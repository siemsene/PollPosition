import { useNavigate } from 'react-router-dom'
import { Clock, ShieldAlert, ShieldCheck, UserPlus } from 'lucide-react'
import TopBar from './TopBar'
import type { InstructorStatus } from '../lib/useInstructorRole'

type Props = {
  isAdmin: boolean
  instructorStatus: InstructorStatus | null
}

type Tone = 'amber' | 'red' | 'slate'

const toneStyles: Record<Tone, { iconWrap: string; icon: string; ring: string }> = {
  amber: {
    iconWrap: 'bg-amber-400/15 border-amber-400/40',
    icon: 'text-amber-500',
    ring: 'ring-1 ring-amber-400/30',
  },
  red: {
    iconWrap: 'bg-red-500/15 border-red-500/40',
    icon: 'text-red-500',
    ring: 'ring-1 ring-red-500/30',
  },
  slate: {
    iconWrap: 'bg-slate-500/15 border-slate-400/40',
    icon: 'text-slate-500',
    ring: '',
  },
}

function StatusCard({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: Tone
  icon: React.ReactNode
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  const styles = toneStyles[tone]
  return (
    <div className={`card p-6 flex items-start gap-4 ${styles.ring}`}>
      <div
        className={`flex-none w-11 h-11 rounded-xl border flex items-center justify-center ${styles.iconWrap} ${styles.icon}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-lg leading-tight">{title}</div>
        <div className="text-sm opacity-80 mt-1.5 leading-relaxed">{body}</div>
        {action && (
          <button type="button" className="btn mt-4" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

export default function InstructorAccessBlocked({ isAdmin, instructorStatus }: Props) {
  const nav = useNavigate()

  return (
    <div>
      <TopBar mode="instructor" />
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
        {isAdmin && (
          <StatusCard
            tone="amber"
            icon={<ShieldCheck size={22} />}
            title="Admin account"
            body="This account is configured as an admin. Use the admin dashboard to manage instructors."
            action={{ label: 'Go to admin dashboard', onClick: () => nav('/admin/overview') }}
          />
        )}
        {instructorStatus === 'pending' && (
          <StatusCard
            tone="amber"
            icon={<Clock size={22} />}
            title="Approval pending"
            body="Your instructor request is pending. You will receive an email when it is approved."
          />
        )}
        {instructorStatus === 'removed' && (
          <StatusCard
            tone="red"
            icon={<ShieldAlert size={22} />}
            title="Access removed"
            body="Instructor access was removed. Contact the administrator if you believe this is a mistake."
          />
        )}
        {instructorStatus === null && (
          <StatusCard
            tone="slate"
            icon={<UserPlus size={22} />}
            title="Instructor access required"
            body="Submit an instructor application to request access."
            action={{ label: 'Apply to be an instructor', onClick: () => nav('/instructor/signup') }}
          />
        )}
      </div>
    </div>
  )
}
