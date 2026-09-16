import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, examLink, mediaUrl } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import { formatDuration, formatMarks } from '../../lib/format.js';
import Modal from '../../components/Modal.jsx';
import Spinner from '../../components/Spinner.jsx';
import ShareLinks from './ShareLinks.jsx';

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
  const [papers, setPapers] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(emptyQ);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [detail, setDetail] = useState(null);
  const [attemptQuery, setAttemptQuery] = useState('');
  const [attemptSort, setAttemptSort] = useState('marks');
  const [attemptLink, setAttemptLink] = useState('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ title: '', description: '', group: 'Other' });
  const [blockValue, setBlockValue] = useState('');

  async function loadExam() {
    const data = await api(`/api/admin/exams/${id}`, { token });
    setExam(data.exam);
    setQuestions(data.questions || []);
    setPapers(data.papers || []);
    setBlocks(data.blocks || []);
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
    return data.exam;
  }

  function openSettings() {
    setSettingsDraft({ title: exam.title, description: exam.description || '', group: exam.group || 'Other' });
    setSettingsOpen(true);
  }

  async function saveSettings(e) {
    e.preventDefault();
    try {
      await saveMeta({
        title: settingsDraft.title,
        description: settingsDraft.description,
        group: settingsDraft.group,
      });
      setSettingsOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(examLink(exam.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function uploadCover(file) {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    try {
      const data = await api(`/api/admin/exams/${id}/cover`, { token, method: 'POST', body, isForm: true });
      setExam(data.exam);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeCover() {
    try {
      const data = await api(`/api/admin/exams/${id}/cover`, { token, method: 'DELETE' });
      setExam(data.exam);
    } catch (err) {
      setError(err.message);
    }
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

  async function removeAllQuestions() {
    setClearing(true);
    setError('');
    try {
      await api(`/api/admin/exams/${id}/questions`, { token, method: 'DELETE' });
      setConfirmClear(false);
      cancelForm();
      await loadExam();
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  }

  async function makeDefaultRead() {
    const paper = papers.find((p) => p.slug === exam?.slug) || papers[0];
    if (!paper) return;
    try {
      await api(`/api/admin/exams/${id}/papers/${paper.id}`, {
        token,
        method: 'PATCH',
        body: { mode: 'read', title: paper.title === 'Full exam' ? 'Read notes' : paper.title },
      });
      await loadExam();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addBlock(kind, value) {
    const raw = String(value || '').trim();
    if (!raw) return;
    if (!confirm(`Block IP ${raw}? That network cannot start a quiz until you Allow it in Settings.`)) {
      return;
    }
    try {
      await api(`/api/admin/exams/${id}/blocks`, { token, method: 'POST', body: { kind: kind || 'ip', value: raw } });
      await loadExam();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeBlock(blockId) {
    try {
      await api(`/api/admin/exams/${id}/blocks/${blockId}`, { token, method: 'DELETE' });
      await loadExam();
    } catch (err) {
      setError(err.message);
    }
  }

  async function openAttempt(attemptId) {
    const data = await api(`/api/admin/attempts/${attemptId}`, { token });
    setDetail(data);
  }

  if (loading) return <Spinner label="Loading exam" />;
  if (!exam) return <p className="text-[var(--danger)]">{error || 'Exam not found'}</p>;

  const link = examLink(exam.slug);
  const defaultPaper = papers.find((p) => p.slug === exam.slug) || papers.find((p) => p.is_default) || papers[0];
  const defaultMode = defaultPaper?.mode || 'read';

  const filteredAttempts = attempts
    .filter((a) => {
      if (attemptLink !== 'all' && a.paper_id !== attemptLink) return false;
      const q = attemptQuery.trim().toLowerCase();
      if (!q) return true;
      return String(a.candidate_name || '').toLowerCase().includes(q);
    })
    .slice()
    .sort((a, b) => {
      if (attemptSort === 'time') {
        if (Boolean(a.submitted_at) !== Boolean(b.submitted_at)) return a.submitted_at ? -1 : 1;
        return (Number(a.time_taken_ms) || 1e15) - (Number(b.time_taken_ms) || 1e15);
      }
      if (attemptSort === 'name') {
        return String(a.candidate_name || '').localeCompare(String(b.candidate_name || ''), undefined, { sensitivity: 'base' });
      }
      if (attemptSort === 'recent') return new Date(b.started_at || 0) - new Date(a.started_at || 0);
      const as = a.submitted_at ? 1 : 0;
      const bs = b.submitted_at ? 1 : 0;
      if (bs !== as) return bs - as;
      const marks = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (marks) return marks;
      return (Number(a.time_taken_ms) || 0) - (Number(b.time_taken_ms) || 0);
    });

  return (
    <div>
      <Link to="/admin" className="text-sm font-bold text-[var(--muted)]">
        ← All exams
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{exam.title}</h1>
          <p className="mt-1 text-[var(--muted)]">{exam.description || 'No description'}</p>
          {exam.group && <p className="mt-2"><span className="chip chip-gold">{exam.group}</span></p>}
        </div>
        <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => saveMeta({ is_active: !exam.is_active })}>
          {exam.is_active ? 'Pause exam' : 'Go live'}
        </button>
      </div>

      <div className="glass mt-5 rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold tracking-wide text-[var(--muted)]">DEFAULT SHARE LINK</p>
            <p className="mt-1 font-display text-lg font-bold">{defaultPaper?.title || 'Read notes'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`chip ${defaultMode === 'read' ? 'chip-gold' : defaultMode === 'practice' ? 'chip-violet' : 'chip-coral'}`}>
              {defaultMode === 'read' ? 'Read mode' : defaultMode === 'practice' ? 'Practice' : 'Exam'}
            </span>
            <span className="chip chip-muted">{defaultPaper?.question_count ?? questions.length} questions</span>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="field" readOnly value={link} />
          <div className="flex gap-2">
            <button className="btn btn-primary whitespace-nowrap px-4" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="btn btn-ghost whitespace-nowrap px-4" href={link} target="_blank" rel="noreferrer">
              Open
            </a>
            {defaultMode !== 'read' && (
              <button className="btn btn-ghost whitespace-nowrap px-4" onClick={makeDefaultRead}>
                Switch to read
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Students open notes first: question, answer, and explanation. Create extra exam or practice links in the
          Links tab for timed quizzes and leaderboards.
        </p>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto rounded-full bg-white/5 p-1">
        {[
          ['questions', `Questions (${questions.length})`],
          ['links', `Links (${papers.length})`],
          ['attempts', `Attempts (${attempts.length})`],
          ['settings', 'Settings'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-extrabold ${
              tab === key ? 'bg-[var(--coral)] text-[#2a0b12]' : 'text-[var(--muted)]'
            }`}
            onClick={() => {
              if (key === 'settings') openSettings();
              else setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

      {tab === 'links' && (
        <ShareLinks
          examId={id}
          examSlug={exam.slug}
          token={token}
          questions={questions}
          papers={papers}
          attempts={attempts}
          onChanged={async () => {
            await Promise.all([loadExam(), loadAttempts()]);
          }}
          onOpenAttempt={openAttempt}
          onBlock={addBlock}
          blocks={blocks}
          defaultDuration={exam.duration_minutes || ''}
        />
      )}

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
                const base = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
                const res = await fetch(`${base}/api/admin/template.xlsx`, {
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
                a.download = 'quiz97-questions-template.xlsx';
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
            <button
              className="btn btn-ghost px-4 py-2 text-sm text-[var(--danger)]"
              disabled={!questions.length || clearing}
              onClick={() => setConfirmClear(true)}
            >
              Delete all questions
            </button>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Columns: question, option_a–d, correct_answer (A–D), explanation, remark. Max 500 questions. Sample files live in{' '}
            <code>samples</code>.
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
        <div className="mt-5">
          {!attempts.length ? (
            <p className="text-[var(--muted)]">No one has started a quiz yet. Share an exam or practice link.</p>
          ) : (
            <>
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                <input
                  className="field py-2 text-sm"
                  value={attemptQuery}
                  onChange={(e) => setAttemptQuery(e.target.value)}
                  placeholder="Search by name"
                />
                <select className="field py-2 text-sm" value={attemptSort} onChange={(e) => setAttemptSort(e.target.value)}>
                  <option value="marks">Top by marks</option>
                  <option value="time">Fastest time</option>
                  <option value="name">Name A–Z</option>
                  <option value="recent">Most recent</option>
                </select>
                <select className="field py-2 text-sm" value={attemptLink} onChange={(e) => setAttemptLink(e.target.value)}>
                  <option value="all">All links</option>
                  {papers
                    .filter((p) => p.mode !== 'read')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Link</th>
                      <th>Marks</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttempts.map((a, i) => (
                      <tr key={a.id}>
                        <td className="text-[var(--muted)]">{i + 1}</td>
                        <td className="font-bold">{a.candidate_name}</td>
                        <td className="text-[var(--muted)]">{a.paper_title || '—'}</td>
                        <td>
                          {a.submitted_at
                            ? `${formatMarks(a.score)} / ${formatMarks(a.max_score || a.total_questions)}`
                            : `${a.answered_count} answered`}
                        </td>
                        <td>{a.submitted_at ? formatDuration(a.time_taken_ms) : '—'}</td>
                        <td>
                          <span className={`chip ${a.submitted_at ? 'chip-mint' : 'chip-muted'}`}>
                            {a.submitted_at ? 'Submitted' : 'In progress'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => openAttempt(a.id)}>
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredAttempts.length && (
                <p className="mt-3 text-sm text-[var(--muted)]">No attempts match these filters.</p>
              )}
            </>
          )}
        </div>
      )}

      <Modal open={settingsOpen} title="Exam settings" onClose={() => setSettingsOpen(false)}>
        <form className="grid gap-3" onSubmit={saveSettings}>
          <label className="grid gap-1 text-sm font-bold">
            Title
            <input
              className="field"
              value={settingsDraft.title}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, title: e.target.value })}
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Description
            <textarea
              className="field min-h-24"
              value={settingsDraft.description}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, description: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Cover image
            <span className="font-normal text-xs text-[var(--muted)]">
              Students see this before they start. It is also used when the exam link is shared.
            </span>
            {exam.cover_url ? (
              <img
                src={mediaUrl(exam.cover_url, exam.updated_at)}
                alt=""
                className="mt-1 max-h-40 w-full rounded-2xl object-cover"
              />
            ) : null}
            <input
              className="field py-2 text-sm font-normal"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                uploadCover(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {exam.cover_url ? (
              <button type="button" className="btn btn-ghost w-fit px-3 py-1.5 text-xs" onClick={removeCover}>
                Remove image
              </button>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Exam group
            <input
              className="field"
              value={settingsDraft.group}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, group: e.target.value })}
              placeholder="RRB, TET, UPSC, Other…"
            />
          </label>
          <p className="text-xs text-[var(--muted)]">
            Time limit, marks, one-time vs multiple attempts, and mode live on each share link.
          </p>
          <div className="mt-2 rounded-2xl bg-black/20 p-3">
            <p className="text-sm font-bold">Blocked IPs</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              A blocked IP cannot start any quiz on this exam until you allow it.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                className="field py-2 text-sm"
                value={blockValue}
                onChange={(e) => setBlockValue(e.target.value)}
                placeholder="e.g. 103.21.44.10"
              />
              <button
                type="button"
                className="btn btn-primary px-4 py-2 text-sm"
                onClick={async () => {
                  await addBlock('ip', blockValue);
                  setBlockValue('');
                }}
              >
                Block IP
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                  <span>
                    <span className={`chip ${b.kind === 'ip' ? 'chip-coral' : 'chip-gold'}`}>{b.kind}</span>
                    <span className="ml-2 font-bold">{b.label || b.value}</span>
                  </span>
                  <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => removeBlock(b.id)}>
                    Allow
                  </button>
                </div>
              ))}
              {!blocks.length && <p className="text-xs text-[var(--muted)]">Nobody is blocked.</p>}
            </div>
          </div>
          <div className="mt-1 flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={() => setSettingsOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary flex-1">Save settings</button>
          </div>
        </form>
      </Modal>

      <Modal open={confirmClear} title="Delete all questions?" onClose={() => !clearing && setConfirmClear(false)}>
        <p className="text-[var(--muted)]">
          This will permanently remove all {questions.length} question{questions.length === 1 ? '' : 's'} from this exam.
          Answer rows tied to those questions will also be removed. The exam and student attempts stay.
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-ghost flex-1" disabled={clearing} onClick={() => setConfirmClear(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary flex-1 bg-[var(--danger)]"
            disabled={clearing}
            onClick={removeAllQuestions}
          >
            {clearing ? 'Deleting…' : 'Delete all'}
          </button>
        </div>
      </Modal>

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
