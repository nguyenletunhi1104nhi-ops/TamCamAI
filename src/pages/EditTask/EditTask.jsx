import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";

function normalizeChecklistItem(item, index) {
  if (typeof item === "string") {
    return {
      id: `step-${index + 1}`,
      title: item,
      completed: false,
    };
  }

  return {
    id: item?.id || `step-${index + 1}`,
    title: item?.title || "",
    completed: Boolean(item?.completed),
  };
}

function getInitialChecklist(taskData) {
  if (Array.isArray(taskData?.checklist) && taskData.checklist.length > 0) {
    return taskData.checklist.map(normalizeChecklistItem);
  }

  if (Array.isArray(taskData?.suggestedSteps) && taskData.suggestedSteps.length > 0) {
    return taskData.suggestedSteps.map(normalizeChecklistItem);
  }

  return [];
}

function EditTask() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchTask() {
      try {
        const taskRef = doc(db, "tasks", id);
        const taskSnap = await getDoc(taskRef);

        if (!taskSnap.exists()) {
          setTask(null);
          return;
        }

        const taskData = {
          id: taskSnap.id,
          ...taskSnap.data(),
        };

        if (taskData.userId !== auth.currentUser?.uid) {
          setTask(null);
          return;
        }

        setTask(taskData);
        setChecklist(getInitialChecklist(taskData));
      } catch (error) {
        console.error("Get task error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTask();
  }, [id]);

  function updateField(field, value) {
    setTask((currentTask) => ({
      ...currentTask,
      [field]: value,
    }));
  }

  function updateChecklistItem(index, value) {
    setChecklist((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              title: value,
            }
          : item
      )
    );
  }

  function toggleChecklistItem(index) {
    setChecklist((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              completed: !item.completed,
            }
          : item
      )
    );
  }

  function addChecklistItem() {
    setChecklist((currentItems) => [
      ...currentItems,
      {
        id: `step-${Date.now()}`,
        title: "",
        completed: false,
      },
    ]);
  }

  function removeChecklistItem(index) {
    setChecklist((currentItems) =>
      currentItems.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!task.title?.trim()) {
      alert("Vui lòng nhập tiêu đề nhiệm vụ.");
      return;
    }

    const cleanedChecklist = checklist
      .map((item, index) => ({
        id: item.id || `step-${index + 1}`,
        title: String(item.title || "").trim(),
        completed: Boolean(item.completed),
      }))
      .filter((item) => item.title);

    try {
      setSaving(true);

      const taskRef = doc(db, "tasks", id);

      await updateDoc(taskRef, {
        title: task.title?.trim() || "",
        description: task.description || "",
        category: task.category || "Personal",
        priority: task.priority || "Trung bình",
        startDate: task.startDate || "",
        deadline: task.deadline || "",
        startTime: task.startTime || "",
        endTime: task.endTime || "",
        estimate: task.estimate || "",
        reminder: task.reminder || "Không nhắc",
        assignee: task.assignee || "",
        status: task.status || "To do",
        completed: task.status === "Completed",
        checklist: cleanedChecklist,
        suggestedSteps: cleanedChecklist.map((item) => item.title),
        updatedAt: serverTimestamp(),
      });

      alert("Đã cập nhật nhiệm vụ!");
      navigate(`/task/${id}`);
    } catch (error) {
      console.error("Update task error:", error);
      alert("Không thể cập nhật nhiệm vụ.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Đang tải nhiệm vụ...</p>;
  }

  if (!task) {
    return <p className="text-red-500">Không tìm thấy nhiệm vụ.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl border border-pink-100 shadow-sm p-8"
      >
        <div className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Chỉnh sửa nhiệm vụ</h1>
          <p className="text-gray-500">
            Cập nhật tên task, mô tả, lịch nhắc và checklist do TamCam AI gợi ý.
          </p>
        </div>

        <div className="space-y-7">
          <div>
            <label className="block font-semibold mb-2">
              Tiêu đề nhiệm vụ
            </label>

            <input
              type="text"
              value={task.title || ""}
              onChange={(event) => updateField("title", event.target.value)}
              className="w-full border border-pink-100 rounded-2xl px-4 py-3 outline-none focus:border-pink-400"
              maxLength={90}
            />
          </div>

          <div>
            <label className="block font-semibold mb-2">Mô tả</label>

            <textarea
              value={task.description || ""}
              onChange={(event) => updateField("description", event.target.value)}
              className="w-full min-h-40 resize-y border border-pink-100 rounded-2xl px-4 py-3 leading-7 outline-none focus:border-pink-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FieldSelect
              label="Danh mục"
              value={task.category || "Personal"}
              onChange={(value) => updateField("category", value)}
              options={["Study", "Work", "Meeting", "Personal", "General"]}
            />

            <FieldSelect
              label="Mức độ ưu tiên"
              value={task.priority || "Trung bình"}
              onChange={(value) => updateField("priority", value)}
              options={["Thấp", "Trung bình", "Cao"]}
            />

            <FieldInput
              label="Ngày bắt đầu"
              type="date"
              value={task.startDate || ""}
              onChange={(value) => updateField("startDate", value)}
            />

            <FieldInput
              label="Deadline"
              type="date"
              value={task.deadline || ""}
              onChange={(value) => updateField("deadline", value)}
            />

            <FieldInput
              label="Giờ bắt đầu"
              type="time"
              value={task.startTime || ""}
              onChange={(value) => updateField("startTime", value)}
            />

            <FieldInput
              label="Giờ kết thúc"
              type="time"
              value={task.endTime || ""}
              onChange={(value) => updateField("endTime", value)}
            />

            <FieldSelect
              label="Trạng thái"
              value={task.status || "To do"}
              onChange={(value) => updateField("status", value)}
              options={["To do", "In Progress", "Completed"]}
            />

            <FieldSelect
              label="Nhắc nhở"
              value={task.reminder || "Không nhắc"}
              onChange={(value) => updateField("reminder", value)}
              options={[
                "Không nhắc",
                "Trước 10 phút",
                "Trước 30 phút",
                "Trước 1 giờ",
                "Trước 1 ngày",
              ]}
            />
          </div>

          <div className="rounded-3xl border border-pink-100 bg-pink-50 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Checklist</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Các bước này sẽ hiện trong Task Detail và có thể tick hoàn thành.
                </p>
              </div>

              <button
                type="button"
                onClick={addChecklistItem}
                className="rounded-2xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-600"
              >
                + Thêm bước
              </button>
            </div>

            {checklist.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-pink-200 bg-white p-4 text-sm text-gray-500">
                Chưa có checklist. Bạn có thể thêm từng bước để task dễ làm hơn.
              </div>
            ) : (
              <div className="space-y-3">
                {checklist.map((item, index) => (
                  <div key={item.id || index} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleChecklistItem(index)}
                      className={`h-11 w-11 rounded-2xl border font-semibold ${
                        item.completed
                          ? "border-pink-500 bg-pink-500 text-white"
                          : "border-pink-200 bg-white text-gray-400"
                      }`}
                      title="Đánh dấu hoàn thành"
                    >
                      {item.completed ? "✓" : index + 1}
                    </button>

                    <input
                      value={item.title}
                      onChange={(event) =>
                        updateChecklistItem(index, event.target.value)
                      }
                      className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-4 py-3 outline-none focus:border-pink-400"
                      placeholder={`Bước ${index + 1}`}
                    />

                    <button
                      type="button"
                      onClick={() => removeChecklistItem(index)}
                      className="h-11 w-11 rounded-2xl border border-pink-100 bg-white text-gray-500 hover:bg-pink-100"
                      title="Xóa bước"
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-2">
            <button
              type="button"
              onClick={() => navigate(`/task/${id}`)}
              className="px-6 py-3 border border-pink-200 rounded-2xl font-semibold text-pink-500 hover:bg-pink-50"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl font-semibold disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function FieldInput({ label, type, value, onChange }) {
  return (
    <div>
      <label className="block font-semibold mb-2">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-pink-100 rounded-2xl px-4 py-3 outline-none focus:border-pink-400"
      />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block font-semibold mb-2">{label}</label>
      <select
        value={value || options[0]}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-pink-100 rounded-2xl px-4 py-3 outline-none focus:border-pink-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

export default EditTask;
