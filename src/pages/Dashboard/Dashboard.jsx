import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";

import StatsCard from "../../components/dashboard/StatsCard";
import TaskCard from "../../components/dashboard/TaskCard";
import ScheduleCard from "../../components/dashboard/ScheduleCard";
import AISuggestionCard from "../../components/dashboard/AISuggestionCard";
import WeeklyProgress from "../../components/dashboard/WeeklyProgress";

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isCompleted(task) {
  return (
    task.completed === true ||
    task.status === "Completed" ||
    task.status === "Hoàn thành"
  );
}

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return undefined;
    }

    const tasksQuery = query(
      collection(db, "tasks"),
      where("userId", "==", auth.currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setTasks(
          snapshot.docs.map((taskDocument) => ({
            ...taskDocument.data(),
            id: taskDocument.id,
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Dashboard tasks error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const dashboardData = useMemo(() => {
    const today = getLocalDateString();
    const completedTasks = tasks.filter(isCompleted);
    const pendingTasks = tasks.filter((task) => !isCompleted(task));
    const todayTasks = pendingTasks.filter(
      (task) => task.deadline === today || task.startDate === today
    );
    const overdueTasks = pendingTasks.filter(
      (task) => task.deadline && task.deadline < today
    );
    const unscheduledTasks = pendingTasks.filter(
      (task) => !task.deadline && !task.startDate
    );
    const upcomingTasks = [...pendingTasks]
      .filter((task) => task.deadline || task.startDate)
      .sort((taskA, taskB) =>
        String(taskA.deadline || taskA.startDate).localeCompare(
          String(taskB.deadline || taskB.startDate)
        )
      )
      .slice(0, 4);

    return {
      total: tasks.length,
      pending: pendingTasks.length,
      completed: completedTasks.length,
      today: todayTasks.length,
      overdue: overdueTasks.length,
      unscheduled: unscheduledTasks.length,
      upcomingTasks,
    };
  }, [tasks]);

  if (loading) {
    return (
      <div className="bg-white border border-pink-100 rounded-3xl p-8 text-gray-500">
        Đang tải Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatsCard
          title="Tổng task"
          value={dashboardData.total}
          note={`${dashboardData.pending} task đang cần xử lý`}
          icon="📋"
          tone="pink"
        />

        <StatsCard
          title="Đang chờ"
          value={dashboardData.pending}
          note={
            dashboardData.overdue > 0
              ? `${dashboardData.overdue} task đã quá hạn`
              : "Cần hoàn thành sớm"
          }
          icon="⏰"
          tone="orange"
        />

        <StatsCard
          title="Hoàn thành"
          value={dashboardData.completed}
          note="task đã xử lý xong"
          icon="✅"
          tone="green"
        />

        <StatsCard
          title="Hạn hôm nay"
          value={dashboardData.today}
          note={
            dashboardData.unscheduled > 0
              ? `${dashboardData.unscheduled} task chưa có lịch`
              : "Đừng để lỡ hạn nhé"
          }
          icon="🗓️"
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-bold">Task sắp tới</h2>

              <Link to="/tasks" className="text-pink-500 font-semibold">
                Xem tất cả
              </Link>
            </div>

            {dashboardData.upcomingTasks.length === 0 ? (
              <div className="border border-dashed border-pink-200 bg-pink-50 rounded-2xl p-6 text-gray-500">
                Hiện chưa có nhiệm vụ sắp tới.
              </div>
            ) : (
              <div className="space-y-4">
                {dashboardData.upcomingTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    id={task.id}
                    title={task.title}
                    subject={task.category}
                    deadline={task.deadline || task.startDate}
                    priority={task.priority}
                    status={task.status}
                    progress={task.completed ? 100 : task.progress || 0}
                  />
                ))}
              </div>
            )}
          </div>

          <WeeklyProgress tasks={tasks} />
        </div>

        <div className="space-y-6">
          <ScheduleCard tasks={tasks} />
          <AISuggestionCard tasks={tasks} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
