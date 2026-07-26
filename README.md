# TamCam AI

TamCam AI is an AI study and work companion for managing tasks, deadlines, reminders, uploaded documents, and personal productivity workflows.

The app helps users upload documents, understand important content, extract actionable tasks, create schedules, chat with an AI assistant, and review productivity through a dashboard.

## Main Features

- AI Chat for task planning, document Q&A, workflow suggestions, and reminders.
- Document upload and analysis for PDF, DOCX, TXT, XLSX, CSV, and JSON.
- Task management with priorities, deadlines, reminders, recurring reminders, and completion status.
- Calendar view with schedule awareness and conflict warnings.
- Analytics dashboard for task progress and productivity insights.
- Firebase Auth and Firestore integration.
- Node/Express upload backend with FastAPI AI service.
- Groq/OpenAI-compatible AI provider support with local fallback logic.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Recharts, Lucide React.
- Backend: Node.js, Express, Multer, Mammoth, pdf-parse, XLSX.
- AI Service: FastAPI, Python, Groq `openai/gpt-oss-20b`, Gemini fallback support.
- Database/Auth: Firebase Authentication and Firestore.
- Hosting: Firebase Hosting for frontend. Backend services must be deployed separately.

## Project Structure

```text
TamCamAI-Web/
├── src/                 React frontend
├── server/              Node/Express upload and API server
├── ai-service/          FastAPI AI service
├── docs/                Deployment and project documentation
├── public/              Static frontend assets
├── firebase.json        Firebase Hosting and Firestore config
└── firestore.rules      Firestore security rules
```

## Local Development

Install frontend dependencies:

```powershell
npm install
```

Run the React frontend:

```powershell
npm run dev
```

Run the Node/Express server:

```powershell
cd server
npm install
npm start
```

Run the FastAPI AI service:

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

## Environment Variables

Frontend production build:

```env
VITE_API_BASE_URL=https://your-node-server-public-url.example.com
VITE_AI_SERVICE_BASE_URL=https://your-fastapi-public-url.example.com
```

Node/Express:

```env
PORT=5000
AI_SERVICE_URL=https://your-fastapi-public-url.example.com/analyze-document
CLIENT_ORIGINS=https://tamcam---ai.web.app,http://localhost:5173
```

FastAPI AI service:

```env
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
GROQ_FALLBACK_MODELS=
CLIENT_ORIGINS=https://tamcam---ai.web.app,http://localhost:5173
```

## Health Checks

Check local services:

```powershell
npm run health
```

Check active AI provider:

```powershell
npm run health:ai
```

Health endpoints:

```text
GET /api/health                 Node/Express
GET /health                     FastAPI
GET /health?probe=ai            FastAPI AI provider probe
```

## Build

```powershell
npm run build
```

The production frontend output is generated in `dist/`.

## Firebase Hosting Deploy

Firebase Hosting only deploys the frontend. The Node/Express server and FastAPI AI service must be deployed to public HTTPS URLs first.

After backend URLs are ready, create `.env.production`:

```env
VITE_API_BASE_URL=https://your-node-server-public-url.example.com
VITE_AI_SERVICE_BASE_URL=https://your-fastapi-public-url.example.com
```

Then build and deploy:

```powershell
npm run build
firebase.cmd deploy --only hosting
```

If upload fails on the public website and the popup mentions `localhost:5000`, the frontend was built without real production backend URLs.

## Documentation

- Deployment guide: `docs/DEPLOYMENT.md`
- Firebase rules guide: `docs/FIREBASE_RULES.md`
- Product spec: `docs/tamcam-ai-v1-spec.md`
- AI/data analysis adoption notes: `docs/awesome-llm-apps-adoption.md`

## Notes

Do not commit `.env`, `.env.production`, API keys, Firebase private credentials, or other secrets.

Use `.env.example`, `.env.production.example`, `server/.env.example`, and `ai-service/.env.example` as templates only.
