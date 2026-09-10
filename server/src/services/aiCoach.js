import Groq from 'groq-sdk';

const MAX_QUESTIONS = 50;
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

function asTips(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(value.suggestions)) return asTips(value.suggestions);
  if (Array.isArray(value.tips)) return asTips(value.tips);
  return [];
}

function parseTipList(text) {
  if (!text) return [];
  let raw = String(text).trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

  const tryParse = (s) => {
    try {
      return asTips(JSON.parse(s));
    } catch {
      return [];
    }
  };

  let tips = tryParse(raw);
  if (tips.length) return tips;

  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    tips = tryParse(arrMatch[0]);
    if (tips.length) return tips;
  }
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    tips = tryParse(objMatch[0]);
    if (tips.length) return tips;
  }

  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 24)
    .slice(0, 3);
}

function client() {
  return new Groq({
    apiKey: (process.env.GROQ_API_KEY || '').trim(),
    timeout: 25000,
    ...(process.env.GROQ_BASE_URL ? { baseURL: process.env.GROQ_BASE_URL } : {}),
  });
}

async function askGroq(items, meta, model) {
  const groq = client();
  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.4,
    max_completion_tokens: 700,
    include_reasoning: false,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a kind, practical exam coach. Reply with JSON only: {"suggestions":["tip1","tip2"]} using exactly 2 or 3 short strings. Each tip must be useful and specific to this student. Do not invent questions. Do not give more than 3 tips.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          student: meta.name,
          exam: meta.examTitle,
          score: `${meta.score}/${meta.total} (${meta.percent}%)`,
          responses: items,
          instruction:
            'Give exactly 2 or 3 helpful suggestions. Focus on the biggest gaps: wrong answers, skipped questions, or slow timing. Mention the question number and what they chose vs the correct idea. Keep each tip to 1–3 sentences.',
        }),
      },
    ],
  });

  const msg = completion.choices?.[0]?.message;
  return parseTipList(msg?.content || msg?.reasoning || '');
}

export async function generateSuggestions(payload) {
  const { name, examTitle, score, total, answers } = payload;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const items = toItems(answers);

  if (!process.env.GROQ_API_KEY) {
    console.error('[quizora] GROQ_API_KEY is missing');
    return [];
  }

  let lastErr;
  for (const model of groqModels()) {
    try {
      const tips = await askGroq(items, { name, examTitle, score, total, percent }, model);
      if (tips.length >= 2) {
        resolvedModel = model;
        return tips.slice(0, 3);
      }
      if (tips.length === 1) {
        const more = await askGroq(items, { name, examTitle, score, total, percent }, model);
        const merged = [...tips, ...more].filter(Boolean).slice(0, 3);
        if (merged.length >= 2) {
          resolvedModel = model;
          return merged.slice(0, 3);
        }
      }
    } catch (err) {
      lastErr = err;
      console.error('[quizora] Groq coaching failed:', model, err.message);
    }
  }

  if (lastErr) console.error('[quizora] Groq coaching gave up:', lastErr.message);
  return [];
}
