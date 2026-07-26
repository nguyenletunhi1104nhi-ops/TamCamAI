function TaskCard({ title, subject, deadline, priority, status, progress = 0 }) {
  const priorityTone =
    priority === "Cao" || priority === "High"
      ? "bg-pink-100 text-pink-600"
      : priority === "Trung bình" || priority === "Medium"
      ? "bg-orange-100 text-orange-600"
      : "bg-green-100 text-green-600";

  const displayProgress = progress || (status === "Completed" ? 100 : 0);

  return (
    <div className="bg-white border border-pink-100 rounded-2xl p-4 flex items-center justify-between hover:shadow-md hover:shadow-pink-100 transition">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-14 h-14 rounded-2xl bg-pink-50 text-pink-500 flex items-center justify-center text-2xl flex-shrink-0">
          📖
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg truncate">{title}</h3>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${priorityTone}`}>
              {priority || "Thấp"}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {subject || "General"} • {deadline || "Chưa có deadline"}
          </p>
        </div>
      </div>

      <div className="w-14 h-14 rounded-full border-4 border-pink-100 flex items-center justify-center text-sm font-semibold text-gray-700 flex-shrink-0">
        {displayProgress}%
      </div>
    </div>
  );
}

export default TaskCard;
