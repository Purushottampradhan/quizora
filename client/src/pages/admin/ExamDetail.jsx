import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, examLink } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import { formatDuration } from '../../lib/format.js';
import Modal from '../../components/Modal.jsx';
import Spinner from '../../components/Spinner.jsx';

const emptyQ = {
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_answer: 'A',
  explanation: '',
  remark: '',
};

export default function ExamDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const [tab, setTab] = useState('questions');
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(emptyQ);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState(null);

  async function loadExam() {
    const data = await api(`/api/admin/exams/${id}`, { token });
    setExam(data.exam);
    setQuestions(data.questions || []);
  }

  async function loadAttempts() {
    const data = await api(`/api/admin/exams/${id}/attempts`, { token });
    setAttempts(data.attempts || []);
  }

  useEffect(() => {
    if (!token) return;
    (async () => {
      setError('');
      try {
        await Promise.all([loadExam(), loadAttempts()]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  async function saveMeta(patch) {
    const data = await api(`/api/admin/exams/${id}`, { token, method: 'PATCH', body: patch });
    setExam(data.exam);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(examLink(exam.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function saveQuestion(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await api(`/api/admin/exams/${id}/questions/${editingId}`, { token, method: 'PATCH', body: form });
      } else {
        await api(`/api/admin/exams/${id}/questions`, { token, method: 'POST', body: form });
      }
      setForm(emptyQ);
      setEditingId(null);
      setShowForm(false);
      await loadExam();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(q) {
    setForm({
      question_text: q.question_text || '',
      option_a: q.option_a || '',
      option_b: q.option_b || '',
      option_c: q.option_c || '',
      option_d: q.option_d || '',
      correct_answer: q.correct_answer || 'A',
      explanation: q.explanation || '',
      remark: q.remark || '',
    });
    setEditingId(q.id);
    setShowForm(true);
    setError('');
    setTimeout(() => {
      document.getElementById('question-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function cancelForm() {
    setForm(emptyQ);
    setEditingId(null);
    setShowForm(false);
  }

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const data = await api(`/api/admin/exams/${id}/questions/upload`, {
        token,
        method: 'POST',
        body,
        isForm: true,
      });
      await loadExam();
      if (data.warnings?.length) setError(`Uploaded ${data.added}. ${data.warnings.join(' ')}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeQuestion(qid) {
    if (!confirm('Delete this question?')) return;
    await api(`/api/admin/exams/${id}/questions/${qid}`, { token, method: 'DELETE' });
    await loadExam();
  }

  async function openAttempt(attemptId) {
    const data = await api(`/api/admin/attempts/${attemptId}`, { token });
    setDetail(data);
  }

  if (loading) return <Spinner label="Loading exam" />;
  if (!exam) return <p className="text-[var(--danger)]">{error || 'Exam not found'}</p>;

  const link = examLink(exam.slug);

  return (
    <div>
      <Link to="/admin" className="text-sm font-bold text-[var(--muted)]">
        ← All exams
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{exam.title}</h1>
          <p className="mt-1 text-[var(--muted)]">{exam.description || 'No description'}</p>
        </div>
        <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => saveMeta({ is_active: !exam.is_active })}>
          {exam.is_active ? 'Pause exam' : 'Go live'}
        </button>
      </div>

      <div className="glass mt-5 rounded-3xl p-4">
        <p className="text-xs font-extrabold tracking-wide text-[var(--muted)]">SHARE LINK</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input className="field" readOnly value={link} />
          <div className="flex gap-2">
            <button className="btn btn-primary whitespace-nowrap px-4" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="btn btn-ghost whitespace-nowrap px-4" href={link} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-2 rounded-full bg-white/5 p-1">
        {[
          ['questions', `Questions (${questions.length})`],
          ['attempts', `Attempts (${attempts.length})`],
          ['settings', 'Settings'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-extrabold ${
              tab === key ? 'bg-[var(--coral)] text-[#2a0b12]' : 'text-[var(--muted)]'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

      {tab === 'questions' && (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2">
            <label className="btn btn-violet cursor-pointer px-4 py-2 text-sm">
              {uploading ? 'Uploading…' : 'Upload JSON / CSV / Excel'}
              <input
                type="file"
                accept=".json,.csv,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => uploadFile(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost px-4 py-2 text-sm"
              onClick={async () => {
                const res = await fetch('/api/admin/template.xlsx', {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                  setError('Could not download template');
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'quizora-questions-template.xlsx';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download template
            </button>
            <button
              className="btn btn-ghost px-4 py-2 text-sm"
              onClick={() => {
                if (showForm) cancelForm();
                else {
                  setEditingId(null);
                  setForm(emptyQ);
                  setShowForm(true);
                }
              }}
            >
              {showForm ? 'Hide form' : 'Add one question'}
            </button>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Columns: question, option_a–d, correct_answer (A–D), explanation, remark. Max 50 questions. Sample files live in{' '}
            <code>quizora/samples</code>.
          </p>

          {showForm && (
            <form id="question-form" className="glass mt-4 grid gap-3 rounded-3xl p-4" onSubmit={saveQuestion}>
              <p className="font-display text-lg font-bold">{editingId ? 'Edit question' : 'New question'}</p>
              <textarea
                className="field min-h-20"
                placeholder="Question"
                required
                value={form.question_text}
                onChange={(e) => setForm({ ...form, question_text: e.target.value })}
              />
              {['a', 'b', 'c', 'd'].map((k) => (
                <input
                  key={k}
                  className="field"
                  placeholder={`Option ${k.toUpperCase()}`}
                  required
                  value={form[`option_${k}`]}
                  onChange={(e) => setForm({ ...form, [`option_${k}`]: e.target.value })}
                />
              ))}
              <label className="grid gap-1 text-sm font-bold">
                Correct option
                <select
                  className="field"
                  value={form.correct_answer}
                  onChange={(e) => setForm({ ...form, correct_answer: e.target.value })}
                >
                  {['A', 'B', 'C', 'D'].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                className="field min-h-20"
                placeholder="Detailed explanation"
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              />
              <input
                className="field"
                placeholder="Remark (admin only)"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary">{editingId ? 'Update question' : 'Save question'}</button>
                <button type="button" className="btn btn-ghost" onClick={cancelForm}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 grid gap-3">
            {questions.map((q, i) => (
              <article key={q.id} className={`glass rounded-3xl p-4 ${editingId === q.id ? 'ring-2 ring-[var(--coral)]' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">
                    <span className="mr-2 text-[var(--coral)]">{i + 1}.</span>
                    {q.question_text}
                  </h3>
                  <div className="flex shrink-0 gap-2">
                    <button className="text-sm font-bold text-[var(--coral-2)]" onClick={() => startEdit(q)}>
                      Edit
                    </button>
                    <button className="text-sm font-bold text-[var(--danger)]" onClick={() => removeQuestion(q.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <ul className="mt-2 grid gap-1 text-sm text-[var(--muted)]">
                  {['A', 'B', 'C', 'D'].map((l) => (
                    <li key={l} className={q.correct_answer === l ? 'font-bold text-[var(--mint)]' : ''}>
                      {l}. {q[`option_${l.toLowerCase()}`]}
                    </li>
                  ))}
                </ul>
                {q.explanation && <p className="mt-2 text-sm">{q.explanation}</p>}
                {q.remark && <p className="mt-1 text-xs text-[var(--gold)]">Remark: {q.remark}</p>}
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === 'attempts' && (
        <div className="mt-5 overflow-x-auto">
          {!attempts.length ? (
            <p className="text-[var(--muted)]">No one has started this exam yet. Share the link.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Score</th>
                  <th className="px-2 py-2">Total time</th>
                  <th className="px-2 py-2">Avg / Q</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t border-white/10">
                    <td className="px-2 py-3 font-bold">{a.candidate_name}</td>
                    <td className="px-2 py-3">
                      {a.submitted_at ? `${a.score}/${a.total_questions}` : `${a.answered_count} answered`}
                    </td>
                    <td className="px-2 py-3">{a.submitted_at ? formatDuration(a.time_taken_ms) : '—'}</td>
                    <td className="px-2 py-3">{a.avg_time_ms ? formatDuration(a.avg_time_ms) : '—'}</td>
                    <td className="px-2 py-3">{a.submitted_at ? 'Submitted' : 'In progress'}</td>
                    <td className="px-2 py-3">
                      <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => openAttempt(a.id)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <form
          className="glass mt-5 grid gap-3 rounded-3xl p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveMeta({
              title: exam.title,
              description: exam.description,
              duration_minutes: exam.duration_minutes,
            });
          }}
        >
          <label className="grid gap-1 text-sm font-bold">
            Title
            <input className="field" value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Description
            <textarea
              className="field min-h-24"
              value={exam.description || ''}
              onChange={(e) => setExam({ ...exam, description: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Duration (minutes)
            <input
              className="field"
              type="number"
              min="1"
              value={exam.duration_minutes || ''}
              onChange={(e) => setExam({ ...exam, duration_minutes: e.target.value })}
            />
          </label>
          <button className="btn btn-primary w-fit">Save settings</button>
        </form>
      )}

      <Modal open={Boolean(detail)} title={detail ? `${detail.attempt.candidate_name}'s attempt` : ''} onClose={() => setDetail(null)} wide>
        {detail && (
          <div>
            <p className="text-[var(--muted)]">
              Score {detail.attempt.score}/{detail.attempt.total_questions} · Total{' '}
              {formatDuration(detail.attempt.time_taken_ms)} · Started {new Date(detail.attempt.started_at).toLocaleString()}
            </p>
            <div className="mt-4 grid gap-3">
              {detail.details.map((q) => (
                <article key={q.question_id} className="rounded-2xl bg-black/20 p-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <strong>
                      {q.number}. {q.question_text}
                    </strong>
                    <span className="shrink-0 text-[var(--muted)]">{formatDuration(q.time_spent_ms)}</span>
                  </div>
                  <p className="mt-1 text-sm">
                    Selected: <b>{q.selected_option || '—'}</b> · Correct: <b>{q.correct_answer}</b>{' '}
                    {q.is_correct ? (
                      <span className="text-[var(--mint)]">Right</span>
                    ) : (
                      <span className="text-[var(--danger)]">Wrong</span>
                    )}
                  </p>
                  {q.explanation && <p className="mt-1 text-sm text-[var(--muted)]">{q.explanation}</p>}
                  {q.remark && <p className="mt-1 text-xs text-[var(--gold)]">{q.remark}</p>}
                </article>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
