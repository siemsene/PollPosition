import { useEffect, useState } from 'react'
import { collection, doc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db, ensureAnonymousAuth } from '../firebase'
import type { Question, Resp, Session } from '../types/poll'

export function useRoomSession(roomCode: string) {
  const [session, setSession] = useState<Session | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomCode) {
      setSession(null)
      setError(null)
      return
    }
    let unsubSession: (() => void) | null = null
    let cancelled = false
    ;(async () => {
      try {
        await ensureAnonymousAuth()
        const qRef = query(collection(db, 'sessions'), where('roomCode', '==', roomCode), limit(1))
        const snap = await getDocs(qRef)
        if (cancelled) return
        if (snap.empty) {
          setError(`Room "${roomCode}" not found.`)
          setSession(null)
          return
        }
        const sessionId = snap.docs[0].id
        unsubSession = onSnapshot(doc(db, 'sessions', sessionId), (s) => {
          if (cancelled) return
          const data = s.data() as any
          if (!data) return
          setSession({
            id: s.id,
            roomCode: data.roomCode,
            activeQuestionId: data.activeQuestionId ?? null,
            isOpen: data.isOpen ?? true,
            ownerUid: data.ownerUid,
            title: data.title,
          })
          setError(null)
        })
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message ?? 'Failed to load room.')
      }
    })()
    return () => {
      cancelled = true
      if (unsubSession) unsubSession()
    }
  }, [roomCode])

  useEffect(() => {
    if (!session?.id || !session.activeQuestionId) {
      setQuestion(null)
      return
    }
    const unsub = onSnapshot(
      doc(db, 'sessions', session.id, 'questions', session.activeQuestionId),
      (d) => {
        if (!d.exists()) { setQuestion(null); return }
        const data = d.data() as any
        setQuestion({
          id: d.id,
          type: data.type,
          prompt: data.prompt,
          options: data.options ?? [],
          synthesis: data.synthesis ?? null,
          synthesizedCount: data.synthesizedCount ?? null,
        })
      },
    )
    return () => unsub()
  }, [session?.id, session?.activeQuestionId])

  return { session, question, error }
}

export function useQuestionResponses(
  sessionId: string | null | undefined,
  questionId: string | null | undefined,
) {
  const [responses, setResponses] = useState<Resp[]>([])

  useEffect(() => {
    if (!sessionId || !questionId) {
      setResponses([])
      return
    }
    const respRef = collection(db, 'sessions', sessionId, 'questions', questionId, 'responses')
    const unsub = onSnapshot(respRef, (snap) => {
      const rs: Resp[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setResponses(rs)
    })
    return () => unsub()
  }, [sessionId, questionId])

  return responses
}
