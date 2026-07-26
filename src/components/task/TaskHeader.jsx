import { Link } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

function TaskHeader({ task }) {
  const priorityStyle = {
    Cao: "bg-red-100 text-red-500",
    "Trung bình": "bg-yellow-100 text-yellow-600",
    Thấp: "bg-green-100 text-green-600",
  };

  const statusStyle = {
    "To do": "bg-gray-100 text-gray-500",
    "In Progress": "bg-blue-100 text-blue-500",
    Completed: "bg-green-100 text-green-600",
  };

  return (
    <div className="border-b border-pink-100 pb-6">
      <Link
        to="/tasks"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-pink-500 mb-6"
      >
        <FiArrowLeft />
        Quay lại
      </Link>

      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {task.title}
          </h1>

          <p className="text-gray-500 mt-2">
            {task.description || "Chưa có mô tả nhiệm vụ"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              priorityStyle[task.priority] ||
              "bg-gray-100 text-gray-500"
            }`}
          >
            {task.priority}
          </span>

          <span
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              statusStyle[task.status] ||
              "bg-gray-100 text-gray-500"
            }`}
          >
            {task.status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TaskHeader;