function AISuggestionBox() {
  const features = [
    ["✅", "Phân tích nội dung", "AI hiểu nội dung và mục tiêu"],
    ["🧾", "Đề xuất checklist", "Tạo danh sách công việc chi tiết"],
    ["⏰", "Gợi ý thời gian", "Ước lượng thời gian phù hợp"],
    ["⭐", "Đề xuất ưu tiên", "Đánh giá mức độ ưu tiên"],
  ];

  return (
    <div className="bg-white rounded-3xl p-6 border border-pink-100 shadow-sm">
      <h3 className="font-bold text-lg mb-5">🤖 AI gợi ý cho bạn</h3>

      <div className="bg-pink-50 rounded-2xl p-5 mb-5">
        <p className="text-gray-700 leading-relaxed">
          Mô tả công việc ngắn gọn, AI sẽ giúp bạn phân tích và tạo checklist chi tiết.
        </p>

        <button className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold py-3 rounded-2xl mt-4">
          ✨ Tạo bằng AI
        </button>
      </div>

      <div className="space-y-4 text-sm">
        {features.map(([icon, title, desc]) => (
          <div key={title} className="flex gap-3">
            <span className="w-9 h-9 rounded-xl bg-pink-50 flex items-center justify-center">
              {icon}
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-gray-500 mt-1">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AISuggestionBox;
