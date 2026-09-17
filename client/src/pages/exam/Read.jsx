import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../../lib/api.js';
import { examPageTitle } from '../../lib/examTitle.js';
import Logo from '../../components/Logo.jsx';
import Spinner from '../../components/Spinner.jsx';

const PAGE = 10;

function storageKey(slug) {
  return `quiz97-read:${slug}`;
}

function readPlace(slug) {
  try {
    const raw =
      localStorage.getItem(storageKey(slug)) || localStorage.getItem(`quizora-read:${slug}`);
    const data = JSON.parse(raw || 'null');
    return {
      lastNumber: Math.max(1, Number(data?.lastNumber) || 1),
      loadedCount: Math.max(0, Number(data?.loadedCount) || 0),
    };
  } catch {
    return { lastNumber: 1, loadedCount: 0 };
  }
}

function writePlace(slug, place) {
  localStorage.setItem(
    storageKey(slug),
    JSON.stringify({
      lastNumber: Math.max(1, Number(place.lastNumber) || 1),
      loadedCount: Math.max(0, Number(place.loadedCount) || 0),
    })
  );
  localStorage.removeItem(`quizora-read:${slug}`);
}

export default function Read() {
  const { slug } = useParams();
  const [exam, setExam] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickedUp, setPickedUp] = useState(null);
  const listRef = useRef(null);
  const itemsRef = useRef([]);

  const fetchPage = useCallback(
    async (offset) => {
      const data = await api(`/api/public/exams/${slug}/notes?offset=${offset}&limit=${PAGE}`);
      setExam(data.exam);
      setTotal(data.total || 0);
      setHasMore(Boolean(data.has_more));
      return data.items || [];
    },
    [slug]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!exam) return;
    const previous = document.title;
    document.title = examPageTitle(exam);
    return () => {
      document.title = previous;
    };
  }, [exam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setPickedUp(null);
      try {
        const saved = readPlace(slug);
        const want = Math.max(PAGE, saved.loadedCount || 0);
        const collected = [];
        let more = true;
        while (more && collected.length < want) {
          const batch = await fetchPage(collected.length);
          collected.push(...batch);
          more = batch.length === PAGE;
          if (cancelled) return;
        }
        if (cancelled) return;
        setItems(collected);
        const last = Math.min(saved.lastNumber, collected.length || 1);
        if (saved.loadedCount > PAGE || last > 1) {
          setPickedUp(last);
        }
        writePlace(slug, { lastNumber: last, loadedCount: collected.length });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, fetchPage]);

  useEffect(() => {
    if (loading || !pickedUp) return;
    const el = listRef.current?.querySelector(`[data-q="${pickedUp}"]`);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [loading, pickedUp, items.length]);

  useEffect(() => {
    const root = listRef.current;
    if (!root || !items.length) return;
    const seen = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).map((e) => Number(e.target.dataset.q));
        if (!visible.length) return;
        writePlace(slug, {
          lastNumber: Math.max(...visible),
          loadedCount: itemsRef.current.length,
        });
      },
      { root: null, threshold: 0.45 }
    );
    root.querySelectorAll('[data-q]').forEach((node) => seen.observe(node));
    return () => seen.disconnect();
  }, [items, slug]);

  async function loadMore() {
    setBusy(true);
    setError('');
    try {
      const batch = await fetchPage(items.length);
      const next = [...items, ...batch];
      setItems(next);
      writePlace(slug, {
        lastNumber: Math.max(readPlace(slug).lastNumber, next[next.length - 1]?.number || 1),
        loadedCount: next.length,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    localStorage.removeItem(storageKey(slug));
    localStorage.removeItem(`quizora-read:${slug}`);
    setPickedUp(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setLoading(true);
    fetchPage(0)
      .then((batch) => {
        setItems(batch);
        writePlace(slug, { lastNumber: 1, loadedCount: batch.length });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  if (loading) return <Spinner label="Opening your notes" />;

  const progress = total ? Math.min(100, Math.round((items.length / total) * 100)) : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-16 pt-6">
      <header className="sticky top-0 z-10 -mx-4 mb-6 border-b border-white/10 bg-[#100a24]/85 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <Link to="/">
            <Logo />
          </Link>
          {exam && (
            <span className="text-xs font-extrabold text-[var(--muted)]">
              {items.length}/{total}
            </span>
          )}
        </div>
        {exam && (
          <div className="progress-track mt-3">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </header>
      {exam ? (
        <>
          <div>
            {exam.cover_url ? (
              <img
                src={mediaUrl(exam.cover_url)}
                alt=""
                className="exam-cover mb-4 -mx-4 w-[calc(100%+2rem)] max-w-none"
              />
            ) : null}
            <span className="chip chip-gold">Read notes</span>
            <h1 className="font-display mt-3 text-3xl font-extrabold">{exam.title}</h1>
            {exam.paper_title && exam.paper_title !== exam.title && (
              <p className="mt-1 font-bold text-[var(--gold)]">{exam.paper_title}</p>
            )}
            {exam.description ? <p className="mt-2 text-[var(--muted)]">{exam.description}</p> : null}
            <p className="mt-3 text-sm text-[var(--muted)]">Read the question, the answer, and why — you do not need to pick an option.</p>
            {pickedUp > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="chip chip-muted">Continuing from question {pickedUp}</span>
                <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={startOver}>
                  Start from beginning
                </button>
              </div>
            )}
          </div>

          <div ref={listRef} className="mt-6 grid gap-4">
            {items.map((q) => (
              <article key={q.number} data-q={q.number} className="glass rounded-3xl p-5">
                <p className="text-xs font-extrabold tracking-wide text-[var(--muted)]">Question {q.number}</p>
                <h2 className="font-display mt-2 text-lg font-bold leading-snug">{q.question_text}</h2>
                <div className="read-answer">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--mint)]">Answer</p>
                  <p className="mt-1 font-semibold">{q.answer}</p>
                </div>
                {q.explanation ? (
                  <div className="read-explain">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--gold)]">Why</p>
                    <p className="mt-1 text-[var(--muted)]">{q.explanation}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

          {hasMore ? (
            <button className="btn btn-primary mx-auto mt-6" onClick={loadMore} disabled={busy}>
              {busy ? 'Loading…' : `Show next ${PAGE} questions`}
            </button>
          ) : (
            <p className="mt-6 text-center text-sm text-[var(--muted)]">You have read all {total} questions.</p>
          )}
        </>
      ) : (
        <p className="mt-10 text-[var(--danger)]">{error || 'We could not find these notes.'}</p>
      )}
    </div>
  );
}
