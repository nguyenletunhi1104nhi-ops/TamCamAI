function PriorityCard() {
  const tasks = [
    "Hoàn thành báo cáo ML trước 17:00",
    "Làm bài tập Data Structure",
    "Ôn tập cho bài kiểm tra",
  ];

  return (
    <div className="bg-white rounded-3xl border border-pink-100 p-5 shadow-sm">
      <h3 className="font-bold mb-4">Ưu tiên hôm nay</h3>

      <div className="space-y-4">
        {tasks.map((task, index) => (
          <div key={index} className="flex gap-3 text-sm text-gray-700">
            <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center text-xs font-bold">
              {index + 1}
            </span>
            <p>{task}</p>
          </div>
        ))}
      </div>

      <button className="mt-5 bg-pink-500 text-white px-5 py-2 rounded-xl text-sm">
        Xem tất cả
      </button>
    </div>
  );
}

export default PriorityCard;