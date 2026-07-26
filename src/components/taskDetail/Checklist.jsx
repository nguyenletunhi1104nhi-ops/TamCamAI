import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "../../firebase/firebase";

function normalizeChecklistItem(item, index) {
  if (typeof item === "string") {
    return {
      id: `suggested-${index + 1}`,
      title: item,
      completed: false,
    };
  }

  return {
    id: item?.id || `suggested-${index + 1}`,
    title: item?.title || "",
    completed: Boolean(item?.completed),
  };
}

function Checklist({ task }) {
  const initialItems =
    task?.checklist?.length > 0
      ? task.checklist.map(normalizeChecklistItem)
      : (task?.suggestedSteps || []).map(normalizeChecklistItem);

  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(initialItems);
  }, [task?.id, task?.checklist, task?.suggestedSteps]);

  const toggleItem = async (id) => {
    if (!task?.id) return;

    const updatedItems = items.map((item) =>
      item.id === id
        ? {
            ...item,
            completed: !item.completed,
          }
        : item
    );

    setItems(updatedItems);

    try {
      setSaving(true);

      await updateDoc(doc(db, "tasks", task.id), {
        checklist: updatedItems,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Update checklist error:", error);
      alert("Không thể lưu tiến độ checklist.");
      setItems(items);
    } finally {
      setSaving(false);
    }
  };

  const completedCount = items.filter((item) => item.completed).length;

  return (
    <div className="bg-white rounded-3xl border border-pink-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-pink-500" />

            <h2 className="text-xl font-bold">Các bước cần làm</h2>
          </div>

          <p className="text-sm text-gray-500 mt-2">
            TamCam AI đề xuất quy trình thực hiện nhiệm vụ
          </p>
        </div>

        <span className="text-sm text-pink-500 font-semibold">
          {completedCount}/{items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-pink-300 bg-pink-50 rounded-2xl p-5 text-gray-600">
          TamCam AI chưa đề xuất các bước cho nhiệm vụ này.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.id || index}
              disabled={saving}
              onClick={() => toggleItem(item.id)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl
                border border-pink-100 hover:bg-pink-50 transition
                disabled:opacity-70 disabled:cursor-wait
              "
            >
              <div
                className={`
                  w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                  ${
                    item.completed
                      ? "bg-pink-500 text-white"
                      : "border border-gray-300 bg-white"
                  }
                `}
              >
                {item.completed ? (
                  <Check size={17} />
                ) : (
                  <span className="text-xs text-gray-400">{index + 1}</span>
                )}
              </div>

              <span
                className={`
                  text-left leading-6
                  ${
                    item.completed
                      ? "font-bold text-gray-900 line-through decoration-pink-400"
                      : "font-normal text-gray-700"
                  }
                `}
              >
                {item.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Checklist;
