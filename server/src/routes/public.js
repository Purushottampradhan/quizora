import { Router } from 'express';
import {
  getAttempt,
  getExamBySlug,
  getReadNotes,
  getResult,
  getShareMeta,
  getCoverImage,
  heartbeat,
  saveAi,
  saveAnswer,
  startExam,
  submitExam,
} from '../services/quizService.js';
import { generateSuggestions } from '../services/aiCoach.js';
import { clientIp } from '../lib/identity.js';
import { renderShareImage } from '../services/ogImage.js';

const router = Router();

function handle(err, res) {
  if (err?.name === 'CastError') {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Request failed' });
}

function answersFromDetails(details) {
  return (details || []).map((q) => {
    const letter = String(q.selected_option || '').toLowerCase();
    const correct = String(q.correct_answer || '').toLowerCase();
    return {
      question_text: q.question_text,
      selected_label: letter ? q[`option_${letter}`] : 'Not answered',
      correct_label: correct ? q[`option_${correct}`] : '',
      explanation: q.explanation,
      is_correct: q.is_correct,
      time_spent_ms: q.time_spent_ms,
    };
  });
}

async function saveAiTips(attemptId, payload) {
  const suggestions = await generateSuggestions(payload);
  if (suggestions.length) {
    await saveAi(attemptId, suggestions);
  }
  return suggestions;
}

router.get('/exams/:slug/cover', async (req, res) => {
  try {
    const image = await getCoverImage(req.params.slug);
    res.setHeader('Content-Type', image.type);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(image.buffer);
  } catch (err) {
    handle(err, res);
  }
});

router.get('/exams/:slug/share', async (req, res) => {
  try {
    res.json(await getShareMeta(req.params.slug));
  } catch (err) {
    handle(err, res);
  }
});

router.get('/exams/:slug/og.png', async (req, res) => {
  try {
    const meta = await getShareMeta(req.params.slug);
    let cover = null;
    try {
      cover = await getCoverImage(req.params.slug);
    } catch {
      cover = null;
    }
    const image = await renderShareImage(cover?.buffer, meta);
    res.setHeader('Content-Type', image.mime);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(image.body);
  } catch (err) {
    handle(err, res);
  }
});

router.get('/exams/:slug', async (req, res) => {
  try {
    res.json(await getExamBySlug(req.params.slug, clientIp(req)));
  } catch (err) {
    handle(err, res);
  }
});

router.get('/exams/:slug/notes', async (req, res) => {
  try {
    res.json(
      await getReadNotes(req.params.slug, Number(req.query.offset) || 0, Number(req.query.limit) || 10)
    );
  } catch (err) {
    handle(err, res);
  }
});

router.post('/exams/:slug/start', async (req, res) => {
  try {
    const data = await startExam(req.params.slug, req.body?.name, clientIp(req));
    res.status(201).json(data);
  } catch (err) {
    handle(err, res);
  }
});

router.get('/attempts/:id', async (req, res) => {
  try {
    res.json(await getAttempt(req.params.id));
  } catch (err) {
    handle(err, res);
  }
});

router.post('/attempts/:id/answer', async (req, res) => {
  try {
    res.json(
      await saveAnswer(
        req.params.id,
        req.body?.question_id,
        req.body?.selected_option,
        Number(req.body?.time_spent_ms) || 0
      )
    );
  } catch (err) {
    handle(err, res);
  }
});

router.post('/attempts/:id/heartbeat', async (req, res) => {
  try {
    res.json(
      await heartbeat(req.params.id, req.body?.question_id, Number(req.body?.time_spent_ms) || 0)
    );
  } catch (err) {
    handle(err, res);
  }
});

router.post('/attempts/:id/submit', async (req, res) => {
  try {
    const data = await submitExam(req.params.id, req.body?.timings || {});
    if (data.already) {
      return res.json({
        attempt_id: data.attempt_id,
        score: data.score,
        total: data.total,
        already: true,
      });
    }

    let ai_suggestions = [];
    try {
      ai_suggestions = await saveAiTips(req.params.id, {
        name: data.name,
        examTitle: data.exam_title || 'Exam',
        score: data.score,
        total: data.total,
        answers: data.review || [],
      });
    } catch (err) {
      console.error('[quiz97] AI save after submit failed:', err.message);
    }
    res.json({
      attempt_id: data.attempt_id,
      score: data.score,
      total: data.total,
      ai_suggestions,
    });
  } catch (err) {
    handle(err, res);
  }
});

router.post('/attempts/:id/coach', async (req, res) => {
  try {
    const data = await getResult(req.params.id);
    const existing = Array.isArray(data.attempt?.ai_suggestions)
      ? data.attempt.ai_suggestions.map(String).filter(Boolean)
      : [];
    if (existing.length >= 2) {
      return res.json({ suggestions: existing.slice(0, 3) });
    }

    const suggestions = await saveAiTips(req.params.id, {
      name: data.attempt?.candidate_name,
      examTitle: data.exam?.title || 'Exam',
      score: data.attempt?.score,
      total: data.attempt?.total_questions,
      answers: answersFromDetails(data.details),
    });
    res.json({ suggestions });
  } catch (err) {
    handle(err, res);
  }
});

router.get('/attempts/:id/result', async (req, res) => {
  try {
    res.json(await getResult(req.params.id));
  } catch (err) {
    handle(err, res);
  }
});

export default router;
