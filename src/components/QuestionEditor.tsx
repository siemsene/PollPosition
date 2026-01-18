import { useMemo, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { Plus } from 'lucide-react'

export type QuestionType = 'mcq' | 'number' | 'short' | 'long' | 'pie'

export default function QuestionEditor({ sessionId }: { sessionId: string }) {
  const [type, setType] = useState<QuestionType>('mcq')
  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

  const usesOptions = type === 'mcq' || type === 'pie'
  const canCreate = prompt.trim().length > 0 && (!usesOptions || options.filter(o => o.trim()).length >= 2)

  const optionsClean = useMemo(
    () => options.map(o => o.trim()).filter(Boolean),
    [options]
  )

  async function createQuestion() {
    if (!canCreate) return
    const ref = collection(db, 'sessions', sessionId, 'questions')
    await addDoc(ref, {
      type,
      prompt: prompt.trim(),
      options: usesOptions ? optionsClean : [],
      createdAt: serverTimestamp(),
    })
    setPrompt('')
    if (usesOptions) setOptions(['', ''])
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Create a question</div>
        <button className="btn" disabled={!canCreate} onClick={createQuestion}>
          <Plus size={18} /> Add
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <div>
          <div className="label mb-1">Answer type</div>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
            <option value="mcq">Multiple choice</option>
            <option value="pie">Pie chart (100-point allocation)</option>
            <option value="number">Numerical</option>
            <option value="short">Short text</option>
            <option value="long">Extended text (word cloud)</option>
          </select>
        </div>

        <div>
          <div className="label mb-1">Prompt</div>
          <textarea
            className="input min-h-[80px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type the question you want to ask..."
          />
        </div>

        {usesOptions && (
          <div>
            <div className="label mb-1">{type === 'pie' ? 'Categories' : 'Options'}</div>
            <div className="grid md:grid-cols-2 gap-2">
              {options.map((opt, idx) => (
                <input
                  key={idx}
                  className="input"
                  value={opt}
                  onChange={(e) => {
                    const next = options.slice()
                    next[idx] = e.target.value
                    setOptions(next)
                  }}
                  placeholder={type === 'pie' ? `Category ${idx + 1}` : undefined}
                />
              ))}
            </div>
            <button
              className="btn-ghost mt-2"
              onClick={() => setOptions([...options, type === 'pie' ? `Category ${options.length + 1}` : `Option ${options.length + 1}`])}
            >
              <Plus size={16} /> {type === 'pie' ? 'Add category' : 'Add option'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
