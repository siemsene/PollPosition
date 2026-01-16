const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

initializeApp()
const db = getFirestore()

exports.synthesizeShortResponses = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const adminSnap = await db.doc('config/admin').get()
  if (!adminSnap.exists || adminSnap.data()?.uid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Instructor access required.')
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'OpenAI API key is not configured.')
  }

  const items = Array.isArray(request.data?.items) ? request.data.items : []
  const question = typeof request.data?.question === 'string' ? request.data.question : null
  const mode = request.data?.mode === 'summary' ? 'summary' : 'grouped'

  const cleaned = items
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 200)

  if (cleaned.length === 0) {
    throw new HttpsError('invalid-argument', 'No responses to synthesize.')
  }

  const prompt = {
    question,
    responses: cleaned,
  }

  const systemContent = mode === 'summary'
    ? 'Write a concise synthesis that integrates and summarizes all responses. ' +
      'Use every response. Do not invent content. Return JSON only with keys: ' +
      '"overall_summary" (string).'
    : 'Group the responses into thematic clusters and write a concise synthesis for each group. ' +
      'Use every response exactly once. Do not invent content. Return JSON only with keys: ' +
      '"overall_summary" (string, optional) and "groups" (array). Each group has keys: ' +
      '"theme" (string), "summary" (string), and "contributions" (array of response strings).'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemContent,
        },
        {
          role: 'user',
          content: JSON.stringify(prompt),
        },
      ],
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new HttpsError('internal', `OpenAI request failed (${res.status}). ${errorText}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new HttpsError('internal', 'OpenAI response missing content.')
  }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (_err) {
    throw new HttpsError('internal', 'Failed to parse OpenAI JSON response.')
  }

  const groups = Array.isArray(parsed?.groups)
    ? parsed.groups.map((group) => ({
        theme: typeof group?.theme === 'string' ? group.theme : 'Theme',
        summary: typeof group?.summary === 'string' ? group.summary : '',
        contributions: Array.isArray(group?.contributions)
          ? group.contributions.filter((item) => typeof item === 'string')
          : [],
      }))
    : []

  return {
    overall_summary: typeof parsed?.overall_summary === 'string' ? parsed.overall_summary : undefined,
    groups,
  }
})
