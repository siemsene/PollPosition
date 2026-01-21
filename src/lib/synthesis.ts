import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export type SynthesisGroup = {
  theme: string
  summary: string
  contributions: string[]
}

export type SynthesisResult = {
  overallSummary?: string
  groups: SynthesisGroup[]
}

type SynthesisInput = {
  question?: string
  items: string[]
  mode?: 'grouped' | 'summary'
  sessionId?: string
}

export async function synthesizeShortResponses({ question, items, mode = 'grouped', sessionId }: SynthesisInput) {
  const call = httpsCallable(functions, 'synthesizeShortResponses')
  const result = await call({ question: question ?? null, items, mode, sessionId: sessionId ?? null })
  const data = result.data as any

  const groups = Array.isArray(data?.groups)
    ? data.groups.map((group: any) => ({
        theme: typeof group?.theme === 'string' ? group.theme : 'Theme',
        summary: typeof group?.summary === 'string' ? group.summary : '',
        contributions: Array.isArray(group?.contributions)
          ? group.contributions.filter((item: unknown) => typeof item === 'string')
          : [],
      }))
    : []

  return {
    overallSummary: typeof data?.overall_summary === 'string' ? data.overall_summary : undefined,
    groups,
  } as SynthesisResult
}
