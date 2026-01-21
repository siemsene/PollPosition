# Poll Position

A lightweight classroom polling app for live sessions with instructor-created questions and real-time responses.

## What this app does
- Instructors create sessions and questions, then display a room code or QR for students to join.
- Students submit answers live (anonymous auth) while the instructor controls the active question.
- Admins approve instructors, can remove instructor access, and see estimated costs.
- Cost estimates track OpenAI synthesis usage and Firestore writes. These are estimates only.
- Live view lets anyone open a separate results page without instructor access.

## Core workflows

### Students
1) Open the app and enter a room code (or scan the QR code).
2) Answer the active question.
3) Optionally view public results with the shared room link.

### Instructors
1) Sign up at `/instructor/signup` and accept the terms.
2) Wait for admin approval.
3) Sign in at `/admin`.
4) Create a session, add questions, and set one active.
5) Share the room code/QR with students.

### Live view (public results)
- Anyone with the room link can open `/results?room=ROOMCODE` to view results live.
- This does not require instructor access or a login.
- It mirrors the active question results only.

### Admins
1) Sign in at `/admin`.
2) If `config/admin` does not exist, the first signed-in user can claim admin access.
3) Open the admin dashboard at `/admin/overview`.
4) Approve or remove instructors, and review instructor cost estimates.

## Question types
- Multiple choice
- Numerical
- Short text
- Extended text (word cloud + synthesis)
- 100 point allocation

## Answering and results
- Students can submit one response per question and update after a short cooldown.
- Live results display:
  - MCQ and numerical: histogram
  - Short text: live feed + synthesis
  - Extended text: word cloud + synthesis
  - 100 point allocation: chart of allocations

## Setup (Firebase)
1) Create a Firebase project.
2) Enable:
   - Firestore
   - Authentication -> Email/Password
   - Authentication -> Anonymous
3) Create a Firebase Web App and copy the config into `.env` (see `.env.example`).
4) Deploy Firestore rules:
   - In Firebase Console -> Firestore -> Rules, paste `firestore.rules`
   - or via CLI: `firebase deploy --only firestore:rules`

## Instructor accounts + admin approval
1) Start the app and sign in at `/admin`.
2) The first instructor to sign in can claim admin access.
3) New instructors sign up at `/instructor/signup`.
4) Admins approve or remove instructors in `/admin/overview`.
5) Only approved instructors can create and manage sessions.

## Cost estimates (optional)
- Cost tracking is an estimate only (OpenAI usage + Firestore writes).
- Defaults are set for GPT-4o-mini pricing and Firestore writes.
- You can override with Functions environment variables:
  - `OPENAI_INPUT_USD_PER_1M` (default 0.15)
  - `OPENAI_OUTPUT_USD_PER_1M` (default 0.60)
  - `FIRESTORE_WRITE_USD_PER_100K` (default 0.18)

## OpenAI synthesis (server-side)
1) Add `OPENAI_API_KEY` for Firebase Functions.
   - For local emulators, create `functions/.env` from `functions/.env.example`.
   - For deploy, set a Functions runtime env var for `OPENAI_API_KEY`.
2) Deploy functions if you are using hosting: `firebase deploy --only functions`.

## Email notifications (optional)
- Configure these in Functions environment variables:
  - `SMTP2GO_API_KEY`
  - `EMAIL_FROM` (verified sender)
  - `ADMIN_EMAIL` (daily digest recipient)
- Daily digest is sent at 08:00 UTC if new instructor requests were submitted that day.
- Instructors receive an approval email when their status changes to approved.

## Run locally
```bash
npm install
cp .env.example .env
# edit .env
npm run dev
```

## Deploy
Typical flow:
- `npm run build`
- `firebase init hosting` (choose `dist`)
- `firebase deploy`

## URLs
- `/` student entry
- `/room` student room
- `/results` public results
- `/admin` login for instructors/admins
- `/admin/dashboard` instructor tools
- `/admin/overview` admin tools
- `/instructor/signup` instructor application
