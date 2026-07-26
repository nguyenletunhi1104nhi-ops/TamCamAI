const dayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function CalendarHeaderRow({ currentWeek }) {
  const today = new Date();

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentWeek);
    date.setDate(currentWeek.getDate() + index);

    const isToday =
      date.toDateString() === today.toDateString();

    return {
      label: dayLabels[index],
      date: date.getDate(),
      active: isToday,
    };
  });

  return (
    <div className="grid grid-cols-[90px_repeat(7,minmax(0,1fr))] bg-white border-b border-pink-100">
      <div className="h-[90px]" />

      {days.map((day) => (
        <div
          key={`${day.label}-${day.date}`}
          className="h-[90px] flex flex-col items-center justify-center"
        >
          <p className="text-sm text-gray-500">{day.label}</p>

          <div
            className={
              day.active
                ? "mt-2 w-11 h-11 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold"
                : "mt-2 w-11 h-11 flex items-center justify-center text-lg font-bold text-gray-900"
            }
          >
            {day.date}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CalendarHeaderRow;