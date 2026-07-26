import { Link } from "react-router-dom";
import { AlertTriangle, CalendarPlus, CheckCircle2, Sparkles } from "lucide-react";
import TamCamMascot from "../brand/TamCamMascot";

function getToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isActive(task) {
  const status = normalizeText(task.status);
  return task.completed !== true && status !== "completed" && status !== "hoan thanh";
}

function priorityRank(task) {
  const priority = normalizeText(task.priority);

  if (priority.includes("cao") || priority.includes("high")) return 3;
  if (priority.includes("trung") || priority.includes("medium")) return 2;
  return 1;
}

function buildInsight(tasks) {
  const today = getToday();
  const activeTasks = tasks.filter(isActive);
  const overdueTasks = activeTasks
    .filter((task) => task.deadline && task.deadline < today)
    .sort((first, second) => first.deadline.localeCompare(second.deadline));
  const todayTasks = activeTasks
    .filter((task) => task.deadline === today || task.startDate === today)
    .sort((first, second) => {
      const priorityDiff = priorityRank(second) - priorityRank(first);
      if (priorityDiff !== 0) return priorityDiff;
      return String(first.startTime || "23:59").localeCompare(
        String(second.startTime || "23:59")
      );
    });
  const unscheduledTasks = activeTasks.filter(
    (task) => !task.deadline && !task.startDate
  );
  const upcomingTasks = activeTasks
    .filter((task) => task.deadline && task.deadline > today)
    .sort((first, second) => {
      const dateDiff = first.deadline.localeCompare(second.deadline);
      if (dateDiff !== 0) return dateDiff;
      return priorityRank(second) - priorityRank(first);
    });

  if (overdueTasks.length > 0) {
    return {
      tone: "risk",
      icon: AlertTriangle,
      title: "Có việc đang quá hạn",
      message: `Ưu tiên xử lý "${overdueTasks[0].title}" trước, vì đã quá hạn từ ${overdueTasks[0].deadline}.`,
      bullets: [
        `Quá hạn: ${overdueTasks.length} task`,
        todayTasks.length ? `Hôm nay còn ${todayTasks.length} task cần chú ý` : "Sau đó rà lại lịch hôm nay",
        unscheduledTasks.length ? `${unscheduledTasks.length} task chưa có lịch` : "Các task chính đã có lịch",
      ],
      actionLabel: "Xem task quá hạn",
      actionPath: "/tasks",
    };
  }

  if (todayTasks.length > 0) {
    return {
      tone: "today",
      icon: Sparkles,
      title: "Nên làm việc quan trọng nhất trước",
      message: `Bắt đầu với "${todayTasks[0].title}"${
        todayTasks[0].startTime ? ` lúc ${todayTasks[0].startTime}` : ""
      }. Đây là task đáng ưu tiên nhất hôm nay.`,
      bullets: [
        `Hôm nay có ${todayTasks.length} task`,
        todayTasks.some((task) => priorityRank(task) === 3)
          ? "Có task ưu tiên cao"
          : "Chưa có task ưu tiên cao",
        unscheduledTasks.length ? `${unscheduledTasks.length} task chưa có lịch` : "Không có task bỏ trống lịch",
      ],
      actionLabel: "Mở lịch hôm nay",
      actionPath: "/calendar",
    };
  }

  if (unscheduledTasks.length > 0) {
    return {
      tone: "schedule",
      icon: CalendarPlus,
      title: "Có task chưa được xếp lịch",
      message: `Bạn nên xếp lịch cho "${unscheduledTasks[0].title}" để Tấm Cám nhắc đúng thời điểm.`,
      bullets: [
        `${unscheduledTasks.length} task chưa có ngày/giờ`,
        upcomingTasks.length
          ? `Deadline gần nhất: ${upcomingTasks[0].deadline}`
          : "Chưa có deadline gần",
        "Xếp lịch giúp Dashboard và Calendar chính xác hơn",
      ],
      actionLabel: "Xem danh sách task",
      actionPath: "/tasks",
    };
  }

  if (upcomingTasks.length > 0) {
    return {
      tone: "ready",
      icon: CheckCircle2,
      title: "Hôm nay khá thoáng",
      message: `Bạn có thể chuẩn bị trước cho "${upcomingTasks[0].title}", hạn ${upcomingTasks[0].deadline}.`,
      bullets: [
        `Có ${upcomingTasks.length} task sắp tới`,
        "Nên làm trước phần khó hoặc cần nhiều thời gian",
        "Có thể hỏi AI để chia nhỏ checklist",
      ],
      actionLabel: "Chat với AI",
      actionPath: "/chat",
    };
  }

  return {
    tone: "empty",
    icon: CheckCircle2,
    title: "Không có việc gấp",
    message: "Bạn đang khá nhẹ lịch. Đây là thời điểm tốt để thêm kế hoạch mới hoặc upload tài liệu cần xử lý.",
    bullets: [
      "Chưa có task đang chờ",
      "Có thể tạo task mới bằng ngôn ngữ tự nhiên",
      "Upload tài liệu để AI phân tích và gợi ý việc cần làm",
    ],
    actionLabel: "Tạo task mới",
    actionPath: "/create-task",
  };
}

function AISuggestionCard({ tasks = [] }) {
  const insight = buildInsight(tasks);
  const Icon = insight.icon;

  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={20} className="text-pink-500" />
        <h2 className="text-xl font-bold">Gợi ý từ AI</h2>
      </div>

      <div className="bg-pink-50 rounded-2xl p-5">
        <div className="flex gap-4">
          <TamCamMascot size="feature" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon size={18} className="text-pink-500 shrink-0" />
              <p className="font-bold text-gray-900">{insight.title}</p>
            </div>

            <p className="text-gray-700 leading-7 mt-3">{insight.message}</p>

            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              {insight.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-pink-400 shrink-0" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Link
          to={insight.actionPath}
          className="mt-6 block text-center w-full border border-pink-300 text-pink-600 hover:bg-pink-100 py-3 rounded-xl font-semibold transition"
        >
          {insight.actionLabel}
        </Link>
      </div>
    </div>
  );
}

export default AISuggestionCard;
