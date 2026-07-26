import { useState } from "react";

import UploadHeader from "../../components/upload/UploadHeader";
import DropZone from "../../components/upload/DropZone";
import SelectedFileCard from "../../components/upload/SelectedFileCard";
import UploadButton from "../../components/upload/UploadButton";
import TamCamMascot from "../../components/brand/TamCamMascot";

const fileTypes = ["PDF", "DOCX", "TXT", "XLSX", "CSV", "JSON"];

function UploadDocument() {
  const [selectedFile, setSelectedFile] = useState(null);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
      <div className="space-y-7">
        <UploadHeader />

        <DropZone onFileSelect={setSelectedFile} />

        <div className="grid grid-cols-3 gap-4">
          {fileTypes.map((type) => (
            <div
              key={type}
              className="bg-white border border-pink-100 rounded-2xl p-4 flex items-center justify-center gap-2 font-semibold"
            >
              <span className="text-pink-500">📄</span>
              {type}
            </div>
          ))}
        </div>

        <SelectedFileCard
          file={selectedFile}
          onRemove={() => setSelectedFile(null)}
        />

        <UploadButton file={selectedFile} />
      </div>

      <aside className="space-y-6">
        <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-5">AI sẽ phân tích</h2>

          <div className="space-y-5">
            {[
              ["🧾", "Trích xuất nội dung", "AI đọc và hiểu nội dung tài liệu của bạn"],
              ["🎯", "Nhận diện nhiệm vụ", "Tự động tìm công việc, deadline, sự kiện"],
              ["✅", "Tạo nhiệm vụ", "Chuyển đổi thành task cụ thể trong lịch"],
              ["✨", "Gợi ý thông minh", "Đưa ra ưu tiên và bước cần làm"],
            ].map(([icon, title, desc]) => (
              <div key={title} className="flex gap-4">
                <div className="w-11 h-11 rounded-2xl bg-pink-50 flex items-center justify-center text-xl">
                  {icon}
                </div>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-gray-500 mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-pink-50 border border-pink-100 rounded-3xl p-6">
          <h2 className="text-xl font-bold text-pink-600">💡 Mẹo hay</h2>
          <p className="text-gray-700 mt-4 leading-7">
            Tài liệu càng rõ ràng, AI càng hiểu chính xác. Hãy ưu tiên file có
            tiêu đề, bullet points, ngày tháng và deadline cụ thể.
          </p>
          <TamCamMascot size="card" className="mt-4 ml-auto" />
        </div>

        <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Lịch sử phân tích gần đây</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p>✅ Tài liệu mới nhất sẽ được lưu để hỏi đáp trong AI Chat.</p>
            <p>✅ Bạn có thể hỏi: “Tài liệu vừa upload nói gì?”</p>
            <p>✅ Hoặc: “Tài liệu có deadline nào không?”</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default UploadDocument;
