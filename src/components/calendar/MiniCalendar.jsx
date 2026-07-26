const days = ["S", "M", "T", "W", "T", "F", "S"];

const dates = Array.from({ length: 31 }, (_, i) => i + 1);

function MiniCalendar() {
  return (
    <div className="bg-white rounded-3xl border border-pink-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">July 2026</h3>
        <span className="text-gray-400">›</span>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs text-gray-400 mb-2">
        {days.map((day, index) => (
          <div key={index}>{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-sm">
        {dates.map((date) => (
          <div
            key={date}
            className={
              date === 23
                ? "w-8 h-8 mx-auto rounded-full bg-pink-500 text-white flex items-center justify-center font-bold"
                : "w-8 h-8 mx-auto flex items-center justify-center text-gray-700"
            }
          >
            {date}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MiniCalendar;