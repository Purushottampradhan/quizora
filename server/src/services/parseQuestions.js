import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';

function normalizeKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pick(row, aliases) {
  const map = {};
  for (const [k, v] of Object.entries(row)) {
    map[normalizeKey(k)] = v;
  }
  for (const alias of aliases) {
    const val = map[normalizeKey(alias)];
    if (val != null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

function letterFromCorrect(value, options) {
  const raw = String(value || '').trim();
  const upper = raw.toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(upper)) return upper;
  if (['1', '2', '3', '4'].includes(raw)) return { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }[raw];
  const match = Object.entries(options).find(
    ([, text]) => text.toLowerCase() === raw.toLowerCase()
  );
  return match ? match[0] : '';
}

export function rowToQuestion(row, index) {
  const question_text = pick(row, [
    'question',
    'question_text',
    'questiontext',
    'q',
    'prompt',
  ]);
  const option_a = pick(row, ['option_a', 'optiona', 'a', 'option1', 'choice_a']);
  const option_b = pick(row, ['option_b', 'optionb', 'b', 'option2', 'choice_b']);
  const option_c = pick(row, ['option_c', 'optionc', 'c', 'option3', 'choice_c']);
  const option_d = pick(row, ['option_d', 'optiond', 'd', 'option4', 'choice_d']);
  const explanation = pick(row, [
    'explanation',
    'detailed_answer',
    'detailedanswer',
    'details',
    'solution',
    'answer_detail',
  ]);
  const remark = pick(row, ['remark', 'remarks', 'note', 'notes', 'comment']);
  const correctRaw = pick(row, [
    'correct_answer',
    'correctanswer',
    'answer',
    'correct',
    'key',
    'right_answer',
  ]);
  const correct_answer = letterFromCorrect(correctRaw, {
    A: option_a,
    B: option_b,
    C: option_c,
    D: option_d,
  });

  if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
    return { error: `Row ${index + 1} is missing question, 4 options, or a valid correct answer (A–D).` };
  }

  return {
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_answer,
    explanation,
    remark,
    order_index: index,
  };
}

export function parseQuestionFile(buffer, filename) {
  const name = (filename || '').toLowerCase();
  let rows = [];

  if (name.endsWith('.json')) {
    const parsed = JSON.parse(buffer.toString('utf8'));
    rows = Array.isArray(parsed) ? parsed : parsed.questions || parsed.data || [];
    if (!Array.isArray(rows)) {
      throw new Error('JSON must be an array of questions, or { "questions": [...] }');
    }
  } else if (name.endsWith('.csv')) {
    rows = parse(buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } else {
    throw new Error('Upload a .json, .csv, .xlsx, or .xls file');
  }

  const questions = [];
  const errors = [];
  rows.forEach((row, i) => {
    const q = rowToQuestion(row, i);
    if (q.error) errors.push(q.error);
    else questions.push(q);
  });

  if (!questions.length) {
    throw new Error(errors[0] || 'No valid questions found in the file');
  }

  return { questions, errors };
}

export function buildExcelTemplateBuffer() {
  const rows = [
    {
      question: 'What is 2 + 2?',
      option_a: '3',
      option_b: '4',
      option_c: '5',
      option_d: '22',
      correct_answer: 'B',
      explanation: '2 + 2 equals 4.',
      remark: 'Easy arithmetic',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
