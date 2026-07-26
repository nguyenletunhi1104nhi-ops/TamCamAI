import { Link } from "react-router-dom";

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function ScheduleCard({ tasks = [] }) {
  const today = getLocalDateString();

  const schedules = tasks
    .filter((task) => {
      return (
        task.startDate === today &&
        task.startTime &&
        task.completed !== true &&
        task.status !== "Completed" &&
        task.status !== "Hoàn thành"
      );
    })
    .sort((taskA, taskB) => taskA.startTime.localeCompare(taskB.startTime));

  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Lịch hôm nay</h2>

        <Link to="/calendar" className="text-pink-500 font-semibold">
          Xem lịch
        </Link>
      </div>

      {schedules.length === 0 ? (
        <div className="border border-dashed border-pink-200 bg-pink-50 rounded-2xl p-5 text-gray-500">
          Hôm nay chưa có lịch.
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((item) => (
            <Link
              key={item.id}
              to={`/task/${item.id}`}
              className="flex gap-4 items-center"
            >
              <span className="text-sm text-gray-500 w-12">{item.startTime}</span>
              <span className="w-3 h-3 rounded-full bg-pink-400 ring-4 ring-pink-100" />

              <div className="flex-1 bg-gradient-to-r from-pink-50 to-white border border-pink-100 rounded-2xl px-4 py-3 hover:bg-pink-100 transition">
                <p className="font-semibold text-gray-800 line-clamp-1">
                  {item.title}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {item.startTime}
                  {item.endTime ? ` - ${item.endTime}` : " - Chưa có giờ kết thúc"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default ScheduleCard;
