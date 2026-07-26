import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, ListTodo, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";
import {
  detectScheduleConflicts,
  getEffectiveTaskDate,
  getReminderMinutes,
  getTaskDateTime,
  getUnscheduledTasks,
  isTaskActive,
  toIsoDate,
} from "../../utils/scheduleUtils";

function buildNotificationItems(tasks, currentTime) {
  const todayIso = toIsoDate(currentTime);
  const activeTasks = tasks.filter(isTaskActive);
  const todayTasks = activeTasks
    .filter((task) => getEffectiveTaskDate(task, currentTime) === todayIso)
    .sort((first, second) =>
      String(first.startTime || "23:59").localeCompare(
        String(second.startTime || "23:59")
      )
    );
  const reminderItems = activeTasks
    .filter((task) => {
      const reminderMinutes = getReminderMinutes(task.reminder);
      const taskDateTime = getTaskDateTime(task);

      if (reminderMinutes === null || !taskDateTime) return false;

      const diffMinutes =
        (taskDateTime.getTime() - currentTime.getTime()) / 60000;

      return diffMinutes >= 0 && diffMinutes <= reminderMinutes;
    })
    .sort(
      (taskA, taskB) =>
        getTaskDateTime(taskA).getTime() - getTaskDateTime(taskB).getTime()
    );
  const conflictItems = detectScheduleConflicts(activeTasks, { today: currentTime });
  const unscheduledTasks = getUnscheduledTasks(activeTasks, 4);

  return [
    ...reminderItems.map((task) => ({
      id: `reminder-${task.id}`,
      type: "reminder",
      icon: Bell,
      title: task.title || "Task sắp đến giờ",
      message: `Sắp đến giờ lúc ${task.startTime || "trong ngày"}`,
      meta: getEffectiveTaskDate(task, currentTime),
      path: `/task/${task.id}`,
    })),
    ...conflictItems.slice(0, 4).map((conflict, index) => ({
      id: `conflict-${conflict.first.id}-${conflict.second.id}-${index}`,
      type: "conflict",
      icon: AlertTriangle,
      title: "Có lịch bị trùng",
      message: `${conflict.first.title || "Task 1"} trùng với ${
        conflict.second.title || "Task 2"
      }`,
      meta: `${conflict.first.effectiveDate} • ${
        conflict.first.startTime || "--:--"
      }`,
      path: "/calendar",
    })),
    ...unscheduledTasks.map((task) => ({
      id: `unscheduled-${task.id}`,
      type: "unscheduled",
      icon: ListTodo,
      title: task.title || "Task chưa có lịch",
      message: "Chưa có ngày/giờ, cần xếp lịch để không bị bỏ sót.",
      meta: task.priority || "Chưa xếp lịch",
      path: `/task/${task.id}`,
    })),
    ...(todayTasks.length > 0
      ? [
          {
            id: "today-summary",
            type: "summary",
            icon: CalendarClock,
            title: `Hôm nay có ${todayTasks.length} việc`,
            message: todayTasks
              .slice(0, 3)
              .map((task) => task.title)
              .filter(Boolean)
              .join(", "),
            meta: todayIso,
            path: "/tasks",
          },
        ]
      : []),
  ];
}
function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const [tasks, setTasks] = useState([]);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [userName, setUserName] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchUserProfile() {
      if (!auth.currentUser) return;

      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUserName(
            userData.fullName ||
              userData.name ||
              auth.currentUser.displayName ||
              "Bạn"
          );
          return;
        }

        setUserName(auth.currentUser.displayName || "Bạn");
      } catch (error) {
        console.error("Get header user error:", error);
        setUserName(auth.currentUser?.displayName || "Bạn");
      }
    }

    fetchUserProfile();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const tasksQuery = query(
      collection(db, "tasks"),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setTasks(
          snapshot.docs.map((taskDocument) => ({
            id: taskDocument.id,
            ...taskDocument.data(),
          }))
        );
      },
      (error) => {
        console.error("Header notification error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  const pageTitleMap = {
    "/": "Dashboard",
    "/dashboard": "Dashboard",
    "/tasks": "Tasks",
    "/calendar": "Calendar",
    "/upload": "Upload Document",
    "/chat": "AI Chat",
    "/analytics": "Analytics",
    "/profile": "Profile",
    "/settings": "Settings",
    "/health": "System Health",
    "/create-task": "Create Task",
  };

  const pageTitle = pageTitleMap[location.pathname] || "Dashboard";

  const notifications = useMemo(() => {
    return buildNotificationItems(tasks, currentTime);
  }, [tasks, currentTime]);

  function handleOpenNotification(path) {
    setOpenNotifications(false);
    navigate(path);
  }

  const notificationTypeClass = {
    reminder: "bg-pink-100 text-pink-500",
    conflict: "bg-red-100 text-red-500",
    unscheduled: "bg-amber-100 text-amber-600",
    summary: "bg-emerald-100 text-emerald-600",
  };

  return (
    <header className="bg-white/90 backdrop-blur border border-pink-100 rounded-[28px] px-6 py-4 shadow-sm flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <p className="text-gray-500 mt-1">
          Chào mừng trở lại, {userName || "bạn"}!
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden lg:flex w-[360px] bg-white border border-pink-100 rounded-2xl px-5 py-3.5 text-gray-400 items-center gap-3">
          <span className="flex-1">Tìm kiếm task, tài liệu...</span>
          <Search size={20} />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenNotifications((currentValue) => !currentValue)}
            className="relative w-13 h-13 bg-white border border-pink-100 rounded-2xl flex items-center justify-center text-gray-600 hover:text-pink-500 hover:border-pink-300 transition"
          >
            <Bell size={22} />

            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {notifications.length > 9 ? "9+" : notifications.length}
              </span>
            )}
          </button>

          {openNotifications && (
            <div className="absolute right-0 top-[68px] w-[380px] bg-white border border-pink-100 rounded-3xl shadow-xl overflow-hidden z-50">
              <div className="px-5 py-4 border-b border-pink-100">
                <h2 className="text-lg font-bold">Thông báo</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Nhắc việc, trùng lịch và task cần xếp lịch
                </p>
              </div>

              <div className="max-h-[420px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    Chưa có thông báo mới.
                  </div>
                ) : (
                  notifications.map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => handleOpenNotification(task.path)}
                      className="w-full text-left px-5 py-4 border-b border-pink-50 hover:bg-pink-50 transition"
                    >
                      <div className="flex gap-3">
                        <div
                          className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center ${
                            notificationTypeClass[task.type] ||
                            "bg-pink-100 text-pink-500"
                          }`}
                        >
                          <task.icon size={18} />
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {task.title}
                          </p>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {task.message || "Bấm để xem chi tiết."}
                          </p>
                          <p className="text-xs text-pink-500 mt-2">
                            {task.meta}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="hidden md:flex items-center gap-3 bg-white border border-pink-100 rounded-2xl px-4 py-2.5 hover:border-pink-300 transition"
        >
          <div className="w-10 h-10 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold">
            {userName ? userName.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="text-left">
            <p className="font-semibold leading-5">{userName || "Bạn"}</p>
            <p className="text-xs text-gray-500">TamCam user</p>
          </div>
        </button>
      </div>
    </header>
  );
}

export default Header;

