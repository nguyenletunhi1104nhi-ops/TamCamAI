export function normalizeChatResponse(data = {}) {
  const answer = String(data.answer || data.reply || "").trim();
  const suggestedTasks = Array.isArray(data.suggestedTasks)
    ? data.suggestedTasks
    : Array.isArray(data.suggestedActions)
      ? data.suggestedActions
      : [];

  return {
    success: data.success !== false,
    conversationId: data.conversationId || "",
    intent: data.intent || "GENERAL_CONVERSATION",
    answer,
    reply: answer,
    confidenceLevel: data.confidenceLevel || data.confidence || "MEDIUM",
    requiresClarification: Boolean(data.requiresClarification),
    clarificationQuestion: data.clarificationQuestion || "",
    requiresConfirmation: Boolean(data.requiresConfirmation),
    sources: Array.isArray(data.sources) ? data.sources : [],
    suggestedTasks,
    suggestedActions: Array.isArray(data.suggestedActions)
      ? data.suggestedActions
      : [],
    memoryCandidates: Array.isArray(data.memoryCandidates)
      ? data.memoryCandidates
      : [],
    metadata: data.metadata && typeof data.metadata === "object"
      ? data.metadata
      : {},
  };
}
