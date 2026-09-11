import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext.jsx';
import Protected from './components/Protected.jsx';
import AdminShell from './components/AdminShell.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/admin/Login.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import ExamDetail from './pages/admin/ExamDetail.jsx';
import Start from './pages/exam/Start.jsx';
import Read from './pages/exam/Read.jsx';
import Quiz from './pages/exam/Quiz.jsx';
import Result from './pages/exam/Result.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin/signup" element={<Navigate to="/admin/login" replace />} />
          <Route element={<Protected />}>
            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<Dashboard />} />
              <Route path="exams/:id" element={<ExamDetail />} />
            </Route>
          </Route>
          <Route path="/e/:slug" element={<Start />} />
          <Route path="/e/:slug/read" element={<Read />} />
          <Route path="/e/:slug/quiz/:attemptId" element={<Quiz />} />
          <Route path="/e/:slug/result/:attemptId" element={<Result />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
