const LETTERS = ['A', 'B', 'C', 'D'];

export function sid(value) {
  return value == null ? '' : String(value);
}

export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function identityMap() {
  return { A: 'A', B: 'B', C: 'C', D: 'D' };
}

export function shuffleLetterMap() {
  const shuffled = shuffle(LETTERS);
  const map = {};
  LETTERS.forEach((letter, i) => {
    map[letter] = shuffled[i];
  });
  return map;
}

export function optionText(q, orig) {
  return { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD }[orig] || '';
}

export function mappedQuestion(q, map = identityMap()) {
  return {
    id: sid(q._id),
    question_text: q.questionText,
    option_a: optionText(q, map.A || 'A'),
    option_b: optionText(q, map.B || 'B'),
    option_c: optionText(q, map.C || 'C'),
    option_d: optionText(q, map.D || 'D'),
    order_index: q.orderIndex,
  };
}

export function displayLetter(map, original) {
  const m = map || identityMap();
  const found = Object.keys(m).find((key) => m[key] === original);
  return found || original;
}

export function pickQuestionIds(paper, questions) {
  const bank = questions.map((q) => sid(q._id));
  if (!bank.length) return [];
  const type = paper?.selectionType || 'all';
  let picked = bank;

  if (type === 'manual') {
    const allowed = new Set(bank);
    picked = (paper.questionIds || []).map(sid).filter((id) => allowed.has(id));
  } else if (type === 'range') {
    const start = Math.max(1, Number(paper.rangeStart) || 1);
    const end = Math.min(bank.length, Number(paper.rangeEnd) || bank.length);
    picked = end >= start ? bank.slice(start - 1, end) : [];
  } else if (type === 'count') {
    const n = Math.min(bank.length, Math.max(1, Number(paper.pickCount) || bank.length));
    const source = paper.shuffleQuestions ? shuffle(bank) : bank;
    return source.slice(0, n);
  }

  if (paper?.shuffleQuestions && picked.length > 1) return shuffle(picked);
  return picked;
}

export function paperQuestionCount(paper, questions) {
  const n = questions.length;
  const type = paper.selectionType || paper.selection_type || 'all';
  if (type === 'range') {
    const start = Math.max(1, Number(paper.rangeStart ?? paper.range_start) || 1);
    const end = Math.min(n, Number(paper.rangeEnd ?? paper.range_end) || n);
    return end >= start ? end - start + 1 : 0;
  }
  if (type === 'count') return Math.min(n, Math.max(0, Number(paper.pickCount ?? paper.pick_count) || 0));
  if (type === 'manual') return (paper.questionIds || paper.question_ids || []).length;
  return n;
}

export function examJson(exam) {
  return {
    id: sid(exam._id),
    title: exam.title,
    description: exam.description,
    slug: exam.slug,
    duration_minutes: exam.durationMinutes,
    is_active: exam.isActive,
    created_by: sid(exam.createdBy),
    created_at: exam.createdAt,
    updated_at: exam.updatedAt,
  };
}

export function questionJson(q) {
  return {
    id: sid(q._id),
    exam_id: sid(q.examId),
    question_text: q.questionText,
    option_a: q.optionA,
    option_b: q.optionB,
    option_c: q.optionC,
    option_d: q.optionD,
    correct_answer: q.correctAnswer,
    explanation: q.explanation,
    remark: q.remark,
    order_index: q.orderIndex,
  };
}

export function paperJson(p, questions = []) {
  return {
    id: sid(p._id),
    exam_id: sid(p.examId),
    slug: p.slug,
    title: p.title,
    mode: p.mode,
    shuffle_questions: p.shuffleQuestions,
    shuffle_options: p.shuffleOptions,
    plus_mark: p.plusMark,
    minus_mark: p.minusMark,
    selection_type: p.selectionType,
    range_start: p.rangeStart,
    range_end: p.rangeEnd,
    pick_count: p.pickCount,
    question_ids: (p.questionIds || []).map(sid),
    is_active: p.isActive,
    created_at: p.createdAt,
    question_count: paperQuestionCount(p, questions),
  };
}

export function attemptJson(a) {
  return {
    id: sid(a._id),
    exam_id: sid(a.examId),
    paper_id: a.paperId ? sid(a.paperId) : null,
    candidate_name: a.candidateName,
    started_at: a.startedAt,
    submitted_at: a.submittedAt,
    score: a.score,
    max_score: a.maxScore,
    total_questions: a.totalQuestions,
    time_taken_ms: a.timeTakenMs,
    ai_suggestions: a.aiSuggestions || [],
    question_ids: (a.questionIds || []).map(sid),
    mode: a.mode,
    plus_mark: a.plusMark,
    minus_mark: a.minusMark,
    correct_count: a.correctCount,
    wrong_count: a.wrongCount,
    skip_count: a.skipCount,
  };
}

export function slugify(title) {
  const base =
    String(title || 'exam')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'exam';
  const tag = Math.random().toString(36).slice(2, 8);
  return `${base}-${tag}`;
}
