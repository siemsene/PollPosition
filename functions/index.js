const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onMessagePublished } = require('firebase-functions/v2/pubsub')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const { CloudBillingClient } = require('@google-cloud/billing')

initializeApp()
const db = getFirestore()

const OPENAI_INPUT_USD_PER_1M = Number(process.env.OPENAI_INPUT_USD_PER_1M ?? '0.15')
const OPENAI_OUTPUT_USD_PER_1M = Number(process.env.OPENAI_OUTPUT_USD_PER_1M ?? '0.60')
const FIRESTORE_WRITE_USD_PER_100K = Number(process.env.FIRESTORE_WRITE_USD_PER_100K ?? '0.18')
const FIRESTORE_WRITE_USD = FIRESTORE_WRITE_USD_PER_100K / 100000

const COST_FIELDS = ['openaiInputTokens', 'openaiOutputTokens', 'openaiUsd', 'firestoreWrites', 'firestoreUsd', 'totalUsd']

// Per-session costs are incremented live; instructor totals are recomputed
// hourly by aggregateInstructorCosts (plus a "carried" bucket for cleaned-up
// sessions), so high-frequency writes touch only one cost document.
async function incrementCostsForSession({ sessionId, ownerUid, firestoreWrites = 0, openaiInputTokens = 0, openaiOutputTokens = 0 }) {
  if (!sessionId || !ownerUid) return
  const openaiUsd = (openaiInputTokens / 1_000_000) * OPENAI_INPUT_USD_PER_1M
    + (openaiOutputTokens / 1_000_000) * OPENAI_OUTPUT_USD_PER_1M
  const firestoreUsd = firestoreWrites * FIRESTORE_WRITE_USD
  const totalUsd = openaiUsd + firestoreUsd
  if (totalUsd <= 0 && firestoreWrites <= 0 && openaiInputTokens <= 0 && openaiOutputTokens <= 0) return

  await db.doc(`session_costs/${sessionId}`).set({
    sessionId,
    ownerUid,
    openaiInputTokens: FieldValue.increment(openaiInputTokens),
    openaiOutputTokens: FieldValue.increment(openaiOutputTokens),
    openaiUsd: FieldValue.increment(openaiUsd),
    firestoreWrites: FieldValue.increment(firestoreWrites),
    firestoreUsd: FieldValue.increment(firestoreUsd),
    totalUsd: FieldValue.increment(totalUsd),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
}

// Session owners never change, so warm instances can skip the lookup read.
const ownerCache = new Map()

async function resolveSessionOwner(sessionId) {
  if (!sessionId) return null
  if (ownerCache.has(sessionId)) return ownerCache.get(sessionId)
  const snap = await db.doc(`sessions/${sessionId}`).get()
  if (!snap.exists) return null
  const owner = snap.data()?.ownerUid ?? null
  if (owner) ownerCache.set(sessionId, owner)
  return owner
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
    console.warn(`SMTP2GO error ${res.status}: ${detail}`)
  }
}

async function runSynthesis({ question, items, mode }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.')
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
          content: JSON.stringify({ question, responses: items }),
        },
      ],
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OpenAI request failed (${res.status}). ${errorText}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI response missing content.')
  }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (_err) {
    throw new Error('Failed to parse OpenAI JSON response.')
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

  const inputTokens = Number(data?.usage?.prompt_tokens ?? 0)
  const outputTokens = Number(data?.usage?.completion_tokens ?? 0)

  return {
    overallSummary: typeof parsed?.overall_summary === 'string' ? parsed.overall_summary : undefined,
    groups,
    usage: {
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    },
  }
}

exports.synthesizeShortResponses = onCall({ region: 'us-central1', timeoutSeconds: 60, enforceAppCheck: true, maxInstances: 10 }, async (request) => {
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

  if (!process.env.OPENAI_API_KEY) {
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

  let result
  try {
    result = await runSynthesis({ question, items: cleaned, mode })
  } catch (err) {
    throw new HttpsError('internal', err?.message ?? 'Synthesis failed.')
  }

  const sessionId = typeof request.data?.sessionId === 'string' ? request.data.sessionId : null
  if (sessionId) {
    const ownerUid = await resolveSessionOwner(sessionId)
    await incrementCostsForSession({
      sessionId,
      ownerUid,
      openaiInputTokens: result.usage.inputTokens,
      openaiOutputTokens: result.usage.outputTokens,
    })
  }

  return {
    overall_summary: result.overallSummary,
    groups: result.groups,
  }
})

exports.deleteInstructor = onCall({ region: 'us-central1', timeoutSeconds: 30, maxInstances: 5 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const adminSnap = await db.doc('config/admin').get()
  if (!adminSnap.exists || adminSnap.data()?.uid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Admin access required.')
  }
  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : ''
  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid is required.')
  }
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'You cannot remove your own account.')
  }

  const adminAuth = getAuth()
  let authDeleted = true
  try {
    await adminAuth.deleteUser(uid)
  } catch (err) {
    if (err && err.code === 'auth/user-not-found') {
      authDeleted = false
    } else {
      throw new HttpsError('internal', err?.message ?? 'Failed to delete auth user.')
    }
  }

  await Promise.allSettled([
    db.doc(`instructors/${uid}`).delete(),
    db.doc(`instructor_costs/${uid}`).delete(),
  ])

  return { ok: true, authDeleted }
})

exports.backfillInstructorEmailVerified = onCall({ region: 'us-central1', timeoutSeconds: 120, maxInstances: 1 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const adminSnap = await db.doc('config/admin').get()
  if (!adminSnap.exists || adminSnap.data()?.uid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Admin access required.')
  }

  const adminAuth = getAuth()
  const instructorsSnap = await db.collection('instructors').get()
  let updated = 0
  let alreadyVerified = 0
  let missing = 0
  const errors = []

  for (const docSnap of instructorsSnap.docs) {
    const uid = docSnap.id
    try {
      const userRecord = await adminAuth.getUser(uid)
      if (userRecord.emailVerified) {
        alreadyVerified += 1
        continue
      }
      await adminAuth.updateUser(uid, { emailVerified: true })
      updated += 1
    } catch (err) {
      if (err && err.code === 'auth/user-not-found') {
        missing += 1
      } else {
        errors.push({ uid, message: err?.message ?? String(err) })
      }
    }
  }

  return { updated, alreadyVerified, missing, errors }
})

exports.notifyAdminOfNewInstructor = onDocumentCreated(
  { region: 'us-central1', document: 'instructors/{instructorId}', maxInstances: 5 },
  async (event) => {
    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) {
      console.warn('ADMIN_EMAIL is not set; skipping new instructor notification.')
      return
    }
    const data = event.data?.data() || {}
    const instructorEmail = data.email || event.params.instructorId
    const status = data.status ? ` (${data.status})` : ''
    const appUrl = process.env.APP_URL
    const dashboardLine = appUrl ? `\nAdmin dashboard: ${appUrl.replace(/\/$/, '')}/admin\n` : ''
    await sendEmail({
      to: adminEmail,
      subject: 'New instructor signup',
      text:
        `A new instructor has signed up:\n- ${instructorEmail}${status}\n` +
        `${dashboardLine}\n` +
        'You are receiving this email because ADMIN_EMAIL is set for this project.',
      htmlTitle: 'New instructor signup',
      preheader: `New signup: ${instructorEmail}`,
      htmlBody:
        `<p>A new instructor has signed up:</p>` +
        `<ul><li>${escapeHtml(`${instructorEmail}${status}`)}</li></ul>` +
        (appUrl ? `<p><a href="${appUrl.replace(/\/$/, '')}/admin">Open the admin dashboard</a></p>` : '') +
        `<p style="color:#64748b;font-size:12px;">You are receiving this email because ADMIN_EMAIL is set for this project.</p>`,
    })
  },
)

exports.notifyInstructorApproved = onDocumentUpdated(
  { region: 'us-central1', document: 'instructors/{instructorId}', maxInstances: 5 },
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
  { region: 'us-central1', schedule: 'every monday 03:00', maxInstances: 1 },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const snap = await db.collection('sessions')
      .where('createdAt', '<', cutoff)
      .get()
    if (snap.empty) return
    // session_costs docs are left in place: aggregateInstructorCosts folds
    // costs of deleted sessions into the owner's "carried" bucket atomically
    // with removing the doc, so a failed fold is retried instead of lost.
    const deletions = snap.docs.map((docSnap) => db.recursiveDelete(docSnap.ref))
    await Promise.allSettled(deletions)
  },
)

exports.cleanupIdleAnonymousUsers = onSchedule(
  { region: 'us-central1', schedule: 'every monday 04:00', maxInstances: 1 },
  async () => {
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000
    const adminAuth = getAuth()
    let pageToken
    let totalDeleted = 0
    do {
      const res = await adminAuth.listUsers(1000, pageToken)
      const idleAnonUids = res.users
        .filter((u) => u.providerData.length === 0)
        .filter((u) => {
          const lastSignIn = u.metadata && u.metadata.lastSignInTime
            ? new Date(u.metadata.lastSignInTime).getTime()
            : 0
          return lastSignIn > 0 && lastSignIn < cutoffMs
        })
        .map((u) => u.uid)
      for (let i = 0; i < idleAnonUids.length; i += 1000) {
        const batch = idleAnonUids.slice(i, i + 1000)
        const result = await adminAuth.deleteUsers(batch)
        totalDeleted += result.successCount
      }
      pageToken = res.pageToken
    } while (pageToken)
    if (totalDeleted > 0) {
      console.log(`Deleted ${totalDeleted} idle anonymous users.`)
    }
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
  { region: 'us-central1', document: 'sessions/{sessionId}', maxInstances: 20 },
  async (event) => {
    // Deletions are excluded so cleanup runs can't recreate cost docs for
    // sessions that were just removed.
    if (!event.data?.after?.exists) return
    const sessionId = event.params.sessionId
    const ownerUid = event.data.after.data()?.ownerUid
    await incrementCostsForSession({ sessionId, ownerUid, firestoreWrites: 1 })
  },
)

exports.trackQuestionWrites = onDocumentWritten(
  { region: 'us-central1', document: 'sessions/{sessionId}/questions/{questionId}', maxInstances: 20 },
  async (event) => {
    if (!event.data?.after?.exists) return
    const sessionId = event.params.sessionId
    const ownerUid = await resolveSessionOwner(sessionId)
    await incrementCostsForSession({ sessionId, ownerUid, firestoreWrites: 1 })
  },
)

const AUTO_SYNTH_MIN_ITEMS = 3
const AUTO_SYNTH_MIN_DELTA = 3
const AUTO_SYNTH_MIN_INTERVAL_MS = 20_000
const AUTO_SYNTH_MAX_RUNS = 40
const AUTO_SYNTH_LOCK_TIMEOUT_MS = 90_000

// Keeps the projector's synthesis fresh for extended-text questions without
// any instructor interaction. Cost guards + a transaction lock bound OpenAI
// usage to at most one call per ~20s per question, 40 auto runs max.
async function maybeAutoSynthesize({ sessionId, questionId, ownerUid }) {
  if (!process.env.OPENAI_API_KEY) return

  const questionRef = db.doc(`sessions/${sessionId}/questions/${questionId}`)
  const [questionSnap, sessionSnap] = await Promise.all([
    questionRef.get(),
    db.doc(`sessions/${sessionId}`).get(),
  ])
  if (!questionSnap.exists || !sessionSnap.exists) return
  const question = questionSnap.data()
  if (question.type !== 'long') return
  const session = sessionSnap.data()
  if (session.activeQuestionId !== questionId || session.isOpen === false) return

  const countSnap = await questionRef.collection('responses').count().get()
  const n = countSnap.data().count
  if (n < AUTO_SYNTH_MIN_ITEMS) return
  if (n - (question.synthesizedCount ?? 0) < AUTO_SYNTH_MIN_DELTA) return

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(questionRef)
    if (!snap.exists) return false
    const data = snap.data()
    const now = Date.now()
    const lastMs = data.synthesizedAt?.toMillis?.() ?? 0
    if (now - lastMs < AUTO_SYNTH_MIN_INTERVAL_MS) return false
    if ((data.autoSynthCount ?? 0) >= AUTO_SYNTH_MAX_RUNS) return false
    const lockMs = data.synthLockAt?.toMillis?.() ?? 0
    if (lockMs && now - lockMs < AUTO_SYNTH_LOCK_TIMEOUT_MS) return false
    tx.update(questionRef, {
      synthLockAt: Timestamp.now(),
      autoSynthCount: FieldValue.increment(1),
    })
    return true
  })
  if (!claimed) return

  try {
    const respSnap = await questionRef.collection('responses')
      .orderBy('submittedAt', 'desc')
      .limit(200)
      .get()
    const items = respSnap.docs
      .map((d) => (typeof d.data()?.value === 'string' ? d.data().value.trim() : ''))
      .filter((v) => v.length > 0)
    if (items.length === 0) {
      await questionRef.update({ synthLockAt: FieldValue.delete() })
      return
    }

    const { overallSummary, groups, usage } = await runSynthesis({
      question: question.prompt ?? null,
      items,
      mode: 'summary',
    })

    // Must match the camelCase shape the web client persists and reads.
    await questionRef.update({
      synthesis: { overallSummary: overallSummary ?? '', groups },
      synthesizedAt: FieldValue.serverTimestamp(),
      synthesizedCount: items.length,
      synthLockAt: FieldValue.delete(),
    })

    await incrementCostsForSession({
      sessionId,
      ownerUid,
      openaiInputTokens: usage.inputTokens,
      openaiOutputTokens: usage.outputTokens,
    })
  } catch (err) {
    await questionRef.update({ synthLockAt: FieldValue.delete() }).catch(() => {})
    throw err
  }
}

exports.onResponseWritten = onDocumentWritten(
  { region: 'us-central1', document: 'sessions/{sessionId}/questions/{questionId}/responses/{responseId}', maxInstances: 50, timeoutSeconds: 60 },
  async (event) => {
    if (!event.data?.after?.exists) return
    const { sessionId, questionId } = event.params
    const ownerUid = await resolveSessionOwner(sessionId)
    await incrementCostsForSession({ sessionId, ownerUid, firestoreWrites: 1 })
    try {
      await maybeAutoSynthesize({ sessionId, questionId, ownerUid })
    } catch (err) {
      console.warn(`Auto-synthesis failed for ${sessionId}/${questionId}:`, err?.message ?? err)
    }
  },
)

// Recomputes instructor totals as carried + sum(live session_costs). The
// "carried" bucket preserves spend from sessions that no longer exist: this
// function folds orphaned session_costs docs into it atomically with their
// deletion, and seeds it once for docs migrated from the old live-increment
// scheme. Only instructors that still exist (or the admin) are written, so
// deleted accounts are not resurrected.
exports.aggregateInstructorCosts = onSchedule(
  { region: 'us-central1', schedule: 'every 1 hours', maxInstances: 1, timeoutSeconds: 540 },
  async () => {
    const [sessionCostsSnap, instructorCostsSnap, instructorsSnap, adminSnap] = await Promise.all([
      db.collection('session_costs').get(),
      db.collection('instructor_costs').get(),
      db.collection('instructors').get(),
      db.doc('config/admin').get(),
    ])

    const validOwners = new Set(instructorsSnap.docs.map((d) => d.id))
    const adminUid = adminSnap.exists ? adminSnap.data()?.uid : null
    if (adminUid) validOwners.add(adminUid)

    const zeroed = () => Object.fromEntries(COST_FIELDS.map((f) => [f, 0]))
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

    // Totals per owner across ALL current session_costs docs (including ones
    // whose session is already gone) — needed for migration seeding below.
    const costDocs = sessionCostsSnap.docs
    const allSums = new Map()
    for (const docSnap of costDocs) {
      const data = docSnap.data()
      const owner = data?.ownerUid
      if (!owner) continue
      const entry = allSums.get(owner) ?? zeroed()
      for (const f of COST_FIELDS) entry[f] += num(data[f])
      allSums.set(owner, entry)
    }

    // One-time migration: instructor_costs docs written by the old
    // live-increment scheme carry history for already-deleted sessions in
    // their totals. Preserve it as the carried baseline.
    for (const docSnap of instructorCostsSnap.docs) {
      const data = docSnap.data()
      if (data?.aggregationSeeded || data?.carried) continue
      const live = allSums.get(docSnap.id) ?? zeroed()
      const carried = {}
      for (const f of COST_FIELDS) carried[f] = Math.max(0, num(data[f]) - live[f])
      try {
        await docSnap.ref.set({ carried, aggregationSeeded: true }, { merge: true })
      } catch (err) {
        console.warn(`Failed to seed carried costs for ${docSnap.id}:`, err?.message ?? err)
      }
    }

    // Fold session_costs docs whose session no longer exists (weekly cleanup
    // or manual deletion) into the owner's carried bucket, atomically with
    // deleting the doc. A failed fold keeps the doc and is retried next run.
    const sessionRefs = costDocs.map((d) => db.doc(`sessions/${d.id}`))
    const sessionSnaps = sessionRefs.length ? await db.getAll(...sessionRefs) : []
    const liveDocs = []
    for (let i = 0; i < costDocs.length; i++) {
      const docSnap = costDocs[i]
      if (sessionSnaps[i].exists) {
        liveDocs.push(docSnap)
        continue
      }
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(docSnap.ref)
          if (!snap.exists) return
          const data = snap.data()
          const owner = data?.ownerUid
          if (owner && validOwners.has(owner)) {
            const carried = {}
            for (const f of COST_FIELDS) carried[f] = FieldValue.increment(num(data[f]))
            tx.set(db.doc(`instructor_costs/${owner}`), {
              instructorId: owner,
              carried,
              aggregationSeeded: true,
            }, { merge: true })
          }
          tx.delete(snap.ref)
        })
      } catch (err) {
        console.warn(`Failed to fold costs for deleted session ${docSnap.id}:`, err?.message ?? err)
        liveDocs.push(docSnap)
      }
    }

    // Recompute totals for owners that still exist.
    const refreshedSnap = await db.collection('instructor_costs').get()
    const carriedByUid = new Map(refreshedSnap.docs.map((d) => [d.id, d.data()?.carried ?? {}]))

    const liveSums = new Map()
    for (const docSnap of liveDocs) {
      const data = docSnap.data()
      const owner = data?.ownerUid
      if (!owner) continue
      const entry = liveSums.get(owner) ?? zeroed()
      for (const f of COST_FIELDS) entry[f] += num(data[f])
      liveSums.set(owner, entry)
    }

    const owners = new Set([...liveSums.keys(), ...carriedByUid.keys()])
    const writes = []
    for (const uid of owners) {
      if (!validOwners.has(uid)) continue
      const live = liveSums.get(uid) ?? zeroed()
      const carried = carriedByUid.get(uid) ?? {}
      const docData = { instructorId: uid, aggregationSeeded: true, updatedAt: FieldValue.serverTimestamp() }
      for (const f of COST_FIELDS) docData[f] = live[f] + num(carried[f])
      writes.push(db.doc(`instructor_costs/${uid}`).set(docData, { merge: true }))
    }
    await Promise.allSettled(writes)
  },
)

const billing = new CloudBillingClient()

exports.disableBillingOnBudgetExceeded = onMessagePublished(
  { region: 'us-central1', topic: 'billing-kill-switch', maxInstances: 1 },
  async (event) => {
    const payload = event.data?.message?.json
    if (!payload) {
      console.warn('Kill switch: empty payload, ignoring.')
      return
    }

    const costAmount = Number(payload.costAmount ?? 0)
    const budgetAmount = Number(payload.budgetAmount ?? 0)
    if (!(costAmount >= budgetAmount) || budgetAmount <= 0) {
      console.log(`Kill switch: cost ${costAmount} below budget ${budgetAmount}, no action.`)
      return
    }

    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT
    if (!projectId) {
      console.error('Kill switch: project id not resolvable from env.')
      return
    }
    const projectName = `projects/${projectId}`

    const [info] = await billing.getProjectBillingInfo({ name: projectName })
    if (!info.billingEnabled) {
      console.log('Kill switch: billing already disabled, nothing to do.')
      return
    }

    console.warn(`KILL SWITCH FIRED: cost=${costAmount} >= budget=${budgetAmount}. Disabling billing on ${projectId}.`)
    const [updated] = await billing.updateProjectBillingInfo({
      name: projectName,
      projectBillingInfo: { billingAccountName: '' },
    })
    console.warn('Kill switch: billing disabled.', updated)
  },
)
