import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { QuestionType } from './QuestionEditor'
import { BarChart3, Hash, MessageCircle, MessageSquareText, Play } from 'lucide-react'

export type Question = {
  id: string
  type: QuestionType
  prompt: string
  options?: string[]
}

export default function QuestionList({
  sessionId,
  activeQuestionId,
  questions,
}: {
  sessionId: string
  activeQuestionId: string | null
  questions: Question[]
}) {

  async function setActive(id: string) {
    await updateDoc(doc(db, 'sessions', sessionId), {
      activeQuestionId: id,
      updatedAt: new Date(),
      isOpen: true,
    })
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Questions</div>
        <div className="text-xs text-slate-400">{questions.length} total</div>
      </div>

      <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pr-1">
        {questions.length === 0 ? (
          <div className="text-sm text-slate-400">No questions yet.</div>
        ) : (
          questions.map((q) => (
            <button
              key={q.id}
              className={`w-full text-left rounded-2xl border px-3 py-3 transition ${
                q.id === activeQuestionId
                  ? 'border-white/30 bg-white/10'
                  : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
              }`}
              onClick={() => setActive(q.id)}
              title="Set as active question"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <TypeIcon type={q.type} />
                    <span className="text-sm font-medium truncate">{q.prompt}</span>
                  </div>
                  {q.type === 'mcq' && (
                    <div className="mt-1 text-xs text-slate-400 truncate">
                      {(q.options ?? []).join(' • ')}
                    </div>
                  )}
                </div>
                <div className={`shrink-0 inline-flex items-center gap-2 text-xs ${q.id === activeQuestionId ? 'text-white' : 'text-slate-400'}`}>
                  <Play size={16} /> Active
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function TypeIcon({ type }: { type: QuestionType }) {
  const cls = "text-slate-300"
  if (type === 'mcq') return <BarChart3 size={16} className={cls} />
  if (type === 'number') return <Hash size={16} className={cls} />
  if (type === 'short') return <MessageCircle size={16} className={cls} />
  return <MessageSquareText size={16} className={cls} />
}
