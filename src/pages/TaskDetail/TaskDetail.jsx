import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/firebase";

import TaskHeader from "../../components/taskDetail/TaskHeader";
import TaskInfo from "../../components/taskDetail/TaskInfo";
import Checklist from "../../components/taskDetail/Checklist";
import ReminderCard from "../../components/taskDetail/ReminderCard";
import ActionButtons from "../../components/taskDetail/ActionButtons";

function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

     const handleDeleteTask = async () => {
  const confirmDelete = window.confirm(
    "Bạn có chắc muốn xóa task này không?"
  );

  if (!confirmDelete) {
    return;
  }

  try {
    await deleteDoc(doc(db, "tasks", id));

    alert("Đã xóa task.");

    navigate("/tasks");
  } catch (error) {
    console.error("Delete task error:", error);
    alert("Không thể xóa task.");
  }
};

    async function fetchTask() {
      try {
        const taskRef = doc(db, "tasks", id);
        const taskSnap = await getDoc(taskRef);

        if (!taskSnap.exists()) {
          setTask(null);
          return;
        }

        const data = {
          id: taskSnap.id,
          ...taskSnap.data(),
        };

        if (data.userId !== auth.currentUser?.uid) {
          setTask(null);
          return;
        }

        setTask(data);
      } catch (error) {
        console.error("Get task detail error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTask();
  }, [id]);

  if (loading) {
    return <p className="text-gray-500">Đang tải chi tiết task...</p>;
  }

  if (!task) {
    return <p className="text-red-500">Không tìm thấy task.</p>;
  }

  return (
    <div className="p-8 bg-[#FFF7FA] min-h-screen">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-sm border border-pink-100 p-8 space-y-6">
        <TaskHeader task={task} />
        <TaskInfo task={task} />
        <Checklist task={task} />
        <ReminderCard task={task} />
        <ActionButtons task={task} />
      </div>
    </div>
  );
}

export default TaskDetail;