const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')

initializeApp()
const db = getFirestore()

const OPENAI_INPUT_USD_PER_1M = Number(process.env.OPENAI_INPUT_USD_PER_1M ?? '0.15')
const OPENAI_OUTPUT_USD_PER_1M = Number(process.env.OPENAI_OUTPUT_USD_PER_1M ?? '0.60')
const FIRESTORE_WRITE_USD_PER_100K = Number(process.env.FIRESTORE_WRITE_USD_PER_100K ?? '0.18')
const FIRESTORE_WRITE_USD = FIRESTORE_WRITE_USD_PER_100K / 100000

async function incrementCostsForSession({ sessionId, ownerUid, firestoreWrites = 0, openaiInputTokens = 0, openaiOutputTokens = 0 }) {
  if (!sessionId || !ownerUid) return
  const openaiUsd = (openaiInputTokens / 1_000_000) * OPENAI_INPUT_USD_PER_1M
    + (openaiOutputTokens / 1_000_000) * OPENAI_OUTPUT_USD_PER_1M
  const firestoreUsd = firestoreWrites * FIRESTORE_WRITE_USD
  const totalUsd = openaiUsd + firestoreUsd
  if (totalUsd <= 0 && firestoreWrites <= 0 && openaiInputTokens <= 0 && openaiOutputTokens <= 0) return

  const sessionRef = db.doc(`session_costs/${sessionId}`)
  const instructorRef = db.doc(`instructor_costs/${ownerUid}`)
  await Promise.all([
    sessionRef.set({
      sessionId,
      ownerUid,
      openaiInputTokens: FieldValue.increment(openaiInputTokens),
      openaiOutputTokens: FieldValue.increment(openaiOutputTokens),
      openaiUsd: FieldValue.increment(openaiUsd),
      firestoreWrites: FieldValue.increment(firestoreWrites),
      firestoreUsd: FieldValue.increment(firestoreUsd),
      totalUsd: FieldValue.increment(totalUsd),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    instructorRef.set({
      instructorId: ownerUid,
      openaiInputTokens: FieldValue.increment(openaiInputTokens),
      openaiOutputTokens: FieldValue.increment(openaiOutputTokens),
      openaiUsd: FieldValue.increment(openaiUsd),
      firestoreWrites: FieldValue.increment(firestoreWrites),
      firestoreUsd: FieldValue.increment(firestoreUsd),
      totalUsd: FieldValue.increment(totalUsd),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ])
}

async function resolveSessionOwner(sessionId) {
  if (!sessionId) return null
  const snap = await db.doc(`sessions/${sessionId}`).get()
  if (!snap.exists) return null
  return snap.data()?.ownerUid ?? null
}

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.SMTP2GO_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    console.warn('Email not configured. Set SMTP2GO_API_KEY and EMAIL_FROM to enable email notifications.')
    return
  }
  const res = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      to: [to],
      sender: from,
      subject,
      text_body: text,
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    console.warn(`SendGrid error ${res.status}: ${detail}`)
  }
}

exports.synthesizeShortResponses = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const [adminSnap, instructorSnap] = await Promise.all([
    db.doc('config/admin').get(),
    db.doc(`instructors/${request.auth.uid}`).get(),
  ])
  const isAdmin = adminSnap.exists && adminSnap.data()?.uid === request.auth.uid
  const isInstructor = instructorSnap.exists && instructorSnap.data()?.status === 'approved'
  if (!isAdmin && !isInstructor) {
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

  const sessionId = typeof request.data?.sessionId === 'string' ? request.data.sessionId : null
  if (sessionId) {
    const ownerUid = await resolveSessionOwner(sessionId)
    const inputTokens = Number(data?.usage?.prompt_tokens ?? 0)
    const outputTokens = Number(data?.usage?.completion_tokens ?? 0)
    await incrementCostsForSession({
      sessionId,
      ownerUid,
      openaiInputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      openaiOutputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    })
  }

  return {
    overall_summary: typeof parsed?.overall_summary === 'string' ? parsed.overall_summary : undefined,
    groups,
  }
})

exports.notifyAdminOfNewInstructors = onSchedule(
  { region: 'us-central1', schedule: 'every day 08:00' },
  async () => {
    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) {
      console.warn('ADMIN_EMAIL is not set; skipping daily instructor digest.')
      return
    }
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    const startTimestamp = Timestamp.fromDate(start)
    const snap = await db.collection('instructors')
      .where('requestedAt', '>=', startTimestamp)
      .get()
    if (snap.empty) return
    const lines = snap.docs.map((doc) => {
      const data = doc.data() || {}
      const status = data.status ? ` (${data.status})` : ''
      return `- ${data.email ?? doc.id}${status}`
    })
    await sendEmail({
      to: adminEmail,
      subject: `New instructor signups today (${snap.size})`,
      text: `New instructor signups were submitted today:\n${lines.join('\n')}\n\nReview them in the admin dashboard.`,
    })
  },
)

exports.notifyInstructorApproved = onDocumentUpdated(
  { region: 'us-central1', document: 'instructors/{instructorId}' },
  async (event) => {
    const before = event.data?.before?.data() || {}
    const after = event.data?.after?.data() || {}
    if (before.status === 'approved' || after.status !== 'approved') return
    if (!after.email) return
    await sendEmail({
      to: after.email,
      subject: 'Your instructor access is approved',
      text: 'Your instructor account has been approved. You can now sign in and create sessions and questions.',
    })
  },
)

exports.trackSessionWrites = onDocumentWritten(
  { region: 'us-central1', document: 'sessions/{sessionId}' },
  async (event) => {
    const sessionId = event.params.sessionId
    const after = event.data?.after?.data() || {}
    const ownerUid = after.ownerUid || (event.data?.before?.data() || {}).ownerUid
    await incrementCostsForSession({ sessionId, ownerUid, firestoreWrites: 1 })
  },
)

exports.trackQuestionWrites = onDocumentWritten(
  { region: 'us-central1', document: 'sessions/{sessionId}/questions/{questionId}' },
  async (event) => {
    const sessionId = event.params.sessionId
    const ownerUid = await resolveSessionOwner(sessionId)
    await incrementCostsForSession({ sessionId, ownerUid, firestoreWrites: 1 })
  },
)

exports.trackResponseWrites = onDocumentWritten(
  { region: 'us-central1', document: 'sessions/{sessionId}/questions/{questionId}/responses/{responseId}' },
  async (event) => {
    const sessionId = event.params.sessionId
    const ownerUid = await resolveSessionOwner(sessionId)
    await incrementCostsForSession({ sessionId, ownerUid, firestoreWrites: 1 })
  },
)
