import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiFileText, FiCheckCircle } from "react-icons/fi";

function AIAnalysis() {
  const navigate = useNavigate();
  const location = useLocation();

  const file = location.state?.file;
  const analysisData = location.state?.analysisData;

  useEffect(() => {
    if (!file || !analysisData) {
      navigate("/upload");
    }
  }, [file, analysisData, navigate]);

  if (!file || !analysisData) {
    return null;
  }

  function goToResult() {
  console.log("ANALYSIS DATA:", analysisData);
  console.log("TASKS FROM BACKEND:", analysisData.tasks);

  navigate("/analysis-result", {
    state: {
      fileName: analysisData.file.name,
      fileSize: analysisData.file.size,
      fileType: analysisData.file.type,
      documentType: analysisData.documentType,
      documentPurpose: analysisData.documentPurpose,
      analysisSource: analysisData.analysisSource,
      textLength: analysisData.textLength,
      documentText: analysisData.documentText,
      textPreview: analysisData.textPreview,
      tasks: analysisData.tasks || [],
    },
  });
}

  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-10">
      <div className="text-center">
        <FiFileText className="text-7xl text-pink-500 mx-auto mb-6" />

        <h1 className="text-4xl font-bold">Đọc tài liệu thành công</h1>

        <p className="text-gray-500 mt-3">
          File:{" "}
          <span className="font-semibold text-gray-700">
            {analysisData.file.name}
          </span>
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-pink-50 rounded-2xl p-5">
          <p className="text-gray-500">Số ký tự đọc được</p>
          <h3 className="text-3xl font-bold mt-2">
            {analysisData.textLength}
          </h3>
        </div>

        <div className="bg-pink-50 rounded-2xl p-5">
          <p className="text-gray-500">Loại file</p>
          <h3 className="text-lg font-bold mt-2">
            {analysisData.file.type || "Không xác định"}
          </h3>
        </div>

        <div className="bg-pink-50 rounded-2xl p-5">
          <p className="text-gray-500">Trạng thái</p>
          <h3 className="text-lg font-bold text-green-600 mt-2 flex items-center gap-2">
            <FiCheckCircle />
            Đã đọc nội dung
          </h3>
        </div>
      </div>

      <div className="mt-8 bg-pink-50 rounded-2xl p-6">
        <h2 className="text-xl font-bold mb-4">Preview nội dung</h2>

        <pre className="whitespace-pre-wrap text-sm text-gray-700 max-h-[260px] overflow-y-auto">
          {analysisData.textPreview}
        </pre>
      </div>

      <button
        type="button"
        onClick={goToResult}
        className="mt-8 w-full bg-pink-500 hover:bg-pink-600 text-white py-4 rounded-2xl font-semibold"
      >
        Tiếp tục trích xuất task
      </button>
    </div>
  );
}

export default AIAnalysis;
