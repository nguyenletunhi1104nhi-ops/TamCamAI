import { useEffect, useState } from "react";
import {
  FiFileText,
  FiFolder,
  FiCalendar,
  FiClock,
  FiBell,
  FiUser,
  FiFlag,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase/firebase";

import FormInput from "./FormInput";
import FormSelect from "./FormSelect";
import DescriptionBox from "./DescriptionBox";

const defaultSettings = {
  defaultReminder: "Trước 30 phút",
  defaultTaskDuration: "90",
};

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addMinutesToTime(time, minutes) {
  const [hour, minute] = String(time || "08:00").split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute + minutes, 0, 0);

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function getDurationMinutes(settings) {
  return Math.max(
    30,
    Math.min(240, Number(settings.defaultTaskDuration) || 90)
  );
}

function getEstimateFromDuration(minutes) {
  if (minutes === 30) return "30 phút";
  if (minutes === 60) return "1 giờ";
  if (minutes === 120) return "2 giờ";
  if (minutes === 240) return "4 giờ";

  return "1 giờ 30 phút";
}

function createInitialTask(settings = defaultSettings) {
  const today = toIsoDate(new Date());
  const startTime = "08:00";
  const duration = getDurationMinutes(settings);

  return {
    title: "",
    category: "Chọn danh mục",
    priority: "Trung bình",
    startDate: today,
    deadline: today,
    startTime,
    endTime: addMinutesToTime(startTime, duration),
    estimate: getEstimateFromDuration(duration),
    reminder: settings.defaultReminder,
    assignee: "Tôi",
    status: "To do",
    description: "",
  };
}

function CreateTaskForm() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [task, setTask] = useState(() => createInitialTask(defaultSettings));

  useEffect(() => {
    async function loadSettings() {
      if (!auth.currentUser) return;

      try {
        const userSnapshot = await getDoc(doc(db, "users", auth.currentUser.uid));
        const nextSettings = {
          ...defaultSettings,
          ...(userSnapshot.data()?.settings || {}),
        };
        const duration = getDurationMinutes(nextSettings);

        setSettings(nextSettings);
        setTask((currentTask) => ({
          ...currentTask,
          endTime: addMinutesToTime(currentTask.startTime, duration),
          estimate: getEstimateFromDuration(duration),
          reminder: currentTask.reminder || nextSettings.defaultReminder,
        }));
      } catch (error) {
        console.warn("Get create task settings error:", error);
      }
    }

    loadSettings();
  }, []);

  function updateField(field, value) {
    setTask((currentTask) => {
      const nextTask = {
        ...currentTask,
        [field]: value,
      };

      if (field === "startTime") {
        nextTask.endTime = addMinutesToTime(value, getDurationMinutes(settings));
      }

      if (field === "estimate") {
        const estimateToMinutes = {
          "30 phút": 30,
          "1 giờ": 60,
          "1 giờ 30 phút": 90,
          "2 giờ": 120,
          "4 giờ": 240,
        };
        nextTask.endTime = addMinutesToTime(
          nextTask.startTime,
          estimateToMinutes[value] || getDurationMinutes(settings)
        );
      }

      return nextTask;
    });
  }
  async function handleSubmit(e) {
    e.preventDefault();

    if (!auth.currentUser) {
      alert("Bạn cần đăng nhập trước khi tạo task.");
      navigate("/login");
      return;
    }

    if (!task.title.trim()) {
      alert("Vui lòng nhập tiêu đề nhiệm vụ.");
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, "tasks"), {
        ...task,
        title: task.title.trim(),
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        completed: task.status === "Completed",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert("Đã tạo nhiệm vụ!");
      navigate("/tasks");
    } catch (error) {
      console.error("Create task error:", error);
      alert("Tạo nhiệm vụ thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-3xl p-8 border border-pink-100 shadow-sm"
    >
      <h2 className="text-pink-500 font-bold mb-6">1. Thông tin cơ bản</h2>

      <div className="space-y-6">
        <FormInput
          label="Tiêu đề nhiệm vụ"
          required
          icon={<FiFileText />}
          value={task.title}
          onChange={(e) => updateField("title", e.target.value)}
          placeholder="Nhập tiêu đề nhiệm vụ..."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormSelect
            label="Danh mục"
            icon={<FiFolder />}
            value={task.category}
            onChange={(e) => updateField("category", e.target.value)}
            options={["Chọn danh mục", "Study", "Work", "Meeting", "Personal"]}
          />

          <FormSelect
            label="Mức độ ưu tiên"
            icon={<FiFlag />}
            value={task.priority}
            onChange={(e) => updateField("priority", e.target.value)}
            options={["Thấp", "Trung bình", "Cao"]}
          />

          <FormInput
            label="Ngày bắt đầu"
            icon={<FiCalendar />}
            type="date"
            value={task.startDate}
            onChange={(e) => updateField("startDate", e.target.value)}
          />
          <FormInput
            label="Giờ bắt đầu"
            icon={<FiClock />}
            type="time"
            value={task.startTime}
            onChange={(e) => updateField("startTime", e.target.value)}
          />

          <FormInput
            label="Giờ kết thúc"
            icon={<FiClock />}
            type="time"
            value={task.endTime}
            onChange={(e) => updateField("endTime", e.target.value)}
          />

          <FormInput
            label="Deadline"
            required
            icon={<FiCalendar />}
            type="date"
            value={task.deadline}
            onChange={(e) => updateField("deadline", e.target.value)}
          />

          <FormSelect
            label="Thời gian ước lượng"
            icon={<FiClock />}
            value={task.estimate}
            onChange={(e) => updateField("estimate", e.target.value)}
            options={["30 phút", "1 giờ", "1 giờ 30 phút", "2 giờ", "4 giờ"]}
          />

          <FormSelect
            label="Nhắc nhở"
            icon={<FiBell />}
            value={task.reminder}
            onChange={(e) => updateField("reminder", e.target.value)}
            options={[
              "Không nhắc",
              "Trước 10 phút",
              "Trước 30 phút",
              "Trước 1 giờ",
              "Trước 1 ngày",
            ]}
          />

          <FormSelect
            label="Người phụ trách"
            icon={<FiUser />}
            value={task.assignee}
            onChange={(e) => updateField("assignee", e.target.value)}
            options={["Tôi", "Nhóm học tập", "Đồng nghiệp"]}
          />

          <FormSelect
            label="Trạng thái"
            icon={<FiFlag />}
            value={task.status}
            onChange={(e) => updateField("status", e.target.value)}
            options={["To do", "In Progress", "Completed"]}
          />
        </div>

        <DescriptionBox
          value={task.description}
          onChange={(e) => updateField("description", e.target.value)}
        />

        <div>
          <label className="block text-pink-500 font-semibold mb-3">
            3. Checklist AI sẽ gợi ý sau khi tạo
          </label>

          <div className="border border-dashed border-pink-300 bg-pink-50 rounded-2xl p-5">
            TamCam AI sẽ phân tích nhiệm vụ và đề xuất checklist phù hợp.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5 pt-4">
          <button
            type="button"
            onClick={() => navigate("/tasks")}
            className="border border-pink-100 text-pink-500 font-semibold py-4 rounded-2xl"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            className="border border-pink-300 text-pink-500 font-semibold py-4 rounded-2xl"
          >
            Lưu nháp
          </button>

          <button
            type="submit"
            disabled={loading}
            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-4 rounded-2xl disabled:opacity-60"
          >
            {loading ? "Đang tạo..." : "Tạo nhiệm vụ"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default CreateTaskForm;

