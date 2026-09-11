import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import Spinner from './Spinner.jsx';

export default function Protected() {
  const { ready, session } = useAuth();
  if (!ready) return <Spinner label="Checking session" />;
  if (!session) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
