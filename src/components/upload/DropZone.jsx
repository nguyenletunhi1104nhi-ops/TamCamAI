import { useRef, useState } from "react";
import { FiUploadCloud } from "react-icons/fi";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function DropZone({ onFileSelect }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function validateFile(file) {
    if (!file) return false;

    if (file.size > MAX_FILE_SIZE) {
      setError("Dung lượng file tối đa là 10 MB.");
      return false;
    }

    setError("");
    return true;
  }

  function selectFile(file) {
    if (validateFile(file)) onFileSelect(file);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          selectFile(event.dataTransfer.files?.[0]);
        }}
        className={`border-2 border-dashed rounded-3xl bg-white p-16 text-center transition cursor-pointer ${
          dragging
            ? "border-pink-500 bg-pink-50"
            : "border-pink-300 hover:border-pink-500"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />

        <FiUploadCloud className="text-7xl text-pink-500 mx-auto mb-5" />

        <h2 className="text-2xl font-bold">
          {dragging ? "Thả file tại đây" : "Kéo & thả file vào đây"}
        </h2>

        <p className="text-gray-500 mt-3">hoặc</p>

        <button
          type="button"
          className="mt-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold px-10 py-3 rounded-2xl shadow-lg shadow-pink-100"
        >
          Chọn file từ máy
        </button>

        <p className="text-sm text-gray-500 mt-6">
          Hỗ trợ mỗi file tối đa 10MB. TamCam AI đọc tốt PDF, DOCX, TXT, Excel, CSV và file văn bản.
        </p>
      </div>

      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
    </div>
  );
}

export default DropZone;
