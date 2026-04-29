import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

export function useOwnedSessions(uid: string | undefined | null) {
  const [sessions, setSessions] = useState<any[]>([])
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setSessions([])
      setLoaded(false)
      return
    }
    const qRef = query(collection(db, 'sessions'), where('ownerUid', '==', uid))
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        list.sort((a, b) => {
          const aTime = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0
          const bTime = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0
          return bTime - aTime
        })
        setSessions(list)
        setLoaded(true)
      },
      (err) => {
        setError(err?.message ?? 'Failed to load sessions.')
        setLoaded(true)
      },
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setCosts({})
      return
    }
    const qRef = query(collection(db, 'session_costs'), where('ownerUid', '==', uid))
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const next: Record<string, number> = {}
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any
          const totalUsd = typeof data.totalUsd === 'number' ? data.totalUsd : 0
          next[docSnap.id] = totalUsd
        })
        setCosts(next)
      },
      (err) => {
        setError(err?.message ?? 'Failed to load cost estimates.')
      },
    )
    return () => unsub()
  }, [uid])

  return { sessions, costs, loaded, error }
}
