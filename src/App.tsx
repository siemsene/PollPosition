import { Routes, Route, Navigate } from 'react-router-dom'
import StudentHome from './routes/StudentHome'
import StudentRoom from './routes/StudentRoom'
import AdminLogin from './routes/AdminLogin'
import AdminDashboard from './routes/AdminDashboard'
import InstructorDashboard from './routes/InstructorDashboard'
import InstructorSignup from './routes/InstructorSignup'
import PublicResults from './routes/PublicResults'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StudentHome />} />
      <Route path="/room" element={<StudentRoom />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/overview" element={<AdminDashboard />} />
      <Route path="/instructor/signup" element={<InstructorSignup />} />
      <Route path="/admin/dashboard" element={<InstructorDashboard />} />
      <Route path="/results" element={<PublicResults />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
