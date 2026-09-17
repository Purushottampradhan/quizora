import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../../lib/api.js';
import { examPageTitle } from '../../lib/examTitle.js';
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

  useEffect(() => {
    if (!exam) return;
    const previous = document.title;
    document.title = examPageTitle(exam);
    return () => {
      document.title = previous;
    };
  }, [exam]);

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

  if (loading) return <Spinner label="Opening your quiz" />;
  if (exam?.mode === 'read') return <Navigate to={`/e/${slug}/read`} replace />;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <Logo />
      {exam ? (
        <div className="glass mt-10 overflow-hidden rounded-3xl">
          {exam.cover_url ? (
            <img src={mediaUrl(exam.cover_url)} alt="" className="exam-cover" />
          ) : null}
          <div className="p-6">
            <p className="text-xs font-extrabold tracking-wide text-[var(--coral-2)]">
              {exam.mode === 'practice' ? 'PRACTICE' : 'QUIZ'}
            </p>
            <h1 className="font-display mt-2 text-3xl font-extrabold">{exam.title}</h1>
            {exam.paper_title && exam.paper_title !== exam.title && (
              <p className="mt-1 font-bold text-[var(--gold)]">{exam.paper_title}</p>
            )}
            <p className="mt-2 text-[var(--muted)]">{exam.description}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="chip chip-muted">{exam.question_count} questions</span>
              {exam.duration_minutes ? (
                <span className="chip chip-coral">{exam.duration_minutes} min time limit</span>
              ) : (
                <span className="chip chip-muted">No time limit</span>
              )}
              <span className="chip chip-muted">
                {Number(exam.minus_mark) > 0
                  ? `+${exam.plus_mark ?? 1} for right, −${exam.minus_mark} for wrong`
                  : `+${exam.plus_mark ?? 1} for a right answer`}
              </span>
              {exam.shuffle_questions && <span className="chip chip-violet">Questions in mixed order</span>}
              {exam.shuffle_options && <span className="chip chip-violet">Answers in mixed order</span>}
              {exam.allow_multiple === false && <span className="chip chip-coral">You can take this only once</span>}
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
                {busy ? 'Starting…' : exam.question_count ? 'Start quiz' : 'No questions yet'}
              </button>
            </form>
            <ul className="mt-5 grid gap-1 text-sm text-[var(--muted)]">
              <li>Tap an answer. The next question opens by itself.</li>
              <li>Use the numbers to jump to any question, skip, or change an answer.</li>
              <li>
                {exam.mode === 'practice'
                  ? 'Practice: after you tap, you see the right answer and why, then tap Next.'
                  : 'Quiz: you will not see if you are right until you finish. Then you get your score, the explanations, and a short note on how you did.'}
              </li>
              {exam.allow_multiple === false && (
                <li>You can take this quiz only once. After you submit, you cannot start again.</li>
              )}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-10 text-[var(--danger)]">{error || 'We could not find this quiz.'}</p>
      )}
    </div>
  );
}
