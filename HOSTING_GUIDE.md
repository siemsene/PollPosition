# Hosting Guide (Complete Newbie)

This guide walks you through hosting your own copy of Poll Position from scratch.

## Prerequisites
- A Google account
- Node.js 18+ and npm installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- A billing account on Google Cloud (Functions v2, App Check, and Pub/Sub all require Blaze plan)

## 1) Create a Firebase project
1) Go to https://console.firebase.google.com/
2) Click "Add project" and follow the prompts.
3) Upgrade the project to the Blaze (pay-as-you-go) plan. Functions v2, App Check enforcement, and the billing kill switch all require it.

## 2) Enable required Firebase services
In Firebase Console:

### Firestore
1) Build -> Firestore Database -> Create database.
2) Choose the default location and start in Production mode.

### Authentication
1) Build -> Authentication -> Get started.
2) Enable "Email/Password".
3) Enable "Anonymous".
4) Under Authentication -> Templates -> "Email address verification", optionally customize the verification email subject and body. The app sends this automatically on instructor signup.

### Hosting (optional, for deployment)
1) Build -> Hosting -> Get started.

## 3) Create a Firebase Web App
1) Project settings (gear icon) -> General -> "Your apps" -> Add web app.
2) Register the app and copy the Firebase config values.

## 4) Set up App Check (reCAPTCHA v3)
App Check is enforced on the server-side `synthesizeShortResponses` function and is what protects your OpenAI spend from abuse. Without it, that callable will reject every request.

1) Create reCAPTCHA v3 keys at https://www.google.com/recaptcha/admin (choose reCAPTCHA v3, add your hosting domain plus `localhost` for dev).
2) In Firebase Console -> Build -> App Check, register your web app with the reCAPTCHA v3 site key.
3) For local development, generate a UUID and register it under App Check -> Manage debug tokens. Put the same UUID in `VITE_APPCHECK_DEBUG_TOKEN` (see step 5).

## 5) Configure environment variables
In this repo:

### Web app config
1) Copy `.env.example` to `.env`.
2) Paste your Firebase config values into `.env`.
3) Set `VITE_RECAPTCHA_SITE_KEY` to the site key from step 4. Without it, App Check is not initialized and `synthesizeShortResponses` calls will fail in production.
4) (Dev only) Optionally set `VITE_APPCHECK_DEBUG_TOKEN` to your registered debug UUID.

### Functions config
1) Copy `functions/.env.example` to `functions/.env`.
2) Fill in API keys and email settings (details in steps 8 and 9).

## 6) Deploy Firestore rules and indexes
From the project root:
```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

If the CLI complains about missing indexes, ensure `firestore.index.json` exists (this repo includes it).

The rules require approved instructors to have a verified email (`request.auth.token.email_verified == true`). If you are migrating an existing project that already has approved instructors, deploy Functions first (step 11) and run the one-time backfill (step 14) **before** deploying these rules — otherwise existing instructors will be locked out until they verify.

## 7) Enable required Google Cloud APIs
Open https://console.cloud.google.com/ and select your Firebase project. Enable:
- Cloud Functions API
- Cloud Build API
- Eventarc API
- Cloud Scheduler API
- Pub/Sub API
- Cloud Billing API (only required if you set up the kill switch in step 12)

These are required for Functions v2, scheduled jobs, and the Pub/Sub-driven kill switch.

## 8) Set OpenAI API key (required for AI synthesis)
- Create a key at https://platform.openai.com/
- Set `OPENAI_API_KEY` in `functions/.env`.

The AI synthesis callable enforces App Check (step 4) and verifies the caller is an admin or approved instructor before calling OpenAI.

## 9) Email setup (SMTP2GO)
The app sends transactional email for:
- Notification to the admin when a new instructor signs up
- Approval confirmation when an instructor is approved
- The Firebase-built-in email verification link sent on signup (this one goes through Firebase Auth, not SMTP2GO)

Steps:
1) Create an SMTP2GO account: https://www.smtp2go.com/
2) Create an API key.
3) Set these in `functions/.env`:
   - `SMTP2GO_API_KEY`
   - `EMAIL_FROM` (a verified sender address)
   - `EMAIL_FROM_NAME` (display name, optional)
   - `EMAIL_REPLY_TO` (optional)
   - `EMAIL_SUBJECT_PREFIX` (optional, defaults to "PollPosition")
   - `ADMIN_EMAIL` (where new-instructor notifications go)
   - `APP_URL` (your deployed app URL — used to build sign-in links in emails)

If `SMTP2GO_API_KEY` or `EMAIL_FROM` are not set, the SMTP2GO emails are silently skipped (the Firebase verification email still sends).

## 10) Cost-tracking knobs (optional)
Cost tracking is an estimate only. You can override defaults in `functions/.env`:
- `OPENAI_INPUT_USD_PER_1M` (default 0.15)
- `OPENAI_OUTPUT_USD_PER_1M` (default 0.60)
- `FIRESTORE_WRITE_USD_PER_100K` (default 0.18)

Per-session and per-instructor totals are written to the `session_costs` and `instructor_costs` collections and shown to admins in the dashboard.

## 11) Deploy Functions
```bash
firebase deploy --only functions
```

The deployed functions:
| Function | Type | Purpose |
| --- | --- | --- |
| `synthesizeShortResponses` | callable (App Check enforced) | OpenAI synthesis of student short answers |
| `deleteInstructor` | callable (admin only) | Hard-delete an instructor: removes Auth user, instructor doc, and cost doc |
| `backfillInstructorEmailVerified` | callable (admin only) | One-time: marks existing instructor accounts as email-verified |
| `notifyAdminOfNewInstructor` | Firestore trigger | Emails `ADMIN_EMAIL` on new signup |
| `notifyInstructorApproved` | Firestore trigger | Emails the instructor when admin sets `status: 'approved'` |
| `cleanupOldSessions` | scheduled (Mon 03:00) | Recursively deletes sessions older than 30 days plus their cost docs |
| `cleanupIdleAnonymousUsers` | scheduled (Mon 04:00) | Deletes anonymous Auth users idle 30+ days |
| `trackSessionWrites` / `trackQuestionWrites` / `trackResponseWrites` | Firestore triggers | Increment cost counters |
| `disableBillingOnBudgetExceeded` | Pub/Sub trigger | Kill switch — disables billing when a budget alert fires (see step 12) |

## 12) Billing budget kill switch (recommended)
The `disableBillingOnBudgetExceeded` function listens on a Pub/Sub topic named `billing-kill-switch` and disables billing on the project when the budget is exceeded. Without this wiring, the function exists but never fires.

1) In Cloud Console -> Pub/Sub, create a topic named exactly `billing-kill-switch`.
2) Cloud Console -> Billing -> Budgets & alerts -> Create budget. Set the amount you can tolerate spending in a worst-case month.
3) On the budget, enable "Connect this budget to a Pub/Sub topic for programmatic notifications" and select the `billing-kill-switch` topic.
4) Grant the budget service account permission to publish to that topic (Cloud Console will prompt you).
5) Make sure the service account running the function has the `Billing Account Administrator` role on the billing account, or it cannot disable billing.

When the budget threshold is crossed, the function will call `updateProjectBillingInfo` with an empty billing account, which **disables all paid services on the project** (Firestore reads/writes will keep working only within the free tier; Functions v2 and OpenAI calls will stop). To re-enable, manually relink the billing account in Cloud Console.

## 13) Deploy Hosting (optional)
```bash
npm install
npm run build
firebase init hosting
# choose `dist` as the public directory
firebase deploy --only hosting
```

## 14) First-time admin setup
1) Visit `/admin` in your deployed app.
2) Create an Email/Password account (use the sign-up link or create one in Firebase Console -> Authentication -> Users).
3) **Verify the email** for that account before signing in (open the verification link Firebase sends, or in Firebase Console mark it verified manually).
4) Sign in. Because no admin yet exists, the first signed-in user can claim admin access — the app will prompt you to do so.
5) Go to `/admin/dashboard` to manage instructors.

## 15) Existing-project migration: backfill verified emails (one-time)
Skip this section if you are setting up a fresh project.

If you are upgrading an already-running deployment that has approved instructors from before the email-verification gate was added:

1) Deploy Functions first (step 11) so `backfillInstructorEmailVerified` exists.
2) Sign in as admin and click **Backfill email verification** on the admin dashboard. The result banner reports how many were updated, already verified, or missing in Auth.
3) Now deploy the rules (step 6).

If you deploy the rules first, every existing approved instructor will be silently locked out until they manually verify. The backfill is idempotent — safe to run more than once.

## 16) Instructor lifecycle
1) Instructors sign up at `/instructor/signup`. The app immediately sends them a Firebase verification email.
2) Admin approves them in `/admin/dashboard`. They will then receive an approval email.
3) They sign in. If their email is not yet verified, they see a "Verify your email" card with **Resend** and **I verified — refresh** buttons (the refresh forces an ID-token refresh so the new `email_verified` claim takes effect without re-signing in).
4) Once verified, they can create sessions at `/admin/dashboard`.

### Removing an instructor (irreversible)
Clicking **Remove** on the admin dashboard now invokes `deleteInstructor`, which:
- Deletes the Firebase Auth user (they cannot sign in again with that email)
- Deletes the `instructors/{uid}` and `instructor_costs/{uid}` docs
- Leaves their sessions in place (those auto-clean at 30 days via `cleanupOldSessions`)

The dashboard prompts for confirmation before calling this. If you need to keep an audit trail of historical instructors, download the CSV first — the Remove action does not preserve any record.

## 17) Verify everything works
- Sign up as an instructor at `/instructor/signup`, verify the email, have admin approve.
- As the instructor, create a session and a question.
- Join as a student on `/` with the room code.
- Open `/results?room=ROOMCODE` to verify live public results.
- For short-answer questions, click "Synthesize" to confirm App Check + OpenAI wiring works.

## Troubleshooting
- **Permission denied after deploy**: rules may have been deployed before the email-verification backfill ran. Run **Backfill email verification** from the admin dashboard, or confirm `request.auth.token.email_verified` is `true` for the user (sign out and back in to refresh the token).
- **Synthesize button silently fails or returns "permission-denied"**: App Check is missing or misconfigured. Check `VITE_RECAPTCHA_SITE_KEY` is set in `.env`, the site key is registered in Firebase Console -> App Check, and your domain is on the reCAPTCHA allow list.
- **Functions deploy errors**: ensure all APIs in step 7 are enabled and billing is on (Blaze plan).
- **Email not sending**: confirm `SMTP2GO_API_KEY` and `EMAIL_FROM` are valid in `functions/.env`. The Firebase email-verification email is independent and configured under Authentication -> Templates.
- **Kill switch never fires**: the Pub/Sub topic must be named exactly `billing-kill-switch` and the budget must be linked to it. Check the function logs for the message `Kill switch:` — if you see nothing, the budget is not publishing to the topic.
- **Removed instructor still appears**: the dashboard hides any rows with `status === 'removed'` (legacy soft-removed records). The new Remove flow hard-deletes, so this should not recur. The CSV export still includes removed rows for audit purposes.
