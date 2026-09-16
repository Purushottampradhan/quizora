import { useMemo, useState } from 'react';
import { api, examLink } from '../../lib/api.js';
import Modal from '../../components/Modal.jsx';
import LinkBoard from './LinkBoard.jsx';

function emptyForm(defaultDuration = '') {
  return {
    title: '',
    mode: 'exam',
    shuffle_questions: false,
    shuffle_options: false,
    duration_minutes: defaultDuration,
    plus_mark: 1,
    minus_mark: 0,
    allow_multiple: true,
    selection_type: 'all',
    range_start: 1,
    range_end: 20,
    pick_count: 20,
    question_ids: [],
  };
}

function formFromPaper(paper) {
  return {
    title: paper.title || '',
    mode: paper.mode || 'exam',
    shuffle_questions: Boolean(paper.shuffle_questions),
    shuffle_options: Boolean(paper.shuffle_options),
    duration_minutes: paper.duration_minutes || '',
    plus_mark: paper.plus_mark ?? 1,
    minus_mark: paper.minus_mark ?? 0,
    allow_multiple: paper.allow_multiple !== false,
    selection_type: paper.selection_type || 'all',
    range_start: paper.range_start || 1,
    range_end: paper.range_end || 20,
    pick_count: paper.pick_count || 20,
    question_ids: paper.question_ids || [],
  };
}

function settingSummary(p) {
  const bits = [p.mode === 'read' ? 'Read' : p.mode === 'practice' ? 'Practice' : 'Exam', `${p.question_count} Q`];
  if (p.mode !== 'read') {
    bits.push(p.duration_minutes ? `${p.duration_minutes} min` : 'no timer');
    bits.push(p.allow_multiple === false ? 'one attempt per IP' : 'multiple attempts');
    bits.push(`+${p.plus_mark}${Number(p.minus_mark) > 0 ? ` / −${p.minus_mark}` : ' / no negative'}`);
    if (p.shuffle_questions) bits.push('shuffle Q');
    if (p.shuffle_options) bits.push('shuffle options');
  }
  if (p.selection_type === 'range') bits.push(`Q ${p.range_start}–${p.range_end}`);
  if (p.selection_type === 'count') bits.push(`first/random ${p.pick_count}`);
  if (p.selection_type === 'manual') bits.push('selected questions');
  if (!p.is_active) bits.push('paused');
  return bits.join(' · ');
}

function modeChip(mode) {
  if (mode === 'read') return <span className="chip chip-gold">Read</span>;
  if (mode === 'practice') return <span className="chip chip-violet">Practice</span>;
  return <span className="chip chip-coral">Exam</span>;
}

export default function ShareLinks({
  examId,
  examSlug,
  token,
  questions,
  papers,
  attempts = [],
  onChanged,
  onOpenAttempt,
  onBlock,
  blocks = [],
  defaultDuration = '',
}) {
  const [form, setForm] = useState(() => emptyForm(defaultDuration));
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [open, setOpen] = useState(false);
  const [misses, setMisses] = useState(null);

  const total = questions.length;
  const chunks = useMemo(() => {
    const out = [];
    for (let start = 1; start <= total; start += 20) {
      const end = Math.min(start + 19, total);
      out.push({ start, end, label: `Q ${start}–${end}` });
    }
    return out;
  }, [total]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm(defaultDuration));
  }

  function startCreate() {
    setError('');
    if (open && !editingId) {
      setOpen(false);
      resetForm();
      return;
    }
    resetForm();
    setOpen(true);
  }

  function startEdit(paper) {
    setError('');
    setEditingId(paper.id);
    setForm(formFromPaper(paper));
    setOpen(true);
  }

  async function copy(slug) {
    await navigator.clipboard.writeText(examLink(slug));
    setCopied(slug);
    setTimeout(() => setCopied(''), 1600);
  }

  async function resetIp(paper, ip) {
    if (!ip) return;
    if (!confirm(`Reset IP ${ip} on “${paper.title}”? Their attempts on this link are removed so they can start again.`)) {
      return;
    }
    try {
      await api(`/api/admin/exams/${examId}/papers/${paper.id}/reset-ip`, {
        token,
        method: 'POST',
        body: { ip },
      });
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadMisses(paper) {
    try {
      const data = await api(`/api/admin/exams/${examId}/papers/${paper.id}/misses`, { token });
      setMisses({ paper, submitted: data.submitted || 0, items: data.items || [] });
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (form.selection_type === 'manual' && !form.question_ids.length) {
      setError('Pick at least one question');
      return;
    }
    if (form.selection_type === 'range' && Number(form.range_end) < Number(form.range_start)) {
      setError('Range “to” must be greater than or equal to “from”');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const path = editingId
        ? `/api/admin/exams/${examId}/papers/${editingId}`
        : `/api/admin/exams/${examId}/papers`;
      await api(path, { token, method: editingId ? 'PATCH' : 'POST', body: form });
      resetForm();
      setOpen(false);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(paper) {
    try {
      await api(`/api/admin/exams/${examId}/papers/${paper.id}`, {
        token,
        method: 'PATCH',
        body: { is_active: !paper.is_active },
      });
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(paper) {
    if (!confirm(`Delete link “${paper.title}”? Students with this URL will not get in.`)) return;
    try {
      await api(`/api/admin/exams/${examId}/papers/${paper.id}`, { token, method: 'DELETE' });
      if (editingId === paper.id) {
        resetForm();
        setOpen(false);
      }
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleId(id) {
    setForm((prev) => {
      const has = prev.question_ids.includes(id);
      return {
        ...prev,
        question_ids: has ? prev.question_ids.filter((x) => x !== id) : [...prev.question_ids, id],
      };
    });
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-[var(--muted)]">
          The default link opens in <strong>read mode</strong> (question, answer, explanation). Add extra exam or
          practice links for scored quizzes. Each quiz link has its own leaderboard.
        </p>
        <button className="btn btn-violet shrink-0" onClick={startCreate}>
          New quiz or practice link
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mt-4 grid gap-4">
        {papers.map((p) => (
          <article key={p.id} className="glass rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-bold">{p.title}</h3>
                  {modeChip(p.mode)}
                  {p.is_default && <span className="chip chip-muted">Default</span>}
                  {!p.is_active && <span className="chip chip-danger">Paused</span>}
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{settingSummary(p)}</p>
                <p className="mt-2 break-all text-xs text-[var(--muted)]">{examLink(p.slug)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary px-3 py-1.5 text-sm" onClick={() => copy(p.slug)}>
                  {copied === p.slug ? 'Copied' : 'Copy link'}
                </button>
                <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => loadMisses(p)}>
                  Missed Qs
                </button>
                <a className="btn btn-ghost px-3 py-1.5 text-sm" href={examLink(p.slug)} target="_blank" rel="noreferrer">
                  Open
                </a>
                <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => startEdit(p)}>
                  Settings
                </button>
                <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => toggle(p)}>
                  {p.is_active ? 'Pause' : 'Go live'}
                </button>
                {!p.is_default && (
                  <button className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]" onClick={() => remove(p)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
            <LinkBoard
              attempts={attempts}
              paper={p}
              examSlug={examSlug}
              onOpenAttempt={onOpenAttempt}
              onBlock={onBlock}
              onResetIp={(ip) => resetIp(p, ip)}
              blocks={blocks}
            />
          </article>
        ))}
        {!papers.length && (
          <p className="text-sm text-[var(--muted)]">
            No share links yet. A read-mode default link is created with each exam.
          </p>
        )}
      </div>

      <Modal
        open={open}
        wide
        title={editingId ? 'Link settings' : 'New share link'}
        onClose={() => {
          resetForm();
          setOpen(false);
        }}
      >
        <form className="grid gap-3" onSubmit={save}>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <label className="grid gap-1 text-sm font-bold">
            Link name
            <input
              className="field"
              required
              placeholder="Practice 1–20 or Anatomy notes"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold">
              Mode
              <select className="field" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="exam">Exam (answers after submit)</option>
                <option value="practice">Practice (show correct after each tap)</option>
                <option value="read">Read (question, answer, explanation — no quiz)</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Questions to send
              <select
                className="field"
                value={form.selection_type}
                onChange={(e) => setForm({ ...form, selection_type: e.target.value })}
              >
                <option value="all">All {total} questions</option>
                <option value="range">By number (e.g. 1–20)</option>
                <option value="count">Count (first N, or random N if shuffle)</option>
                <option value="manual">Manual pick</option>
              </select>
            </label>
          </div>

          {form.selection_type === 'range' && (
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                {chunks.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    className="btn btn-ghost px-3 py-1 text-xs"
                    onClick={() => setForm({ ...form, range_start: c.start, range_end: c.end, title: form.title || c.label })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm font-bold">
                  From
                  <input
                    className="field"
                    type="number"
                    min="1"
                    max={total || 1}
                    value={form.range_start}
                    onChange={(e) => setForm({ ...form, range_start: Number(e.target.value) })}
                  />
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  To
                  <input
                    className="field"
                    type="number"
                    min="1"
                    max={total || 1}
                    value={form.range_end}
                    onChange={(e) => setForm({ ...form, range_end: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          )}

          {form.selection_type === 'count' && (
            <label className="grid gap-1 text-sm font-bold">
              How many questions
              <input
                className="field"
                type="number"
                min="1"
                max={total || 1}
                value={form.pick_count}
                onChange={(e) => setForm({ ...form, pick_count: Number(e.target.value) })}
              />
            </label>
          )}

          {form.selection_type === 'manual' && (
            <div className="max-h-56 overflow-y-auto rounded-2xl bg-black/20 p-2">
              {questions.map((q, i) => (
                <label key={q.id} className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.question_ids.includes(q.id)}
                    onChange={() => toggleId(q.id)}
                  />
                  <span>
                    {i + 1}. {q.question_text}
                  </span>
                </label>
              ))}
            </div>
          )}

          {form.mode !== 'read' && (
            <>
              <label className="grid gap-1 text-sm font-bold">
                Attempts
                <select
                  className="field"
                  value={form.allow_multiple ? 'multiple' : 'once'}
                  onChange={(e) => setForm({ ...form, allow_multiple: e.target.value === 'multiple' })}
                >
                  <option value="multiple">Multiple times</option>
                  <option value="once">One time per IP</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                Time limit (minutes)
                <input
                  className="field"
                  type="number"
                  min="1"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                  placeholder="Leave empty for no limit"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-bold">
                  Marks for correct
                  <input
                    className="field"
                    type="number"
                    step="0.25"
                    min="0"
                    value={form.plus_mark}
                    onChange={(e) => setForm({ ...form, plus_mark: Number(e.target.value) })}
                  />
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  Negative for wrong
                  <input
                    className="field"
                    type="number"
                    step="0.25"
                    min="0"
                    value={form.minus_mark}
                    onChange={(e) => setForm({ ...form, minus_mark: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.shuffle_questions}
                  onChange={(e) => setForm({ ...form, shuffle_questions: e.target.checked })}
                />
                Shuffle question order
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.shuffle_options}
                  onChange={(e) => setForm({ ...form, shuffle_options: e.target.checked })}
                />
                Shuffle A–D options
              </label>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary w-fit" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save link settings' : 'Create link'}
            </button>
            <button
              type="button"
              className="btn btn-ghost w-fit"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(misses)}
        wide
        title={misses ? `Wrong questions · ${misses.paper.title}` : 'Wrong questions'}
        onClose={() => setMisses(null)}
      >
        {misses && (
          <div className="grid gap-3">
            <p className="text-sm text-[var(--muted)]">
              Top missed questions from {misses.submitted} submitted attempt
              {misses.submitted === 1 ? '' : 's'} on this link.
            </p>
            {!misses.items.length ? (
              <p className="text-sm text-[var(--muted)]">No wrong answers yet on this link.</p>
            ) : (
              <ol className="grid gap-3">
                {misses.items.map((row, i) => (
                  <li key={row.question_id} className="rounded-2xl bg-black/20 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">
                      #{i + 1} · {row.wrong} wrong · {row.wrong_pct}% · {row.seen} seen
                    </p>
                    <p className="mt-2 font-bold">{row.question_text}</p>
                    <p className="mt-2 text-sm text-[var(--mint)]">
                      Correct ({row.correct_answer}): {row.correct_label}
                    </p>
                    {row.explanation ? (
                      <p className="mt-1 text-sm text-[var(--muted)]">{row.explanation}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
