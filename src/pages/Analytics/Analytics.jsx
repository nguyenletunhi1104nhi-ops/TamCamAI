import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Target, TrendingUp } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";

const PIE_COLORS = ["#ec4899", "#22c55e", "#f59e0b", "#60a5fa", "#8b5cf6"];
const PRIORITY_LABELS = ["Cao", "Trung bình", "Thấp", "Khác"];

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isCompleted(task) {
  const status = normalizeText(task.status);
  return task.completed === true || status === "completed" || status === "hoan thanh";
}

function getTaskDate(task) {
  return task.deadline || task.startDate || "";
}

function getPriorityLabel(task) {
  const priority = normalizeText(task.priority);

  if (priority.includes("cao") || priority.includes("high")) return "Cao";
  if (priority.includes("trung") || priority.includes("medium")) return "Trung bình";
  if (priority.includes("thap") || priority.includes("low")) return "Thấp";
  return "Khác";
}

function getCategory(task) {
  return task.category || task.documentType || "Khác";
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function buildAnalytics(tasks) {
  const today = getLocalDateString();
  const weekEnd = getLocalDateString(addDays(new Date(), 7));
  const completedTasks = tasks.filter(isCompleted);
  const activeTasks = tasks.filter((task) => !isCompleted(task));
  const overdueTasks = activeTasks.filter((task) => {
    const date = getTaskDate(task);
    return date && date < today;
  });
  const dueThisWeek = activeTasks.filter((task) => {
    const date = getTaskDate(task);
    return date && date >= today && date <= weekEnd;
  });
  const unscheduledTasks = activeTasks.filter((task) => !getTaskDate(task));

  const categoryMap = tasks.reduce((acc, task) => {
    const category = getCategory(task);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const categoryData = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((first, second) => second.value - first.value);

  const nextSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(new Date(), index);
    const dateString = getLocalDateString(date);
    const dayTasks = activeTasks.filter((task) => getTaskDate(task) === dateString);

    return {
      name: `${date.getDate()}/${date.getMonth() + 1}`,
      value: dayTasks.length,
      highPriority: dayTasks.filter((task) => getPriorityLabel(task) === "Cao").length,
    };
  });

  const priorityData = PRIORITY_LABELS.map((label) => {
    const group = tasks.filter((task) => getPriorityLabel(task) === label);
    const completed = group.filter(isCompleted).length;

    return {
      label,
      total: group.length,
      completed,
      rate: percent(completed, group.length),
    };
  }).filter((item) => item.total > 0 || item.label !== "Khác");

  const overdueByCategory = overdueTasks.reduce((acc, task) => {
    const category = getCategory(task);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const riskiestCategory = Object.entries(overdueByCategory).sort(
    (first, second) => second[1] - first[1]
  )[0];
  const overloadedDays = nextSevenDays.filter((day) => day.value >= 4);
  const highPriorityThisWeek = dueThisWeek.filter(
    (task) => getPriorityLabel(task) === "Cao"
  ).length;
  const riskScore = Math.min(
    100,
    overdueTasks.length * 25 +
      unscheduledTasks.length * 8 +
      highPriorityThisWeek * 10 +
      overloadedDays.length * 12
  );

  const insight =
    overdueTasks.length > 0
      ? `Có ${overdueTasks.length} task quá hạn. Nên xử lý task cũ nhất trước rồi mới nhận thêm việc mới.`
      : dueThisWeek.length > 0
        ? `Tuần tới có ${dueThisWeek.length} task cần theo dõi. Ưu tiên task mức Cao và các ngày có từ 4 task trở lên.`
        : "Tuần tới chưa có áp lực lớn. Đây là thời điểm tốt để xếp lịch cho task chưa có deadline.";

  return {
    total: tasks.length,
    completed: completedTasks.length,
    active: activeTasks.length,
    overdue: overdueTasks.length,
    dueThisWeek: dueThisWeek.length,
    unscheduled: unscheduledTasks.length,
    completionRate: percent(completedTasks.length, tasks.length),
    categoryData,
    nextSevenDays,
    priorityData,
    riskScore,
    riskiestCategory,
    overloadedDays,
    insight,
  };
}

function MetricCard({ title, value, note, icon: Icon, tone }) {
  const toneClass = {
    pink: "bg-pink-100 text-pink-500",
    orange: "bg-orange-100 text-orange-500",
    green: "bg-emerald-100 text-emerald-600",
    purple: "bg-violet-100 text-violet-600",
  };

  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-gray-600">{title}</p>
          <h3 className="text-3xl font-bold mt-3">{value}</h3>
        </div>
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            toneClass[tone] || toneClass.pink
          }`}
        >
          <Icon size={22} />
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-4">{note}</p>
    </div>
  );
}

function Analytics() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return undefined;
    }

    const tasksQuery = query(
      collection(db, "tasks"),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setTasks(
          snapshot.docs.map((taskDocument) => ({
            id: taskDocument.id,
            ...taskDocument.data(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Analytics tasks error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const data = useMemo(() => buildAnalytics(tasks), [tasks]);

  if (loading) {
    return (
      <div className="bg-white border border-pink-100 rounded-3xl p-8 text-gray-500">
        Đang tải Analytics...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <MetricCard
            title="Tỷ lệ hoàn thành"
            value={`${data.completionRate}%`}
            note={`${data.completed}/${data.total} task đã xong`}
            icon={CheckCircle2}
            tone="pink"
          />
          <MetricCard
            title="Đang thực hiện"
            value={data.active}
            note={`${data.dueThisWeek} task cần chú ý trong 7 ngày tới`}
            icon={Clock3}
            tone="orange"
          />
          <MetricCard
            title="Quá hạn"
            value={data.overdue}
            note={data.overdue > 0 ? "Cần xử lý trước khi thêm việc mới" : "Chưa có task quá hạn"}
            icon={AlertTriangle}
            tone="purple"
          />
          <MetricCard
            title="Rủi ro tuần tới"
            value={`${data.riskScore}%`}
            note={`${data.unscheduled} task chưa có lịch`}
            icon={TrendingUp}
            tone="green"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-6">Khối lượng 7 ngày tới</h2>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.nextSevenDays}>
                  <CartesianGrid stroke="#ffe4ef" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#ec4899" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="highPriority" fill="#f59e0b" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-6">Phân bổ task theo danh mục</h2>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categoryData.length ? data.categoryData : [{ name: "Chưa có", value: 1 }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {(data.categoryData.length ? data.categoryData : [{ name: "Chưa có", value: 1 }]).map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-5">Hiệu suất theo mức độ ưu tiên</h2>
          <div className="space-y-5">
            {data.priorityData.map((item) => (
              <div key={item.label} className="grid grid-cols-[100px_1fr_60px] items-center gap-4">
                <span>{item.label}</span>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pink-500"
                    style={{ width: `${item.rate}%` }}
                  />
                </div>
                <span className="font-semibold text-right">{item.rate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-5">Tổng quan</h2>
          <div className="space-y-4 text-sm">
            <p className="flex justify-between gap-4"><span>Tổng số task</span><b>{data.total}</b></p>
            <p className="flex justify-between gap-4"><span>Đã hoàn thành</span><b>{data.completed}</b></p>
            <p className="flex justify-between gap-4"><span>Đang xử lý</span><b>{data.active}</b></p>
            <p className="flex justify-between gap-4"><span>Quá hạn</span><b>{data.overdue}</b></p>
            <p className="flex justify-between gap-4"><span>Chưa có lịch</span><b>{data.unscheduled}</b></p>
          </div>
        </div>

        <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Target size={20} className="text-pink-500" />
            <h2 className="text-xl font-bold">AI Insight</h2>
          </div>

          <div className="space-y-4 text-gray-700 leading-7">
            <p>{data.insight}</p>
            {data.riskiestCategory && (
              <p>
                Danh mục rủi ro nhất là <b>{data.riskiestCategory[0]}</b> với{" "}
                <b>{data.riskiestCategory[1]}</b> task quá hạn.
              </p>
            )}
            {data.overloadedDays.length > 0 && (
              <p>
                Có {data.overloadedDays.length} ngày đang quá tải. Nên dời bớt task
                sang ngày nhẹ hơn.
              </p>
            )}
            {data.unscheduled > 0 && (
              <p>
                Có {data.unscheduled} task chưa có lịch, nên xếp ngày/giờ để hệ thống
                nhắc đúng lúc.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={20} className="text-pink-500" />
            <h2 className="text-xl font-bold">Dự đoán tuần tới</h2>
          </div>
          <p className="text-gray-700 leading-7">
            Mức rủi ro hiện tại là <b>{data.riskScore}%</b>. Chỉ số này tăng khi có
            task quá hạn, task ưu tiên cao sắp đến hạn, ngày bị quá tải hoặc task
            chưa được xếp lịch.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default Analytics;
