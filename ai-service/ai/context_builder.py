from .text import compact_text, normalize_text


def build_context(payload: dict) -> dict:
    message = payload.get("message") or ""
    normalized_message = normalize_text(message)
    history = payload.get("history") or []
    tasks = payload.get("tasks") or []
    documents = payload.get("documents") or []
    summary = payload.get("conversationSummary") or {}

    relevant_tasks = [
        task
        for task in tasks
        if not task.get("completed") and _is_relevant_task(normalized_message, task)
    ][:20]

    relevant_documents = [
        {
            "fileName": doc.get("fileName") or doc.get("file") or "Tai lieu",
            "preview": compact_text(
                doc.get("textPreview") or doc.get("text") or doc.get("summary") or "",
                1000,
            ),
            "analysisSource": doc.get("analysisSource") or doc.get("source") or "",
        }
        for doc in documents[:5]
    ]

    return {
        "message": message,
        "normalizedMessage": normalized_message,
        "conversationId": payload.get("conversationId") or "",
        "userId": payload.get("userId") or "",
        "recentMessages": history[-8:],
        "relevantTasks": relevant_tasks,
        "relevantDocuments": relevant_documents,
        "conversationSummary": summary,
        "feedbackMemory": payload.get("feedbackMemory") or "",
        "qLearningPolicy": payload.get("qLearningPolicy") or "",
        "userProfile": payload.get("userProfile") or {},
    }


def _is_relevant_task(normalized_message: str, task: dict) -> bool:
    title = normalize_text(task.get("title") or "")
    category = normalize_text(task.get("category") or task.get("type") or "")
    if "ielts" in normalized_message:
        return "ielts" in title or "study" in category or "hoc" in title
    return True

