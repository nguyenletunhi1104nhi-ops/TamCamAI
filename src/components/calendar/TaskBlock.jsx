import { Link } from "react-router-dom";

function getMinutes(time) {
  const [hour, minute] = String(time || "08:00").split(":").map(Number);
  return hour * 60 + minute;
}

function getColor(event) {
  if (event.status === "Completed" || event.status === "Hoàn thành") {
    return {
      bg: "#ECFDF5",
      border: "#22C55E",
      text: "#16A34A",
    };
  }

  if (event.priority === "Cao" || event.priority === "High") {
    return {
      bg: "#FFE8EE",
      border: "#F43F5E",
      text: "#E11D48",
    };
  }

  if (event.priority === "Trung bình" || event.priority === "Medium") {
    return {
      bg: "#FFF7ED",
      border: "#F97316",
      text: "#EA580C",
    };
  }

  return {
    bg: "#EAF3FF",
    border: "#3B82F6",
    text: "#2563EB",
  };
}

function TaskBlock({ event, highlighted = false }) {
  const start = getMinutes(event.start);
  const end = getMinutes(event.end);
  const top = start;
  const height = Math.max(end - start, 45);
  const dayWidth = 100 / 7;
  const gap = 8;
  const color = getColor(event);
  const overlapCount = Math.max(1, Number(event.overlapCount) || 1);
  const overlapIndex = Math.max(0, Number(event.overlapIndex) || 0);
  const innerGap = overlapCount > 1 ? 4 : 0;
  const blockWidth = `calc((${dayWidth}% - ${gap * 2}px - ${
    innerGap * (overlapCount - 1)
  }px) / ${overlapCount})`;
  const blockLeft = `calc(${event.day} * ${dayWidth}% + ${gap}px + (${blockWidth} + ${innerGap}px) * ${overlapIndex})`;

  return (
    <Link
      to={`/task/${event.id}`}
      id={`calendar-task-${event.id}`}
      className={`absolute rounded-xl p-3 border overflow-hidden hover:shadow-md transition ${
        highlighted ? "shadow-lg ring-4 ring-pink-100 z-20" : "shadow-sm"
      }`}
      style={{
        top: `${top}px`,
        left: blockLeft,
        width: blockWidth,
        height: `${height}px`,
        backgroundColor: color.bg,
        borderColor: color.border,
        outline: highlighted ? "2px solid #EC4899" : "none",
      }}
      title={`${event.title} • ${event.start} - ${event.end}`}
    >
      <h4 className="font-semibold text-sm truncate" style={{ color: color.text }}>
        {event.title}
      </h4>

      <p className="text-xs mt-1 text-gray-700">
        {event.start} - {event.end}
      </p>

      {event.hasConflict && (
        <span className="mt-2 inline-flex rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-red-500">
          Trùng lịch
        </span>
      )}

      {height >= 80 && event.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-600">
          {event.description}
        </p>
      )}
    </Link>
  );
}

export default TaskBlock;
