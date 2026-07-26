import { useEffect, useRef } from "react";
import TimeColumn from "./TimeColumn";
import GridLines from "./GridLines";
import TaskLayer from "./TaskLayer";
import CurrentTimeLine from "./CurrentTimeLine";

function getMinutes(time) {
  const [hour, minute] = String(time || "08:00").split(":").map(Number);
  return hour * 60 + minute;
}

function CalendarBody({ tasks, currentWeek, highlightedTaskId }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 420;
    }
  }, []);

  useEffect(() => {
    if (!bodyRef.current || !highlightedTaskId) return;

    const highlightedTask = tasks.find((task) => task.id === highlightedTaskId);
    if (!highlightedTask?.startTime) return;

    bodyRef.current.scrollTop = Math.max(getMinutes(highlightedTask.startTime) - 120, 0);
  }, [highlightedTaskId, tasks, currentWeek]);

  return (
    <div ref={bodyRef} className="relative h-[520px] overflow-y-auto">
      <div className="relative min-h-[1440px] grid grid-cols-[90px_repeat(7,minmax(0,1fr))]">
        <TimeColumn />

        <div className="relative col-span-7">
          <GridLines />
          <TaskLayer
            tasks={tasks}
            currentWeek={currentWeek}
            highlightedTaskId={highlightedTaskId}
          />
          <CurrentTimeLine />
        </div>
      </div>
    </div>
  );
}

export default CalendarBody;
