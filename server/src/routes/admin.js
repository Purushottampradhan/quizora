import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireAdmin, signToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Exam } from '../models/Exam.js';
import { Question } from '../models/Question.js';
import { ExamPaper } from '../models/ExamPaper.js';
import { Attempt } from '../models/Attempt.js';
import { AttemptAnswer } from '../models/AttemptAnswer.js';
import { parseQuestionFile, buildExcelTemplateBuffer } from '../services/parseQuestions.js';
import { attemptJson, examJson, optionText, paperJson, questionJson, slugify } from '../services/quizEngine.js';

const MAX_QUESTIONS = 500;

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function paperFields(body) {
  const allowed = {};
  if (typeof body.title === 'string') allowed.title = body.title.trim() || 'Share link';
  if (body.mode === 'exam' || body.mode === 'practice' || body.mode === 'read') allowed.mode = body.mode;
  if (typeof body.shuffle_questions === 'boolean') allowed.shuffleQuestions = body.shuffle_questions;
  if (typeof body.shuffle_options === 'boolean') allowed.shuffleOptions = body.shuffle_options;
  if (body.plus_mark != null) allowed.plusMark = Math.max(0, Number(body.plus_mark) || 1);
  if (body.minus_mark != null) allowed.minusMark = Math.max(0, Number(body.minus_mark) || 0);
  if (['all', 'range', 'count', 'manual'].includes(body.selection_type)) {
    allowed.selectionType = body.selection_type;
  }
  if (body.range_start != null) allowed.rangeStart = Number(body.range_start) || null;
  if (body.range_end != null) allowed.rangeEnd = Number(body.range_end) || null;
  if (body.pick_count != null) allowed.pickCount = Number(body.pick_count) || null;
  if (Array.isArray(body.question_ids)) allowed.questionIds = body.question_ids;
  if (typeof body.is_active === 'boolean') allowed.isActive = body.is_active;
  return allowed;
}

async function requireExam(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ error: 'Exam not found' });
    return null;
  }
  const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user.id });
  if (!exam) {
    res.status(404).json({ error: 'Exam not found' });
    return null;
  }
  return exam;
}

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({
    token: signToken(user),
    user: { id: String(user._id), email: user.email },
  });
});

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
  const exams = await Exam.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
  const ids = exams.map((e) => e._id);
  const counts = {};
  for (const id of ids) {
    counts[String(id)] = { questions: 0, attempts: 0, submitted: 0 };
  }
  if (ids.length) {
    const [qCounts, attempts] = await Promise.all([
      Question.aggregate([{ $match: { examId: { $in: ids } } }, { $group: { _id: '$examId', n: { $sum: 1 } } }]),
      Attempt.find({ examId: { $in: ids } }).select('examId submittedAt'),
    ]);
    for (const row of qCounts) {
      counts[String(row._id)].questions = row.n;
    }
    for (const a of attempts) {
      const key = String(a.examId);
      counts[key] = counts[key] || { questions: 0, attempts: 0, submitted: 0 };
      counts[key].attempts += 1;
      if (a.submittedAt) counts[key].submitted += 1;
    }
  }

  res.json({
    exams: exams.map((e) => {
      const c = counts[String(e._id)] || { questions: 0, attempts: 0, submitted: 0 };
      return {
        ...examJson(e),
        question_count: c.questions,
        attempt_count: c.attempts,
        submitted_count: c.submitted,
      };
    }),
  });
});

router.post('/exams', requireAdmin, async (req, res) => {
  const { title, description, duration_minutes } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const duration = duration_minutes === '' || duration_minutes == null ? null : Number(duration_minutes);
  const exam = await Exam.create({
    title: String(title).trim(),
    description: String(description || '').trim(),
    slug: slugify(title),
    durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : null,
    createdBy: req.user.id,
  });
  await ExamPaper.create({
    examId: exam._id,
    slug: exam.slug,
    title: 'Full exam',
    mode: 'exam',
    selectionType: 'all',
  });
  res.status(201).json({ exam: examJson(exam) });
});

router.get('/exams/:id', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;

  const [questions, papers] = await Promise.all([
    Question.find({ examId: exam._id }).sort({ orderIndex: 1 }).limit(MAX_QUESTIONS),
    ExamPaper.find({ examId: exam._id }).sort({ createdAt: 1 }),
  ]);

  res.json({
    exam: examJson(exam),
    questions: questions.map(questionJson),
    papers: papers.map((p) => paperJson(p, questions)),
  });
});

router.patch('/exams/:id', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const body = req.body || {};
  if (typeof body.title === 'string') exam.title = body.title.trim();
  if (typeof body.description === 'string') exam.description = body.description.trim();
  if (typeof body.is_active === 'boolean') exam.isActive = body.is_active;
  if (body.duration_minutes === null || body.duration_minutes === '') exam.durationMinutes = null;
  else if (body.duration_minutes != null) exam.durationMinutes = Number(body.duration_minutes) || null;
  await exam.save();
  res.json({ exam: examJson(exam) });
});

router.delete('/exams/:id', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const attempts = await Attempt.find({ examId: exam._id }).select('_id');
  await AttemptAnswer.deleteMany({ attemptId: { $in: attempts.map((a) => a._id) } });
  await Attempt.deleteMany({ examId: exam._id });
  await Question.deleteMany({ examId: exam._id });
  await ExamPaper.deleteMany({ examId: exam._id });
  await exam.deleteOne();
  res.json({ ok: true });
});

router.post('/exams/:id/questions', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;

  const count = await Question.countDocuments({ examId: exam._id });
  if (count >= MAX_QUESTIONS) {
    return res.status(400).json({ error: `An exam can have at most ${MAX_QUESTIONS} questions` });
  }
  const last = await Question.findOne({ examId: exam._id }).sort({ orderIndex: -1 }).select('orderIndex');
  const body = req.body || {};
  const row = {
    examId: exam._id,
    questionText: String(body.question_text || '').trim(),
    optionA: String(body.option_a || '').trim(),
    optionB: String(body.option_b || '').trim(),
    optionC: String(body.option_c || '').trim(),
    optionD: String(body.option_d || '').trim(),
    correctAnswer: String(body.correct_answer || '').trim().toUpperCase(),
    explanation: String(body.explanation || '').trim(),
    remark: String(body.remark || '').trim(),
    orderIndex: (last?.orderIndex ?? -1) + 1,
  };

  if (!row.questionText || !row.optionA || !row.optionB || !row.optionC || !row.optionD) {
    return res.status(400).json({ error: 'Question and all four options are required' });
  }
  if (!['A', 'B', 'C', 'D'].includes(row.correctAnswer)) {
    return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
  }

  const question = await Question.create(row);
  res.status(201).json({ question: questionJson(question) });
});

router.post('/exams/:id/questions/upload', requireAdmin, upload.single('file'), async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  if (!req.file) return res.status(400).json({ error: 'Choose a JSON, CSV, or Excel file' });

  try {
    const { questions, errors } = parseQuestionFile(req.file.buffer, req.file.originalname);
    const count = await Question.countDocuments({ examId: exam._id });
    const remaining = MAX_QUESTIONS - count;
    if (remaining <= 0) {
      return res.status(400).json({ error: `An exam can have at most ${MAX_QUESTIONS} questions` });
    }
    const toAdd = questions.slice(0, remaining);
    const last = await Question.findOne({ examId: exam._id }).sort({ orderIndex: -1 }).select('orderIndex');
    let start = (last?.orderIndex ?? -1) + 1;
    const docs = toAdd.map((q, i) => ({
      examId: exam._id,
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c,
      optionD: q.option_d,
      correctAnswer: q.correct_answer,
      explanation: q.explanation || '',
      remark: q.remark || '',
      orderIndex: start + i,
    }));
    const added = docs.length ? await Question.insertMany(docs) : [];
    const warnings = [...(errors || [])];
    if (questions.length > toAdd.length) {
      warnings.push(`Only ${toAdd.length} questions were added (${MAX_QUESTIONS} max per exam).`);
    }
    res.json({ added: added.length, warnings, questions: added.map(questionJson) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not parse file' });
  }
});

router.patch('/exams/:id/questions/:qid', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const body = req.body || {};
  const row = {
    questionText: String(body.question_text || '').trim(),
    optionA: String(body.option_a || '').trim(),
    optionB: String(body.option_b || '').trim(),
    optionC: String(body.option_c || '').trim(),
    optionD: String(body.option_d || '').trim(),
    correctAnswer: String(body.correct_answer || '').trim().toUpperCase(),
    explanation: String(body.explanation || '').trim(),
    remark: String(body.remark || '').trim(),
  };

  if (!row.questionText || !row.optionA || !row.optionB || !row.optionC || !row.optionD) {
    return res.status(400).json({ error: 'Question and all four options are required' });
  }
  if (!['A', 'B', 'C', 'D'].includes(row.correctAnswer)) {
    return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
  }

  const question = await Question.findOneAndUpdate(
    { _id: req.params.qid, examId: exam._id },
    { $set: row },
    { new: true }
  );
  if (!question) return res.status(404).json({ error: 'Question not found' });
  res.json({ question: questionJson(question) });
});

router.delete('/exams/:id/questions', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const result = await Question.deleteMany({ examId: exam._id });
  await ExamPaper.updateMany({ examId: exam._id }, { $set: { questionIds: [] } });
  res.json({ ok: true, deleted: result.deletedCount || 0 });
});

router.delete('/exams/:id/questions/:qid', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  await Question.deleteOne({ _id: req.params.qid, examId: exam._id });
  res.json({ ok: true });
});

router.get('/exams/:id/attempts', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;

  const attempts = await Attempt.find({ examId: exam._id }).sort({ startedAt: -1 });
  const ids = attempts.map((a) => a._id);
  const answers = ids.length ? await AttemptAnswer.find({ attemptId: { $in: ids } }) : [];
  const byAttempt = {};
  for (const ans of answers) {
    const key = String(ans.attemptId);
    byAttempt[key] = byAttempt[key] || [];
    byAttempt[key].push(ans);
  }

  res.json({
    attempts: attempts.map((a) => {
      const list = byAttempt[String(a._id)] || [];
      const answered = list.filter((x) => x.selectedOption).length;
      const avgMs =
        list.length > 0 ? Math.round(list.reduce((s, x) => s + (x.timeSpentMs || 0), 0) / list.length) : 0;
      return {
        ...attemptJson(a),
        answered_count: answered,
        avg_time_ms: avgMs,
      };
    }),
  });
});

router.get('/attempts/:attemptId', requireAdmin, async (req, res) => {
  const attempt = await Attempt.findById(req.params.attemptId);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const exam = await Exam.findOne({ _id: attempt.examId, createdBy: req.user.id });
  if (!exam) return res.status(404).json({ error: 'Attempt not found' });

  const questions = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 }).limit(MAX_QUESTIONS);
  const answers = await AttemptAnswer.find({ attemptId: attempt._id });
  const answerMap = Object.fromEntries(answers.map((a) => [String(a.questionId), a]));
  const qMap = Object.fromEntries(questions.map((q) => [String(q._id), q]));
  const ordered = (attempt.questionIds || []).length
    ? attempt.questionIds.map((qid) => qMap[String(qid)]).filter(Boolean)
    : questions;

  const details = ordered.map((q, i) => {
    const ans = answerMap[String(q._id)];
    const selected = ans?.selectedOption || null;
    return {
      number: i + 1,
      question_id: String(q._id),
      question_text: q.questionText,
      option_a: q.optionA,
      option_b: q.optionB,
      option_c: q.optionC,
      option_d: q.optionD,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      remark: q.remark,
      selected_option: selected,
      is_correct: ans?.isCorrect ?? null,
      time_spent_ms: ans?.timeSpentMs || 0,
      selected_label: selected ? optionText(q, selected) : null,
      correct_label: optionText(q, q.correctAnswer),
    };
  });

  res.json({ exam: examJson(exam), attempt: attemptJson(attempt), details });
});

router.post('/exams/:id/papers', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const fields = paperFields(req.body || {});
  const paper = await ExamPaper.create({
    examId: exam._id,
    slug: slugify(fields.title || 'set'),
    title: fields.title || 'Share link',
    mode: fields.mode || 'exam',
    shuffleQuestions: fields.shuffleQuestions || false,
    shuffleOptions: fields.shuffleOptions || false,
    plusMark: fields.plusMark ?? 1,
    minusMark: fields.minusMark ?? 0,
    selectionType: fields.selectionType || 'all',
    rangeStart: fields.rangeStart ?? null,
    rangeEnd: fields.rangeEnd ?? null,
    pickCount: fields.pickCount ?? null,
    questionIds: fields.questionIds || [],
    isActive: fields.isActive !== false,
  });
  const questions = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 });
  res.status(201).json({ paper: paperJson(paper, questions) });
});

router.patch('/exams/:id/papers/:pid', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const fields = paperFields(req.body || {});
  const paper = await ExamPaper.findOneAndUpdate(
    { _id: req.params.pid, examId: exam._id },
    { $set: fields },
    { new: true }
  );
  if (!paper) return res.status(404).json({ error: 'Link not found' });
  const questions = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 });
  res.json({ paper: paperJson(paper, questions) });
});

router.delete('/exams/:id/papers/:pid', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  await ExamPaper.deleteOne({ _id: req.params.pid, examId: exam._id });
  res.json({ ok: true });
});

export default router;
