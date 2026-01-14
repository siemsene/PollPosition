export function safeParseNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

export function sturgesBins(n: number) {
  if (n <= 1) return 1
  return Math.max(3, Math.ceil(Math.log2(n) + 1))
}

export function numericHistogram(values: number[]) {
  const n = values.length
  if (n === 0) return { bins: [] as { name: string, count: number }[], min: 0, max: 0 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    return {
      bins: [{ name: `${min}`, count: n }],
      min,
      max
    }
  }

  const k = sturgesBins(n)
  const width = (max - min) / k

  const counts = new Array(k).fill(0)
  for (const v of values) {
    let idx = Math.floor((v - min) / width)
    if (idx === k) idx = k - 1
    counts[idx]++
  }

  const bins = counts.map((count, i) => {
    const a = min + i * width
    const b = i === k - 1 ? max : (min + (i + 1) * width)
    const name = `${roundNice(a)}-${roundNice(b)}`
    return { name, count }
  })

  return { bins, min, max }
}

function roundNice(x: number) {
  return `${Math.round(x)}`
}
