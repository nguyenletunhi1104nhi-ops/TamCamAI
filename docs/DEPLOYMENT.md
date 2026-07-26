# TamCam AI Beta Deployment

## 1. Frontend environment

Firebase Hosting only serves the React frontend. Upload, AI chat, document analysis,
and task rewrite require public HTTPS backends. Production must never call
`localhost` or `127.0.0.1` from the browser.

Copy `.env.production.example` to `.env.production` before building Firebase Hosting:

```env
VITE_API_BASE_URL=https://your-node-server-public-url.example.com
VITE_AI_SERVICE_BASE_URL=https://your-fastapi-public-url.example.com
```

`VITE_API_BASE_URL` is used for document upload through Node/Express.
`VITE_AI_SERVICE_BASE_URL` is used by AI Chat for direct chat and task-draft rewrite endpoints.

If Firebase Hosting shows a popup like `Upload dang loi vi ban web production dang goi API local`,
the production bundle was built without real backend URLs. The browser is trying to call
`http://localhost:5000` from the user's machine, which cannot work on a public website.

Before deploying Firebase Hosting, build with real public backend URLs:

```powershell
Copy-Item .env.production.example .env.production
# Edit .env.production and replace both URLs with deployed HTTPS services.
npm run build
firebase.cmd deploy --only hosting
```

Production upload must call a public HTTPS Node/Express endpoint:

Production upload must call a public HTTPS Node/Express endpoint:

```text
https://your-node-server-public-url.example.com/api/analyze-document
```

## 2. Node/Express server environment

Copy `server/.env.example` to `server/.env` or configure these variables in the hosting dashboard:

```env
PORT=5000
AI_SERVICE_URL=https://your-fastapi-public-url.example.com/analyze-document
CLIENT_ORIGINS=https://tamcam---ai.web.app
```

Use comma-separated values for multiple frontend domains:

```env
CLIENT_ORIGINS=https://tamcam---ai.web.app,http://localhost:5173,http://localhost:5175
```

Node/Express start command:

```powershell
npm install
npm start
```

## 3. FastAPI AI service environment

Copy `ai-service/.env.example` to `ai-service/.env` or configure these variables in the hosting dashboard:

```env
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
GROQ_FALLBACK_MODELS=
CLIENT_ORIGINS=https://tamcam---ai.web.app
```

FastAPI start command:

```powershell
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port $env:PORT
```

If the host does not provide `$env:PORT`, use `--port 8000`.

## 4. Minimum beta checklist

- Frontend build passes with `npm run build`.
- Node server can call FastAPI through `AI_SERVICE_URL`.
- FastAPI starts with a valid `GROQ_API_KEY`.
- Firebase rules allow each user to access only their own data.
- Upload document works with PDF, DOCX, TXT, CSV/XLSX.
- Chat can answer about the latest uploaded document.
- Creating task from chat and upload result writes to Firebase.
- Calendar shows created tasks and warns about schedule conflicts.

## 5. Firebase rules

Deploy Firestore rules before public beta:

```powershell
firebase use tamcam---ai
firebase deploy --only firestore:rules
```

See `docs/FIREBASE_RULES.md` for the full rule explanation and verification checklist.

## 6. Production health check

After deploying frontend, Node/Express, and FastAPI, open:

```text
https://your-frontend-domain.example.com/health
```

Expected result:

- Frontend: OK.
- Node / Express: OK.
- FastAPI AI Service: OK.
- AI provider: OK after pressing `Test AI`.
- Firebase Auth: OK when a user is signed in.

Health endpoints:

```text
GET https://your-node-server-public-url.example.com/api/health
GET https://your-fastapi-public-url.example.com/health
GET https://your-fastapi-public-url.example.com/health?probe=ai
```

How to read AI provider errors:

- `keyConfigured: no`: missing `GROQ_API_KEY` or active provider key in FastAPI environment.
- `errorKind: permission-denied`: usually invalid key, wrong project, disabled API, or provider 403.
- `errorKind: quota-or-rate-limit`: quota/rate limit issue, usually provider 429.
- `probe: skipped`: health loaded, but you have not pressed `Test AI` yet.

Do not run `Test AI` repeatedly during demos because it makes a real provider API call.

You can also run the same health check from terminal:

```powershell
npm run health
```

To test the active AI provider with a real API call:

```powershell
npm run health:ai
```

For production URLs, set environment variables before running:

```powershell
$env:VITE_API_BASE_URL="https://your-node-server-public-url.example.com"
$env:VITE_AI_SERVICE_BASE_URL="https://your-fastapi-public-url.example.com"
npm run health:ai
```
