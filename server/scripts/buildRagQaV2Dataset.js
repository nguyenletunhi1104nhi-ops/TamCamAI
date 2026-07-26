import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");
const outputPath = path.resolve(projectRoot, "server/data/tamcam-rag-qa-v2.jsonl");

const baseQuestions = [
  ["overview", "File này là gì?", "Tài liệu {topic}.", ["{must1}", "{must2}"]],
  ["detail", "{factQuestion}", "{factAnswer}", ["{fact1}", "{fact2}"]],
  ["workflow", "{workflowQuestion}", "{workflowAnswer}", ["{workflow1}", "{workflow2}"]],
  ["deadline", "Deadline hoặc mốc thời gian là gì?", "{deadlineAnswer}", ["{deadline1}"]],
  ["task", "Tôi cần làm gì?", "{taskAnswer}", ["{task1}", "{task2}"]],
  ["risk", "Rủi ro hoặc điểm cần chú ý là gì?", "{riskAnswer}", ["{risk1}"]],
  ["comparison", "{comparisonQuestion}", "{comparisonAnswer}", ["{comparison1}", "{comparison2}"]],
  ["recommendation", "Nên ưu tiên xử lý gì?", "{recommendationAnswer}", ["{recommendation1}"]],
  ["fact", "{factQuestion2}", "{factAnswer2}", ["{fact3}"]],
  ["multi_fact", "{multiQuestion}", "{multiAnswer}", ["{multi1}", "{multi2}"]],
];

const domains = [
  {
    id: "rag-v2-study",
    category: "study_document",
    fileName: "tai-lieu-karnaugh.docx",
    topic: "lý thuyết Karnaugh/K-map để tối giản hàm Boolean",
    text: "Tài liệu Karnaugh/K-map dùng để tối giản hàm Boolean. Nội dung gồm khái niệm K-map, mã Gray, cách nhóm ô 1 và cách suy ra biểu thức tối giản. Khi làm bài cần viết bảng chân trị, lập K-map, nhóm các ô 1 theo nhóm 1, 2, 4, 8 hoặc 16 rồi rút biểu thức. Deadline ôn tập là 12/07. Việc cần làm là làm lại 5 bài sai và ghi công thức nhóm ô. Rủi ro thường gặp là nhóm sai ô không kề nhau hoặc bỏ sót nhóm lớn. K-map khác bảng chân trị ở chỗ K-map dùng trực quan hóa để rút gọn nhanh hơn.",
    vars: {
      must1: "Karnaugh", must2: "Boolean",
      factQuestion: "K-map dùng để làm gì?", factAnswer: "K-map dùng để tối giản hàm Boolean bằng cách nhóm các ô 1.", fact1: "tối giản", fact2: "Boolean",
      workflowQuestion: "Làm bài Karnaugh theo bước nào?", workflowAnswer: "Viết bảng chân trị, lập K-map, nhóm ô 1 rồi suy ra biểu thức tối giản.", workflow1: "bảng chân trị", workflow2: "biểu thức tối giản",
      deadlineAnswer: "Deadline ôn tập là 12/07.", deadline1: "12/07",
      taskAnswer: "Làm lại 5 bài sai và ghi công thức nhóm ô.", task1: "5 bài sai", task2: "công thức",
      riskAnswer: "Rủi ro là nhóm sai ô không kề nhau hoặc bỏ sót nhóm lớn.", risk1: "nhóm sai",
      comparisonQuestion: "K-map khác bảng chân trị như thế nào?", comparisonAnswer: "K-map trực quan hóa để rút gọn nhanh hơn, còn bảng chân trị liệt kê giá trị.", comparison1: "trực quan", comparison2: "bảng chân trị",
      recommendationAnswer: "Ưu tiên làm lại 5 bài sai trước.", recommendation1: "5 bài sai",
      factQuestion2: "Nhóm ô có kích thước nào?", factAnswer2: "Nhóm ô có kích thước 1, 2, 4, 8 hoặc 16.", fact3: "16",
      multiQuestion: "Tài liệu gồm những phần nào?", multiAnswer: "Gồm khái niệm K-map, mã Gray, nhóm ô 1 và biểu thức tối giản.", multi1: "mã Gray", multi2: "nhóm ô 1",
    },
  },
  {
    id: "rag-v2-office",
    category: "office_report",
    fileName: "bao-cao-hanh-chinh.docx",
    topic: "báo cáo văn phòng về nhân sự và hồ sơ hành chính",
    text: "Báo cáo hành chính tháng 6 tổng hợp 156 hồ sơ, 12 hồ sơ trễ hạn và 4 hợp đồng sắp hết hạn. Phòng Tổ chức hành chính phụ trách kiểm tra hồ sơ. Deadline gửi báo cáo là 15/07. Quy trình xử lý gồm kiểm tra danh sách hồ sơ, đối chiếu hợp đồng, cập nhật trạng thái và gửi trưởng phòng. Rủi ro là hồ sơ thiếu chữ ký và hợp đồng hết hạn chưa gia hạn. Tháng 6 có nhiều hồ sơ hơn tháng 5 là 24 hồ sơ. Khuyến nghị ưu tiên xử lý 12 hồ sơ trễ hạn.",
    vars: {
      must1: "hồ sơ", must2: "hành chính",
      factQuestion: "Có bao nhiêu hồ sơ trễ hạn?", factAnswer: "Có 12 hồ sơ trễ hạn.", fact1: "12", fact2: "trễ hạn",
      workflowQuestion: "Quy trình xử lý hồ sơ gồm gì?", workflowAnswer: "Kiểm tra danh sách, đối chiếu hợp đồng, cập nhật trạng thái và gửi trưởng phòng.", workflow1: "đối chiếu", workflow2: "gửi trưởng phòng",
      deadlineAnswer: "Deadline gửi báo cáo là 15/07.", deadline1: "15/07",
      taskAnswer: "Kiểm tra hồ sơ, đối chiếu hợp đồng và cập nhật trạng thái.", task1: "kiểm tra", task2: "cập nhật",
      riskAnswer: "Rủi ro là hồ sơ thiếu chữ ký và hợp đồng hết hạn chưa gia hạn.", risk1: "thiếu chữ ký",
      comparisonQuestion: "Tháng 6 khác tháng 5 thế nào?", comparisonAnswer: "Tháng 6 nhiều hơn tháng 5 là 24 hồ sơ.", comparison1: "24", comparison2: "tháng 5",
      recommendationAnswer: "Ưu tiên xử lý 12 hồ sơ trễ hạn.", recommendation1: "12 hồ sơ",
      factQuestion2: "Ai phụ trách kiểm tra hồ sơ?", factAnswer2: "Phòng Tổ chức hành chính phụ trách kiểm tra hồ sơ.", fact3: "Tổ chức hành chính",
      multiQuestion: "Báo cáo nêu những số liệu nào?", multiAnswer: "156 hồ sơ, 12 hồ sơ trễ hạn và 4 hợp đồng sắp hết hạn.", multi1: "156", multi2: "4 hợp đồng",
    },
  },
];

const extraDomains = [
  ["contract", "hợp đồng vận chuyển", "02_Hop_dong_van_chuyen.docx", "20/07/2026", "19/07/2027", "Bên B vận chuyển đơn hàng nội thành", "thanh toán chậm"],
  ["meeting", "biên bản họp KPI", "bien-ban-hop-kpi.docx", "10/07", "12/07", "cập nhật KPI tháng 6", "thiếu số liệu"],
  ["process", "quy trình quản lý đơn hàng", "quy-trinh-don-hang.docx", "không nêu deadline", "mỗi tuần", "tiếp nhận, xác nhận, kiểm kho, điều phối, đổi trả", "cập nhật trạng thái chậm"],
  ["logistics", "báo cáo giao hàng", "bao-cao-logistics.docx", "18/07", "20/07", "kiểm tra đơn giao trễ", "sai địa chỉ"],
  ["notice", "thông báo cập nhật KPI", "thong-bao-kpi.docx", "15/07", "12/07", "cập nhật dữ liệu KPI tháng 6", "ô dữ liệu trống"],
  ["multi-deadline", "kế hoạch dự án nhiều mốc", "ke-hoach-du-an.docx", "10/07", "30/07", "phân tích yêu cầu, giao diện, kiểm thử, báo cáo", "chậm giao diện"],
  ["no-task", "tài liệu tham khảo nghiệp vụ", "tai-lieu-tham-khao.docx", "không có deadline", "không có", "đọc hiểu quy định nội bộ", "không có nhiệm vụ được giao"],
  ["long-section", "tài liệu dài nhiều section", "tai-lieu-dai.docx", "25/07", "28/07", "tổng hợp section A, B, C và kết luận", "bỏ sót section B"],
];

extraDomains.forEach(([id, topic, fileName, deadline, secondDate, action, risk]) => {
  domains.push({
    id: `rag-v2-${id}`,
    category: id,
    fileName,
    topic,
    text: `Tài liệu này là ${topic}. Nội dung chính gồm mục tiêu, phạm vi, người liên quan và các bước xử lý. Mốc chính là ${deadline}; mốc theo dõi là ${secondDate}. Việc cần làm là ${action}. Rủi ro chính là ${risk}. Quy trình gồm tiếp nhận thông tin, kiểm tra dữ liệu, xử lý phần còn thiếu và báo cáo kết quả. So với kỳ trước, khối lượng tăng 18%. Khuyến nghị ưu tiên phần có hạn gần và rủi ro cao.`,
    vars: {
      must1: topic.split(" ")[0], must2: "xử lý",
      factQuestion: "Mốc chính là khi nào?", factAnswer: `Mốc chính là ${deadline}.`, fact1: deadline, fact2: "mốc",
      workflowQuestion: "Quy trình gồm những bước nào?", workflowAnswer: "Tiếp nhận thông tin, kiểm tra dữ liệu, xử lý phần còn thiếu và báo cáo kết quả.", workflow1: "tiếp nhận", workflow2: "báo cáo",
      deadlineAnswer: `Mốc chính là ${deadline}; mốc theo dõi là ${secondDate}.`, deadline1: deadline,
      taskAnswer: `Việc cần làm là ${action}.`, task1: action.split(" ")[0], task2: action.split(" ").slice(-1)[0],
      riskAnswer: `Rủi ro chính là ${risk}.`, risk1: risk.split(" ")[0],
      comparisonQuestion: "So với kỳ trước có gì khác?", comparisonAnswer: "Khối lượng tăng 18% so với kỳ trước.", comparison1: "18%", comparison2: "kỳ trước",
      recommendationAnswer: "Ưu tiên phần có hạn gần và rủi ro cao.", recommendation1: "hạn gần",
      factQuestion2: "Tài liệu có nội dung chính gì?", factAnswer2: "Gồm mục tiêu, phạm vi, người liên quan và các bước xử lý.", fact3: "phạm vi",
      multiQuestion: "Tài liệu nhắc những yếu tố nào?", multiAnswer: "Có mốc chính, mốc theo dõi, việc cần làm, rủi ro và quy trình.", multi1: "rủi ro", multi2: "quy trình",
    },
  });
});

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

const lines = domains.map((domain) => {
  const questions = baseQuestions.map(([category, question, expectedAnswer, mustContain]) => ({
    category,
    intent: category === "overview" ? "DOCUMENT_OVERVIEW" : undefined,
    question: fill(question, domain.vars),
    expectedAnswer: fill(expectedAnswer, { ...domain.vars, topic: domain.topic }),
    mustContain: mustContain.map((item) => fill(item, domain.vars)).filter(Boolean),
    evidence: fill(expectedAnswer, { ...domain.vars, topic: domain.topic }),
  }));
  return JSON.stringify({
    id: domain.id,
    category: domain.category,
    document: {
      fileName: domain.fileName,
      documentText: domain.text,
    },
    questions,
  });
});

fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf-8");
console.log(`Wrote ${domains.length} documents and ${domains.length * baseQuestions.length} questions to ${outputPath}`);
