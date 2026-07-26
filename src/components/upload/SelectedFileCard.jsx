function SelectedFileCard({ file, onRemove }) {
  if (!file) return null;

  const sizeMB = (file.size / 1024 / 1024).toFixed(2);

  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-5 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-500 flex items-center justify-center text-xl">
          📄
        </div>
        <div>
          <h3 className="font-semibold text-lg">{file.name}</h3>
          <p className="text-gray-500 text-sm mt-1">{sizeMB} MB</p>
        </div>
      </div>

      <button onClick={onRemove} className="text-pink-500 font-semibold">
        Xóa
      </button>
    </div>
  );
}

export default SelectedFileCard;
