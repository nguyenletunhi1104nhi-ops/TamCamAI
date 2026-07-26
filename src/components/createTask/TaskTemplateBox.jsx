function TaskTemplateBox() {
  const templates = [
    ["🎓", "Bài tập / Assignment"],
    ["💼", "Dự án cá nhân"],
    ["📚", "Ôn tập / Thi cử"],
    ["👥", "Cuộc họp"],
    ["☑️", "Công việc hằng ngày"],
  ];

  return (
    <div className="bg-white rounded-3xl p-6 border border-pink-100 shadow-sm">
      <h3 className="font-bold text-lg mb-5">📋 Mẫu nhiệm vụ phổ biến</h3>

      <div className="space-y-3">
        {templates.map(([icon, item]) => (
          <button
            key={item}
            className="w-full flex justify-between items-center border border-pink-100 rounded-2xl px-4 py-3 hover:bg-pink-50"
          >
            <span className="flex items-center gap-3">
              <span>{icon}</span>
              {item}
            </span>
            <span className="text-pink-500 font-bold text-xl">+</span>
          </button>
        ))}
      </div>

      <button className="w-full text-pink-500 font-semibold mt-5">
        Xem thêm mẫu
      </button>
    </div>
  );
}

export default TaskTemplateBox;
