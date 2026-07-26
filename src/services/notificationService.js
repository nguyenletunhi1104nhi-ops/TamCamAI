export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("Trình duyệt không hỗ trợ Web Notification.");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

function canNotify() {
  return "Notification" in window && Notification.permission === "granted";
}

export function showTaskNotification(task) {
  if (!canNotify()) {
    return;
  }

  const notification = new Notification("TamCam AI - Sắp đến giờ", {
    body: `${task.title} lúc ${task.startTime || "trong ngày"}`,
    icon: "/favicon.ico",
    tag: `task-${task.id}`,
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = `/task/${task.id}`;
    notification.close();
  };
}

export function showDailyTaskSummaryNotification(tasks) {
  if (!canNotify() || tasks.length === 0) {
    return;
  }

  const firstTasks = tasks
    .slice(0, 3)
    .map((task) => `${task.startTime || "Trong ngày"} - ${task.title}`)
    .join("\n");
  const moreText =
    tasks.length > 3 ? `\nVà ${tasks.length - 3} việc khác.` : "";

  const notification = new Notification(
    `TamCam AI - Hôm nay có ${tasks.length} việc`,
    {
      body: `${firstTasks}${moreText}`,
      icon: "/favicon.ico",
      tag: "tamcam-daily-summary",
    }
  );

  notification.onclick = () => {
    window.focus();
    window.location.href = "/tasks";
    notification.close();
  };
}

export function showScheduleConflictNotification(conflicts) {
  if (!canNotify() || conflicts.length === 0) {
    return;
  }

  const firstConflict = conflicts[0];
  const notification = new Notification("TamCam AI - Có lịch bị trùng", {
    body:
      conflicts.length === 1
        ? `${firstConflict.first.title} trùng với ${firstConflict.second.title}`
        : `Có ${conflicts.length} cặp task đang trùng giờ. Bấm để xem Calendar.`,
    icon: "/favicon.ico",
    tag: "tamcam-schedule-conflicts",
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = "/calendar";
    notification.close();
  };
}

export function showUnscheduledTasksNotification(tasks) {
  if (!canNotify() || tasks.length === 0) {
    return;
  }

  const firstTasks = tasks
    .slice(0, 3)
    .map((task) => task.title)
    .join(", ");
  const moreText = tasks.length > 3 ? ` và ${tasks.length - 3} task khác` : "";

  const notification = new Notification("TamCam AI - Task chưa có lịch", {
    body: `${firstTasks}${moreText}. Bạn có thể xếp lịch để dễ theo dõi hơn.`,
    icon: "/favicon.ico",
    tag: "tamcam-unscheduled-tasks",
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = "/tasks";
    notification.close();
  };
}
