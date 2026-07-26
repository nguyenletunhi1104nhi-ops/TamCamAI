const hours = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`
);

function TimeColumn() {
  return (
    <div className="border-r border-pink-100">
      {hours.map((hour) => (
        <div
          key={hour}
          className="h-[60px] px-5 text-sm text-gray-500 border-b border-pink-50"
        >
          {hour}
        </div>
      ))}
    </div>
  );
}

export default TimeColumn;