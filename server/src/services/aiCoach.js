import Groq from 'groq-sdk';

const MAX_QUESTIONS = 500;
const DEFAULT_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
];

let resolvedModel = null;

function groqModels() {
  const preferred = (process.env.GROQ_MODEL || '').trim();
  const list = [resolvedModel, preferred, ...DEFAULT_MODELS].filter(Boolean);
  return [...new Set(list)];
}

function sec(ms) {
  return Math.max(0, Math.round((Number(ms) || 0) / 1000));
}

function clip(text, n = 220) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function toItems(answers) {
  const list = (answers || []).slice(0, MAX_QUESTIONS);
  const avg =
    list.length > 0 ? list.reduce((s, a) => s + (a.time_spent_ms || 0), 0) / list.length : 0;

  return list.map((a, i) => {
    const skipped = !a.selected_label || a.selected_label === 'Not answered';
    const status = a.is_correct ? 'correct' : skipped ? 'skipped' : 'wrong';
    return {
      number: i + 1,
      question: clip(a.question_text),
      selected: skipped ? 'Skipped / not answered' : clip(a.selected_label, 120),
      correct: clip(a.correct_label, 120),
      explanation: clip(a.explanation, 160),
      status,
      time_sec: sec(a.time_spent_ms),
      slow: avg > 0 && (a.time_spent_ms || 0) > avg * 1.4,
    };
  });
}

function asParagraph(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (typeof value === 'object') {
    const direct = value.paragraph || value.summary || value.feedback || value.advice;
    if (direct) return asParagraph(direct);
    if (Array.isArray(value.suggestions)) return asParagraph(value.suggestions.join(' '));
    if (Array.isArray(value.tips)) return asParagraph(value.tips.join(' '));
  }
  if (Array.isArray(value)) return asParagraph(value.filter(Boolean).join(' '));
  return '';
}

function parseParagraph(text) {
  if (!text) return '';
  let raw = String(text).trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

  const tryParse = (s) => {
    try {
      return asParagraph(JSON.parse(s));
    } catch {
      return '';
    }
  };

  let paragraph = tryParse(raw);
  if (paragraph) return paragraph;

  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    paragraph = tryParse(objMatch[0]);
    if (paragraph) return paragraph;
  }

  return raw.replace(/\s+/g, ' ').trim();
}

function client() {
  return new Groq({
    apiKey: (process.env.GROQ_API_KEY || '').trim(),
    timeout: 25000,
    ...(process.env.GROQ_BASE_URL ? { baseURL: process.env.GROQ_BASE_URL } : {}),
  });
}

function overview(items, meta) {
  const wrong = items.filter((a) => a.status === 'wrong');
  const skipped = items.filter((a) => a.status === 'skipped');
  const slow = items.filter((a) => a.slow);
  return {
    student: meta.name,
    exam: meta.examTitle,
    score: `${meta.score}/${meta.total} (${meta.percent}%)`,
    correct: items.filter((a) => a.status === 'correct').length,
    wrong: wrong.length,
    skipped: skipped.length,
    slow_questions: slow.length,
    all_responses: items,
    instruction:
      'Write one flowing paragraph (4–8 sentences) about this student overall. Use the full set of answers together: patterns, weak topics, skipping, and pacing. Do not go question by question, do not list Q1/Q2, and do not write bullet points. Do not invent questions.',
  };
}

async function askGroq(items, meta, model) {
  const groq = client();
  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.4,
    max_completion_tokens: 500,
    include_reasoning: false,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a kind exam coach. Write in simple everyday words a student can understand. Reply with JSON only: {"paragraph":"..."} containing exactly one paragraph. Judge the whole quiz as a whole, never question by question. No lists, no numbering, no headings.',
      },
      {
        role: 'user',
        content: JSON.stringify(overview(items, meta)),
      },
    ],
  });

  const msg = completion.choices?.[0]?.message;
  return parseParagraph(msg?.content || msg?.reasoning || '');
}

export async function generateSuggestions(payload) {
  const { name, examTitle, score, total, answers } = payload;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const items = toItems(answers);

  if (!process.env.GROQ_API_KEY) {
    console.error('[quiz97] GROQ_API_KEY is missing');
    return [];
  }

  let lastErr;
  for (const model of groqModels()) {
    try {
      const paragraph = await askGroq(items, { name, examTitle, score, total, percent }, model);
      if (paragraph.length >= 40) {
        resolvedModel = model;
        return [paragraph];
      }
    } catch (err) {
      lastErr = err;
      console.error('[quiz97] Groq coaching failed:', model, err.message);
    }
  }

  if (lastErr) console.error('[quiz97] Groq coaching gave up:', lastErr.message);
  return [];
}
