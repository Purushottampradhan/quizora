import { Router } from 'express';
import multer from 'multer';
import { requireAdmin } from '../middleware/auth.js';
import { parseQuestionFile, buildExcelTemplateBuffer } from '../services/parseQuestions.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function slugify(title) {
  const base = String(title || 'exam')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'exam';
  const tag = Math.random().toString(36).slice(2, 8);
  return `${base}-${tag}`;
}

function optionText(q, letter) {
  return { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }[letter] || '';
}

router.get('/me', requireAdmin, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

router.get('/template.xlsx', requireAdmin, (_req, res) => {
  const buf = buildExcelTemplateBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="quizora-questions-template.xlsx"');
  res.send(buf);
});

router.get('/exams', requireAdmin, async (req, res) => {
  const { data: exams, error } = await req.sb
    .from('exams')
    .select('*')
    .eq('created_by', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const ids = (exams || []).map((e) => e.id);
  const counts = {};
  if (ids.length) {
    const { data: qs } = await req.sb.from('questions').select('exam_id').in('exam_id', ids);
    const { data: atts } = await req.sb.from('attempts').select('exam_id, submitted_at, score, total_questions').in('exam_id', ids);
    for (const q of qs || []) counts[q.exam_id] = counts[q.exam_id] || { questions: 0, attempts: 0, submitted: 0 };
    for (const q of qs || []) counts[q.exam_id].questions += 1;
    for (const a of atts || []) {
      counts[a.exam_id] = counts[a.exam_id] || { questions: 0, attempts: 0, submitted: 0 };
      counts[a.exam_id].attempts += 1;
      if (a.submitted_at) counts[a.exam_id].submitted += 1;
    }
  }

  res.json({
    exams: (exams || []).map((e) => ({
      ...e,
      question_count: counts[e.id]?.questions || 0,
      attempt_count: counts[e.id]?.attempts || 0,
      submitted_count: counts[e.id]?.submitted || 0,
    })),
  });
});

router.post('/exams', requireAdmin, async (req, res) => {
  const { title, description, duration_minutes } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const duration = duration_minutes === '' || duration_minutes == null ? null : Number(duration_minutes);
  const { data, error } = await req.sb
    .from('exams')
    .insert({
      title: String(title).trim(),
      description: String(description || '').trim(),
      slug: slugify(title),
      duration_minutes: Number.isFinite(duration) && duration > 0 ? duration : null,
      created_by: req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ exam: data });
});

router.get('/exams/:id', requireAdmin, async (req, res) => {
  const { data: exam, error } = await req.sb
    .from('exams')
    .select('*')
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .single();
  if (error || !exam) return res.status(404).json({ error: 'Exam not found' });

  const { data: questions } = await req.sb
    .from('questions')
    .select('*')
    .eq('exam_id', exam.id)
    .order('order_index', { ascending: true });

  res.json({ exam, questions: questions || [] });
});

router.patch('/exams/:id', requireAdmin, async (req, res) => {
  const allowed = {};
  const body = req.body || {};
  if (typeof body.title === 'string') allowed.title = body.title.trim();
  if (typeof body.description === 'string') allowed.description = body.description.trim();
  if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active;
  if (body.duration_minutes === null || body.duration_minutes === '') allowed.duration_minutes = null;
  else if (body.duration_minutes != null) allowed.duration_minutes = Number(body.duration_minutes) || null;

  const { data, error } = await req.sb
    .from('exams')
    .update(allowed)
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .select()
    .single();
  if (error || !data) return res.status(404).json({ error: error?.message || 'Exam not found' });
  res.json({ exam: data });
});

router.delete('/exams/:id', requireAdmin, async (req, res) => {
  const { error } = await req.sb.from('exams').delete().eq('id', req.params.id).eq('created_by', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.post('/exams/:id/questions', requireAdmin, async (req, res) => {
  const { data: exam } = await req.sb
    .from('exams')
    .select('id')
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .single();
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const body = req.body || {};
  const { data: last } = await req.sb
    .from('questions')
    .select('order_index')
    .eq('exam_id', exam.id)
    .order('order_index', { ascending: false })
    .limit(1);
  const { count } = await req.sb
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', exam.id);
  if ((count || 0) >= 50) {
    return res.status(400).json({ error: 'An exam can have at most 50 questions' });
  }
  const order_index = (last?.[0]?.order_index ?? -1) + 1;

  const row = {
    exam_id: exam.id,
    question_text: String(body.question_text || '').trim(),
    option_a: String(body.option_a || '').trim(),
    option_b: String(body.option_b || '').trim(),
    option_c: String(body.option_c || '').trim(),
    option_d: String(body.option_d || '').trim(),
    correct_answer: String(body.correct_answer || '').trim().toUpperCase(),
    explanation: String(body.explanation || '').trim(),
    remark: String(body.remark || '').trim(),
    order_index,
  };

  if (!row.question_text || !row.option_a || !row.option_b || !row.option_c || !row.option_d) {
    return res.status(400).json({ error: 'Question and all four options are required' });
  }
  if (!['A', 'B', 'C', 'D'].includes(row.correct_answer)) {
    return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
  }

  const { data, error } = await req.sb.from('questions').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ question: data });
});

router.post('/exams/:id/questions/upload', requireAdmin, upload.single('file'), async (req, res) => {
  const { data: exam } = await req.sb
    .from('exams')
    .select('id')
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .single();
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  if (!req.file) return res.status(400).json({ error: 'Choose a JSON, CSV, or Excel file' });

  try {
    const { questions, errors } = parseQuestionFile(req.file.buffer, req.file.originalname);
    const { count } = await req.sb
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('exam_id', exam.id);
    const remaining = 50 - (count || 0);
    if (remaining <= 0) {
      return res.status(400).json({ error: 'An exam can have at most 50 questions' });
    }
    const toAdd = questions.slice(0, remaining);
    const { data: last } = await req.sb
      .from('questions')
      .select('order_index')
      .eq('exam_id', exam.id)
      .order('order_index', { ascending: false })
      .limit(1);
    let start = (last?.[0]?.order_index ?? -1) + 1;
    const rows = toAdd.map((q, i) => ({ ...q, exam_id: exam.id, order_index: start + i }));
    const { data, error } = await req.sb.from('questions').insert(rows).select();
    if (error) return res.status(500).json({ error: error.message });
    const warnings = [...(errors || [])];
    if (questions.length > toAdd.length) {
      warnings.push(`Only ${toAdd.length} questions were added (50 max per exam).`);
    }
    res.json({ added: data.length, warnings, questions: data });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not parse file' });
  }
});

router.patch('/exams/:id/questions/:qid', requireAdmin, async (req, res) => {
  const { data: exam } = await req.sb
    .from('exams')
    .select('id')
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .single();
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const body = req.body || {};
  const row = {
    question_text: String(body.question_text || '').trim(),
    option_a: String(body.option_a || '').trim(),
    option_b: String(body.option_b || '').trim(),
    option_c: String(body.option_c || '').trim(),
    option_d: String(body.option_d || '').trim(),
    correct_answer: String(body.correct_answer || '').trim().toUpperCase(),
    explanation: String(body.explanation || '').trim(),
    remark: String(body.remark || '').trim(),
  };

  if (!row.question_text || !row.option_a || !row.option_b || !row.option_c || !row.option_d) {
    return res.status(400).json({ error: 'Question and all four options are required' });
  }
  if (!['A', 'B', 'C', 'D'].includes(row.correct_answer)) {
    return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
  }

  const { data, error } = await req.sb
    .from('questions')
    .update(row)
    .eq('id', req.params.qid)
    .eq('exam_id', exam.id)
    .select()
    .single();
  if (error || !data) return res.status(404).json({ error: error?.message || 'Question not found' });
  res.json({ question: data });
});

router.delete('/exams/:id/questions/:qid', requireAdmin, async (req, res) => {
  const { data: exam } = await req.sb
    .from('exams')
    .select('id')
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .single();
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const { error } = await req.sb.from('questions').delete().eq('id', req.params.qid).eq('exam_id', exam.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get('/exams/:id/attempts', requireAdmin, async (req, res) => {
  const { data: exam } = await req.sb
    .from('exams')
    .select('id')
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .single();
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const { data: attempts, error } = await req.sb
    .from('attempts')
    .select('*')
    .eq('exam_id', exam.id)
    .order('started_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const ids = (attempts || []).map((a) => a.id);
  let answers = [];
  if (ids.length) {
    const { data } = await req.sb.from('attempt_answers').select('*').in('attempt_id', ids);
    answers = data || [];
  }

  const byAttempt = {};
  for (const ans of answers) {
    byAttempt[ans.attempt_id] = byAttempt[ans.attempt_id] || [];
    byAttempt[ans.attempt_id].push(ans);
  }

  res.json({
    attempts: (attempts || []).map((a) => {
      const list = byAttempt[a.id] || [];
      const answered = list.filter((x) => x.selected_option).length;
      const avgMs =
        list.length > 0 ? Math.round(list.reduce((s, x) => s + (x.time_spent_ms || 0), 0) / list.length) : 0;
      return {
        ...a,
        answered_count: answered,
        avg_time_ms: avgMs,
      };
    }),
  });
});

router.get('/attempts/:attemptId', requireAdmin, async (req, res) => {
  const { data: attempt, error } = await req.sb
    .from('attempts')
    .select('*')
    .eq('id', req.params.attemptId)
    .single();
  if (error || !attempt) return res.status(404).json({ error: 'Attempt not found' });

  const { data: exam } = await req.sb
    .from('exams')
    .select('*')
    .eq('id', attempt.exam_id)
    .eq('created_by', req.user.id)
    .single();
  if (!exam) return res.status(404).json({ error: 'Attempt not found' });

  const { data: questions } = await req.sb
    .from('questions')
    .select('*')
    .eq('exam_id', exam.id)
    .order('order_index', { ascending: true });
  const { data: answers } = await req.sb
    .from('attempt_answers')
    .select('*')
    .eq('attempt_id', attempt.id);

  const answerMap = Object.fromEntries((answers || []).map((a) => [a.question_id, a]));
  const details = (questions || []).map((q, i) => {
    const ans = answerMap[q.id];
    return {
      number: i + 1,
      question_id: q.id,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      remark: q.remark,
      selected_option: ans?.selected_option || null,
      is_correct: ans?.is_correct ?? null,
      time_spent_ms: ans?.time_spent_ms || 0,
      selected_label: ans?.selected_option ? optionText(q, ans.selected_option) : null,
      correct_label: optionText(q, q.correct_answer),
    };
  });

  res.json({ exam, attempt, details });
});

export default router;
