import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireAdmin, signToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Exam } from '../models/Exam.js';
import { Question } from '../models/Question.js';
import { ExamPaper } from '../models/ExamPaper.js';
import { ExamBlock } from '../models/ExamBlock.js';
import { Attempt } from '../models/Attempt.js';
import { nameKey, normalizeIp } from '../lib/identity.js';
import { AttemptAnswer } from '../models/AttemptAnswer.js';
import { parseQuestionFile, buildExcelTemplateBuffer } from '../services/parseQuestions.js';
import { attemptJson, examJson, normalizeGroup, optionText, paperJson, questionJson, slugify } from '../services/quizEngine.js';

function parseDuration(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function ensureDefaultReadPaper(exam) {
  const paper = await ExamPaper.findOne({ examId: exam._id, slug: exam.slug });
  if (!paper || paper.mode === 'read') return;
  await ExamPaper.updateOne(
    { _id: paper._id },
    { $set: { mode: 'read', title: paper.title === 'Full exam' ? 'Read notes' : paper.title } }
  );
}

async function backfillPaperDurations(exam) {
  await ExamPaper.updateMany(
    { examId: exam._id, durationMinutes: { $exists: false } },
    { $set: { durationMinutes: exam.durationMinutes ?? null } }
  );
}

const MAX_QUESTIONS = 500;

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
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
  if (typeof body.allow_multiple === 'boolean') allowed.allowMultipleAttempts = body.allow_multiple;
  if (Object.prototype.hasOwnProperty.call(body, 'duration_minutes')) {
    allowed.durationMinutes = parseDuration(body.duration_minutes);
  }
  return allowed;
}

function blockJson(b) {
  return {
    id: String(b._id),
    kind: b.kind,
    value: b.value,
    label: b.label || b.value,
    note: b.note || '',
    created_at: b.createdAt,
  };
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
  res.setHeader('Content-Disposition', 'attachment; filename="quiz97-questions-template.xlsx"');
  res.send(buf);
});

router.get('/exams', requireAdmin, async (req, res) => {
  const exams = await Exam.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
  const missingGroup = exams.filter((exam) => !exam.group);
  if (missingGroup.length) {
    await Promise.all(
      missingGroup.map((exam) => {
        exam.group = normalizeGroup('', exam.title);
        return exam.save();
      })
    );
  }
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
  const { title, description, duration_minutes, group } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const duration = parseDuration(duration_minutes);
  const exam = await Exam.create({
    title: String(title).trim(),
    description: String(description || '').trim(),
    slug: slugify(title),
    durationMinutes: duration,
    group: normalizeGroup(group, title),
    createdBy: req.user.id,
  });
  await ExamPaper.create({
    examId: exam._id,
    slug: exam.slug,
    title: 'Read notes',
    mode: 'read',
    selectionType: 'all',
    durationMinutes: null,
  });
  res.status(201).json({ exam: examJson(exam) });
});

router.post('/exams/:id/copy', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const title = String(req.body?.title || `${exam.title} copy`).trim();
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const questions = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 }).limit(MAX_QUESTIONS);
  const papers = await ExamPaper.find({ examId: exam._id }).sort({ createdAt: 1 });
  const source = await Exam.findById(exam._id).select('+coverImage');

  let copy;
  try {
    copy = await Exam.create({
      title,
      description: exam.description || '',
      slug: slugify(title),
      durationMinutes: exam.durationMinutes ?? null,
      group: normalizeGroup(req.body?.group || exam.group, title),
      isActive: exam.isActive !== false,
      createdBy: req.user.id,
      coverImage: source.coverImage,
      coverImageType: source.coverImageType || '',
    });

    const idMap = new Map();
    if (questions.length) {
      const created = await Question.insertMany(
        questions.map((q, i) => ({
          examId: copy._id,
          questionText: q.questionText,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          remark: q.remark || '',
          orderIndex: q.orderIndex ?? i,
        }))
      );
      questions.forEach((q, i) => idMap.set(String(q._id), created[i]._id));
    }

    if (papers.length) {
      await ExamPaper.insertMany(
        papers.map((p) => {
          const isDefault = p.slug === exam.slug;
          return {
            examId: copy._id,
            slug: isDefault ? copy.slug : slugify(p.title || 'set'),
            title: p.title,
            mode: p.mode,
            shuffleQuestions: p.shuffleQuestions,
            shuffleOptions: p.shuffleOptions,
            durationMinutes: p.durationMinutes,
            plusMark: p.plusMark,
            minusMark: p.minusMark,
            selectionType: p.selectionType,
            rangeStart: p.rangeStart,
            rangeEnd: p.rangeEnd,
            pickCount: p.pickCount,
            questionIds: (p.questionIds || []).map((qid) => idMap.get(String(qid))).filter(Boolean),
            isActive: p.isActive !== false,
            allowMultipleAttempts: p.allowMultipleAttempts !== false,
          };
        })
      );
    } else {
      await ExamPaper.create({
        examId: copy._id,
        slug: copy.slug,
        title: 'Read notes',
        mode: 'read',
        selectionType: 'all',
        durationMinutes: null,
      });
    }
  } catch (err) {
    if (copy) await destroyExam(copy);
    throw err;
  }

  res.status(201).json({ exam: examJson(copy) });
});

router.get('/exams/:id', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;

  await backfillPaperDurations(exam);
  await ensureDefaultReadPaper(exam);
  const [questions, papers, blocks] = await Promise.all([
    Question.find({ examId: exam._id }).sort({ orderIndex: 1 }).limit(MAX_QUESTIONS),
    ExamPaper.find({ examId: exam._id }).sort({ createdAt: 1 }),
    ExamBlock.find({ examId: exam._id }).sort({ createdAt: -1 }),
  ]);

  res.json({
    exam: examJson(exam),
    questions: questions.map(questionJson),
    papers: papers.map((p) => paperJson(p, questions, exam)),
    blocks: blocks.map(blockJson),
  });
});

router.patch('/exams/:id', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const body = req.body || {};
  if (typeof body.title === 'string') exam.title = body.title.trim();
  if (typeof body.description === 'string') exam.description = body.description.trim();
  if (typeof body.is_active === 'boolean') exam.isActive = body.is_active;
  if (typeof body.group === 'string') exam.group = normalizeGroup(body.group);
  if (body.duration_minutes === null || body.duration_minutes === '') exam.durationMinutes = null;
  else if (body.duration_minutes != null) exam.durationMinutes = Number(body.duration_minutes) || null;
  await exam.save();
  res.json({ exam: examJson(exam) });
});

router.post('/exams/:id/cover', requireAdmin, coverUpload.single('file'), async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  if (!req.file?.buffer?.length) return res.status(400).json({ error: 'Choose a JPG, PNG, WebP, or GIF image' });
  if (!COVER_TYPES.has(req.file.mimetype)) {
    return res.status(400).json({ error: 'Use a JPG, PNG, WebP, or GIF image (max 2MB)' });
  }
  exam.coverImage = req.file.buffer;
  exam.coverImageType = req.file.mimetype;
  await exam.save();
  res.json({ exam: examJson(exam) });
});

router.delete('/exams/:id/cover', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  await Exam.updateOne({ _id: exam._id }, { $unset: { coverImage: 1 }, $set: { coverImageType: '' } });
  const next = await Exam.findById(exam._id);
  res.json({ exam: examJson(next) });
});

async function destroyExam(exam) {
  const attempts = await Attempt.find({ examId: exam._id }).select('_id');
  await AttemptAnswer.deleteMany({ attemptId: { $in: attempts.map((a) => a._id) } });
  await Attempt.deleteMany({ examId: exam._id });
  await Question.deleteMany({ examId: exam._id });
  await ExamPaper.deleteMany({ examId: exam._id });
  await ExamBlock.deleteMany({ examId: exam._id });
  await exam.deleteOne();
}

router.patch('/exam-groups', requireAdmin, async (req, res) => {
  const from = normalizeGroup(req.body?.from);
  const to = normalizeGroup(req.body?.to);
  if (!from || !to) return res.status(400).json({ error: 'Current and new group names are required' });
  if (from === to) return res.json({ ok: true, updated: 0, group: to });
  const result = await Exam.updateMany({ createdBy: req.user.id, group: from }, { $set: { group: to } });
  res.json({ ok: true, updated: result.modifiedCount || 0, group: to });
});

router.delete('/exam-groups', requireAdmin, async (req, res) => {
  const name = normalizeGroup(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Group name is required' });
  const exams = await Exam.find({ createdBy: req.user.id, group: name });
  for (const exam of exams) {
    await destroyExam(exam);
  }
  res.json({ ok: true, deleted: exams.length });
});

router.delete('/exams/:id', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  await destroyExam(exam);
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

  const [attempts, papers] = await Promise.all([
    Attempt.find({ examId: exam._id }).sort({ startedAt: -1 }),
    ExamPaper.find({ examId: exam._id }).select('title'),
  ]);
  const ids = attempts.map((a) => a._id);
  const answers = ids.length ? await AttemptAnswer.find({ attemptId: { $in: ids } }) : [];
  const byAttempt = {};
  for (const ans of answers) {
    const key = String(ans.attemptId);
    byAttempt[key] = byAttempt[key] || [];
    byAttempt[key].push(ans);
  }
  const titles = Object.fromEntries(papers.map((p) => [String(p._id), p.title]));

  res.json({
    attempts: attempts.map((a) => {
      const list = byAttempt[String(a._id)] || [];
      const answered = list.filter((x) => x.selectedOption).length;
      const avgMs =
        list.length > 0 ? Math.round(list.reduce((s, x) => s + (x.timeSpentMs || 0), 0) / list.length) : 0;
      return {
        ...attemptJson(a),
        paper_title: a.paperId ? titles[String(a.paperId)] || null : null,
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
    allowMultipleAttempts: fields.allowMultipleAttempts !== false,
    durationMinutes: Object.prototype.hasOwnProperty.call(fields, 'durationMinutes')
      ? fields.durationMinutes
      : exam.durationMinutes ?? null,
  });
  const questions = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 });
  res.status(201).json({ paper: paperJson(paper, questions, exam) });
});

router.patch('/exams/:id/papers/:pid', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const fields = paperFields(req.body || {});
  const current = await ExamPaper.findOne({ _id: req.params.pid, examId: exam._id });
  if (!current) return res.status(404).json({ error: 'Link not found' });
  const paper = await ExamPaper.findOneAndUpdate(
    { _id: current._id },
    { $set: fields },
    { new: true }
  );
  if (!paper) return res.status(404).json({ error: 'Link not found' });
  const questions = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 });
  res.json({ paper: paperJson(paper, questions, exam) });
});

router.delete('/exams/:id/papers/:pid', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const paper = await ExamPaper.findOne({ _id: req.params.pid, examId: exam._id });
  if (!paper) return res.status(404).json({ error: 'Link not found' });
  if (paper.slug === exam.slug) {
    return res.status(400).json({ error: 'The default read link cannot be deleted' });
  }
  await ExamPaper.deleteOne({ _id: paper._id });
  res.json({ ok: true });
});

router.post('/exams/:id/papers/:pid/reset-ip', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const paper = await ExamPaper.findOne({ _id: req.params.pid, examId: exam._id });
  if (!paper) return res.status(404).json({ error: 'Link not found' });
  const ip = normalizeIp(req.body?.ip);
  if (!ip) return res.status(400).json({ error: 'Enter an IP to reset' });

  const filter = { examId: exam._id, clientIp: ip };
  if (paper.slug === exam.slug) {
    filter.$or = [{ paperId: paper._id }, { paperId: null }];
  } else {
    filter.paperId = paper._id;
  }
  const attempts = await Attempt.find(filter).select('_id');
  await AttemptAnswer.deleteMany({ attemptId: { $in: attempts.map((a) => a._id) } });
  await Attempt.deleteMany({ _id: { $in: attempts.map((a) => a._id) } });
  res.json({ ok: true, deleted: attempts.length, ip });
});

router.get('/exams/:id/papers/:pid/misses', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const paper = await ExamPaper.findOne({ _id: req.params.pid, examId: exam._id });
  if (!paper) return res.status(404).json({ error: 'Link not found' });

  const filter = { examId: exam._id, submittedAt: { $ne: null } };
  if (paper.slug === exam.slug) {
    filter.$or = [{ paperId: paper._id }, { paperId: null }];
  } else {
    filter.paperId = paper._id;
  }
  const attempts = await Attempt.find(filter).select('_id questionIds');
  const attemptIds = attempts.map((a) => a._id);
  const answers = attemptIds.length ? await AttemptAnswer.find({ attemptId: { $in: attemptIds } }) : [];
  const byAttempt = new Map();
  for (const ans of answers) {
    const key = String(ans.attemptId);
    const map = byAttempt.get(key) || new Map();
    map.set(String(ans.questionId), ans);
    byAttempt.set(key, map);
  }

  const stats = new Map();
  function bucket(qid) {
    const key = String(qid);
    if (!stats.has(key)) stats.set(key, { seen: 0, wrong: 0, correct: 0, skipped: 0 });
    return stats.get(key);
  }

  for (const attempt of attempts) {
    const ids = (attempt.questionIds || []).length
      ? attempt.questionIds
      : [];
    const ansMap = byAttempt.get(String(attempt._id)) || new Map();
    const qids = ids.length ? ids : [...ansMap.keys()];
    for (const qid of qids) {
      const row = bucket(qid);
      row.seen += 1;
      const ans = ansMap.get(String(qid));
      if (!ans?.selectedOption) row.skipped += 1;
      else if (ans.isCorrect) row.correct += 1;
      else row.wrong += 1;
    }
  }

  const questions = await Question.find({ _id: { $in: [...stats.keys()] } });
  const qMap = Object.fromEntries(questions.map((q) => [String(q._id), q]));
  const items = [...stats.entries()]
    .map(([qid, row]) => {
      const q = qMap[qid];
      if (!q) return null;
      return {
        question_id: qid,
        question_text: q.questionText,
        correct_answer: q.correctAnswer,
        correct_label: optionText(q, q.correctAnswer),
        explanation: q.explanation || '',
        seen: row.seen,
        wrong: row.wrong,
        correct: row.correct,
        skipped: row.skipped,
        wrong_pct: row.seen ? Math.round((row.wrong / row.seen) * 100) : 0,
      };
    })
    .filter(Boolean)
    .filter((row) => row.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.wrong_pct - a.wrong_pct)
    .slice(0, 10);

  res.json({
    paper: paperJson(paper, questions, exam),
    submitted: attempts.length,
    items,
  });
});

router.post('/exams/:id/blocks', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const kind = req.body?.kind === 'ip' ? 'ip' : req.body?.kind === 'name' ? 'name' : '';
  if (!kind) return res.status(400).json({ error: 'Block a name or an IP' });
  const raw = String(req.body?.value || '').trim();
  if (!raw) return res.status(400).json({ error: 'Enter a name or IP to block' });
  const value = kind === 'ip' ? normalizeIp(raw) : nameKey(raw);
  if (!value) return res.status(400).json({ error: 'Enter a name or IP to block' });
  try {
    const block = await ExamBlock.create({
      examId: exam._id,
      kind,
      value,
      label: raw,
      note: String(req.body?.note || '').trim(),
    });
    res.status(201).json({ block: blockJson(block) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Already blocked' });
    throw err;
  }
});

router.delete('/exams/:id/blocks/:bid', requireAdmin, async (req, res) => {
  const exam = await requireExam(req, res);
  if (!exam) return;
  const result = await ExamBlock.deleteOne({ _id: req.params.bid, examId: exam._id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Block not found' });
  res.json({ ok: true });
});

export default router;
