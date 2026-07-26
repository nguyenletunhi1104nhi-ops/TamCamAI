import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const dayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getLast7Days() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dayNumber = String(date.getDate()).padStart(2, "0");

    return {
      date: `${year}-${month}-${dayNumber}`,
      day: dayLabels[date.getDay()],
      tasks: 0,
    };
  });
}

function WeeklyProgress({ tasks = [] }) {
  const completedTotal = tasks.filter(
    (task) => task.completed === true || task.status === "Completed"
  ).length;

  const data = getLast7Days().map((dayItem) => {
    const completedCount = tasks.filter((task) => {
      const isCompleted = task.completed === true || task.status === "Completed";
      return isCompleted && task.deadline === dayItem.date;
    }).length;

    return {
      ...dayItem,
      tasks: completedCount,
    };
  });

  const percent = tasks.length ? Math.round((completedTotal / tasks.length) * 100) : 0;

  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold">📈 Tiến độ tuần này</h2>
          <p className="text-gray-500 mt-2">
            Bạn đã hoàn thành {completedTotal}/{tasks.length} task
          </p>
        </div>
        <span className="text-pink-500 font-bold text-xl">{percent}%</span>
      </div>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <defs>
              <linearGradient id="weeklyPink" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffe4ef" vertical={false} />
            <XAxis dataKey="day" axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="tasks"
              stroke="url(#weeklyPink)"
              strokeWidth={3}
              dot={{ r: 5, fill: "#ec4899" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default WeeklyProgress;
