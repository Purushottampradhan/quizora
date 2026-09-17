import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, examLink, mediaUrl } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import Modal from '../../components/Modal.jsx';
import Spinner from '../../components/Spinner.jsx';

const PRESET_GROUPS = ['RRB', 'TET', 'UPSC', 'Other'];

function emptyForm(group = 'Other') {
  return { title: '', description: '', duration_minutes: '', group, custom_group: '' };
}

function groupChip(name) {
  if (name === 'RRB') return 'chip-coral';
  if (name === 'TET') return 'chip-gold';
  if (name === 'UPSC') return 'chip-violet';
  if (name === 'Other') return 'chip-muted';
  return 'chip-mint';
}

function sortGroups(names) {
  return [...names].sort((a, b) => {
    const ia = PRESET_GROUPS.indexOf(a);
    const ib = PRESET_GROUPS.indexOf(b);
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

export default function Dashboard() {
  const { token } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm());
  const [newGroupName, setNewGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [examQuery, setExamQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [view, setView] = useState('grouped');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [extraGroups, setExtraGroups] = useState([]);
  const [renameGroup, setRenameGroup] = useState(null);
  const [deleteGroup, setDeleteGroup] = useState(null);
  const [editBatch, setEditBatch] = useState(null);
  const [deleteBatch, setDeleteBatch] = useState(null);
  const [copyBatch, setCopyBatch] = useState(null);

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

  const usedGroups = useMemo(() => {
    const names = new Set(PRESET_GROUPS);
    for (const exam of exams) names.add(exam.group || 'Other');
    for (const name of extraGroups) names.add(name);
    if (form.group && form.group !== '__custom') names.add(form.group);
    if (renameGroup?.to) names.add(renameGroup.to);
    if (copyBatch?.group && copyBatch.group !== '__custom') names.add(copyBatch.group);
    return sortGroups(names);
  }, [exams, extraGroups, form.group, renameGroup, copyBatch]);

  const filteredExams = useMemo(() => {
    const needle = examQuery.trim().toLowerCase();
    return exams.filter((exam) => {
      const group = exam.group || 'Other';
      if (groupFilter !== 'all' && group !== groupFilter) return false;
      if (!needle) return true;
      return (
        String(exam.title || '').toLowerCase().includes(needle) ||
        String(exam.description || '').toLowerCase().includes(needle)
      );
    });
  }, [exams, examQuery, groupFilter]);

  const visibleGroups = useMemo(() => {
    const gNeedle = groupQuery.trim().toLowerCase();
    return usedGroups.filter((name) => {
      if (groupFilter !== 'all' && name !== groupFilter) return false;
      if (gNeedle && !name.toLowerCase().includes(gNeedle)) return false;
      if (examQuery.trim() && !filteredExams.some((e) => (e.group || 'Other') === name)) return false;
      return true;
    });
  }, [usedGroups, groupFilter, groupQuery, examQuery, filteredExams]);

  function openCreate(group = 'Other') {
    setError('');
    setForm(emptyForm(group || 'Other'));
    setOpen(true);
  }

  function chosenGroup() {
    if (form.group === '__custom') return form.custom_group.trim() || 'Other';
    return form.group || 'Other';
  }

  async function createExam(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/admin/exams', {
        token,
        method: 'POST',
        body: { ...form, group: chosenGroup() },
      });
      setOpen(false);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addGroup(e) {
    e.preventDefault();
    const name = newGroupName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const known = usedGroups.find((g) => g.toLowerCase() === name.toLowerCase());
    const group = known || name;
    if (!known) setExtraGroups((prev) => (prev.includes(group) ? prev : [...prev, group]));
    setGroupOpen(false);
    setNewGroupName('');
    setGroupFilter(group);
    setForm(emptyForm(group));
    setOpen(true);
  }

  async function saveGroupName(e) {
    e.preventDefault();
    if (!renameGroup) return;
    const from = renameGroup.from;
    const to = String(renameGroup.to || '').trim().replace(/\s+/g, ' ');
    if (!to) return;
    setBusy(true);
    try {
      const count = exams.filter((exam) => (exam.group || 'Other') === from).length;
      if (count) {
        await api('/api/admin/exam-groups', { token, method: 'PATCH', body: { from, to } });
      }
      setExtraGroups((prev) => {
        const next = prev.filter((g) => g !== from);
        if (!PRESET_GROUPS.includes(to) && !next.includes(to)) next.push(to);
        return next;
      });
      if (groupFilter === from) setGroupFilter(to);
      setRenameGroup(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteGroup() {
    if (!deleteGroup) return;
    setBusy(true);
    try {
      const name = deleteGroup.name;
      const count = exams.filter((exam) => (exam.group || 'Other') === name).length;
      if (count) {
        await api('/api/admin/exam-groups', { token, method: 'DELETE', body: { name } });
      }
      setExtraGroups((prev) => prev.filter((g) => g !== name));
      if (groupFilter === name) setGroupFilter('all');
      setDeleteGroup(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveBatch(e) {
    e.preventDefault();
    if (!editBatch) return;
    setBusy(true);
    try {
      await api(`/api/admin/exams/${editBatch.exam.id}`, {
        token,
        method: 'PATCH',
        body: {
          title: editBatch.title,
          group: editBatch.group === '__custom' ? editBatch.custom_group : editBatch.group,
          is_active: editBatch.is_active,
        },
      });
      setEditBatch(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteBatch() {
    if (!deleteBatch) return;
    setBusy(true);
    try {
      await api(`/api/admin/exams/${deleteBatch.id}`, { token, method: 'DELETE' });
      setDeleteBatch(null);
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

  function startCopy(exam) {
    setCopyBatch({
      exam,
      title: `${exam.title} copy`,
      group: exam.group || 'Other',
      custom_group: '',
    });
  }

  async function confirmCopyBatch(e) {
    e.preventDefault();
    if (!copyBatch) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/exams/${copyBatch.exam.id}/copy`, {
        token,
        method: 'POST',
        body: {
          title: copyBatch.title,
          group: copyBatch.group === '__custom' ? copyBatch.custom_group : copyBatch.group,
        },
      });
      setCopyBatch(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleGroup(name) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function startEdit(exam) {
    setEditBatch({
      exam,
      title: exam.title,
      group: exam.group || 'Other',
      custom_group: '',
      is_active: exam.is_active !== false,
    });
  }

  const batchActions = {
    copied,
    onCopy: copyLink,
    onDuplicate: startCopy,
    onEdit: startEdit,
    onDelete: setDeleteBatch,
  };

  if (loading) return <Spinner label="Loading exams" />;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Exams</h1>
          <p className="mt-1 text-[var(--muted)]">
            Group papers by exam (RRB, TET, UPSC), then add batches inside each group.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => setGroupOpen(true)}>
            New group
          </button>
          <button className="btn btn-primary" onClick={() => openCreate(groupFilter === 'all' ? 'Other' : groupFilter)}>
            New exam
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="field py-2.5 text-sm"
          value={examQuery}
          onChange={(e) => setExamQuery(e.target.value)}
          placeholder="Search exam or batch name"
          aria-label="Search exams by name"
        />
        <input
          className="field py-2.5 text-sm"
          value={groupQuery}
          onChange={(e) => setGroupQuery(e.target.value)}
          placeholder="Search exam group"
          aria-label="Search exam groups"
        />
        <select
          className="field py-2.5 text-sm"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          aria-label="Filter by exam group"
        >
          <option value="all">All groups</option>
          {usedGroups.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="field py-2.5 text-sm"
          value={view}
          onChange={(e) => setView(e.target.value)}
          aria-label="Exam list layout"
        >
          <option value="grouped">Group by exam</option>
          <option value="list">All exams list</option>
        </select>
      </div>

      {error && <p className="mt-4 text-[var(--danger)]">{error}</p>}

      {view === 'list' ? (
        <ExamGrid exams={filteredExams} {...batchActions} emptyLabel={exams.length ? 'No exams match that search.' : 'No exams yet. Create one from a group.'} />
      ) : (
        <div className="mt-6 grid gap-4">
          {visibleGroups.map((name) => {
            const items = filteredExams.filter((exam) => (exam.group || 'Other') === name);
            const allInGroup = exams.filter((exam) => (exam.group || 'Other') === name);
            const closed = collapsed.has(name);
            return (
              <section key={name} className="glass rounded-3xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => toggleGroup(name)}
                    aria-expanded={!closed}
                  >
                    <span className={`chip ${groupChip(name)}`}>{name}</span>
                    <span className="font-display text-xl font-bold">{name}</span>
                    <span className="text-sm text-[var(--muted)]">
                      {items.length === 1 ? '1 batch' : `${items.length} batches`}
                    </span>
                    <span className="text-xs font-bold text-[var(--muted)]">{closed ? 'Show' : 'Hide'}</span>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => setRenameGroup({ from: name, to: name })}>
                      Rename
                    </button>
                    <button
                      className="btn btn-ghost px-4 py-2 text-sm text-[var(--danger)]"
                      onClick={() => setDeleteGroup({ name, count: allInGroup.length })}
                    >
                      Delete group
                    </button>
                    <button className="btn btn-primary px-4 py-2 text-sm" onClick={() => openCreate(name)}>
                      Add exam
                    </button>
                  </div>
                </div>
                {!closed && (
                  items.length ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {items.map((exam) => (
                        <ExamCard key={exam.id} exam={exam} hideGroup {...batchActions} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[var(--muted)]">
                      No batches in this group yet. Add an exam for a batch, paper, or year.
                    </p>
                  )
                )}
              </section>
            );
          })}
          {!visibleGroups.length && (
            <p className="mt-2 text-[var(--muted)]">No exam groups match that search.</p>
          )}
        </div>
      )}

      <Modal open={open} title="Create exam" onClose={() => setOpen(false)}>
        <form className="grid gap-3" onSubmit={createExam}>
          <GroupSelect form={form} setForm={setForm} groups={usedGroups} />
          <label className="grid gap-1 text-sm font-bold">
            Exam / batch name
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Nursing staff previous year, Batch 1…"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Description
            <textarea
              className="field min-h-24"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this batch covers"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Time limit for quiz links (minutes, optional)
            <input
              className="field"
              type="number"
              min="1"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              placeholder="Used when you add an exam or practice link"
            />
          </label>
          <button className="btn btn-primary mt-2" disabled={busy}>
            {busy ? 'Creating…' : 'Create & get link'}
          </button>
        </form>
      </Modal>

      <Modal open={groupOpen} title="New exam group" onClose={() => setGroupOpen(false)}>
        <form className="grid gap-3" onSubmit={addGroup}>
          <p className="text-sm text-[var(--muted)]">
            Use a family like RRB, TET, or UPSC. Then add batches inside it.
          </p>
          <label className="grid gap-1 text-sm font-bold">
            Group name
            <input
              className="field"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              required
              placeholder="RRB, TET, UPSC, SSC…"
            />
          </label>
          <button className="btn btn-primary mt-2">Create group and add exam</button>
        </form>
      </Modal>

      <Modal open={Boolean(renameGroup)} title="Rename group" onClose={() => setRenameGroup(null)}>
        {renameGroup && (
          <form className="grid gap-3" onSubmit={saveGroupName}>
            <p className="text-sm text-[var(--muted)]">
              All batches in “{renameGroup.from}” will move to the new name. If that name already exists, the groups merge.
            </p>
            <label className="grid gap-1 text-sm font-bold">
              New group name
              <input
                className="field"
                value={renameGroup.to}
                onChange={(e) => setRenameGroup({ ...renameGroup, to: e.target.value })}
                required
              />
            </label>
            <button className="btn btn-primary mt-2" disabled={busy}>
              {busy ? 'Saving…' : 'Save name'}
            </button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(deleteGroup)} title="Delete group?" onClose={() => !busy && setDeleteGroup(null)}>
        {deleteGroup && (
          <div className="grid gap-3">
            {deleteGroup.count ? (
              <p className="text-[var(--muted)]">
                This will permanently delete group “{deleteGroup.name}” and all {deleteGroup.count} batch
                {deleteGroup.count === 1 ? '' : 'es'} inside it, including questions, share links, and student attempts.
              </p>
            ) : (
              <p className="text-[var(--muted)]">
                “{deleteGroup.name}” has no batches. {PRESET_GROUPS.includes(deleteGroup.name)
                  ? 'The empty RRB / TET / UPSC / Other buckets stay on this screen.'
                  : 'Remove this empty group from the list?'}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" disabled={busy} onClick={() => setDeleteGroup(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary flex-1"
                disabled={busy || (!deleteGroup.count && PRESET_GROUPS.includes(deleteGroup.name))}
                onClick={confirmDeleteGroup}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(editBatch)} title="Edit batch" onClose={() => setEditBatch(null)}>
        {editBatch && (
          <form className="grid gap-3" onSubmit={saveBatch}>
            <label className="grid gap-1 text-sm font-bold">
              Batch name
              <input
                className="field"
                value={editBatch.title}
                onChange={(e) => setEditBatch({ ...editBatch, title: e.target.value })}
                required
              />
            </label>
            <GroupSelect
              form={editBatch}
              setForm={setEditBatch}
              groups={usedGroups}
            />
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={editBatch.is_active}
                onChange={(e) => setEditBatch({ ...editBatch, is_active: e.target.checked })}
              />
              Live for students
            </label>
            <button className="btn btn-primary mt-2" disabled={busy}>
              {busy ? 'Saving…' : 'Save batch'}
            </button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(deleteBatch)} title="Delete batch?" onClose={() => !busy && setDeleteBatch(null)}>
        {deleteBatch && (
          <div className="grid gap-3">
            <p className="text-[var(--muted)]">
              Permanently delete “{deleteBatch.title}”? Questions, share links, and student attempts on this batch will be removed.
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" disabled={busy} onClick={() => setDeleteBatch(null)}>
                Cancel
              </button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={confirmDeleteBatch}>
                {busy ? 'Deleting…' : 'Delete batch'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(copyBatch)} title="Copy batch" onClose={() => !busy && setCopyBatch(null)}>
        {copyBatch && (
          <form className="grid gap-3" onSubmit={confirmCopyBatch}>
            <p className="text-sm text-[var(--muted)]">
              Duplicate “{copyBatch.exam.title}” with its questions and share-link settings. Student attempts are not copied.
            </p>
            <label className="grid gap-1 text-sm font-bold">
              New batch name
              <input
                className="field"
                value={copyBatch.title}
                onChange={(e) => setCopyBatch({ ...copyBatch, title: e.target.value })}
                required
              />
            </label>
            <GroupSelect form={copyBatch} setForm={setCopyBatch} groups={usedGroups} />
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" disabled={busy} onClick={() => setCopyBatch(null)}>
                Cancel
              </button>
              <button className="btn btn-primary flex-1" disabled={busy}>
                {busy ? 'Copying…' : 'Copy batch'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function GroupSelect({ form, setForm, groups }) {
  return (
    <>
      <label className="grid gap-1 text-sm font-bold">
        Exam group
        <select
          className="field"
          value={form.group}
          onChange={(e) => setForm({ ...form, group: e.target.value })}
        >
          {groups.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__custom">New group…</option>
        </select>
      </label>
      {form.group === '__custom' && (
        <label className="grid gap-1 text-sm font-bold">
          New group name
          <input
            className="field"
            value={form.custom_group}
            onChange={(e) => setForm({ ...form, custom_group: e.target.value })}
            placeholder="SSC, NEET, Police…"
            required
          />
        </label>
      )}
    </>
  );
}

function ExamGrid({ exams, emptyLabel, ...actions }) {
  if (!exams.length) {
    return <p className="mt-8 text-[var(--muted)]">{emptyLabel}</p>;
  }
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {exams.map((exam) => (
        <ExamCard key={exam.id} exam={exam} {...actions} />
      ))}
    </div>
  );
}

function ExamCard({ exam, copied, onCopy, onDuplicate, onEdit, onDelete, hideGroup = false }) {
  return (
    <article className="overflow-hidden rounded-3xl bg-black/20">
      {exam.cover_url ? (
        <img src={mediaUrl(exam.cover_url, exam.updated_at)} alt="" className="exam-cover" />
      ) : null}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
        <div>
          {!hideGroup && <span className={`chip ${groupChip(exam.group || 'Other')}`}>{exam.group || 'Other'}</span>}
          <h2 className={`font-display text-xl font-bold ${hideGroup ? '' : 'mt-2'}`}>{exam.title}</h2>
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
        <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => onCopy(exam.slug)}>
          {copied === exam.slug ? 'Copied!' : 'Copy link'}
        </button>
        <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => onDuplicate(exam)}>
          Copy batch
        </button>
        <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => onEdit(exam)}>
          Edit
        </button>
        <button className="btn btn-ghost px-4 py-2 text-sm text-[var(--danger)]" onClick={() => onDelete(exam)}>
          Delete
        </button>
      </div>
      </div>
    </article>
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
