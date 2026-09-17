export function examPageTitle(exam) {
  if (!exam) return 'Quiz97 — live quizzes';
  if (exam.paper_title && exam.paper_title !== exam.title) {
    return `${exam.title} · ${exam.paper_title}`;
  }
  return exam.title || 'Quiz97 — live quizzes';
}
