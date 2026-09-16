import { useMemo, useState } from 'react';
import { formatDuration, formatMarks } from '../../lib/format.js';

export function attemptsForPaper(attempts, paper, examSlug) {
  return (attempts || []).filter((a) => {
    if (a.paper_id) return a.paper_id === paper.id;
    return paper.slug === examSlug;
  });
}

function sortRows(rows, sort) {
  const copy = [...rows];
  if (sort === 'marks') {
    copy.sort((a, b) => {
      const as = a.submitted_at ? 1 : 0;
      const bs = b.submitted_at ? 1 : 0;
      if (bs !== as) return bs - as;
      const marks = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (marks) return marks;
      return (Number(a.time_taken_ms) || 0) - (Number(b.time_taken_ms) || 0);
    });
  } else if (sort === 'time') {
    copy.sort((a, b) => {
      if (Boolean(a.submitted_at) !== Boolean(b.submitted_at)) return a.submitted_at ? -1 : 1;
      return (Number(a.time_taken_ms) || Number.POSITIVE_INFINITY) - (Number(b.time_taken_ms) || Number.POSITIVE_INFINITY);
    });
  } else if (sort === 'name') {
    copy.sort((a, b) => String(a.candidate_name || '').localeCompare(String(b.candidate_name || ''), undefined, { sensitivity: 'base' }));
  } else {
    copy.sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  }
  return copy;
}

function marksLabel(a) {
  if (!a.submitted_at) return `${a.answered_count || 0} answered`;
  const max = a.max_score || a.total_questions;
  return `${formatMarks(a.score)} / ${formatMarks(max)}`;
}

export default function LinkBoard({ attempts, paper, examSlug, onOpenAttempt, onBlock, onResetIp, blocks = [] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('marks');

  const mine = useMemo(() => attemptsForPaper(attempts, paper, examSlug), [attempts, paper, examSlug]);

  const submitted = mine.filter((a) => a.submitted_at);
  const unique = new Set(mine.map((a) => String(a.candidate_name || '').trim().toLowerCase()).filter(Boolean)).size;
  const avgMarks = submitted.length
    ? submitted.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / submitted.length
    : 0;
  const avgTime = submitted.length
    ? submitted.reduce((sum, a) => sum + (Number(a.time_taken_ms) || 0), 0) / submitted.length
    : 0;
  const totalTime = submitted.reduce((sum, a) => sum + (Number(a.time_taken_ms) || 0), 0);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? mine.filter((a) => String(a.candidate_name || '').toLowerCase().includes(needle))
      : mine;
    return sortRows(filtered, sort);
  }, [mine, query, sort]);

  const blockedIps = new Set(blocks.filter((b) => b.kind === 'ip').map((b) => b.value));

  if (paper.mode === 'read' && !mine.length) {
    return (
      <p className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-sm text-[var(--muted)]">
        Read mode has no leaderboard — students study notes and do not submit scores.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      {paper.mode === 'read' && (
        <p className="mb-3 text-xs text-[var(--muted)]">
          This is a read link. The scores below are from earlier quiz attempts on this URL.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat n={mine.length} label="Attempts" />
        <Stat n={unique} label="People" />
        <Stat n={submitted.length ? formatMarks(avgMarks) : '—'} label="Avg marks" />
        <Stat n={submitted.length ? formatDuration(avgTime) : '—'} label="Avg time" />
      </div>
      {submitted.length > 0 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Combined time on submitted papers: {formatDuration(totalTime)}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="field py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          aria-label="Search candidates by name"
        />
        <select
          className="field py-2 text-sm sm:max-w-52"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort candidates"
        >
          <option value="marks">Top by marks</option>
          <option value="time">Fastest time</option>
          <option value="name">Name A–Z</option>
          <option value="recent">Most recent</option>
        </select>
      </div>

      {!mine.length ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No one has used this link yet.</p>
      ) : !rows.length ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No names match “{query}”.</p>
      ) : (
        <div className="link-attempts">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>IP</th>
                <th>Marks</th>
                <th>Time</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.id}>
                  <td className="text-[var(--muted)]">{i + 1}</td>
                  <td className="font-bold">{a.candidate_name}</td>
                  <td className="text-xs text-[var(--muted)]">
                    {a.client_ip || '—'}
                    {a.client_ip && blockedIps.has(a.client_ip) && (
                      <span className="chip chip-danger ml-1">Blocked</span>
                    )}
                  </td>
                  <td>{marksLabel(a)}</td>
                  <td>{a.submitted_at ? formatDuration(a.time_taken_ms) : '—'}</td>
                  <td>
                    <span className={`chip ${a.submitted_at ? 'chip-mint' : 'chip-muted'}`}>
                      {a.submitted_at ? 'Submitted' : 'In progress'}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => onOpenAttempt?.(a.id)}>
                        Details
                      </button>
                      {paper.mode !== 'read' && onBlock && a.client_ip ? (
                        <button
                          className="btn btn-ghost px-2 py-1 text-xs text-[var(--danger)]"
                          onClick={() => onBlock('ip', a.client_ip)}
                        >
                          Block IP
                        </button>
                      ) : null}
                      {onResetIp && a.client_ip ? (
                        <button
                          className="btn btn-ghost px-2 py-1 text-xs"
                          onClick={() => onResetIp(a.client_ip)}
                        >
                          Reset IP
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className="stat-tile">
      <p className="font-display text-lg font-extrabold leading-none">{n}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</p>
    </div>
  );
}
