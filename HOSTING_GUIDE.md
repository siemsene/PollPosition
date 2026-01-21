# Hosting Guide (Complete Newbie)

This guide walks you through hosting your own copy of Poll Position from scratch.

## Prerequisites
- A Google account
- Node.js 18+ and npm installed
- Firebase CLI installed (`npm install -g firebase-tools`)

## 1) Create a Firebase project
1) Go to https://console.firebase.google.com/
2) Click "Add project" and follow the prompts.
3) Once created, open the project.

## 2) Enable required Firebase services
In Firebase Console:

### Firestore
1) Build -> Firestore Database -> Create database.
2) Choose the default location and start in Production mode.

### Authentication
1) Build -> Authentication -> Get started.
2) Enable "Email/Password".
3) Enable "Anonymous".

### Hosting (optional, for deployment)
1) Build -> Hosting -> Get started.

## 3) Create a Firebase Web App
1) Project settings (gear icon) -> General -> "Your apps" -> Add web app.
2) Register the app and copy the Firebase config values.

## 4) Configure environment variables
In this repo:

### Web app config
1) Copy `.env.example` to `.env`.
2) Paste your Firebase config values into `.env`.

### Functions config
1) Copy `functions/.env.example` to `functions/.env`.
2) Add your API keys and email settings (details below).

## 5) Deploy Firestore rules and indexes
From the project root:
```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

If the CLI complains about missing indexes, ensure `firestore.index.json` exists (this repo includes it).

## 6) Enable required Google Cloud APIs
Open https://console.cloud.google.com/ and select your Firebase project. Enable:
- Cloud Functions API
- Cloud Build API
- Eventarc API
- Cloud Scheduler API
- Pub/Sub API

These are required for Functions v2 and scheduled jobs.

## 7) Set OpenAI API key (required for synthesis)
You need an OpenAI API key if you want AI synthesis:
- Create a key at https://platform.openai.com/
- Set `OPENAI_API_KEY` in `functions/.env`.

## 8) Email setup (SMTP2GO)
This app sends:
- Daily admin digest when new instructors sign up
- Approval email when an instructor is approved

Steps:
1) Create an SMTP2GO account: https://www.smtp2go.com/
2) Create an API key.
3) Set these in `functions/.env`:
   - `SMTP2GO_API_KEY`
   - `EMAIL_FROM` (a verified sender address)
   - `ADMIN_EMAIL` (where the daily digest goes)

## 9) ReCAPTCHA (not currently used)
The current app does not include a reCAPTCHA flow. If you plan to add it:
1) Create keys at https://www.google.com/recaptcha/admin
2) Add keys to your frontend `.env` and update the signup/login flows to use it.

## 10) Deploy Functions
```bash
firebase deploy --only functions
```

## 11) Deploy Hosting (optional)
```bash
npm install
npm run build
firebase init hosting
# choose `dist` as the public directory
firebase deploy --only hosting
```

## 12) First-time admin setup
1) Visit `/admin` in your deployed app.
2) Sign in with Email/Password (create a user in Firebase Auth if needed).
3) If no admin exists, the first sign-in can claim admin access.
4) Go to `/admin/overview` to approve instructors.

## 13) Instructor setup
1) Instructors sign up at `/instructor/signup`.
2) Admin approves them in `/admin/overview`.
3) Approved instructors can create sessions at `/admin/dashboard`.

## 14) Verify everything works
- Create a session and question.
- Join as a student on `/` with the room code.
- Open `/results?room=ROOMCODE` to verify live public results.

## Optional: Cost estimates
Cost tracking is an estimate only. You can override defaults in `functions/.env`:
- `OPENAI_INPUT_USD_PER_1M`
- `OPENAI_OUTPUT_USD_PER_1M`
- `FIRESTORE_WRITE_USD_PER_100K`

## Troubleshooting
- Missing permissions after deploy: redeploy `firestore.rules`.
- Functions deploy errors: ensure APIs are enabled and billing is on.
- Email not sending: confirm `SMTP2GO_API_KEY` and `EMAIL_FROM` are valid.
