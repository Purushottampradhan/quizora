import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Logo from '../../components/Logo.jsx';
import Spinner from '../../components/Spinner.jsx';

const PAGE = 10;

function storageKey(slug) {
  return `quizora-read:${slug}`;
}

function readPlace(slug) {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(slug)) || 'null');
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

  if (loading) return <Spinner label="Opening notes" />;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
      <Link to="/">
        <Logo />
      </Link>
      {exam ? (
        <>
          <div className="mt-8">
            <p className="text-xs font-extrabold tracking-wide text-[var(--coral-2)]">READ</p>
            <h1 className="font-display mt-2 text-3xl font-extrabold">{exam.title}</h1>
            {exam.paper_title && exam.paper_title !== exam.title && (
              <p className="mt-1 font-bold text-[var(--gold)]">{exam.paper_title}</p>
            )}
            {exam.description ? <p className="mt-2 text-[var(--muted)]">{exam.description}</p> : null}
            <p className="mt-3 text-sm text-[var(--muted)]">
              {items.length} of {total} questions · answer and explanation only
            </p>
            {pickedUp > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-white/10 px-3 py-1">Picking up at Q {pickedUp}</span>
                <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={startOver}>
                  Start from beginning
                </button>
              </div>
            )}
          </div>

          <div ref={listRef} className="mt-6 grid gap-4">
            {items.map((q) => (
              <article key={q.number} data-q={q.number} className="glass rounded-3xl p-5">
                <p className="text-xs font-extrabold tracking-wide text-[var(--muted)]">Q {q.number}</p>
                <h2 className="font-display mt-2 text-lg font-bold leading-snug">{q.question_text}</h2>
                <p className="mt-4 text-sm font-bold text-[var(--mint)]">Answer</p>
                <p className="mt-1 font-semibold">{q.answer}</p>
                {q.explanation ? (
                  <>
                    <p className="mt-4 text-sm font-bold text-[var(--gold)]">Explanation</p>
                    <p className="mt-1 text-[var(--muted)]">{q.explanation}</p>
                  </>
                ) : null}
              </article>
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

          {hasMore ? (
            <button className="btn btn-primary mx-auto mt-6" onClick={loadMore} disabled={busy}>
              {busy ? 'Loading…' : 'Load more questions'}
            </button>
          ) : (
            <p className="mt-6 text-center text-sm text-[var(--muted)]">You have read all {total} questions.</p>
          )}
        </>
      ) : (
        <p className="mt-10 text-[var(--danger)]">{error || 'Notes not found'}</p>
      )}
    </div>
  );
}
