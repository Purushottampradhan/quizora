import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex gap-2">
          <Link className="btn btn-primary px-4 py-2 text-sm" to="/admin/login">
            Sign in
          </Link>
        </div>
      </header>

      <section className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-3 inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold tracking-wide text-[var(--coral-2)]">
            LIVE QUIZZES
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
            Quizzes that feel quick, clear, and a little addictive.
          </h1>
          <p className="mt-4 max-w-md text-lg text-[var(--muted)]">
            Make a quiz, add questions, and share one link. Students type their name, tap answers, and then see their score plus a short study note.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" to="/admin/login">
              Sign in
            </Link>
          </div>
        </div>
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between text-sm text-[var(--muted)]">
            <span>Question 3 of 10</span>
            <span className="text-[var(--mint)]">4 answered · 6 left</span>
          </div>
          <div className="progress-track mb-5">
            <div className="progress-fill" style={{ width: '30%' }} />
          </div>
          <h2 className="font-display text-xl font-bold">What does CSS stand for?</h2>
          <div className="mt-4 grid gap-2">
            {['Computer Style Sheets', 'Creative Styling System', 'Cascading Style Sheets', 'Colorful Style Syntax'].map(
              (opt, i) => (
                <div key={opt} className={`option ${i === 2 ? 'selected' : ''}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 font-extrabold">
                    {['A', 'B', 'C', 'D'][i]}
                  </span>
                  <span className="pt-1 font-semibold">{opt}</span>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      <section id="how" className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          ['Share a link', 'Send one link. Anyone with it can start at once — they do not need an account.'],
          ['Tap and go', 'Pick an answer and the next question opens. Use the numbers to jump around anytime.'],
          ['See how you did', 'After you finish: your score, the right answers, why, and a short note on the whole quiz.'],
        ].map(([title, body]) => (
          <div key={title} className="glass rounded-3xl p-5">
            <h3 className="font-display text-lg font-bold">{title}</h3>
            <p className="mt-2 text-[var(--muted)]">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
