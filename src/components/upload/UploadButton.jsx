import { useState } from "react";
import { useNavigate } from "react-router-dom";

function UploadButton({ file }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
  const isProductionPage =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";
  const isCallingLocalApi =
    apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1");

  function getUploadErrorMessage(error) {
    const rawMessage = String(error?.message || "").trim();

    if (isProductionPage && isCallingLocalApi) {
      return [
        "Upload đang lỗi vì bản web production đang gọi API local.",
        `API hiện tại: ${apiBaseUrl}`,
        "Bạn cần deploy Node/Express server lên một URL public, set VITE_API_BASE_URL bằng URL đó, build lại frontend rồi deploy lại Firebase Hosting.",
      ].join("\n");
    }

    if (/failed to fetch|fetch failed|networkerror|load failed/i.test(rawMessage)) {
      return [
        "Không kết nối được tới server phân tích tài liệu.",
        `API hiện tại: ${apiBaseUrl}`,
        "Bạn kiểm tra Node/Express server đã deploy chưa, CORS đã cho phép domain Firebase chưa, và endpoint /api/health có mở được không.",
      ].join("\n");
    }

    return rawMessage || "Không thể phân tích tài liệu.";
  }

  async function handleAnalyze() {
    if (!file) {
      return;
    }

    try {
      if (isProductionPage && isCallingLocalApi) {
        throw new Error("Production frontend is calling localhost API.");
      }

      setLoading(true);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${apiBaseUrl}/api/analyze-document`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Không thể phân tích tài liệu.");
      }

      console.log("Analyze document result:", data);

      navigate("/analysis-result", {
        state: {
          file,
          analysisData: data,
        },
      });
    } catch (error) {
      console.error("Analyze document error:", error);
      alert(getUploadErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={!file || loading}
      onClick={handleAnalyze}
      className={`
        w-full py-4 rounded-2xl font-semibold text-lg transition
        ${
          file && !loading
            ? "bg-pink-500 hover:bg-pink-600 text-white"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
        }
      `}
    >
      {loading ? "Đang gửi tài liệu..." : "Phân tích với AI"}
    </button>
  );
}

export default UploadButton;
