import { useNavigate } from 'react-router-dom'
import TopBar from './TopBar'
import type { InstructorStatus } from '../lib/useInstructorRole'

type Props = {
  isAdmin: boolean
  instructorStatus: InstructorStatus | null
}

export default function InstructorAccessBlocked({ isAdmin, instructorStatus }: Props) {
  const nav = useNavigate()

  return (
    <div>
      <TopBar mode="instructor" />
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
        {isAdmin && (
          <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
            <div className="font-semibold text-amber-200">Admin account</div>
            <div className="text-sm text-amber-100/80 mt-1">
              This account is configured as an admin. Use the admin dashboard to manage instructors.
            </div>
            <button type="button" className="btn mt-3" onClick={() => nav('/admin/overview')}>
              Go to admin dashboard
            </button>
          </div>
        )}
        {instructorStatus === 'pending' && (
          <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
            <div className="font-semibold text-amber-200">Approval pending</div>
            <div className="text-sm text-amber-100/80 mt-1">
              Your instructor request is pending. You will receive an email when it is approved.
            </div>
          </div>
        )}
        {instructorStatus === 'removed' && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Access removed</div>
            <div className="text-sm text-red-100/80 mt-1">
              Instructor access was removed. Contact the administrator if you believe this is a mistake.
            </div>
          </div>
        )}
        {instructorStatus === null && (
          <div className="card p-4 border border-slate-700/80 bg-slate-950/30">
            <div className="font-semibold text-slate-100">Instructor access required</div>
            <div className="text-sm text-slate-300 mt-1">
              Submit an instructor application to request access.
            </div>
            <button type="button" className="btn mt-3" onClick={() => nav('/instructor/signup')}>
              Apply to be an instructor
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
