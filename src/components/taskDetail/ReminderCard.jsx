import { Bell, Repeat } from "lucide-react";

function ReminderCard({ task }) {
  return (
    <div className="bg-white rounded-3xl border border-pink-100 p-6">
      <h2 className="text-xl font-bold mb-5">Reminder</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-pink-50">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-pink-500 shadow-sm">
            <Bell size={22} />
          </div>

          <div>
            <p className="text-sm text-gray-500">Notify</p>

            <h4 className="font-semibold text-gray-800">
              {task?.reminder || "Không nhắc"}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-2xl bg-pink-50">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-pink-500 shadow-sm">
            <Repeat size={22} />
          </div>

          <div>
            <p className="text-sm text-gray-500">Repeat</p>

            <h4 className="font-semibold text-gray-800">
              {task?.repeat || "Không lặp lại"}
            </h4>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReminderCard;