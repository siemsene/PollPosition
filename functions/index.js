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

function renderEmailHtml({ title, preheader, body }) {
  const safeTitle = title || 'PollPosition'
  const safePreheader = preheader || ''
  const safeBody = body || ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b1220;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;color:transparent;mso-hide:all;">
      ${safePreheader}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1220;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#0f172a;color:#ffffff;font-weight:bold;letter-spacing:0.3px;">
                PollPosition
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#0f172a;">${safeTitle}</h1>
                <div style="font-size:14px;line-height:1.6;color:#334155;">
                  ${safeBody}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">
                You are receiving this email because you are listed as an instructor or admin for PollPosition.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function sendEmail({ to, subject, text, htmlTitle, htmlBody, preheader }) {
  const apiKey = process.env.SMTP2GO_API_KEY
  const from = process.env.EMAIL_FROM
  const fromName = process.env.EMAIL_FROM_NAME
  const replyTo = process.env.EMAIL_REPLY_TO
  const subjectPrefix = process.env.EMAIL_SUBJECT_PREFIX || 'PollPosition'
  if (!apiKey || !from) {
    console.warn('Email not configured. Set SMTP2GO_API_KEY and EMAIL_FROM to enable email notifications.')
    return
  }
  const sender = fromName ? `${fromName} <${from}>` : from
  const fullSubject = subjectPrefix ? `${subjectPrefix}: ${subject}` : subject
  const res = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      to: [to],
      sender,
      reply_to: replyTo || undefined,
      subject: fullSubject,
      text_body: text,
      html_body: htmlBody ? renderEmailHtml({ title: htmlTitle || subject, preheader, body: htmlBody }) : undefined,
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
    const appUrl = process.env.APP_URL
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
    const dashboardLine = appUrl ? `\nAdmin dashboard: ${appUrl.replace(/\/$/, '')}/admin\n` : ''
    await sendEmail({
      to: adminEmail,
      subject: `New instructor signups (${snap.size})`,
      text:
        `New instructor signups were submitted today:\n${lines.join('\n')}\n` +
        `${dashboardLine}\n` +
        'You are receiving this email because ADMIN_EMAIL is set for this project.',
      htmlTitle: `New instructor signups (${snap.size})`,
      preheader: `${snap.size} new instructor signup${snap.size === 1 ? '' : 's'} today.`,
      htmlBody:
        `<p>The following instructor signups were submitted today:</p>` +
        `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` +
        (appUrl ? `<p><a href="${appUrl.replace(/\/$/, '')}/admin">Open the admin dashboard</a></p>` : '') +
        `<p style="color:#64748b;font-size:12px;">You are receiving this email because ADMIN_EMAIL is set for this project.</p>`,
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
    const appUrl = process.env.APP_URL
    const signInLine = appUrl ? `\nSign in: ${appUrl.replace(/\/$/, '')}/admin\n` : ''
    await sendEmail({
      to: after.email,
      subject: 'Instructor access approved',
      text:
        'Your instructor access has been approved. You can now sign in and create sessions and questions.' +
        signInLine +
        '\nIf you did not request instructor access, you can ignore this email.',
      htmlTitle: 'Instructor access approved',
      preheader: 'You can now sign in and create sessions.',
      htmlBody:
        '<p>Your instructor access has been approved. You can now sign in and create sessions and questions.</p>' +
        (appUrl ? `<p><a href="${appUrl.replace(/\/$/, '')}/admin">Sign in to PollPosition</a></p>` : '') +
        '<p style="color:#64748b;font-size:12px;">If you did not request instructor access, you can ignore this email.</p>',
    })
  },
)

exports.cleanupOldSessions = onSchedule(
  { region: 'us-central1', schedule: 'every day 03:00' },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const snap = await db.collection('sessions')
      .where('createdAt', '<', cutoff)
      .get()
    if (snap.empty) return
    const deletions = snap.docs.map(async (docSnap) => {
      await Promise.allSettled([
        db.recursiveDelete(docSnap.ref),
        db.doc(`session_costs/${docSnap.id}`).delete().catch(() => {}),
      ])
    })
    await Promise.allSettled(deletions)
  },
)

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
