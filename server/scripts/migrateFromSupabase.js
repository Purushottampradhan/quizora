import { createHash } from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import '../src/loadEnv.js';
import { connectDb } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Exam } from '../src/models/Exam.js';
import { Question } from '../src/models/Question.js';
import { ExamPaper } from '../src/models/ExamPaper.js';
import { Attempt } from '../src/models/Attempt.js';
import { AttemptAnswer } from '../src/models/AttemptAnswer.js';

const PAGE = 1000;

function oid(uuid) {
  if (!uuid) return null;
  return new mongoose.Types.ObjectId(createHash('md5').update(String(uuid)).digest('hex').slice(0, 24));
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function supabaseLogin() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.SUPABASE_EMAIL;
  const password = process.env.SUPABASE_PASSWORD;
  if (!url || !anon || !email || !password) {
    throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_EMAIL, and SUPABASE_PASSWORD');
  }
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg || data.error || 'Supabase login failed');
  }
  return { url, anon, token: data.access_token };
}

async function fetchAll(sb, table) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const res = await fetch(`${sb.url}/rest/v1/${table}?select=*&order=id.asc`, {
      headers: {
        apikey: sb.anon,
        Authorization: `Bearer ${sb.token}`,
        Range: `${from}-${to}`,
        Prefer: 'count=exact',
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${table}: ${data.message || res.status}`);
    rows.push(...(Array.isArray(data) ? data : []));
    if (!Array.isArray(data) || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function remapIds(ids) {
  return (ids || []).map(oid).filter(Boolean);
}

function remapMaps(maps) {
  const out = {};
  for (const [key, value] of Object.entries(maps || {})) {
    out[String(oid(key))] = value;
  }
  return out;
}

async function ensureAdmin() {
  const email = String(process.env.ADMIN_EMAIL || process.env.SUPABASE_EMAIL || '')
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD || process.env.SUPABASE_PASSWORD;
  if (!email || !password) throw new Error('Need ADMIN_EMAIL/ADMIN_PASSWORD or SUPABASE_EMAIL/SUPABASE_PASSWORD');
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12) });
    console.log(`Created Mongo admin: ${email}`);
  }
  return user;
}

async function replaceAll(Model, docs) {
  if (!docs.length) return 0;
  const result = await Model.bulkWrite(
    docs.map((doc) => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
    })),
    { ordered: false }
  );
  return (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
}

const sb = await supabaseLogin();
await connectDb();
const admin = await ensureAdmin();

const [exams, questions, papers, attempts, answers] = await Promise.all([
  fetchAll(sb, 'exams'),
  fetchAll(sb, 'questions'),
  fetchAll(sb, 'exam_papers'),
  fetchAll(sb, 'attempts'),
  fetchAll(sb, 'attempt_answers'),
]);

console.log('Fetched from Supabase:', {
  exams: exams.length,
  questions: questions.length,
  papers: papers.length,
  attempts: attempts.length,
  answers: answers.length,
});

const examDocs = exams.map((e) => ({
  _id: oid(e.id),
  title: e.title,
  description: e.description || '',
  slug: e.slug,
  durationMinutes: e.duration_minutes == null ? null : num(e.duration_minutes, null),
  isActive: e.is_active !== false,
  createdBy: admin._id,
  createdAt: asDate(e.created_at) || new Date(),
  updatedAt: asDate(e.updated_at) || asDate(e.created_at) || new Date(),
}));

const questionDocs = questions.map((q) => ({
  _id: oid(q.id),
  examId: oid(q.exam_id),
  questionText: q.question_text,
  optionA: q.option_a,
  optionB: q.option_b,
  optionC: q.option_c,
  optionD: q.option_d,
  correctAnswer: String(q.correct_answer || 'A').toUpperCase(),
  explanation: q.explanation || '',
  remark: q.remark || '',
  orderIndex: num(q.order_index, 0),
  createdAt: asDate(q.created_at) || new Date(),
  updatedAt: asDate(q.created_at) || new Date(),
}));

const paperDocs = papers.map((p) => ({
  _id: oid(p.id),
  examId: oid(p.exam_id),
  slug: p.slug,
  title: p.title || 'Full exam',
  mode: p.mode === 'practice' ? 'practice' : 'exam',
  shuffleQuestions: Boolean(p.shuffle_questions),
  shuffleOptions: Boolean(p.shuffle_options),
  plusMark: num(p.plus_mark, 1),
  minusMark: num(p.minus_mark, 0),
  selectionType: ['all', 'range', 'count', 'manual'].includes(p.selection_type) ? p.selection_type : 'all',
  rangeStart: p.range_start == null ? null : num(p.range_start, null),
  rangeEnd: p.range_end == null ? null : num(p.range_end, null),
  pickCount: p.pick_count == null ? null : num(p.pick_count, null),
  questionIds: remapIds(p.question_ids),
  isActive: p.is_active !== false,
  createdAt: asDate(p.created_at) || new Date(),
  updatedAt: asDate(p.created_at) || new Date(),
}));

const attemptDocs = attempts.map((a) => ({
  _id: oid(a.id),
  examId: oid(a.exam_id),
  paperId: a.paper_id ? oid(a.paper_id) : null,
  candidateName: a.candidate_name,
  startedAt: asDate(a.started_at) || new Date(),
  submittedAt: asDate(a.submitted_at),
  score: num(a.score, 0),
  maxScore: num(a.max_score, 0),
  totalQuestions: num(a.total_questions, 0),
  timeTakenMs: num(a.time_taken_ms, 0),
  aiSuggestions: Array.isArray(a.ai_suggestions) ? a.ai_suggestions.map(String) : [],
  questionIds: remapIds(a.question_ids),
  optionMaps: remapMaps(a.option_maps),
  mode: a.mode === 'practice' ? 'practice' : 'exam',
  plusMark: num(a.plus_mark, 1),
  minusMark: num(a.minus_mark, 0),
  correctCount: num(a.correct_count, 0),
  wrongCount: num(a.wrong_count, 0),
  skipCount: num(a.skip_count, 0),
  createdAt: asDate(a.created_at) || asDate(a.started_at) || new Date(),
  updatedAt: asDate(a.created_at) || new Date(),
}));

const answerDocs = answers
  .filter((row) => row.attempt_id && row.question_id)
  .map((row) => ({
    _id: oid(row.id),
    attemptId: oid(row.attempt_id),
    questionId: oid(row.question_id),
    selectedOption: row.selected_option || null,
    isCorrect: row.is_correct ?? null,
    timeSpentMs: num(row.time_spent_ms, 0),
    answeredAt: asDate(row.answered_at) || new Date(),
    createdAt: asDate(row.answered_at) || new Date(),
    updatedAt: asDate(row.answered_at) || new Date(),
  }));

const written = {
  exams: await replaceAll(Exam, examDocs),
  questions: await replaceAll(Question, questionDocs),
  papers: await replaceAll(ExamPaper, paperDocs),
  attempts: await replaceAll(Attempt, attemptDocs),
  answers: await replaceAll(AttemptAnswer, answerDocs),
};

const counts = {
  users: await User.countDocuments(),
  exams: await Exam.countDocuments(),
  questions: await Question.countDocuments(),
  papers: await ExamPaper.countDocuments(),
  attempts: await Attempt.countDocuments(),
  answers: await AttemptAnswer.countDocuments(),
};

console.log('Upserted:', written);
console.log('Mongo quiz totals:', counts);
console.log('Student links still use the same /e/:slug URLs.');
await mongoose.disconnect();
