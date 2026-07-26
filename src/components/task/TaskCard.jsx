import { Link } from "react-router-dom";
import { FiCalendar, FiFlag, FiBookOpen } from "react-icons/fi";

function TaskCard({ task, highlighted = false }) {
  if (!task) return null;

  const checklist =
    task?.checklist?.length > 0
      ? task.checklist.map((item) => item.title || item)
      : (task?.suggestedSteps || []).map((item) => item.title || item);
  const completedChecklist = task?.checklist?.filter?.((item) => item.completed).length || 0;
  const totalChecklist = checklist.length;
  const scheduleText = [
    task.deadline || task.startDate || "Chưa có ngày",
    task.startTime,
  ]
    .filter(Boolean)
    .join(" • ");

  const priorityStyle = {
    Cao: "bg-red-50 text-red-500",
    "Trung bình": "bg-yellow-50 text-yellow-600",
    Thấp: "bg-green-50 text-green-500",
    High: "bg-red-50 text-red-500",
    Medium: "bg-yellow-50 text-yellow-600",
    Low: "bg-green-50 text-green-500",
  };

  const statusStyle = {
    "To do": "bg-gray-50 text-gray-500",
    "In Progress": "bg-blue-50 text-blue-500",
    Completed: "bg-green-50 text-green-500",
    Pending: "bg-orange-50 text-orange-500",
  };

  return (
    <Link
      to={`/task/${task.id}`}
      id={`task-${task.id}`}
      className={`block bg-white border rounded-3xl p-6 shadow-sm hover:shadow-md transition ${
        highlighted
          ? "border-pink-400 ring-4 ring-pink-100 shadow-lg"
          : "border-pink-100"
      }`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3
            className="line-clamp-2 text-xl font-bold leading-7 text-gray-900"
            title={task.title}
          >
            {task.title}
          </h3>
          <p className="mt-2 truncate text-gray-500" title={task.subject}>
            {task.subject || task.category || "Task"}
          </p>
        </div>

        <span
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${
            statusStyle[task.status] || "bg-gray-50 text-gray-500"
          }`}
        >
          {task.status}
        </span>
      </div>

      {task.description && (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-gray-600">
          {task.description}
        </p>
      )}

      {totalChecklist > 0 && (
        <div className="mt-4 rounded-2xl bg-pink-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-gray-700">Checklist</span>
            <span className="text-pink-600 font-semibold">
              {completedChecklist}/{totalChecklist}
            </span>
          </div>
          <ul className="space-y-1 text-sm text-gray-600">
            {checklist.slice(0, 3).map((step, index) => (
              <li key={`${step}-${index}`} className="line-clamp-1">
                - {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mt-6 text-sm">
        <div className="flex min-w-0 items-center gap-2 text-gray-500">
          <FiCalendar className="shrink-0" />
          <span className="truncate" title={scheduleText}>
            {scheduleText}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <FiFlag className="shrink-0 text-gray-500" />
          <span
            className={`truncate px-3 py-1 rounded-full font-semibold ${
              priorityStyle[task.priority] || "bg-gray-50 text-gray-500"
            }`}
            title={task.priority}
          >
            {task.priority}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-gray-500">
          <FiBookOpen className="shrink-0" />
          <span className="truncate" title={task.category || task.subject}>
            {task.category || task.subject || "General"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default TaskCard;
