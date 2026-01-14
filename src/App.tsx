import { Routes, Route, Navigate } from 'react-router-dom'
import StudentHome from './routes/StudentHome'
import StudentRoom from './routes/StudentRoom'
import AdminLogin from './routes/AdminLogin'
import InstructorDashboard from './routes/InstructorDashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StudentHome />} />
      <Route path="/room" element={<StudentRoom />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<InstructorDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
