function DescriptionBox({ value, onChange }) {
  return (
    <div>
      <label className="block text-pink-500 font-semibold mb-3">
        2. Mô tả nhiệm vụ
      </label>

      <textarea
        value={value}
        onChange={onChange}
        placeholder="Nhập mô tả chi tiết về nhiệm vụ, mục tiêu, yêu cầu..."
        className="w-full h-36 border border-pink-100 rounded-2xl p-5 outline-none resize-none"
        maxLength={1000}
      />

      <p className="text-right text-gray-400 text-sm mt-1">
        {value.length}/1000
      </p>
    </div>
  );
}

export default DescriptionBox;