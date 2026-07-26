import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, Clock, Sparkles } from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import MiniCalendar from "./MiniCalendar";
import PriorityCard from "./PriorityCard";
import ProgressCard from "./ProgressCard";
import AISuggestionCard from "./AISuggestionCard";
import { db } from "../../firebase/firebase";
import {
  detectScheduleConflicts,
  findFreeSlot,
  getTaskRange,
  isTaskActive,
  toIsoDate,
} from "../../utils/scheduleUtils";

const DAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getWeekDates(currentWeek) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentWeek);
    date.setDate(date.getDate() + index);
    return toIsoDate(date);
  });
}

function getWeekTasks(tasks, weekDates) {
  return tasks
    .filter(isTaskActive)
    .filter((task) => weekDates.includes(task.startDate))
    .map((task) => ({
      ...task,
      taskDate: task.startDate,
      range: getTaskRange(task),
    }))
    .filter((task) => task.range);
}

function buildScheduleSuggestion(tasks, currentWeek) {
  if (!currentWeek) {
    return null;
  }

  const weekDates = getWeekDates(currentWeek);
  const weekTasks = getWeekTasks(tasks, weekDates);
  const conflicts = detectScheduleConflicts(weekTasks, {
    includeInactive: true,
    dateGetter: (task) => task.startDate || "",
  });

  if (conflicts.length === 0) {
    return {
      type: "healthy",
      title: "Lịch tuần này ổn",
      message: "Chưa thấy task nào bị trùng giờ trong tuần đang xem.",
      conflicts,
      weekTasks,
    };
  }

  const firstConflict = conflicts[0];
  const taskToMove = firstConflict.second;
  const slot = findFreeSlot(
    weekTasks.filter((task) => task.id !== taskToMove.id),
    weekDates,
    taskToMove.range.duration,
    {
      dateGetter: (task) => task.startDate || "",
    }
  );

  return {
    type: "conflict",
    title: `Có ${conflicts.length} lịch bị trùng`,
    message: `${firstConflict.first.title || "Task 1"} đang trùng với ${
      firstConflict.second.title || "Task 2"
    }.`,
    conflicts,
    weekTasks,
    taskToMove,
    slot,
  };
}

function formatDateLabel(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return `${DAY_NAMES[date.getDay()]} ${String(day).padStart(2, "0")}/${String(
    month
  ).padStart(2, "0")}`;
}

function RightSidebar({ tasks = [], currentWeek }) {
  const [applying, setApplying] = useState(false);
  const suggestion = useMemo(
    () => buildScheduleSuggestion(tasks, currentWeek),
    [tasks, currentWeek]
  );

  async function applySuggestion() {
    if (!suggestion?.taskToMove || !suggestion?.slot) return;

    setApplying(true);

    try {
      await updateDoc(doc(db, "tasks", suggestion.taskToMove.id), {
        startDate: suggestion.slot.date,
        deadline: suggestion.slot.date,
        startTime: suggestion.slot.start,
        endTime: suggestion.slot.end,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Apply calendar suggestion error:", error);
      alert("Chưa áp dụng được gợi ý. Bạn thử lại sau nhé.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <aside className="w-[280px] shrink-0 space-y-4">
      <MiniCalendar />

      <div className="bg-white rounded-3xl border border-pink-100 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-500 flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">AI gợi ý lịch</h2>
            <p className="text-xs text-gray-500">Dựa trên tuần đang xem</p>
          </div>
        </div>

        {!suggestion ? (
          <p className="mt-4 text-sm text-gray-600">
            Chưa có dữ liệu lịch để phân tích.
          </p>
        ) : suggestion.type === "healthy" ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
            <div className="flex gap-3">
              <CalendarCheck className="text-emerald-500 shrink-0" size={20} />
              <div>
                <p className="font-semibold text-gray-900">{suggestion.title}</p>
                <p className="text-sm text-gray-600 mt-1">{suggestion.message}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="text-red-500 shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-gray-900">{suggestion.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{suggestion.message}</p>
                </div>
              </div>
            </div>

            {suggestion.slot ? (
              <div className="rounded-2xl bg-pink-50 border border-pink-100 p-4">
                <div className="flex gap-3">
                  <Clock className="text-pink-500 shrink-0" size={20} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      Dời "{suggestion.taskToMove.title}"
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Sang {formatDateLabel(suggestion.slot.date)},{" "}
                      {suggestion.slot.start} - {suggestion.slot.end}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={applySuggestion}
                  disabled={applying}
                  className="mt-4 w-full bg-pink-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {applying ? "Đang áp dụng..." : "Áp dụng gợi ý"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Tuần này chưa còn khung trống đủ dài. Bạn nên dời bớt task sang
                tuần khác.
              </p>
            )}
          </div>
        )}
      </div>

      <PriorityCard />
      <ProgressCard />
      <AISuggestionCard />
    </aside>
  );
}

export default RightSidebar;
