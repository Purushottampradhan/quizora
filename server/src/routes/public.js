import { Router } from 'express';
import { supabaseAnon } from '../supabase.js';
import { generateSuggestions } from '../services/aiCoach.js';

const router = Router();

async function rpc(name, args) {
  const { data, error } = await supabaseAnon().rpc(name, args);
  if (error) {
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }
  if (data && data.error) {
    const err = new Error(data.error);
    err.status = 400;
    throw err;
  }
  return data;
}

function handle(err, res) {
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
    await rpc('quiz_save_ai', { p_attempt_id: attemptId, p_suggestions: suggestions });
  }
  return suggestions;
}

router.get('/exams/:slug', async (req, res) => {
  try {
    const data = await rpc('quiz_get_exam', { p_slug: req.params.slug });
    if (data?.error) return res.status(404).json({ error: data.error });
    res.json(data);
  } catch (err) {
    handle(err, res);
  }
});

router.post('/exams/:slug/start', async (req, res) => {
  try {
    const data = await rpc('quiz_start_exam', {
      p_slug: req.params.slug,
      p_name: String(req.body?.name || ''),
    });
    if (data?.error) return res.status(400).json({ error: data.error });
    res.status(201).json(data);
  } catch (err) {
    handle(err, res);
  }
});

router.get('/attempts/:id', async (req, res) => {
  try {
    const data = await rpc('quiz_get_attempt', { p_id: req.params.id });
    if (data?.error) return res.status(404).json({ error: data.error });
    res.json(data);
  } catch (err) {
    handle(err, res);
  }
});

router.post('/attempts/:id/answer', async (req, res) => {
  try {
    const data = await rpc('quiz_save_answer', {
      p_attempt_id: req.params.id,
      p_question_id: req.body?.question_id,
      p_selected: req.body?.selected_option,
      p_time_ms: Number(req.body?.time_spent_ms) || 0,
    });
    if (data?.error) return res.status(400).json({ error: data.error });
    res.json(data);
  } catch (err) {
    handle(err, res);
  }
});

router.post('/attempts/:id/heartbeat', async (req, res) => {
  try {
    const data = await rpc('quiz_heartbeat', {
      p_attempt_id: req.params.id,
      p_question_id: req.body?.question_id,
      p_time_ms: Number(req.body?.time_spent_ms) || 0,
    });
    res.json(data || { ok: true });
  } catch (err) {
    handle(err, res);
  }
});

router.post('/attempts/:id/submit', async (req, res) => {
  try {
    const data = await rpc('quiz_submit_exam', {
      p_attempt_id: req.params.id,
      p_timings: req.body?.timings || {},
    });
    if (data?.error) return res.status(400).json({ error: data.error });
    if (data.already) {
      return res.json({ attempt_id: data.attempt_id, score: data.score, total: data.total, already: true });
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
      console.error('[quizora] AI save after submit failed:', err.message);
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
    const data = await rpc('quiz_get_result', { p_id: req.params.id });
    if (data?.error) return res.status(404).json({ error: data.error });

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
    const data = await rpc('quiz_get_result', { p_id: req.params.id });
    if (data?.error) return res.status(404).json({ error: data.error });
    res.json(data);
  } catch (err) {
    handle(err, res);
  }
});

export default router;
