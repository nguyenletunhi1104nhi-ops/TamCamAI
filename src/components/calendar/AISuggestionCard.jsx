function AISuggestionCard() {
  return (
    <div className="bg-pink-50 rounded-3xl border border-pink-100 p-5 shadow-sm">
      <h3 className="font-bold mb-3">Gợi ý từ AI</h3>

      <p className="text-sm text-gray-700 leading-6">
        Bạn nên dành 30 phút đọc tài liệu về Deep Learning vào buổi tối để hiểu bài tốt hơn.
      </p>

      <button className="mt-4 bg-pink-500 text-white px-5 py-2 rounded-xl text-sm">
        Áp dụng
      </button>
    </div>
  );
}

export default AISuggestionCard;