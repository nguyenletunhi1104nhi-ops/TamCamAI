# TamCam AI V1.1 Spec

## Product Direction

TamCam AI is a smart assistant for study, office work, personal scheduling, uploaded document analysis, task planning, reminders and workflow guidance.

The assistant should feel closer to ChatGPT/Gemini than a rule-based bot:

- Understand natural Vietnamese, short follow-up questions and imperfect wording.
- Keep recent chat context so words like "nó", "file này", "phần đó", "chia tiếp" refer to the latest relevant task/document.
- Avoid repeated hardcoded fallback replies.
- Prefer Gemini/AI service for open-ended chat.
- Use local analyzer only as fallback or for deterministic app actions.

## Chat Capability

Chat must support all of these:

- General Q&A.
- Questions about uploaded files.
- Natural-language task creation.
- Checking current tasks, calendar and deadlines.
- Workflow suggestions for study/work/personal planning.
- Guidance for app areas: Dashboard, Tasks, Calendar, Upload Document, AI Chat, Analytics, Profile and Settings.

## Supported Files in V1

Supported first:

- PDF
- DOCX
- TXT
- Excel/XLSX
- CSV

OCR for PNG/JPG is out of V1.1 and can be planned later.

## File Answer Format

When users ask about a file or data, TamCam AI should adapt to the question but always be able to provide:

1. What this file/data is.
2. What it is about.
3. Main content or data structure.
4. Important details, numbers, trends, deadlines or anomalies.
5. What the user should do next.
6. Draft tasks/workflow if useful.
7. Confidence score.

If the file contains numeric/tabular data, TamCam AI should analyze:

- Totals.
- Categories/groups.
- Highest/lowest values.
- Trends.
- Abnormal values.
- Suggested charts or dashboard views.

## Action Mode

TamCam AI must distinguish between:

- Answer mode: only answer/explain.
- Draft mode: suggest tasks/checklists/workflow without saving.
- Action mode: create/update/delete/complete tasks only after clear user intent or confirmation.

If date/time is missing:

- Suggest a reasonable schedule.
- Ask whether the user wants to keep or adjust it.

## Trust And Privacy

Required:

- Show confidence for file/data analysis.
- Confidence is controlled as `HIGH`, `MEDIUM`, or `LOW`, then displayed to users as `Cao`, `Trung bình`, or `Thấp`.
- Add a UI path to clear chat history and uploaded-file cache.
- Keep Firebase support.
- Fall back to localStorage when Firestore permission fails.
- Avoid saying data was saved if Firebase/local save failed.

## Upcoming UI Requirements

Next build slices should add:

- "Create task from this suggestion" action under assistant replies.
- "Add to Calendar" action for schedule suggestions.
- Dashboard section: "AI understands about you".
- Numeric document insights and chart suggestions for Excel/CSV.
- Better responsive chat bubble wrapping.

## Structured AI Response

Gemini should return structured JSON for chat responses:

```json
{
  "intent": "DOCUMENT_ANALYSIS",
  "answer": "Natural Vietnamese answer for the user.",
  "confidenceLevel": "HIGH",
  "requiresConfirmation": false,
  "suggestedTasks": []
}
```

`suggestedTasks` are drafts only. The frontend shows a confirmation button and creates the real task only after the user clicks it.
