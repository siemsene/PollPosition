import type { SynthesisResult } from '../lib/synthesis'

export type QuestionType = 'mcq' | 'number' | 'short' | 'long' | 'pie' | 'scale' | 'rank' | 'multi' | 'cloud'

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
  scaleMin?: number | null
  scaleMax?: number | null
  scaleMinLabel?: string | null
  scaleMaxLabel?: string | null
  synthesis?: SynthesisResult | null
  synthesizedCount?: number | null
  synthesizedAt?: any
  order?: number | null
  createdAt?: any
  isQuiz?: boolean
  // Only present on the public doc while the instructor has revealed the
  // answer; the always-private copy lives in questions/{id}/meta/answer.
  correctOptions?: string[] | null
  revealAnswer?: boolean
}

export type Resp = {
  id: string
  value: unknown
  userId?: string
  submittedAt?: any
}
