import { useState } from 'react'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { formatUsd } from '../lib/format'
import ConfirmDialog from './ConfirmDialog'

type SessionLite = {
  id: string
  title?: string
  roomCode?: string
}

type Props = {
  sessions: SessionLite[]
  costs: Record<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
  onDeleted?: (id: string) => void
}

export default function SessionsListPanel({ sessions, costs, selectedId, onSelect, onDeleted }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string, title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function confirmDelete() {
    const target = pendingDelete
    if (!target || busyId) return
    setError(null)
    setBusyId(target.id)
    try {
      await deleteDoc(doc(db, 'sessions', target.id))
      onDeleted?.(target.id)
      setPendingDelete(null)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete session.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="card p-4 lg:col-span-1">
      <div className="font-semibold">Sessions</div>
      <div className="text-sm text-slate-400 mt-1">Rejoin or delete old sessions.</div>
      {error && <div className="text-xs text-red-200 mt-2">{error}</div>}
      <div className="mt-3 space-y-2 max-h-[380px] overflow-auto pr-1">
        {sessions.length === 0 ? (
          <div className="text-sm text-slate-400">No sessions yet.</div>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === selectedId
            const label = s.title || 'Class session'
            const code = s.roomCode || '------'
            const cost = costs[s.id] ?? 0
            return (
              <div
                key={s.id}
                className={`rounded-2xl border px-3 py-3 session-card ${isActive ? 'border-white/30 bg-white/10' : 'border-slate-700/80 bg-slate-950/30'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{label}</div>
                    <div className="text-xs text-slate-400 mt-1">Room: {code}</div>
                    <div className="text-xs text-slate-400 mt-1">Est. cost: {formatUsd(cost)}</div>
                  </div>
                  {isActive && <span className="text-xs text-slate-300">Current</span>}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button type="button" className="btn-ghost" onClick={() => onSelect(s.id)}>
                    Rejoin
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setPendingDelete({ id: s.id, title: s.title || 'Class session' })}
                    disabled={busyId === s.id}
                  >
                    {busyId === s.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this session?"
        description={
          <>
            This removes <span className="text-slate-100 font-medium">{pendingDelete?.title}</span>.
            Question data may remain in subcollections.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={busyId !== null}
        onConfirm={confirmDelete}
        onCancel={() => { if (!busyId) setPendingDelete(null) }}
      />
    </div>
  )
}
