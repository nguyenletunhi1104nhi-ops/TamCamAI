import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

function TaskHeader({ task }) {
  const navigate = useNavigate();

  const priorityStyle = {
    Cao: "bg-red-100 text-red-500",
    "Trung bình": "bg-yellow-100 text-yellow-600",
    Thấp: "bg-green-100 text-green-600",
    High: "bg-red-100 text-red-500",
    Medium: "bg-yellow-100 text-yellow-600",
    Low: "bg-green-100 text-green-600",
  };

  const statusStyle = {
    "To do": "bg-gray-100 text-gray-600",
    Pending: "bg-orange-100 text-orange-600",
    "In Progress": "bg-blue-100 text-blue-600",
    Completed: "bg-green-100 text-green-600",
  };

  return (
    <div className="border-b border-pink-100 pb-6">
      <button
        type="button"
        onClick={() => navigate("/tasks")}
        className="flex items-center gap-2 text-gray-500 hover:text-pink-500 mb-6"
      >
        <ArrowLeft size={20} />
        <span>Quay lại</span>
      </button>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold leading-tight">
            {task?.title || "Chưa có tiêu đề"}
          </h1>

          <p className="text-gray-500 mt-3 whitespace-pre-line leading-7">
            {task?.description || "Không có mô tả"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <span
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              priorityStyle[task?.priority] || "bg-gray-100 text-gray-600"
            }`}
          >
            {task?.priority || "Chưa có"}
          </span>

          <span
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              statusStyle[task?.status] || "bg-gray-100 text-gray-600"
            }`}
          >
            {task?.status || "Chưa có"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TaskHeader;
