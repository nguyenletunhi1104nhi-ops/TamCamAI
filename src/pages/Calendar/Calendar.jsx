import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useLocation } from "react-router-dom";

import { auth, db } from "../../firebase/firebase";
import WeekView from "../../components/calendar/WeekView";

function Calendar() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const highlightedTaskId = new URLSearchParams(location.search).get("highlightTaskId");

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const tasksQuery = query(
      collection(db, "tasks"),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const taskList = snapshot.docs.map((taskDocument) => ({
        ...taskDocument.data(),
        id: taskDocument.id,
      }));

      setTasks(taskList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <p className="text-gray-500">Đang tải lịch...</p>;
  }

  return <WeekView tasks={tasks} highlightedTaskId={highlightedTaskId} />;
}

export default Calendar;
