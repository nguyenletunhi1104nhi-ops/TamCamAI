export async function sendChatMessage({
  aiServiceBaseUrl,
  message,
  conversationId,
  userId,
  tasks,
  documents,
  history,
  relevantContext,
  feedbackMemory,
  qLearningPolicy,
  conversationSummary,
  userProfile,
}) {
  const response = await fetch(`${aiServiceBaseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      conversationId,
      userId,
      tasks,
      documents,
      history,
      relevantContext,
      feedbackMemory,
      qLearningPolicy,
      conversationSummary,
      userProfile,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const chatError = new Error(
      data.message ||
        data.error ||
        data.answer ||
        data.reply ||
        `HTTP error: ${response.status}`
    );
    chatError.errorKind = data.errorKind || data.aiErrorKind || "";
    chatError.status = response.status;
    chatError.details = data.details || "";
    throw chatError;
  }

  return data;
}
