const filters = [
  { label: "Tất cả", value: "all" },
  { label: "Hôm nay", value: "today" },
  { label: "Tuần này", value: "week" },
  { label: "Đang làm", value: "active" },
  { label: "Hoàn thành", value: "completed" },
  { label: "Ưu tiên cao", value: "high" },
  { label: "Chưa có lịch", value: "unscheduled" },
];

function FilterBar({ activeFilter = "all", onChange }) {
  return (
    <div className="flex gap-3 flex-wrap">
      {filters.map((item) => {
        const active = activeFilter === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange?.(item.value)}
            className={`px-5 py-2 rounded-full border font-semibold transition ${
              active
                ? "border-pink-500 bg-pink-500 text-white"
                : "border-pink-200 bg-white text-gray-600 hover:bg-pink-50"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default FilterBar;
