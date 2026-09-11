import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDuration, percent, formatMarks } from '../../lib/format.js';
import Logo from '../../components/Logo.jsx';
import Spinner from '../../components/Spinner.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function Result() {
  const { slug, attemptId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tips, setTips] = useState([]);
  const [aiStatus, setAiStatus] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api(`/api/public/attempts/${attemptId}/result`);
        if (cancelled) return;
        setData(res);
        const existing = Array.isArray(res.attempt?.ai_suggestions)
          ? res.attempt.ai_suggestions.map(String).filter(Boolean)
          : [];
        if (existing.length >= 2) {
          setTips(existing.slice(0, 3));
          setAiStatus('ready');
          return;
        }
        if (existing.length) setTips(existing);
        setAiStatus('loading');
        try {
          const coached = await api(`/api/public/attempts/${attemptId}/coach`, { method: 'POST' });
          if (cancelled) return;
          const next = Array.isArray(coached.suggestions)
            ? coached.suggestions.map(String).filter(Boolean)
            : [];
          if (next.length) {
            setTips(next.slice(0, 3));
            setAiStatus('ready');
          } else {
            setAiStatus(existing.length ? 'ready' : 'missing');
          }
        } catch {
          if (!cancelled) setAiStatus(existing.length ? 'ready' : 'missing');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-[var(--danger)]">{error}</p>
        <Link className="btn btn-ghost mt-4 inline-flex" to={`/e/${slug}`}>
          Back to start
        </Link>
      </div>
    );
  }
  if (!data) return <Spinner label="Crunching results" />;

  const { attempt, exam, details } = data;
  const maxScore = Number(attempt.max_score) || attempt.total_questions || details.length;
  const pct = percent(Math.max(0, attempt.score), maxScore);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Logo />
      <section className="glass mt-8 rounded-3xl p-6 text-center">
        <p className="text-sm text-[var(--muted)]">Nice work, {attempt.candidate_name}</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold">{exam.title}</h1>
        {exam.paper_title && exam.paper_title !== exam.title && (
          <p className="mt-1 text-[var(--gold)]">{exam.paper_title}</p>
        )}
        <p className="mt-2 text-xs font-extrabold tracking-wide text-[var(--coral-2)]">
          {attempt.mode === 'practice' ? 'PRACTICE' : 'EXAM'}
        </p>
        <div className="score-ring mx-auto mt-6" style={{ '--p': pct }}>
          <div className="score-inner">
            {formatMarks(attempt.score)}/{formatMarks(maxScore)}
          </div>
        </div>
        <p className="mt-4 text-lg font-bold">{pct}% · {formatDuration(attempt.time_taken_ms)} total</p>
        <p className="text-sm text-[var(--muted)]">
          {attempt.correct_count ?? '—'} correct · {attempt.wrong_count ?? 0} wrong · {attempt.skip_count ?? 0} skipped
          {Number(attempt.minus_mark) > 0 ? ` · +${formatMarks(attempt.plus_mark)} / −${formatMarks(attempt.minus_mark)}` : ''}
        </p>
        <p className="text-sm text-[var(--muted)]">
          Average {formatDuration((attempt.time_taken_ms || 0) / Math.max(1, details.length))} per question
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-bold">Answer review</h2>
        <p className="mt-1 text-[var(--muted)]">Your pick, the correct one, and why.</p>
        <div className="mt-4 grid gap-3">
          {details.map((q) => (
            <article key={q.number} className="glass rounded-3xl p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">
                  {q.number}. {q.question_text}
                </h3>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-extrabold ${
                  q.is_correct
                    ? 'bg-emerald-400/15 text-[var(--mint)]'
                    : q.selected_option
                      ? 'bg-rose-400/15 text-[var(--danger)]'
                      : 'bg-amber-400/15 text-[var(--gold)]'
                }`}>
                  {q.is_correct ? 'Correct' : q.selected_option ? 'Wrong' : 'Skipped'} · {formatDuration(q.time_spent_ms)}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {LETTERS.map((letter) => {
                  const selected = q.selected_option === letter;
                  const correct = q.correct_answer === letter;
                  let cls = 'option cursor-default';
                  if (correct) cls += ' correct';
                  else if (selected) cls += ' wrong';
                  return (
                    <div key={letter} className={cls}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 font-extrabold">
                        {letter}
                      </span>
                      <span className="pt-1">
                        {q[`option_${letter.toLowerCase()}`]}
                        {selected && <em className="ml-2 text-xs not-italic text-[var(--muted)]">your answer</em>}
                        {correct && <em className="ml-2 text-xs not-italic text-[var(--mint)]">correct</em>}
                      </span>
                    </div>
                  );
                })}
              </div>
              {q.explanation && (
                <p className="mt-3 rounded-2xl bg-black/25 p-3 text-sm leading-relaxed">
                  <strong className="text-[var(--gold)]">Why: </strong>
                  {q.explanation}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 mb-10">
        <h2 className="font-display text-2xl font-bold">What to improve next</h2>
        <p className="mt-1 text-[var(--muted)]">2–3 AI tips based on your answers.</p>
        {tips.length ? (
          <ol className="mt-4 grid gap-2">
            {tips.slice(0, 3).map((tip, i) => (
              <li key={i} className="glass flex gap-3 rounded-2xl p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--coral)] font-extrabold text-[#2a0b12]">
                  {i + 1}
                </span>
                <p className="pt-1 leading-relaxed">{tip}</p>
              </li>
            ))}
          </ol>
        ) : aiStatus === 'loading' || aiStatus === 'idle' ? (
          <p className="glass mt-4 rounded-2xl p-4 text-[var(--muted)]">Writing your AI tips…</p>
        ) : (
          <p className="glass mt-4 rounded-2xl p-4 text-[var(--muted)]">
            Could not generate AI tips. Refresh this page to try again.
          </p>
        )}
      </section>
    </div>
  );
}
