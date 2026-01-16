# Poll Position

A lightweight classroom polling app.

## Features
- Instructor login (fixed email + password, e.g. `Sesame`) using Firebase Auth (Email/Password)
- Instructor creates a session/room and questions (MCQ, numeric, short text, long text)
- Instructor can set an active question
- Students join via QR code (or room code) and submit answers
- Instructor view shows:
  - Histogram for MCQ and numeric
  - Live text feed for short text
  - Word cloud for long text

## Setup (Firebase)
1) Create a Firebase project
2) Enable:
   - Firestore
   - Authentication → **Email/Password** (for instructor)
   - Authentication → **Anonymous** (for students)
3) Create a Web App in Firebase and copy the web config into `.env` (see `.env.example`)
4) Deploy Firestore rules:
   - In Firebase console: Firestore → Rules → paste `firestore.rules`
   - or via `firebase deploy` if you use Firebase CLI

## Instructor account
1) In Firebase console: Authentication → Users → Add user
   - email: whatever you put in `VITE_INSTRUCTOR_EMAIL`
   - password: `Sesame` (or any password you like)
2) Start the app and sign in at `/admin`
3) Click "Bootstrap instructor access" to write your instructor UID into `/config/admin`
   - This enables security rules that only allow your UID to create/update sessions/questions.

## OpenAI synthesis (server-side)
1) Add `OPENAI_API_KEY` for Firebase Functions
   - For local emulators, create `functions/.env` from `functions/.env.example`
   - For deploy, set a Functions runtime env var for `OPENAI_API_KEY`
2) Deploy functions if you are using hosting: `firebase deploy --only functions`

## Run locally
```bash
npm install
cp .env.example .env
# edit .env
npm run dev
```

## Deploy
You can deploy with Firebase Hosting (optional). Typical flow:
- `npm run build`
- `firebase init hosting` (choose `dist`)
- `firebase deploy`

