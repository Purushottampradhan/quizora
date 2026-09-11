import { useMemo, useState } from 'react';
import { api, examLink } from '../../lib/api.js';

const emptyForm = {
  title: '',
  mode: 'exam',
  shuffle_questions: false,
  shuffle_options: false,
  plus_mark: 1,
  minus_mark: 0,
  selection_type: 'all',
  range_start: 1,
  range_end: 20,
  pick_count: 20,
  question_ids: [],
};

export default function ShareLinks({ examId, token, questions, papers, onChanged }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [open, setOpen] = useState(false);

  const total = questions.length;
  const chunks = useMemo(() => {
    const out = [];
    for (let start = 1; start <= total; start += 20) {
      const end = Math.min(start + 19, total);
      out.push({ start, end, label: `Q ${start}–${end}` });
    }
    return out;
  }, [total]);

  async function copy(slug) {
    await navigator.clipboard.writeText(examLink(slug));
    setCopied(slug);
    setTimeout(() => setCopied(''), 1600);
  }

  async function create(e) {
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
      await api(`/api/admin/exams/${examId}/papers`, { token, method: 'POST', body: form });
      setForm(emptyForm);
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
      <p className="text-sm text-[var(--muted)]">
        Each link can be a quiz, practice, or <strong>read mode</strong> (question + answer + explanation on one
        page, no options). You can still send only part of the bank (1–20, 21–40, first N, or hand-picked).
      </p>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mt-4 grid gap-3">
        {papers.map((p) => (
          <article key={p.id} className="glass rounded-3xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display font-bold">{p.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {p.mode === 'read' ? 'Read' : p.mode === 'practice' ? 'Practice' : 'Exam'} · {p.question_count} Q
                  {p.mode !== 'read' ? ` · +${p.plus_mark}${Number(p.minus_mark) > 0 ? ` / −${p.minus_mark}` : ' / no negative'}` : ''}
                  {p.mode !== 'read' && p.shuffle_questions ? ' · shuffle Q' : ''}
                  {p.mode !== 'read' && p.shuffle_options ? ' · shuffle options' : ''}
                  {p.selection_type === 'range' ? ` · Q ${p.range_start}–${p.range_end}` : ''}
                  {p.selection_type === 'count' ? ` · first/random ${p.pick_count}` : ''}
                  {p.selection_type === 'manual' ? ' · selected questions' : ''}
                  {p.is_active ? '' : ' · paused'}
                </p>
                <p className="mt-2 break-all text-xs text-[var(--muted)]">{examLink(p.slug)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary px-3 py-1.5 text-sm" onClick={() => copy(p.slug)}>
                  {copied === p.slug ? 'Copied' : 'Copy link'}
                </button>
                <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => toggle(p)}>
                  {p.is_active ? 'Pause' : 'Go live'}
                </button>
                <button className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]" onClick={() => remove(p)}>
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
        {!papers.length && (
          <p className="text-sm text-[var(--muted)]">
            No share links yet. A Full exam link is created with each exam — or add one below.
          </p>
        )}
      </div>

      <button className="btn btn-violet mt-4" onClick={() => setOpen((v) => !v)}>
        {open ? 'Close form' : 'New share link'}
      </button>

      {open && (
        <form className="glass mt-4 grid gap-3 rounded-3xl p-4" onSubmit={create}>
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
          )}
          {form.mode !== 'read' && (
          <>
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
          <button className="btn btn-primary w-fit" disabled={busy}>
            {busy ? 'Creating…' : 'Create link'}
          </button>
        </form>
      )}
    </div>
  );
}
