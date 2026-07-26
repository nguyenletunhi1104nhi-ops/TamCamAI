import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "../../firebase/firebase";

import CalendarHeader from "./CalendarHeader";
import CalendarHeaderRow from "./CalendarHeaderRow";
import CalendarBody from "./CalendarBody";
import RightSidebar from "./RightSidebar";

function getWeekStart(date) {
  const nextDate = new Date(date);
  const day = nextDate.getDay();
  nextDate.setDate(nextDate.getDate() - day);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function WeekView({ highlightedTaskId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));

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
        const taskList = snapshot.docs.map((taskDoc) => ({
          ...taskDoc.data(),
          id: taskDoc.id,
        }));

        setTasks(taskList);
        setLoading(false);
      },
      (error) => {
        console.error("Calendar tasks error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!highlightedTaskId || tasks.length === 0) return;

    const highlightedTask = tasks.find((task) => task.id === highlightedTaskId);
    if (!highlightedTask?.startDate) return;

    setCurrentWeek(getWeekStart(highlightedTask.startDate));
  }, [highlightedTaskId, tasks]);

  const goPrevWeek = () => {
    setCurrentWeek((previousWeek) => {
      const nextWeek = new Date(previousWeek);
      nextWeek.setDate(nextWeek.getDate() - 7);
      return nextWeek;
    });
  };

  const goNextWeek = () => {
    setCurrentWeek((previousWeek) => {
      const nextWeek = new Date(previousWeek);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    });
  };

  const goToday = () => {
    setCurrentWeek(getWeekStart(new Date()));
  };

  if (loading) {
    return <p className="text-gray-500">Đang tải lịch...</p>;
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 bg-white rounded-[28px] border border-pink-100 overflow-hidden">
        <CalendarHeader
          currentWeek={currentWeek}
          onPrevWeek={goPrevWeek}
          onNextWeek={goNextWeek}
          onToday={goToday}
        />

        <CalendarHeaderRow currentWeek={currentWeek} />

        <CalendarBody
          tasks={tasks}
          currentWeek={currentWeek}
          highlightedTaskId={highlightedTaskId}
        />
      </div>

      <RightSidebar tasks={tasks} currentWeek={currentWeek} />
    </div>
  );
}

export default WeekView;
