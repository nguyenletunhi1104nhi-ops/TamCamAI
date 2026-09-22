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
