import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { auth, db } from '../firebase'
import { sendPasswordResetEmail } from 'firebase/auth'
import { collection, deleteField, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { UserCheck, UserMinus } from 'lucide-react'

export default function AdminDashboard() {
  const nav = useNavigate()
  const [user, setUser] = useState(() => auth.currentUser)
  const [adminDoc, setAdminDoc] = useState<any | null>(null)
  const [adminLoaded, setAdminLoaded] = useState(false)
  const [instructors, setInstructors] = useState<any[]>([])
  const [instructorCosts, setInstructorCosts] = useState<Record<string, number>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [resetInfo, setResetInfo] = useState<string | null>(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      if (!u || u.isAnonymous) {
        if (u?.isAnonymous) auth.signOut().catch(() => {})
        nav('/admin', { replace: true })
      }
    })
    return () => unsub()
  }, [nav])

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setAdminDoc(null)
      setAdminLoaded(true)
      return
    }
    const unsub = onSnapshot(
      doc(db, 'config', 'admin'),
      (snap) => {
        setAdminDoc(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null)
        setAdminLoaded(true)
      },
      (err) => {
        setActionError(err?.message ?? 'Failed to load admin configuration.')
        setAdminLoaded(true)
      },
    )
    return () => unsub()
  }, [user?.uid])

  const isAdmin = !!adminDoc && user?.uid === adminDoc.uid

  useEffect(() => {
    if (!isAdmin) {
      setInstructors([])
      return
    }
    const qRef = query(collection(db, 'instructors'), orderBy('requestedAt', 'desc'))
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setInstructors(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
      },
      (err) => {
        setActionError(err?.message ?? 'Failed to load instructor requests.')
      },
    )
    return () => unsub()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) {
      setInstructorCosts({})
      return
    }
    const qRef = collection(db, 'instructor_costs')
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const next: Record<string, number> = {}
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any
          const totalUsd = typeof data.totalUsd === 'number' ? data.totalUsd : 0
          next[docSnap.id] = totalUsd
        })
        setInstructorCosts(next)
      },
      (err) => {
        setActionError(err?.message ?? 'Failed to load cost estimates.')
      },
    )
    return () => unsub()
  }, [isAdmin])

  async function approveInstructor(id: string) {
    if (!isAdmin || !auth.currentUser) return
    setActionError(null)
    try {
      await updateDoc(doc(db, 'instructors', id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser.uid,
        removedAt: deleteField(),
        removedBy: deleteField(),
      })
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to approve instructor.')
    }
  }

  async function removeInstructor(id: string) {
    if (!isAdmin || !auth.currentUser || auth.currentUser.uid === id) return
    setActionError(null)
    try {
      await updateDoc(doc(db, 'instructors', id), {
        status: 'removed',
        removedAt: serverTimestamp(),
        removedBy: auth.currentUser.uid,
      })
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to remove instructor.')
    }
  }

  async function resetPassword() {
    const email = auth.currentUser?.email
    if (!email) {
      setActionError('No email address found for this account.')
      return
    }
    setActionError(null)
    setResetInfo(null)
    try {
      await sendPasswordResetEmail(auth, email)
      setResetInfo('Password reset email sent. Check your inbox.')
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to send reset email.')
    }
  }

  function downloadInstructorCsv() {
    if (!isAdmin) return
    const header = ['uid', 'email', 'status', 'requestedAt', 'approvedAt', 'removedAt']
    const rows = instructors.map((inst) => {
      const requestedAt = formatTimestamp(inst.requestedAt)
      const approvedAt = formatTimestamp(inst.approvedAt)
      const removedAt = formatTimestamp(inst.removedAt)
      return [
        inst.id ?? '',
        inst.email ?? '',
        inst.status ?? '',
        requestedAt,
        approvedAt,
        removedAt,
      ]
    })
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvCell(cell)).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 10)
    const link = document.createElement('a')
    link.href = url
    link.download = `instructors-${stamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!user || !adminLoaded) return null

  if (!isAdmin) {
    return (
      <div>
        <TopBar mode="admin" />
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Admin access required</div>
            <div className="text-sm text-red-100/80 mt-1">
              This account is not configured as an admin.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <TopBar mode="admin" />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div>
          <div className="text-2xl font-semibold">Admin dashboard</div>
          <div className="text-slate-400 mt-1">Approve or remove instructors.</div>
          <div className="text-xs text-slate-500 mt-2">Cost estimates are approximate and may not match billed totals.</div>
        </div>
        <div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={resetPassword}>Reset password</button>
            <button className="btn-ghost" onClick={downloadInstructorCsv}>
              Download instructors CSV
            </button>
          </div>
        </div>

        {actionError && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Something went wrong</div>
            <div className="text-sm text-red-100/80 mt-1">{actionError}</div>
          </div>
        )}
        {resetInfo && (
          <div className="card p-4 border border-emerald-500/30 bg-emerald-500/10">
            <div className="font-semibold text-emerald-200">Password reset sent</div>
            <div className="text-sm text-emerald-100/80 mt-1">{resetInfo}</div>
          </div>
        )}

        <div className="card p-4 border border-slate-800 bg-slate-950/40">
          <div className="font-semibold text-slate-100">Instructor approvals</div>
          <div className="text-sm text-slate-400 mt-1">Approve or remove instructors who requested access.</div>
          <div className="mt-4 space-y-3">
            {instructors.length === 0 && (
              <div className="text-sm text-slate-400">No instructor requests yet.</div>
            )}
            {instructors.map((inst) => {
              const isSelf = inst.id === user.uid
              const cost = instructorCosts[inst.id] ?? 0
              return (
                <div key={inst.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{inst.email ?? 'Instructor'}</div>
                      <div className="text-xs text-slate-400 mt-1">Status: {inst.status ?? 'pending'}</div>
                      <div className="text-xs text-slate-400 mt-1">Total est. cost: {formatUsd(cost)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inst.status !== 'approved' && (
                        <button className="btn-ghost" onClick={() => approveInstructor(inst.id)}>
                          <UserCheck size={16} /> Approve
                        </button>
                      )}
                      {inst.status !== 'removed' && (
                        <button
                          className="btn-ghost"
                          onClick={() => removeInstructor(inst.id)}
                          disabled={isSelf}
                          title={isSelf ? 'You cannot remove your own access.' : 'Remove instructor'}
                        >
                          <UserMinus size={16} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatTimestamp(value: any) {
  if (!value) return ''
  if (typeof value.toMillis === 'function') {
    return new Date(value.toMillis()).toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value)
  const escaped = raw.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}
