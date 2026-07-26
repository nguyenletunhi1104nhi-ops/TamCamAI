import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, CheckCircle2, Trash2 } from "lucide-react";
import {
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../../firebase/firebase";

function ActionButtons({ task }) {
  const navigate = useNavigate();

  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleComplete = async () => {
    if (!task?.id) {
      return;
    }

    try {
      setCompleting(true);

      const taskRef = doc(db, "tasks", task.id);

      await updateDoc(taskRef, {
        status: "Completed",
        completed: true,
        updatedAt: serverTimestamp(),
      });

      alert("Đã hoàn thành nhiệm vụ!");

      window.location.reload();
    } catch (error) {
      console.error("Complete task error:", error);

      alert("Không thể cập nhật nhiệm vụ.");
    } finally {
      setCompleting(false);
    }
  };

  const handleDelete = async () => {
    if (!task?.id) {
      return;
    }

    const confirmDelete = window.confirm(
      `Bạn có chắc muốn xóa nhiệm vụ "${task.title}" không?`
    );

    if (!confirmDelete) {
      return;
    }

    try {
      setDeleting(true);

      const taskRef = doc(db, "tasks", task.id);

      await deleteDoc(taskRef);

      alert("Đã xóa nhiệm vụ!");

      navigate("/tasks");
    } catch (error) {
      console.error("Delete task error:", error);

      alert("Không thể xóa nhiệm vụ.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex justify-end gap-4 pt-4 border-t border-pink-100">
      <button
        type="button"
        onClick={() => navigate(`/task/${task.id}/edit`)}
        className="
          flex items-center gap-2
          px-5 py-3
          rounded-2xl
          bg-white
          border border-pink-200
          hover:bg-pink-50
          transition
        "
      >
        <Pencil size={18} />
        Edit
      </button>

      <button
        type="button"
        onClick={handleComplete}
        disabled={completing || task?.completed}
        className="
          flex items-center gap-2
          px-5 py-3
          rounded-2xl
          bg-green-500
          text-white
          hover:bg-green-600
          transition
          disabled:opacity-50
          disabled:cursor-not-allowed
        "
      >
        <CheckCircle2 size={18} />

        {task?.completed
          ? "Completed"
          : completing
          ? "Đang cập nhật..."
          : "Complete"}
      </button>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="
          flex items-center gap-2
          px-5 py-3
          rounded-2xl
          bg-red-500
          text-white
          hover:bg-red-600
          transition
          disabled:opacity-50
          disabled:cursor-not-allowed
        "
      >
        <Trash2 size={18} />

        {deleting ? "Đang xóa..." : "Delete"}
      </button>
    </div>
  );
}

export default ActionButtons;