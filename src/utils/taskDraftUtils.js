export function getTaskDraftChecklist(taskDraft) {
  return (Array.isArray(taskDraft?.suggestedSteps)
    ? taskDraft.suggestedSteps
    : Array.isArray(taskDraft?.checklist)
    ? taskDraft.checklist
    : []
  )
    .map((step) => String(step?.title || step || "").trim())
    .filter(Boolean);
}

export function getTaskDraftHealth(taskDraft) {
  const title = String(taskDraft?.title || "").trim();
  const checklist = getTaskDraftChecklist(taskDraft);
  const warnings = [];

  if (!title) {
    warnings.push("Thiếu tên task");
  } else if (title.length > 72 || title.split(/\s+/).filter(Boolean).length > 12) {
    warnings.push("Tên task còn dài, nên rút gọn");
  }

  if (!String(taskDraft?.description || "").trim()) {
    warnings.push("Thiếu mô tả/bối cảnh");
  }

  if (checklist.length === 0) {
    warnings.push("Chưa có checklist");
  }

  if (!taskDraft?.deadline && !taskDraft?.startDate) {
    warnings.push("Chưa có ngày, có thể để Inbox");
  }

  return {
    canCreate: Boolean(title) && title.length <= 90,
    checklist,
    warnings,
  };
}

export function formatTaskSchedule(task, formatDate) {
  const date = task?.startDate || task?.deadline;
  const dateText = date
    ? typeof formatDate === "function"
      ? formatDate(date)
      : date
    : "chưa có ngày";
  const timeText = task?.startTime ? ` lúc ${task.startTime}` : "";
  const reminderText =
    task?.reminder && task.reminder !== "Không nhắc"
      ? `, nhắc ${String(task.reminder).toLowerCase()}`
      : "";

  return `${dateText}${timeText}${reminderText}`;
}
