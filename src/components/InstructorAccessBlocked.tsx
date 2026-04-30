import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendEmailVerification } from 'firebase/auth'
import { Clock, MailCheck, ShieldAlert, ShieldCheck, UserPlus } from 'lucide-react'
import TopBar from './TopBar'
import { auth } from '../firebase'
import type { InstructorStatus } from '../lib/useInstructorRole'

type Props = {
  isAdmin: boolean
  instructorStatus: InstructorStatus | null
  emailVerified?: boolean
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

export default function InstructorAccessBlocked({ isAdmin, instructorStatus, emailVerified }: Props) {
  const nav = useNavigate()
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  async function resendVerification() {
    const current = auth.currentUser
    if (!current) return
    setVerifyInfo(null)
    setVerifyError(null)
    try {
      await sendEmailVerification(current)
      setVerifyInfo('Verification email sent. After clicking the link, sign out and back in.')
    } catch (e: any) {
      setVerifyError(e?.message ?? 'Failed to send verification email.')
    }
  }

  async function refreshAfterVerification() {
    const current = auth.currentUser
    if (!current) return
    setVerifyInfo(null)
    setVerifyError(null)
    try {
      await current.reload()
      await current.getIdToken(true)
      if (current.emailVerified) {
        window.location.reload()
      } else {
        setVerifyError('Your email is not verified yet. Open the link we sent and try again.')
      }
    } catch (e: any) {
      setVerifyError(e?.message ?? 'Failed to refresh.')
    }
  }

  const needsEmailVerification = instructorStatus === 'approved' && emailVerified === false

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
        {needsEmailVerification && (
          <div className="card p-6 ring-1 ring-amber-400/30">
            <div className="flex items-start gap-4">
              <div className="flex-none w-11 h-11 rounded-xl border bg-amber-400/15 border-amber-400/40 text-amber-500 flex items-center justify-center">
                <MailCheck size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-lg leading-tight">Verify your email</div>
                <div className="text-sm opacity-80 mt-1.5 leading-relaxed">
                  Your account is approved, but you still need to verify your email address. Open the link we sent to {auth.currentUser?.email ?? 'your inbox'} to continue.
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button type="button" className="btn" onClick={refreshAfterVerification}>
                    I verified — refresh
                  </button>
                  <button type="button" className="btn-ghost" onClick={resendVerification}>
                    Resend verification email
                  </button>
                </div>
                {verifyInfo && <div className="text-sm text-emerald-300 mt-3">{verifyInfo}</div>}
                {verifyError && <div className="text-sm text-red-300 mt-3">{verifyError}</div>}
              </div>
            </div>
          </div>
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
