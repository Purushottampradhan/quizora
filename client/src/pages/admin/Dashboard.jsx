import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, examLink } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import Modal from '../../components/Modal.jsx';
import Spinner from '../../components/Spinner.jsx';

export default function Dashboard() {
  const { token } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', duration_minutes: '' });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  async function load() {
    setError('');
    try {
      const data = await api('/api/admin/exams', { token });
      setExams(data.exams || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) load();
    else setLoading(false);
  }, [token]);

  async function createExam(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/admin/exams', { token, method: 'POST', body: form });
      setOpen(false);
      setForm({ title: '', description: '', duration_minutes: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(slug) {
    await navigator.clipboard.writeText(examLink(slug));
    setCopied(slug);
    setTimeout(() => setCopied(''), 1600);
  }

  if (loading) return <Spinner label="Loading exams" />;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Exams</h1>
          <p className="mt-1 text-[var(--muted)]">Create an exam, upload questions, share the link.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          New exam
        </button>
      </div>

      {error && <p className="mt-4 text-[var(--danger)]">{error}</p>}

      {!exams.length ? (
        <div className="glass mt-8 rounded-3xl p-8 text-center">
          <p className="font-display text-xl font-bold">No exams yet</p>
          <p className="mt-2 text-[var(--muted)]">Start with a title. You can add questions next.</p>
          <button className="btn btn-violet mt-5" onClick={() => setOpen(true)}>
            Create your first exam
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {exams.map((exam) => (
            <article key={exam.id} className="glass rounded-3xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">{exam.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{exam.description || 'No description'}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                    exam.is_active ? 'bg-emerald-400/15 text-[var(--mint)]' : 'bg-white/10 text-[var(--muted)]'
                  }`}
                >
                  {exam.is_active ? 'Live' : 'Paused'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat n={exam.question_count} label="Questions" />
                <Stat n={exam.attempt_count} label="Attempts" />
                <Stat n={exam.submitted_count} label="Submitted" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link className="btn btn-violet px-4 py-2 text-sm" to={`/admin/exams/${exam.id}`}>
                  Open
                </Link>
                <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => copyLink(exam.slug)}>
                  {copied === exam.slug ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={open} title="Create exam" onClose={() => setOpen(false)}>
        <form className="grid gap-3" onSubmit={createExam}>
          <label className="grid gap-1 text-sm font-bold">
            Title
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Frontend basics"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Description
            <textarea
              className="field min-h-24"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this exam covers"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Time limit (minutes, optional)
            <input
              className="field"
              type="number"
              min="1"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              placeholder="Leave empty for no limit"
            />
          </label>
          <button className="btn btn-primary mt-2" disabled={busy}>
            {busy ? 'Creating…' : 'Create & get link'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className="rounded-2xl bg-black/20 px-2 py-3">
      <div className="font-display text-2xl font-extrabold">{n}</div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}
