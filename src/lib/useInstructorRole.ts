import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

export type InstructorStatus = 'pending' | 'approved' | 'removed'

export type InstructorRoleState = {
  user: User | null
  loaded: boolean
  error: string | null
  adminClaimed: boolean
  isAdmin: boolean
  instructorStatus: InstructorStatus | null
}

export function useInstructorRole(redirectTo: string = '/admin'): InstructorRoleState {
  const nav = useNavigate()
  const [user, setUser] = useState<User | null>(() => auth.currentUser)
  const [adminDoc, setAdminDoc] = useState<{ uid: string } | null>(null)
  const [adminLoaded, setAdminLoaded] = useState(false)
  const [instructorDoc, setInstructorDoc] = useState<{ status?: InstructorStatus } | null>(null)
  const [instructorLoaded, setInstructorLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      if (!u || u.isAnonymous) {
        if (u?.isAnonymous) auth.signOut().catch(() => {})
        nav(redirectTo, { replace: true })
      }
    })
    return () => unsub()
  }, [nav, redirectTo])

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setAdminDoc(null)
      setAdminLoaded(true)
      return
    }
    const unsub = onSnapshot(
      doc(db, 'config', 'admin'),
      (snap) => {
        setAdminDoc(snap.exists() ? (snap.data() as any) : null)
        setAdminLoaded(true)
      },
      (err) => {
        setError(err?.message ?? 'Failed to load admin configuration.')
        setAdminLoaded(true)
      },
    )
    return () => unsub()
  }, [user?.uid])

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setInstructorDoc(null)
      setInstructorLoaded(false)
      return
    }
    const unsub = onSnapshot(
      doc(db, 'instructors', user.uid),
      (snap) => {
        setInstructorDoc(snap.exists() ? (snap.data() as any) : null)
        setInstructorLoaded(true)
      },
      (err) => {
        setError(err?.message ?? 'Failed to load instructor status.')
        setInstructorLoaded(true)
      },
    )
    return () => unsub()
  }, [user?.uid])

  const adminClaimed = adminDoc !== null
  const isAdmin = adminClaimed && user?.uid === adminDoc?.uid
  const instructorStatus = (instructorDoc?.status ?? null) as InstructorStatus | null

  return {
    user,
    loaded: adminLoaded && instructorLoaded,
    error,
    adminClaimed,
    isAdmin,
    instructorStatus,
  }
}
