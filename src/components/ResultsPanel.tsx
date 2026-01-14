import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ReactWordcloud from 'react-wordcloud'
import { numericHistogram, safeParseNumber } from '../lib/hist'
import { wordFrequencies } from '../lib/text'
import type { QuestionType } from './QuestionEditor'

type Resp = { id: string, value: unknown, submittedAt?: any }

export default function ResultsPanel({
  type,
  options,
  responses,
}: {
  type: QuestionType
  options: string[]
  responses: Resp[]
}) {

  const mcqData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const opt of options) counts.set(opt, 0)
    for (const r of responses) {
      const v = typeof r.value === 'string' ? r.value : String(r.value ?? '')
      if (counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  }, [responses, options])

  const numData = useMemo(() => {
    const vals = responses
      .map(r => safeParseNumber(r.value))
      .filter((v): v is number => v !== null)

    const hist = numericHistogram(vals)
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    const sorted = vals.slice().sort((a, b) => a - b)
    const median = vals.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null

    return { hist, mean, median, n: vals.length }
  }, [responses])

  const shortTexts = useMemo(() => {
    return responses
      .map(r => (typeof r.value === 'string' ? r.value : String(r.value ?? '')).trim())
      .filter(Boolean)
  }, [responses])

  const words = useMemo(() => {
    return wordFrequencies(shortTexts, 90)
  }, [shortTexts])

  return (
    <div className="card p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-semibold">Live results</div>
          <div className="text-sm text-slate-400">{responses.length} response(s)</div>
        </div>
        {type === 'number' && (
          <div className="text-xs text-slate-400 text-right">
            <div>n = {numData.n}</div>
            <div>mean = {numData.mean === null ? '—' : round2(numData.mean)}</div>
            <div>median = {numData.median === null ? '—' : round2(numData.median)}</div>
          </div>
        )}
      </div>

      <div className="mt-4">
        {(type === 'mcq' || type === 'number') && (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={type === 'mcq' ? mcqData : numData.hist.bins} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} interval={0} />
                <YAxis tick={{ fill: '#cbd5e1', fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0' }} />
                <Bar dataKey="count" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {type === 'short' && (
          <div className="space-y-2 max-h-[360px] overflow-auto pr-2">
            {shortTexts.length === 0 ? (
              <div className="text-slate-400 text-sm">No answers yet.</div>
            ) : (
              shortTexts.slice().reverse().map((t, idx) => (
                <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2">
                  {t}
                </div>
              ))
            )}
          </div>
        )}

        {type === 'long' && (
          <div className="h-[360px] w-full rounded-2xl border border-slate-800 bg-slate-950/30 p-2">
            {words.length === 0 ? (
              <div className="text-slate-400 text-sm p-3">No answers yet.</div>
            ) : (
              <ReactWordcloud
                words={words}
                options={{
                  rotations: 2,
                  rotationAngles: [0, 90],
                  fontSizes: [14, 64],
                  enableTooltip: true,
                  deterministic: true,
                  padding: 2,
                  scale: 'sqrt',
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function round2(x: number) {
  const r = Math.round(x * 100) / 100
  return (Math.abs(r - Math.round(r)) < 1e-9) ? `${Math.round(r)}` : `${r}`
}
