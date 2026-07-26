import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Clock3,
  Flag,
  FolderOpen,
  Gauge,
} from "lucide-react";

function InfoItem({ icon, label, value }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-pink-50">
      <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-pink-500 shadow-sm">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <h4 className="truncate font-semibold text-gray-800" title={value || "Chưa có"}>
          {value || "Chưa có"}
        </h4>
      </div>
    </div>
  );
}

function TaskInfo({ task }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <InfoItem icon={<CalendarDays size={22} />} label="Deadline" value={task.deadline || task.startDate} />
      <InfoItem icon={<Clock3 size={22} />} label="Giờ bắt đầu" value={task.startTime} />
      <InfoItem icon={<Clock3 size={22} />} label="Giờ kết thúc" value={task.endTime} />
      <InfoItem icon={<FolderOpen size={22} />} label="Danh mục" value={task.category} />
      <InfoItem icon={<Flag size={22} />} label="Ưu tiên" value={task.priority} />
      <InfoItem icon={<Gauge size={22} />} label="Độ khó" value={task.difficulty} />
      <InfoItem icon={<AlertCircle size={22} />} label="Mức cần thiết" value={task.necessity} />
      <InfoItem icon={<BookOpen size={22} />} label="Lĩnh vực" value={task.domain} />
    </div>
  );
}

export default TaskInfo;
