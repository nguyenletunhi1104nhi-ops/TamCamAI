function GridLines() {
  return (
    <div className="absolute inset-0 grid grid-cols-7">
      {Array.from({ length: 7 }).map((_, dayIndex) => (
        <div key={dayIndex} className="border-r border-pink-100">
          {Array.from({ length: 24 }).map((_, hourIndex) => (
            <div
              key={hourIndex}
              className="h-[60px] border-b border-pink-50"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default GridLines;