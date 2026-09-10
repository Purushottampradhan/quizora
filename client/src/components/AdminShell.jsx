import { Link, Outlet, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export default function AdminShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await signOut();
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#100a24]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/admin">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden max-w-[40vw] truncate text-[var(--muted)] sm:inline">{user?.email}</span>
            <button className="btn btn-ghost px-3 py-2 text-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
