export const WORK_START_MINUTES = 8 * 60;
export const WORK_END_MINUTES = 21 * 60;

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/\u00C4\u2018/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTaskActive(task) {
  const status = normalizeSearchText(task?.status);
  return task?.completed !== true && status !== "completed" && status !== "hoan thanh";
}

export function getEffectiveTaskDate(task, today = new Date()) {
  const dateValue = task?.startDate || task?.deadline;

  if (!dateValue) return "";

  if (task?.recurrence === "yearly") {
    const [, month, day] = String(dateValue).split("-");
    if (!month || !day) return "";
    return `${today.getFullYear()}-${month}-${day}`;
  }

  return dateValue;
}

export function getTaskMinutes(time) {
  const [hour, minute] = String(time || "").split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return hour * 60 + minute;
}

export function toTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addMinutesToTime(time, minutesToAdd = 60) {
  const start = getTaskMinutes(time);
  if (start === null) return "";
  return toTime(start + minutesToAdd);
}

export function addDaysToIsoDate(dateString, days) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return "";

  date.setDate(date.getDate() + days);

  return toIsoDate(date);
}

export function getTaskRange(task, fallbackDuration = 60) {
  const start = getTaskMinutes(task?.startTime);

  if (start === null) return null;

  const end = getTaskMinutes(task?.endTime) ?? start + fallbackDuration;

  return {
    start,
    end: Math.max(end, start + 15),
    duration: Math.max(end - start, 30),
  };
}

export function getTaskDate(task, today = new Date()) {
  return getEffectiveTaskDate(task, today);
}

export function getTaskDateTime(task, today = new Date()) {
  const taskDate = getEffectiveTaskDate(task, today);

  if (!taskDate || !task?.startTime) return null;

  const [year, month, day] = taskDate.split("-").map(Number);
  const [hour, minute] = task.startTime.split(":").map(Number);
  const taskDateTime = new Date(year, month - 1, day, hour, minute, 0, 0);

  return Number.isNaN(taskDateTime.getTime()) ? null : taskDateTime;
}

export function getReminderMinutes(reminder) {
  const text = normalizeSearchText(reminder);

  if (text.includes("khong nhac")) return null;

  if (text.includes("10") && text.includes("phut")) return 10;
  if (text.includes("30") && text.includes("phut")) return 30;
  if (text.includes("1") && text.includes("gio")) return 60;
  if (text.includes("1") && text.includes("ngay")) return 1440;
  if (text.includes("dung ngay")) return 0;

  return null;
}

export function withScheduleMeta(tasks, options = {}) {
  const {
    today = new Date(),
    includeInactive = false,
    getId = (task, index) => task?.id || task?.tempId || `task-${index}`,
    dateGetter = (task) => getTaskDate(task, today),
  } = options;

  return tasks
    .filter((task) => includeInactive || isTaskActive(task))
    .map((task, index) => ({
      ...task,
      tempId: task.tempId || task.__selectionKey || getId(task, index),
      effectiveDate: dateGetter(task),
      taskDate: dateGetter(task),
      range: getTaskRange(task),
    }))
    .filter((task) => task.taskDate && task.range);
}

export function detectScheduleConflicts(tasks, options = {}) {
  const scheduledTasks = withScheduleMeta(tasks, options);
  const conflicts = [];

  for (let firstIndex = 0; firstIndex < scheduledTasks.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < scheduledTasks.length;
      secondIndex += 1
    ) {
      const first = scheduledTasks[firstIndex];
      const second = scheduledTasks[secondIndex];

      if (first.taskDate !== second.taskDate) continue;

      if (first.range.start < second.range.end && second.range.start < first.range.end) {
        conflicts.push({ first, second });
      }
    }
  }

  return conflicts;
}

export function detectNewTaskConflicts(newTasks, existingTasks, options = {}) {
  const { today = new Date(), getNewTaskId } = options;
  const existingScheduledTasks = withScheduleMeta(existingTasks, { today });
  const newScheduledTasks = withScheduleMeta(newTasks, {
    today,
    includeInactive: true,
    getId: getNewTaskId,
    dateGetter: (task) => task.startDate || task.deadline || "",
  });
  const conflicts = [];

  newScheduledTasks.forEach((newTask, index) => {
    existingScheduledTasks.forEach((existingTask) => {
      if (newTask.taskDate !== existingTask.taskDate) return;

      if (
        newTask.range.start < existingTask.range.end &&
        existingTask.range.start < newTask.range.end
      ) {
        conflicts.push({ type: "existing", first: newTask, second: existingTask });
      }
    });

    newScheduledTasks.slice(index + 1).forEach((otherTask) => {
      if (newTask.taskDate !== otherTask.taskDate) return;

      if (
        newTask.range.start < otherTask.range.end &&
        otherTask.range.start < newTask.range.end
      ) {
        conflicts.push({ type: "draft", first: newTask, second: otherTask });
      }
    });
  });

  return conflicts;
}

export function findFreeSlot(tasks, dates, durationMinutes, options = {}) {
  const {
    workStart = WORK_START_MINUTES,
    workEnd = WORK_END_MINUTES,
    today = new Date(),
    excludeTaskId = "",
    dateGetter = (task) => task.startDate || task.deadline || getEffectiveTaskDate(task, today),
  } = options;
  const scheduledTasks = withScheduleMeta(tasks, {
    today,
    includeInactive: true,
    dateGetter,
  }).filter((task) => (task.id || task.tempId) !== excludeTaskId);

  for (const date of dates) {
    const busyRanges = scheduledTasks
      .filter((task) => task.taskDate === date)
      .map((task) => task.range)
      .sort((first, second) => first.start - second.start);
    let cursor = workStart;

    for (const range of busyRanges) {
      if (range.start - cursor >= durationMinutes) {
        return {
          date,
          start: toTime(cursor),
          end: toTime(cursor + durationMinutes),
          startTime: toTime(cursor),
          endTime: toTime(cursor + durationMinutes),
        };
      }

      cursor = Math.max(cursor, range.end);
    }

    if (workEnd - cursor >= durationMinutes) {
      return {
        date,
        start: toTime(cursor),
        end: toTime(cursor + durationMinutes),
        startTime: toTime(cursor),
        endTime: toTime(cursor + durationMinutes),
      };
    }
  }

  return null;
}

export function findFreeSlotFromDate(taskToMove, tasks, options = {}) {
  const {
    daysToSearch = 7,
    dateGetter = (task) => task.startDate || task.deadline || "",
  } = options;
  const sourceDate = dateGetter(taskToMove);
  const range = getTaskRange(taskToMove);

  if (!sourceDate || !range) return null;

  const dates = Array.from({ length: daysToSearch + 1 }, (_, index) =>
    addDaysToIsoDate(sourceDate, index)
  ).filter(Boolean);

  return findFreeSlot(tasks, dates, range.duration, {
    ...options,
    excludeTaskId: taskToMove.tempId || taskToMove.id || taskToMove.__selectionKey || "",
    dateGetter,
  });
}

export function getUnscheduledTasks(tasks, limit = 8) {
  return tasks
    .filter(isTaskActive)
    .filter((task) => !task.startDate && !task.deadline)
    .slice(0, limit);
}
