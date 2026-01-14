export const DEFAULT_STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","but","by","for","if","in","into","is","it","no","not","of","on","or","s","such","t","that","the","their","then","there","these","they","this","to","was","will","with","we","you","your","i","me","my","our","ours","from","have","has","had","were","been","can","could","should","would","what","when","where","who","why","how","do","does","did","so","than","too","very",
  // classroom noise
  "like","just","also","really"
])

export function tokenize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) return []

  return cleaned
    .split(" ")
    .map(w => w.replace(/^'+|'+$/g, ""))
    .filter(w => w.length >= 3 && !DEFAULT_STOP_WORDS.has(w))
}

export function wordFrequencies(texts: string[], topN = 80) {
  const freq = new Map<string, number>()
  for (const t of texts) {
    for (const token of tokenize(t)) {
      freq.set(token, (freq.get(token) ?? 0) + 1)
    }
  }
  return Array.from(freq.entries())
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
}
