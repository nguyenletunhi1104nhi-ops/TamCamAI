import { FiChevronLeft, FiChevronRight, FiSearch } from "react-icons/fi";

function CalendarHeader({ currentWeek, onPrevWeek, onNextWeek, onToday }) {
  const monthTitle = currentWeek.toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-white rounded-3xl p-6 border border-pink-100 shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={onToday}
          className="px-5 py-3 rounded-2xl border border-pink-100 font-semibold hover:bg-pink-50"
        >
          Hôm nay
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onPrevWeek}
            className="w-12 h-12 rounded-2xl border border-pink-100 flex items-center justify-center hover:bg-pink-50"
          >
            <FiChevronLeft />
          </button>

          <button
            onClick={onNextWeek}
            className="w-12 h-12 rounded-2xl border border-pink-100 flex items-center justify-center hover:bg-pink-50"
          >
            <FiChevronRight />
          </button>
        </div>

        <h1 className="text-2xl font-bold ml-4 capitalize">
          {monthTitle}
        </h1>
      </div>

      <div className="hidden md:flex items-center gap-3 w-[360px] border border-pink-100 rounded-2xl px-5 py-3">
        <input
          placeholder="Tìm kiếm..."
          className="w-full outline-none text-gray-600"
        />
        <FiSearch className="text-gray-500 text-xl" />
      </div>
    </div>
  );
}

export default CalendarHeader;