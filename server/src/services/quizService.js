import { Attempt } from '../models/Attempt.js';
import { AttemptAnswer } from '../models/AttemptAnswer.js';
import { Exam } from '../models/Exam.js';
import { ExamPaper } from '../models/ExamPaper.js';
import { Question } from '../models/Question.js';
import {
  displayLetter,
  identityMap,
  mappedQuestion,
  optionText,
  pickQuestionIds,
  shuffleLetterMap,
  sid,
} from './quizEngine.js';

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function publicExam(exam, paper, questionCount) {
  const p = paper || {};
  return {
    id: sid(exam._id),
    title: exam.title,
    description: exam.description,
    slug: p.slug || exam.slug,
    paper_title: p.title || exam.title,
    duration_minutes: exam.durationMinutes,
    is_active: exam.isActive,
    question_count: questionCount,
    mode: p.mode || 'exam',
    shuffle_questions: Boolean(p.shuffleQuestions),
    shuffle_options: Boolean(p.shuffleOptions),
    plus_mark: p.plusMark ?? 1,
    minus_mark: p.minusMark ?? 0,
    selection_type: p.selectionType || 'all',
  };
}

async function questionsByIds(ids) {
  if (!ids.length) return [];
  const docs = await Question.find({ _id: { $in: ids } });
  const map = new Map(docs.map((q) => [sid(q._id), q]));
  return ids.map((id) => map.get(sid(id))).filter(Boolean);
}

async function resolvePaperAndExam(slug) {
  const paper = await ExamPaper.findOne({ slug, isActive: true });
  if (paper) {
    const exam = await Exam.findOne({ _id: paper.examId, isActive: true });
    return { paper, exam };
  }
  const exam = await Exam.findOne({ slug, isActive: true });
  return { paper: null, exam };
}

function optionMapFor(attempt, questionId) {
  const maps = attempt.optionMaps || {};
  return maps[sid(questionId)] || identityMap();
}

function attemptPayload(attempt, exam, paper) {
  return {
    id: sid(attempt._id),
    candidate_name: attempt.candidateName,
    started_at: attempt.startedAt,
    mode: attempt.mode || 'exam',
    plus_mark: attempt.plusMark ?? 1,
    minus_mark: attempt.minusMark ?? 0,
    exam: {
      id: sid(exam._id),
      title: exam.title,
      description: exam.description,
      slug: paper?.slug || exam.slug,
      paper_title: paper?.title || exam.title,
      duration_minutes: exam.durationMinutes,
      mode: attempt.mode || 'exam',
    },
  };
}

export async function getExamBySlug(slug) {
  const { paper, exam } = await resolvePaperAndExam(slug);
  if (!exam) fail('This exam is not available', 404);

  if (paper) {
    const bank = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 });
    const ids = pickQuestionIds({ ...paper.toObject(), shuffleQuestions: paper.mode === 'read' ? false : paper.shuffleQuestions }, bank);
    return { exam: publicExam(exam, paper, ids.length) };
  }

  const count = await Question.countDocuments({ examId: exam._id });
  return { exam: publicExam(exam, null, count) };
}

const NOTES_MAX = 50;

export async function getReadNotes(slug, offset = 0, limit = 20) {
  const { paper, exam } = await resolvePaperAndExam(slug);
  if (!exam) fail('This exam is not available', 404);
  if ((paper?.mode || 'exam') !== 'read') {
    fail('This link is a quiz, not a reading set', 400);
  }

  const bank = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 });
  const ids = pickQuestionIds({ ...paper.toObject(), shuffleQuestions: false }, bank);
  const start = Math.max(0, Number(offset) || 0);
  const take = Math.min(NOTES_MAX, Math.max(1, Number(limit) || 10));
  const slice = ids.slice(start, start + take);
  const questions = await questionsByIds(slice);

  return {
    exam: publicExam(exam, paper, ids.length),
    items: questions.map((q, i) => ({
      number: start + i + 1,
      question_text: q.questionText,
      answer: optionText(q, q.correctAnswer),
      explanation: q.explanation || '',
    })),
    offset: start,
    total: ids.length,
    has_more: start + slice.length < ids.length,
  };
}

export async function startExam(slug, name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2) fail('Please enter your name (at least 2 characters)');

  const { paper, exam } = await resolvePaperAndExam(slug);
  if (!exam) fail('This exam is not available', 404);
  if ((paper?.mode || 'exam') === 'read') fail('This is a reading set, not a quiz');

  const bank = await Question.find({ examId: exam._id }).sort({ orderIndex: 1 });
  const ids = paper ? pickQuestionIds(paper, bank) : bank.map((q) => sid(q._id));
  if (!ids.length) fail('This exam has no questions yet');

  const questions = await questionsByIds(ids);
  const maps = {};
  const qs = questions.map((q) => {
    const qmap = paper?.shuffleOptions ? shuffleLetterMap() : identityMap();
    maps[sid(q._id)] = qmap;
    return mappedQuestion(q, qmap);
  });

  const plus = paper?.plusMark ?? 1;
  const attempt = await Attempt.create({
    examId: exam._id,
    paperId: paper?._id || null,
    candidateName: trimmed,
    totalQuestions: ids.length,
    questionIds: ids,
    optionMaps: maps,
    mode: paper?.mode || 'exam',
    plusMark: plus,
    minusMark: paper?.minusMark ?? 0,
    maxScore: ids.length * plus,
  });

  return {
    attempt: attemptPayload(attempt, exam, paper),
    questions: qs,
    answers: {},
  };
}

export async function getAttempt(id) {
  const attempt = await Attempt.findById(id);
  if (!attempt) fail('Attempt not found', 404);
  if (attempt.submittedAt) {
    return { submitted: true, attempt_id: sid(attempt._id) };
  }

  const exam = await Exam.findById(attempt.examId);
  const paper = attempt.paperId ? await ExamPaper.findById(attempt.paperId) : null;
  let ids = (attempt.questionIds || []).map(sid);
  if (!ids.length) {
    const bank = await Question.find({ examId: attempt.examId }).sort({ orderIndex: 1 });
    ids = bank.map((q) => sid(q._id));
  }

  const questions = await questionsByIds(ids);
  const qs = questions.map((q) => mappedQuestion(q, optionMapFor(attempt, q._id)));
  const saved = await AttemptAnswer.find({
    attemptId: attempt._id,
    selectedOption: { $nin: [null, ''] },
  });
  const answers = {};
  for (const ans of saved) {
    const qid = sid(ans.questionId);
    answers[qid] = {
      selected_option: displayLetter(optionMapFor(attempt, qid), ans.selectedOption),
      selected_original: ans.selectedOption,
      time_spent_ms: ans.timeSpentMs || 0,
    };
  }

  return {
    submitted: false,
    attempt: attemptPayload(attempt, exam, paper),
    questions: qs,
    answers,
  };
}

export async function saveAnswer(attemptId, questionId, selected, timeMs) {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.submittedAt) fail('This attempt is closed');

  const letter = String(selected || '').trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(letter)) fail('Pick option A, B, C, or D');

  const allowed = (attempt.questionIds || []).map(sid);
  if (allowed.length && !allowed.includes(sid(questionId))) fail('Invalid question');

  const question = await Question.findOne({ _id: questionId, examId: attempt.examId });
  if (!question) fail('Invalid question');

  const qmap = optionMapFor(attempt, questionId);
  const orig = qmap[letter] || letter;
  const spent = Math.max(Number(timeMs) || 0, 0);

  await AttemptAnswer.findOneAndUpdate(
    { attemptId: attempt._id, questionId: question._id },
    {
      $set: { selectedOption: orig, answeredAt: new Date() },
      $inc: { timeSpentMs: spent },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const isOk = orig === question.correctAnswer;
  if ((attempt.mode || 'exam') === 'practice') {
    return {
      ok: true,
      mode: 'practice',
      is_correct: isOk,
      correct_option: displayLetter(qmap, question.correctAnswer),
      explanation: question.explanation || '',
    };
  }
  return { ok: true, mode: 'exam' };
}

export async function heartbeat(attemptId, questionId, timeMs) {
  const spent = Math.max(Number(timeMs) || 0, 0);
  if (!attemptId || !questionId || spent <= 0) return { ok: true };

  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.submittedAt) return { ok: true };

  await AttemptAnswer.findOneAndUpdate(
    { attemptId: attempt._id, questionId },
    { $inc: { timeSpentMs: spent } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return { ok: true };
}

export async function submitExam(attemptId, timings = {}) {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt) fail('Attempt not found', 404);
  if (attempt.submittedAt) {
    return {
      attempt_id: sid(attempt._id),
      already: true,
      score: attempt.score,
      total: attempt.totalQuestions,
    };
  }

  const exam = await Exam.findById(attempt.examId);
  const plus = attempt.plusMark ?? 1;
  const minus = attempt.minusMark ?? 0;
  let ids = (attempt.questionIds || []).map(sid);
  if (!ids.length) {
    const bank = await Question.find({ examId: attempt.examId }).sort({ orderIndex: 1 });
    ids = bank.map((q) => sid(q._id));
  }

  const questions = await questionsByIds(ids);
  const answers = await AttemptAnswer.find({ attemptId: attempt._id });
  const byQ = new Map(answers.map((a) => [sid(a.questionId), a]));

  let points = 0;
  let nCorrect = 0;
  let nWrong = 0;
  let nSkip = 0;
  const review = [];

  for (const q of questions) {
    const extra = Math.max(Number(timings[sid(q._id)]) || 0, 0);
    const ans = byQ.get(sid(q._id));
    const selected = ans?.selectedOption || null;
    const correct = Boolean(selected && selected === q.correctAnswer);
    const timeSpent = (ans?.timeSpentMs || 0) + extra;

    if (!selected) nSkip += 1;
    else if (correct) {
      nCorrect += 1;
      points += plus;
    } else {
      nWrong += 1;
      points -= minus;
    }

    await AttemptAnswer.findOneAndUpdate(
      { attemptId: attempt._id, questionId: q._id },
      {
        $set: { selectedOption: selected, isCorrect: correct },
        $inc: { timeSpentMs: extra },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    review.push({
      question_text: q.questionText,
      selected_label: selected ? optionText(q, selected) : 'Not answered',
      correct_label: optionText(q, q.correctAnswer),
      explanation: q.explanation,
      is_correct: correct,
      time_spent_ms: timeSpent,
    });
  }

  const submitted = new Date();
  attempt.submittedAt = submitted;
  attempt.score = points;
  attempt.maxScore = questions.length * plus;
  attempt.totalQuestions = questions.length;
  attempt.correctCount = nCorrect;
  attempt.wrongCount = nWrong;
  attempt.skipCount = nSkip;
  attempt.timeTakenMs = Math.max(0, submitted.getTime() - new Date(attempt.startedAt).getTime());
  await attempt.save();

  return {
    attempt_id: sid(attempt._id),
    score: points,
    total: questions.length,
    max_score: questions.length * plus,
    name: attempt.candidateName,
    exam_title: exam?.title || 'Exam',
    review,
  };
}

export async function saveAi(attemptId, suggestions) {
  await Attempt.findByIdAndUpdate(attemptId, { aiSuggestions: suggestions || [] });
}

export async function getResult(id) {
  const attempt = await Attempt.findById(id);
  if (!attempt || !attempt.submittedAt) fail('Result not ready', 404);

  const exam = await Exam.findById(attempt.examId);
  const paper = attempt.paperId ? await ExamPaper.findById(attempt.paperId) : null;
  let ids = (attempt.questionIds || []).map(sid);
  if (!ids.length) {
    const bank = await Question.find({ examId: attempt.examId }).sort({ orderIndex: 1 });
    ids = bank.map((q) => sid(q._id));
  }

  const questions = await questionsByIds(ids);
  const answers = await AttemptAnswer.find({ attemptId: attempt._id });
  const byQ = new Map(answers.map((a) => [sid(a.questionId), a]));

  const details = questions.map((q, i) => {
    const ans = byQ.get(sid(q._id));
    return {
      number: i + 1,
      question_text: q.questionText,
      option_a: q.optionA,
      option_b: q.optionB,
      option_c: q.optionC,
      option_d: q.optionD,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      selected_option: ans?.selectedOption || null,
      is_correct: ans?.isCorrect ?? false,
      time_spent_ms: ans?.timeSpentMs || 0,
    };
  });

  return {
    exam: {
      title: exam?.title,
      description: exam?.description,
      slug: paper?.slug || exam?.slug,
      paper_title: paper?.title || exam?.title,
      mode: attempt.mode || 'exam',
    },
    attempt: {
      id: sid(attempt._id),
      candidate_name: attempt.candidateName,
      started_at: attempt.startedAt,
      submitted_at: attempt.submittedAt,
      score: attempt.score,
      max_score: attempt.maxScore ?? attempt.totalQuestions,
      total_questions: attempt.totalQuestions,
      correct_count: attempt.correctCount ?? attempt.score,
      wrong_count: attempt.wrongCount || 0,
      skip_count: attempt.skipCount || 0,
      plus_mark: attempt.plusMark ?? 1,
      minus_mark: attempt.minusMark ?? 0,
      time_taken_ms: attempt.timeTakenMs,
      ai_suggestions: attempt.aiSuggestions || [],
      mode: attempt.mode || 'exam',
    },
    details,
  };
}
