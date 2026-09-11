import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Logo from '../../components/Logo.jsx';
import Spinner from '../../components/Spinner.jsx';

export default function Start() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api(`/api/public/exams/${slug}`);
        setExam(data.exam);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  async function start(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/public/exams/${slug}/start`, { method: 'POST', body: { name } });
      navigate(`/e/${slug}/quiz/${data.attempt.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Opening exam" />;
  if (exam?.mode === 'read') return <Navigate to={`/e/${slug}/read`} replace />;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <Logo />
      {exam ? (
        <div className="glass mt-10 rounded-3xl p-6">
          <p className="text-xs font-extrabold tracking-wide text-[var(--coral-2)]">
            {exam.mode === 'practice' ? 'PRACTICE' : 'EXAM'}
          </p>
          <h1 className="font-display mt-2 text-3xl font-extrabold">{exam.title}</h1>
          {exam.paper_title && exam.paper_title !== exam.title && (
            <p className="mt-1 font-bold text-[var(--gold)]">{exam.paper_title}</p>
          )}
          <p className="mt-2 text-[var(--muted)]">{exam.description}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white/10 px-3 py-1">{exam.question_count} questions</span>
            {exam.duration_minutes ? (
              <span className="rounded-full bg-white/10 px-3 py-1">{exam.duration_minutes} min limit</span>
            ) : (
              <span className="rounded-full bg-white/10 px-3 py-1">No time limit</span>
            )}
            <span className="rounded-full bg-white/10 px-3 py-1">
              +{exam.plus_mark ?? 1}
              {Number(exam.minus_mark) > 0 ? ` / −${exam.minus_mark} wrong` : ' · no negative'}
            </span>
            {exam.shuffle_questions && <span className="rounded-full bg-white/10 px-3 py-1">Shuffled questions</span>}
            {exam.shuffle_options && <span className="rounded-full bg-white/10 px-3 py-1">Shuffled options</span>}
          </div>
          <form className="mt-6 grid gap-3" onSubmit={start}>
            <label className="grid gap-1 text-sm font-bold">
              Your name
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Type your name to begin"
                required
                minLength={2}
                autoFocus
              />
            </label>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button className="btn btn-primary mt-1" disabled={busy || !exam.question_count}>
              {busy ? 'Starting…' : 'Start exam'}
            </button>
          </form>
          <ul className="mt-5 grid gap-1 text-sm text-[var(--muted)]">
            <li>Tap an option — next question opens on its own.</li>
            <li>Jump to any number in the bar if you want to skip or change.</li>
            <li>
              {exam.mode === 'practice'
                ? 'Practice: after you tap, you see the correct answer and explanation, then Next.'
                : 'Exam: answers stay hidden until you submit. Then you get score, explanations, and AI tips.'}
            </li>
          </ul>
        </div>
      ) : (
        <p className="mt-10 text-[var(--danger)]">{error || 'Exam not found'}</p>
      )}
    </div>
  );
}
