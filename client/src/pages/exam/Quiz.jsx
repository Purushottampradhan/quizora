import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatClock } from '../../lib/format.js';
import Spinner from '../../components/Spinner.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];

function skipKey(attemptId) {
  return `quiz97-skip-${attemptId}`;
}

function loadSkips(attemptId) {
  try {
    const raw =
      localStorage.getItem(skipKey(attemptId)) || localStorage.getItem(`quizora-skip-${attemptId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Quiz() {
  const { slug, attemptId } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [skipped, setSkipped] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [qClock, setQClock] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [reveal, setReveal] = useState(null);
  const enteredAt = useRef(Date.now());
  const currentId = useRef(null);
  const submittedRef = useRef(false);
  const hiddenAt = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api(`/api/public/attempts/${attemptId}`);
        if (data.submitted) {
          navigate(`/e/${slug}/result/${attemptId}`, { replace: true });
          return;
        }
        setPayload(data);
        const map = {};
        for (const [qid, val] of Object.entries(data.answers || {})) {
          if (val.selected_option) map[qid] = val.selected_option;
        }
        setAnswers(map);
        const savedSkips = loadSkips(attemptId).filter((id) => !map[id]);
        setSkipped(savedSkips);
        enteredAt.current = Date.now();
        currentId.current = data.questions?.[0]?.id || null;
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [attemptId, slug, navigate]);

  useEffect(() => {
    localStorage.setItem(skipKey(attemptId), JSON.stringify(skipped));
  }, [skipped, attemptId]);

  useEffect(() => {
    if (!payload?.attempt?.started_at) return;
    const start = new Date(payload.attempt.started_at).getTime();
    const tick = () => {
      setElapsed(Date.now() - start);
      if (!hiddenAt.current) setQClock(Date.now() - enteredAt.current);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [payload, index]);

  const questions = payload?.questions || [];
  const exam = payload?.attempt?.exam;
  const question = questions[index];
  const isPractice = (payload?.attempt?.mode || exam?.mode) === 'practice';
  const limitMs = exam?.duration_minutes ? exam.duration_minutes * 60 * 1000 : null;
  const remaining = limitMs ? Math.max(0, limitMs - elapsed) : null;

  function flushDelta() {
    if (hiddenAt.current) return 0;
    const ms = Math.max(0, Date.now() - enteredAt.current);
    enteredAt.current = Date.now();
    return ms;
  }

  function persistTime(questionId, ms) {
    if (!questionId || ms < 80) return;
    api(`/api/public/attempts/${attemptId}/heartbeat`, {
      method: 'POST',
      body: { question_id: questionId, time_spent_ms: ms },
    }).catch(() => {});
  }

  useEffect(() => {
    function onVis() {
      const qid = currentId.current;
      if (document.hidden) {
        const ms = flushDelta();
        persistTime(qid, ms);
        hiddenAt.current = Date.now();
      } else {
        hiddenAt.current = null;
        enteredAt.current = Date.now();
      }
    }
    function onLeave() {
      persistTime(currentId.current, flushDelta());
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [attemptId]);

  function nextOpenIndex(from, answeredMap, skipIds) {
    const open = (i) => {
      const q = questions[i];
      return q && !answeredMap[q.id];
    };
    for (let step = 1; step <= questions.length; step += 1) {
      const i = (from + step) % questions.length;
      if (open(i) && !skipIds.includes(questions[i].id)) return i;
    }
    for (let step = 1; step <= questions.length; step += 1) {
      const i = (from + step) % questions.length;
      if (open(i)) return i;
    }
    return from;
  }

  async function goTo(nextIndex) {
    if (nextIndex === index || nextIndex < 0 || nextIndex >= questions.length) return;
    const q = questions[index];
    persistTime(q?.id, flushDelta());
    setIndex(nextIndex);
    currentId.current = questions[nextIndex]?.id || null;
    enteredAt.current = Date.now();
    setQClock(0);
    setReveal(null);
  }

  async function pick(letter) {
    if (!question) return;
    if (isPractice && (reveal || answers[question.id])) return;
    const time_spent_ms = flushDelta();
    const nextAnswers = { ...answers, [question.id]: letter };
    setAnswers(nextAnswers);
    setSkipped((prev) => prev.filter((id) => id !== question.id));
    try {
      const res = await api(`/api/public/attempts/${attemptId}/answer`, {
        method: 'POST',
        body: { question_id: question.id, selected_option: letter, time_spent_ms },
      });
      if (res.mode === 'practice') {
        setReveal({
          picked: letter,
          correct_option: res.correct_option,
          explanation: res.explanation,
          is_correct: res.is_correct,
        });
        return;
      }
    } catch (err) {
      setError(err.message);
      return;
    }

    const next = nextOpenIndex(index, nextAnswers, skipped.filter((id) => id !== question.id));
    window.setTimeout(() => {
      if (next !== index) {
        setIndex(next);
        currentId.current = questions[next]?.id || null;
        enteredAt.current = Date.now();
        setQClock(0);
        setReveal(null);
      } else {
        enteredAt.current = Date.now();
      }
    }, 380);
  }

  function nextAfterPractice() {
    const next = nextOpenIndex(index, answers, skipped.filter((id) => id !== question.id));
    setReveal(null);
    if (next !== index) {
      persistTime(question.id, flushDelta());
      setIndex(next);
      currentId.current = questions[next]?.id || null;
      enteredAt.current = Date.now();
      setQClock(0);
    }
  }

  function skipQuestion() {
    if (!question || answers[question.id] || reveal) return;
    persistTime(question.id, flushDelta());
    const nextSkipped = skipped.includes(question.id) ? skipped : [...skipped, question.id];
    setSkipped(nextSkipped);
    const next = nextOpenIndex(index, answers, nextSkipped);
    setIndex(next);
    currentId.current = questions[next]?.id || null;
    enteredAt.current = Date.now();
    setQClock(0);
    setReveal(null);
  }

  async function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const timings = {};
      if (question) timings[question.id] = flushDelta();
      await api(`/api/public/attempts/${attemptId}/submit`, { method: 'POST', body: { timings } });
      localStorage.removeItem(skipKey(attemptId));
      navigate(`/e/${slug}/result/${attemptId}`);
    } catch (err) {
      submittedRef.current = false;
      setError(err.message);
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (remaining === 0 && payload) submit();
  }, [remaining, payload]);

  const done = useMemo(() => questions.filter((q) => answers[q.id]).length, [questions, answers]);
  const skipCount = skipped.filter((id) => !answers[id]).length;
  const left = questions.length - done;
  const practiceNext = question ? nextOpenIndex(index, answers, skipped.filter((id) => id !== question.id)) : index;

  if (error && !payload) {
    return <p className="p-6 text-[var(--danger)]">{error}</p>;
  }
  if (!payload || !question) return <Spinner label="Loading questions" />;

  return (
    <div className="quiz-shell mx-auto w-full max-w-3xl px-2.5 pt-2 sm:px-4">
      <header className="glass shrink-0 rounded-2xl px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display truncate text-[0.95rem] font-bold leading-tight">{exam.title}</p>
            <p className="text-[11px] text-[var(--muted)]">
              {isPractice ? 'Practice · ' : 'Exam · '}
              {done}/{questions.length} done · {skipCount} skip · {left} left
            </p>
          </div>
          <div className="shrink-0 text-right leading-tight">
            {remaining != null && (
              <p className={`font-display text-base font-extrabold ${remaining < 60000 ? 'text-[var(--danger)]' : ''}`}>
                {formatClock(remaining)}
                <span className="ml-1 text-[10px] font-bold text-[var(--muted)]">left</span>
              </p>
            )}
            <p className="text-[10px] text-[var(--gold)]">Q {formatClock(qClock)}</p>
          </div>
        </div>
        <div className="progress-track mt-2">
          <div className="progress-fill" style={{ width: `${questions.length ? (done / questions.length) * 100 : 0}%` }} />
        </div>
        <div className="quiz-pills mt-2">
          {questions.map((q, i) => {
            const isDone = Boolean(answers[q.id]);
            const isSkip = !isDone && skipped.includes(q.id);
            return (
              <button
                key={q.id}
                className={`q-pill ${isDone ? 'done' : ''} ${isSkip ? 'skipped' : ''} ${i === index ? 'current' : ''}`}
                onClick={() => goTo(i)}
                title={isDone ? 'Answered' : isSkip ? 'Skipped' : 'Not answered'}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] font-bold text-[var(--muted)]">
          <span className="text-[var(--coral)]">●</span> now
          <span className="ml-2 text-[var(--mint)]">● done</span>
          <span className="ml-2 text-[var(--gold)]">● skip</span>
        </p>
      </header>

      <section className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl glass px-3 py-2.5">
        <p className="text-[10px] font-extrabold tracking-wide text-[var(--muted)]">
          Q {index + 1}/{questions.length}
          {skipped.includes(question.id) && !answers[question.id] ? ' · SKIPPED' : ''}
        </p>
        <h1 className="quiz-stem">{question.question_text}</h1>
        <div className="mt-2 grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto pb-1">
          {LETTERS.map((letter) => {
            let cls = `quiz-option ${answers[question.id] === letter ? 'selected' : ''}`;
            if (reveal) {
              if (letter === reveal.correct_option) cls += ' correct';
              else if (letter === reveal.picked && !reveal.is_correct) cls += ' wrong';
            }
            return (
              <button
                key={letter}
                className={cls}
                onClick={() => pick(letter)}
                disabled={Boolean(reveal) || (isPractice && Boolean(answers[question.id]) && !reveal)}
              >
                <span className="quiz-letter">{letter}</span>
                <span>{question[`option_${letter.toLowerCase()}`]}</span>
              </button>
            );
          })}
        </div>
        {reveal && (
          <p className="mt-2 rounded-xl bg-black/25 p-2 text-xs leading-relaxed">
            {reveal.is_correct ? 'Correct. ' : `Wrong. Correct is ${reveal.correct_option}. `}
            {reveal.explanation}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
      </section>

      <div className="quiz-bar shrink-0">
        <div className="flex gap-1.5">
          <button className="btn btn-ghost flex-1" disabled={index === 0} onClick={() => goTo(index - 1)}>
            Back
          </button>
          <button
            className="btn btn-ghost flex-1"
            onClick={skipQuestion}
            disabled={Boolean(answers[question.id]) || Boolean(reveal)}
          >
            Skip
          </button>
          {isPractice && reveal && practiceNext !== index ? (
            <button className="btn btn-primary flex-[1.3]" onClick={nextAfterPractice}>
              Next
            </button>
          ) : (
            <button
              className="btn btn-primary flex-[1.3]"
              onClick={() => (left > 0 && !reveal ? setConfirm(true) : submit())}
              disabled={submitting}
            >
              {submitting ? '…' : 'Submit'}
            </button>
          )}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="glass w-full max-w-md rounded-3xl p-5">
            <h2 className="font-display text-xl font-bold">Submit now?</h2>
            <p className="mt-2 text-[var(--muted)]">
              {left} unanswered
              {skipCount ? `, including ${skipCount} skipped` : ''}. You can tap a gold number to go back, or submit anyway.
            </p>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setConfirm(false)}>
                Keep going
              </button>
              <button className="btn btn-primary flex-1" onClick={submit} disabled={submitting}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
