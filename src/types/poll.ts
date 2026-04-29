import type { SynthesisResult } from '../lib/synthesis'

export type QuestionType = 'mcq' | 'number' | 'short' | 'long' | 'pie'

export type Session = {
  id: string
  roomCode: string
  activeQuestionId: string | null
  isOpen?: boolean
  ownerUid?: string
  title?: string
}

export type Question = {
  id: string
  type: QuestionType
  prompt: string
  options?: string[]
  synthesis?: SynthesisResult | null
  synthesizedCount?: number | null
}

export type Resp = {
  id: string
  value: unknown
  userId?: string
  submittedAt?: any
}
