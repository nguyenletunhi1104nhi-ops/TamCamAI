import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "../../firebase/firebase";

import TaskCard from "../../components/task/TaskCard";
import SearchBar from "../../components/task/SearchBar";
import FilterBar from "../../components/task/FilterBar";
import EmptyTask from "../../components/task/EmptyTask";

function Task() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const location = useLocation();
  const highlightedTaskId = new URLSearchParams(location.search).get("highlightTaskId");

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
          id: taskDoc.id,
          ...taskDoc.data(),
        }));

        setTasks(taskList);
        setLoading(false);
      },
      (error) => {
        console.error("Get tasks error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loading || !highlightedTaskId) return undefined;

    const timer = setTimeout(() => {
      document
        .getElementById(`task-${highlightedTaskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    return () => clearTimeout(timer);
  }, [highlightedTaskId, loading, tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    const today = new Date();
    const todayIso = toIsoDate(today);
    const weekEnd = addDays(today, 6);

    return tasks.filter((task) => {
      const taskDate = task.startDate || task.deadline || "";
      const searchable = normalizeText(
        [
          task.title,
          task.description,
          task.category,
          task.priority,
          task.status,
          ...(task.checklist || []).map((item) => item.title || item),
          ...(task.suggestedSteps || []).map((item) => item.title || item),
        ].join(" ")
      );

      if (normalizedSearch && !searchable.includes(normalizedSearch)) {
        return false;
      }

      if (activeFilter === "today") {
        return taskDate === todayIso;
      }

      if (activeFilter === "week") {
        return taskDate && taskDate >= todayIso && taskDate <= toIsoDate(weekEnd);
      }

      if (activeFilter === "active") {
        return !["completed", "done"].includes(normalizeText(task.status));
      }

      if (activeFilter === "completed") {
        return task.completed || normalizeText(task.status) === "completed";
      }

      if (activeFilter === "high") {
        return ["cao", "high"].includes(normalizeText(task.priority));
      }

      if (activeFilter === "unscheduled") {
        return !taskDate;
      }

      return true;
    });
  }, [activeFilter, searchTerm, tasks]);

  if (loading) {
    return <p className="text-gray-500">Đang tải task...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-gray-500">
            Quản lý danh sách công việc, mô tả và checklist của bạn
          </p>
        </div>

        <Link
          to="/create-task"
          className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-4 rounded-2xl font-semibold transition"
        >
          + Tạo Task
        </Link>
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} />
      <FilterBar activeFilter={activeFilter} onChange={setActiveFilter} />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>
          Hiển thị {filteredTasks.length}/{tasks.length} task
        </span>
        {(searchTerm || activeFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setActiveFilter("all");
            }}
            className="font-semibold text-pink-500 hover:text-pink-600"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <EmptyTask />
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-3xl border border-pink-100 p-10 text-center text-gray-500">
          Không tìm thấy task phù hợp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              highlighted={task.id === highlightedTaskId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export default Task;
