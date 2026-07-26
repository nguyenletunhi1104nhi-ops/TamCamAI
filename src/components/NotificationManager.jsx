import { useEffect, useRef } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { auth, db } from "../firebase/firebase";
import {
  requestNotificationPermission,
  showDailyTaskSummaryNotification,
  showScheduleConflictNotification,
  showTaskNotification,
  showUnscheduledTasksNotification,
} from "../services/notificationService";
import {
  detectScheduleConflicts,
  getEffectiveTaskDate,
  getReminderMinutes,
  getTaskDateTime,
  getUnscheduledTasks,
  isTaskActive,
  toIsoDate,
} from "../utils/scheduleUtils";

function rememberNotification(notifiedSet, key) {
  notifiedSet.add(key);
  localStorage.setItem(
    "tamcam-notified-tasks",
    JSON.stringify(Array.from(notifiedSet))
  );
}

function NotificationManager() {
  const tasksRef = useRef([]);
  const notifiedTasksRef = useRef(
    new Set(JSON.parse(localStorage.getItem("tamcam-notified-tasks") || "[]"))
  );

  useEffect(() => {
    let unsubscribe = () => {};
    let timer = null;

    async function startNotificationWatcher() {
      const allowed = await requestNotificationPermission();

      if (!allowed || !auth.currentUser) {
        return;
      }

      const tasksQuery = query(
        collection(db, "tasks"),
        where("userId", "==", auth.currentUser.uid)
      );

      unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        const today = new Date();
        const todayIso = toIsoDate(today);

        tasksRef.current = snapshot.docs.map((taskDoc) => ({
          ...taskDoc.data(),
          id: taskDoc.id,
        }));

        const todayTasks = tasksRef.current
          .filter(isTaskActive)
          .filter((task) => getEffectiveTaskDate(task, today) === todayIso)
          .sort((first, second) =>
            String(first.startTime || "23:59").localeCompare(
              String(second.startTime || "23:59")
            )
          );

        const summaryKey = ["daily-summary", auth.currentUser.uid, todayIso].join("-");

        if (todayTasks.length > 0 && !notifiedTasksRef.current.has(summaryKey)) {
          showDailyTaskSummaryNotification(todayTasks);
          rememberNotification(notifiedTasksRef.current, summaryKey);
        }

        const conflicts = detectScheduleConflicts(tasksRef.current, { today });
        const conflictKey = ["daily-conflicts", auth.currentUser.uid, todayIso].join("-");

        if (conflicts.length > 0 && !notifiedTasksRef.current.has(conflictKey)) {
          showScheduleConflictNotification(conflicts);
          rememberNotification(notifiedTasksRef.current, conflictKey);
        }

        const unscheduledTasks = getUnscheduledTasks(tasksRef.current);
        const unscheduledKey = ["daily-unscheduled", auth.currentUser.uid, todayIso].join("-");

        if (
          unscheduledTasks.length > 0 &&
          !notifiedTasksRef.current.has(unscheduledKey)
        ) {
          showUnscheduledTasksNotification(unscheduledTasks);
          rememberNotification(notifiedTasksRef.current, unscheduledKey);
        }
      });

      timer = setInterval(() => {
        const now = new Date();

        tasksRef.current.forEach((task) => {
          if (!isTaskActive(task) || !task.startTime) {
            return;
          }

          const reminderMinutes = getReminderMinutes(task.reminder);

          if (reminderMinutes === null) {
            return;
          }

          const taskDateTime = getTaskDateTime(task, now);
          if (!taskDateTime) {
            return;
          }

          const diff = (taskDateTime.getTime() - now.getTime()) / 60000;
          const notificationKey = [
            task.id,
            getEffectiveTaskDate(task, now),
            task.startTime,
            task.reminder,
          ].join("-");

          if (
            diff >= 0 &&
            diff <= reminderMinutes &&
            !notifiedTasksRef.current.has(notificationKey)
          ) {
            showTaskNotification(task);
            rememberNotification(notifiedTasksRef.current, notificationKey);
          }
        });
      }, 5000);
    }

    startNotificationWatcher();

    return () => {
      unsubscribe();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, []);

  return null;
}

export default NotificationManager;
