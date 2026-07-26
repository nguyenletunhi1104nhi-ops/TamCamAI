const TASK_KEYWORDS = [
  "nộp",
  "hoàn thành",
  "làm",
  "chuẩn bị",
  "viết",
  "thực hiện",
  "gửi",
  "báo cáo",
  "bài tập",
  "đồ án",
  "dự án",
  "deadline",
  "hạn",
  "phải",
  "cần",
  "họp",
  "ôn tập",
  "thuyết trình",
  "assignment",
  "submit",
  "complete",
  "prepare",
  "report",
  "project",
  "meeting",
];

const MEETING_KEYWORDS = [
  "họp",
  "cuộc họp",
  "meeting",
  "lịch họp",
  "trao đổi",
  "thảo luận",
];

const STUDY_KEYWORDS = [
  "bài tập",
  "đồ án",
  "ôn tập",
  "học",
  "môn",
  "kiểm tra",
  "thi",
  "thuyết trình",
  "assignment",
  "quiz",
  "exam",
];

const WORK_KEYWORDS = [
  "email",
  "báo cáo",
  "dự án",
  "khách hàng",
  "hợp đồng",
  "kế hoạch",
  "công việc",
  "project",
  "report",
  "client",
];

const HIGH_NECESSITY_KEYWORDS = [
  "bắt buộc",
  "quan trọng",
  "khẩn cấp",
  "gấp",
  "phải",
  "cần hoàn thành",
  "không được trễ",
  "required",
  "mandatory",
  "urgent",
  "important",
];

const MEDIUM_NECESSITY_KEYWORDS = [
  "nên",
  "chuẩn bị",
  "họp",
  "meeting",
  "presentation",
  "thuyết trình",
  "báo cáo",
];

const HIGH_DIFFICULTY_KEYWORDS = [
  "đồ án",
  "dự án",
  "project",
  "machine learning",
  "nghiên cứu",
  "research",
  "xây dựng hệ thống",
  "phát triển hệ thống",
  "huấn luyện mô hình",
  "phân tích dữ liệu",
];

const MEDIUM_DIFFICULTY_KEYWORDS = [
  "báo cáo",
  "report",
  "assignment",
  "bài tập",
  "phân tích",
  "analysis",
  "thuyết trình",
  "presentation",
  "database",
  "cơ sở dữ liệu",
];

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function toSearchText(text) {
  return normalizeText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+|\n+|;+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 5);
}

function splitDocumentBlocks(text) {
  const lines = normalizeText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks = [];
  let currentBlock = "";

  for (const line of lines) {
    const searchableLine = toSearchText(line);
    const isHeading =
      /^(\d+\.|bai\s+\d+|chuong\s+\d+|phan\s+\d+|muc\s+\d+)/i.test(
        searchableLine
      ) || line.length <= 90;

    if (
      currentBlock &&
      (isHeading || currentBlock.length + line.length > 700)
    ) {
      blocks.push(currentBlock.trim());
      currentBlock = line;
      continue;
    }

    currentBlock = currentBlock ? `${currentBlock} ${line}` : line;
  }

  if (currentBlock) {
    blocks.push(currentBlock.trim());
  }

  return blocks.filter((block) => block.length >= 8);
}

function isFrontMatterBlock(block) {
  const searchable = toSearchText(block);

  return (
    searchable.includes("muc luc") ||
    searchable.includes("de tai") ||
    searchable.includes("thanh vien") ||
    searchable.includes("giang vien") ||
    searchable.includes("truong dai hoc") ||
    searchable.includes("bo giao duc") ||
    /^(\d+(\.\d+)*\s+)?(phan|chuong|bai|muc)\s+\d+/i.test(searchable) ||
    /^\d+(\.\d+)*\s+[a-z\s]+?\s+\d{1,3}$/i.test(searchable) ||
    /^[A-ZÀ-Ỹ0-9\s().:-]{8,100}$/.test(block)
  );
}

function isContentBlock(block) {
  const searchable = toSearchText(block);
  const words = searchable.split(/\s+/).filter(Boolean);
  const hasContentSignal =
    /la|gom|bao gom|nham|giup|cho phep|quan ly|he thong|nguoi dung|yeu cau|duoc su dung|can/i.test(
      searchable
    ) || /[.:;]/.test(block);

  return words.length >= 14 && hasContentSignal && !isFrontMatterBlock(block);
}

function removeFrontMatter(blocks) {
  const firstContentIndex = blocks.findIndex((block, index) => {
    if (index > 28) {
      return true;
    }

    return isContentBlock(block);
  });

  return firstContentIndex > 0 ? blocks.slice(firstContentIndex) : blocks;
}

function extractDocumentKeywords(text, limit = 18) {
  const stopWords = new Set([
    "dang",
    "duoc",
    "nhung",
    "trong",
    "ngoai",
    "phan",
    "muc",
    "chuong",
    "bang",
    "hinh",
    "trang",
    "tai",
    "lieu",
    "cua",
    "cho",
    "voi",
    "cac",
    "mot",
    "nay",
    "qua",
    "the",
    "can",
    "lam",
    "thuc",
    "hien",
  ]);
  const counts = new Map();

  toSearchText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word))
    .forEach((word) => {
      counts.set(word, (counts.get(word) || 0) + 1);
    });

  return [...counts.entries()]
    .sort((firstItem, secondItem) => secondItem[1] - firstItem[1])
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

function scoreDocumentBlock(block, keywords) {
  const searchable = toSearchText(block);
  const keywordScore = keywords.filter((keyword) =>
    searchable.includes(keyword)
  ).length;
  const actionScore = [
    "yeu cau",
    "muc tieu",
    "ket luan",
    "chuc nang",
    "quan ly",
    "nguoi dung",
    "he thong",
    "deadline",
    "nhiem vu",
    "can",
    "phai",
  ].filter((keyword) => searchable.includes(keyword)).length;
  const numberScore = /\d/.test(block) ? 1 : 0;
  const lengthScore = Math.min(Math.floor(block.length / 180), 3);

  return keywordScore + actionScore * 2 + numberScore + lengthScore;
}

function buildDocumentSections(text) {
  const blocks = removeFrontMatter(splitDocumentBlocks(text));
  const contentBlocks = blocks.filter(
    (block, index) =>
      isContentBlock(block) ||
      (index > 0 && block.length >= 90 && !isFrontMatterBlock(block))
  );
  const sourceBlocks = contentBlocks.length > 0
    ? contentBlocks
    : blocks.filter((block) => !isFrontMatterBlock(block));

  return sourceBlocks.slice(0, 14).map((block, index) => {
    const titleMatch = block.match(
      /^((?:\d+(?:\.\d+)*\s+)?[^.!?\n:]{8,90})[:.\n]?/
    );
    const title = (titleMatch?.[1] || `Phần ${index + 1}`)
      .replace(/\s+/g, " ")
      .trim();
    const content = block.replace(titleMatch?.[0] || "", "").trim() || block;

    return {
      index: index + 1,
      title: title.slice(0, 120),
      content,
      preview: content.replace(/\s+/g, " ").slice(0, 500),
    };
  });
}

function buildDocumentChunks(sections) {
  return sections
    .flatMap((section) => {
      const chunks = section.content
        .split(/(?<=[.!?])\s+|\n+/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length >= 40);

      return (chunks.length > 0 ? chunks : [section.content]).map(
        (chunk, index) => ({
          id: `section-${section.index}-chunk-${index + 1}`,
          sectionTitle: section.title,
          text: chunk.slice(0, 900),
          keywords: extractDocumentKeywords(chunk, 8),
        })
      );
    })
    .slice(0, 24);
}

function buildDocumentSummary(text, sections, tasks) {
  const multiKnowledgeSummary = buildMultiKnowledgeTaskSummary(text, tasks);

  if (multiKnowledgeSummary) {
    return multiKnowledgeSummary;
  }

  const knowledgeSummary = buildKnowledgeTaskSummary(text, tasks);

  if (knowledgeSummary) {
    return knowledgeSummary;
  }

  const knowledgeOnlySummary = buildKnowledgeOnlySummary(text);

  if (knowledgeOnlySummary) {
    return knowledgeOnlySummary;
  }

  if (isProgrammingProjectDocument(text)) {
    const topic = inferProgrammingTopic(text);
    const searchable = cleanSearchText(text);
    const mainIdeas = [
      `Đây là tài liệu dự án lập trình về ${topic}.`,
      searchable.includes("mysql") || searchable.includes("co so du lieu")
        ? "Có phần thiết kế/làm việc với cơ sở dữ liệu MySQL."
        : "",
      searchable.includes("cli") || searchable.includes("menu")
        ? "Có phần xây dựng giao diện dòng lệnh hoặc menu điều hướng."
        : "",
      searchable.includes("dang ky") || searchable.includes("tra cuu")
        ? "Có chức năng nghiệp vụ như đăng ký, tra cứu hoặc quản lý thông tin."
        : "",
      "Phần lời cảm ơn/mở đầu/kết luận chỉ là bối cảnh, không nên dùng làm task chính.",
    ].filter(Boolean);

    return {
      overview: `Tài liệu này nên được xử lý như một dự án phần mềm: đọc yêu cầu, thiết kế dữ liệu, xây chức năng, kiểm thử và hoàn thiện báo cáo.`,
      mainIdeas,
      keyDetails: [
        "Ưu tiên các yêu cầu kỹ thuật như database, menu, chức năng CRUD/tra cứu/đăng ký, kiểm thử.",
        "Không lấy lời cảm ơn, bìa, mục lục hoặc kết luận làm tên task.",
        "Tên task cần ngắn; chi tiết triển khai đưa vào mô tả hoặc checklist.",
      ],
      nextActions: [
        `Thiết kế Database cho ${topic}`,
        `Xây dựng luồng chức năng chính của ${topic}`,
        `Kiểm thử và hoàn thiện báo cáo ${topic}`,
      ],
    };
  }

  if (sections.length === 0) {
    return {
      overview:
        "Tài liệu chưa có đủ nội dung văn bản để tạo tóm tắt chi tiết.",
      mainIdeas: [],
      keyDetails: [],
      nextActions: [],
    };
  }

  const keywords = extractDocumentKeywords(text, 12);
  const rankedSections = [...sections]
    .map((section) => ({
      ...section,
      score: scoreDocumentBlock(section.content, keywords),
    }))
    .sort((firstSection, secondSection) => secondSection.score - firstSection.score);
  const mainIdeas = rankedSections
    .slice(0, 7)
    .map((section) => `${section.title}: ${section.preview}`);
  const keyDetails = rankedSections
    .filter((section) =>
      /\d|deadline|hạn|yêu cầu|mục tiêu|chức năng|người dùng|quản lý/i.test(
        section.content
      )
    )
    .slice(0, 6)
    .map((section) => section.preview);
  const nextActions = Array.isArray(tasks) && tasks.length > 0
    ? tasks.slice(0, 5).map((task) => task.title || task.description)
    : [
        "Đọc các phần nội dung chính và đánh dấu điểm chưa hiểu.",
        "Tách yêu cầu/chức năng/action item thành checklist nhỏ.",
        "Tạo task hoặc lịch nhắc cho phần cần hoàn thành.",
      ];

  return {
    overview: mainIdeas[0] || sections[0].preview,
    mainIdeas,
    keyDetails,
    nextActions,
  };
}

function containsKeyword(text, keywords) {
  const searchable = toSearchText(text);

  return keywords.some((keyword) =>
    searchable.includes(toSearchText(keyword))
  );
}

function countKeywords(text, keywords) {
  const searchable = toSearchText(text);

  return keywords.filter((keyword) =>
    searchable.includes(toSearchText(keyword))
  ).length;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function createDate(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return "";
  }

  return toIsoDate(date);
}

function isValidIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  return createDate(match[1], match[2], match[3]) === value;
}

function isBadTaskTitle(title) {
  const normalized = toSearchText(title);
  const words = normalized.split(/\s+/).filter(Boolean);
  const rawTitle = String(title || "");

  if (words.length < 2 || normalized.length < 8) {
    return true;
  }

  if (words.length > 12 || String(title || "").length > 90) {
    return true;
  }

  const hasBlockedPhrase = [
    "cuoc hop",
    "thoi",
    "hoan thanh la",
    "khong co nhiem vu",
    "khong co nguoi phu trach",
    "khong co thoi gian",
    "khong co deadline",
    "ma nhan vien",
    "ho va ten",
    "ngay sinh",
    "phong ban",
    "chuc vu",
  ].some((phrase) => normalized === phrase || normalized.includes(phrase));

  if (hasBlockedPhrase) {
    return true;
  }

  if (
    /\s\|\s/.test(rawTitle) ||
    /^(kpi|quản lý|quan ly|dữ liệu|du lieu|thông tin|thong tin)\s+là\b/i.test(rawTitle) ||
    /\b(là|la)\s+(hệ thống|he thong|quy trình|quy trinh|tài liệu|tai lieu|một|mot)\b/i.test(rawTitle)
  ) {
    return true;
  }

  return false;
}

function isInformationalSentence(sentence) {
  const searchable = cleanSearchText(sentence);

  if (hasNoActionSignal(sentence)) {
    return true;
  }

  const definitionSignals = [
    " la ",
    " la mot ",
    " la qua trinh ",
    " la he thong ",
    " bao gom ",
    " duoc su dung ",
    " giup ",
    " cho phep ",
    " nham ",
    " co the gom ",
    " thuong lien quan ",
  ];
  const actionSignals = [
    "can ",
    "phai ",
    "yeu cau ",
    "han ",
    "deadline",
    "nop",
    "gui",
    "cap nhat",
    "bo sung",
    "kiem tra",
    "ra soat",
    "doi chieu",
    "hoan thanh",
    "chuan bi",
    "thiet ke",
    "xay dung",
    "phan cong",
  ];

  return (
    definitionSignals.some((signal) => searchable.includes(signal)) &&
    !actionSignals.some((signal) => searchable.includes(signal))
  );
}

function buildConciseTaskTitle(task) {
  const rawTitle = String(task?.title || "").replace(/\s+/g, " ").trim();
  const merged = cleanSearchText(
    `${rawTitle} ${task?.description || ""} ${task?.sourceText || ""}`
  );

  if (merged.includes("sinh nhat") && merged.includes("ho va ten")) {
    const nameMatch = String(task?.description || task?.sourceText || "").match(
      /họ\s*và\s*tên\s*:\s*([^|,\n]+)/i
    );
    return nameMatch
      ? `Nhắc sinh nhật ${nameMatch[1].trim()}`
      : "Nhắc sinh nhật nhân viên";
  }

  if (merged.includes("hop dong") || merged.includes("contract")) {
    return "Kiểm tra điều khoản hợp đồng";
  }

  if (merged.includes("bien ban hop") || merged.includes("cuoc hop") || merged.includes("hop ngay")) {
    if (merged.includes("gui bao cao") || merged.includes("bao cao tong hop")) {
      return "Kiểm tra và gửi báo cáo";
    }

    return "Kiểm tra việc sau cuộc họp";
  }

  if (merged.includes("kpi")) {
    if (merged.includes("cap nhat") || merged.includes("bo sung") || merged.includes("dien")) {
      return "Cập nhật dữ liệu KPI";
    }

    if (merged.includes("gui") || merged.includes("truong nhom")) {
      return "Gửi file KPI";
    }

    return "Cập nhật dữ liệu KPI";
  }

  if (merged.includes("don hang") || merged.includes("order")) {
    if (merged.includes("cap nhat trang thai")) {
      return "Cập nhật trạng thái đơn hàng";
    }

    return "Rà soát đơn hàng";
  }

  if (merged.includes("mysql") || merged.includes("co so du lieu") || merged.includes("database")) {
    return "Thiết kế database";
  }

  if (merged.includes("cli") || merged.includes("menu")) {
    return "Xây dựng menu chức năng";
  }

  if (merged.includes("python") || merged.includes("code")) {
    return "Hoàn thiện code Python";
  }

  if (merged.includes("bao cao") || merged.includes("tieu luan")) {
    return "Hoàn thiện báo cáo";
  }

  if (merged.includes("thuyet trinh") || merged.includes("slide")) {
    return "Chuẩn bị thuyết trình";
  }

  if (merged.includes("bai tap") || merged.includes("loi giai")) {
    return "Làm lại bài tập";
  }

  if (merged.includes("tu vung") || merged.includes("tieng anh")) {
    return "Ôn từ vựng tiếng Anh";
  }

  return rawTitle;
}

function normalizeTaskChecklist(task) {
  const rawSteps = Array.isArray(task?.suggestedSteps) ? task.suggestedSteps : [];
  const merged = cleanSearchText(
    `${task?.title || ""} ${task?.description || ""} ${task?.sourceText || ""}`
  );
  const fallbackSteps = [];

  if (merged.includes("kpi")) {
    fallbackSteps.push(
      "Kiểm tra các ô dữ liệu KPI còn thiếu",
      "Đối chiếu số liệu với báo cáo phòng ban",
      "Cập nhật trạng thái hoàn thành và số lượng hồ sơ",
      "Gửi file sau khi đã kiểm tra"
    );
  } else if (merged.includes("don hang") || merged.includes("order")) {
    fallbackSteps.push(
      "Kiểm tra trạng thái đơn hàng hiện tại",
      "Đối chiếu tồn kho và thông tin giao hàng",
      "Ghi nhận đơn chậm, sai hoặc cần xử lý",
      "Đề xuất bước xử lý tiếp theo"
    );
  } else if (merged.includes("mysql") || merged.includes("database")) {
    fallbackSteps.push(
      "Xác định các thực thể và bảng dữ liệu",
      "Thiết kế khóa chính, khóa ngoại và quan hệ",
      "Tạo truy vấn hoặc cấu trúc bảng cần thiết",
      "Kiểm thử dữ liệu mẫu"
    );
  } else if (merged.includes("python") || merged.includes("code") || merged.includes("cli")) {
    fallbackSteps.push(
      "Xác định chức năng chính cần code",
      "Tách menu hoặc luồng xử lý thành module nhỏ",
      "Code và kiểm thử từng chức năng",
      "Ghi lại hướng dẫn sử dụng"
    );
  }

  const steps = rawSteps.length > 0 ? rawSteps : fallbackSteps;
  const seen = new Set();

  return steps
    .map((step) => String(step || "").replace(/\s+/g, " ").trim())
    .filter((step) => step && !isInformationalSentence(step))
    .filter((step) => {
      const key = cleanSearchText(step);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function sanitizeTaskForOutput(task) {
  const cleanDate = (value) => (isValidIsoDate(value) ? value : "");
  const originalTitle = String(task?.title || "").replace(/\s+/g, " ").trim();
  const titleNeedsRewrite =
    isBadTaskTitle(originalTitle) ||
    isInformationalSentence(originalTitle) ||
    isStructuredDataRow(originalTitle) ||
    originalTitle.length > 80 ||
    originalTitle.split(/\s+/).filter(Boolean).length > 12;
  const conciseTitle = titleNeedsRewrite ? buildConciseTaskTitle(task) : originalTitle;
  const title = String(conciseTitle || originalTitle).replace(/\s+/g, " ").trim();
  const sourceText = String(task?.sourceText || "");
  const isBirthdayReminder =
    cleanSearchText(title).startsWith("nhac sinh nhat") &&
    (task?.type === "Reminder" || task?.domain === "Human Resources");

  if (
    isBadTaskTitle(title) ||
    isInformationalSentence(originalTitle) ||
    isStructuredDataRow(title) ||
    (!isBirthdayReminder && isStructuredDataRow(sourceText))
  ) {
    return null;
  }

  return {
    ...task,
    title,
    description:
      originalTitle && originalTitle !== title
        ? [task?.description, `Ngữ cảnh gốc: ${originalTitle}`]
            .filter(Boolean)
            .join("\n")
        : task?.description,
    suggestedSteps: normalizeTaskChecklist(task),
    startDate: cleanDate(task?.startDate),
    deadline: cleanDate(task?.deadline),
  };
}

function extractExplicitDate(sentence) {
  const currentYear = new Date().getFullYear();
  const numericPatterns = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(\d{1,2})-(\d{1,2})-(\d{4})/,
  ];

  for (const pattern of numericPatterns) {
    const match = sentence.match(pattern);
    if (match) {
      return createDate(match[3], match[2], match[1]);
    }
  }

  const isoMatch = sentence.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return createDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const vietnameseDateMatch = toSearchText(sentence).match(
    /ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?/
  );

  if (vietnameseDateMatch) {
    return createDate(
      vietnameseDateMatch[3] || currentYear,
      vietnameseDateMatch[2],
      vietnameseDateMatch[1]
    );
  }

  const beforeDateMatch = toSearchText(sentence).match(
    /truoc\s+(?:ngay\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/
  );

  if (beforeDateMatch) {
    return createDate(
      beforeDateMatch[3] || currentYear,
      beforeDateMatch[2],
      beforeDateMatch[1]
    );
  }

  return "";
}

function extractRelativeDate(sentence) {
  const today = new Date();
  const searchable = toSearchText(sentence);

  if (searchable.includes("hom nay")) {
    return toIsoDate(today);
  }

  if (searchable.includes("ngay mai") || /\bmai\b/.test(searchable)) {
    return toIsoDate(addDays(today, 1));
  }

  if (searchable.includes("ngay kia")) {
    return toIsoDate(addDays(today, 2));
  }

  if (searchable.includes("cuoi tuan sau")) {
    const daysUntilSunday = (7 - today.getDay()) % 7;
    return toIsoDate(addDays(today, daysUntilSunday + 7));
  }

  if (searchable.includes("cuoi tuan nay")) {
    const daysUntilSunday = (7 - today.getDay()) % 7;
    return toIsoDate(addDays(today, daysUntilSunday));
  }

  const weekdayMatch = searchable.match(
    /thu\s*([2-7])\s*(tuan\s*(nay|sau))?/
  );

  if (weekdayMatch) {
    const targetDay = Number(weekdayMatch[1]) - 1;
    const currentDay = today.getDay();
    let diff = targetDay - currentDay;

    if (weekdayMatch[3] === "sau") {
      diff += 7;
    } else if (diff < 0) {
      diff += 7;
    }

    return toIsoDate(addDays(today, diff));
  }

  if (searchable.includes("chu nhat tuan sau")) {
    const daysUntilSunday = (7 - today.getDay()) % 7;
    return toIsoDate(addDays(today, daysUntilSunday + 7));
  }

  if (searchable.includes("chu nhat")) {
    const daysUntilSunday = (7 - today.getDay()) % 7;
    return toIsoDate(addDays(today, daysUntilSunday));
  }

  return "";
}

function extractDate(sentence) {
  return extractExplicitDate(sentence) || extractRelativeDate(sentence);
}

function extractTime(sentence) {
  const searchable = toSearchText(sentence);
  const match = searchable.match(
    /\b([01]?\d|2[0-3])(?:[:h]| gio)(?:\s*([0-5]\d))?\b/
  );

  if (!match) {
    return "";
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (
    searchable.includes("chieu") ||
    searchable.includes("toi")
  ) {
    if (hour >= 1 && hour <= 11) {
      hour += 12;
    }
  }

  if (searchable.includes("trua") && hour < 12) {
    hour += 12;
  }

  if (searchable.includes("sang") && hour === 12) {
    hour = 0;
  }

  return `${pad(hour)}:${pad(minute)}`;
}

function extractEndTime(sentence, startTime) {
  const searchable = toSearchText(sentence);
  const rangeMatch = searchable.match(
    /\b([01]?\d|2[0-3])(?:[:h]| gio)(?:\s*[0-5]\d)?\s*(?:-|den|toi)\s*([01]?\d|2[0-3])(?:[:h]| gio)?(?:\s*([0-5]\d))?\b/
  );

  if (!rangeMatch) {
    return "";
  }

  let endHour = Number(rangeMatch[2]);
  const endMinute = Number(rangeMatch[3] || 0);

  if (
    startTime &&
    Number(startTime.slice(0, 2)) >= 12 &&
    endHour <= 11
  ) {
    endHour += 12;
  }

  return `${pad(endHour)}:${pad(endMinute)}`;
}

function detectType(sentence) {
  const searchable = toSearchText(sentence);

  if (containsKeyword(sentence, MEETING_KEYWORDS)) {
    return "Meeting";
  }

  if (
    searchable.includes("assignment") ||
    searchable.includes("bai tap") ||
    searchable.includes("nop")
  ) {
    return "Assignment";
  }

  if (
    searchable.includes("deadline") ||
    /\bhan\b/.test(searchable)
  ) {
    return "Deadline";
  }

  if (
    searchable.includes("hoc") ||
    searchable.includes("on tap")
  ) {
    return "Learning";
  }

  return "Task";
}

function detectCategory(sentence, type) {
  if (type === "Meeting") {
    return "Meeting";
  }

  if (containsKeyword(sentence, STUDY_KEYWORDS)) {
    return "Study";
  }

  if (containsKeyword(sentence, WORK_KEYWORDS)) {
    return "Work";
  }

  return "Study";
}

function detectDifficulty(sentence) {
  if (countKeywords(sentence, HIGH_DIFFICULTY_KEYWORDS) >= 1) {
    return "Khó";
  }

  if (countKeywords(sentence, MEDIUM_DIFFICULTY_KEYWORDS) >= 1) {
    return "Trung bình";
  }

  return "Dễ";
}

function daysUntil(deadline) {
  if (!deadline) {
    return null;
  }

  const today = new Date();
  const deadlineDate = new Date(`${deadline}T00:00:00`);
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return Math.ceil(
    (deadlineDate.getTime() - todayDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function detectNecessity(sentence, deadline) {
  if (countKeywords(sentence, HIGH_NECESSITY_KEYWORDS) >= 1) {
    return "Cao";
  }

  const remainingDays = daysUntil(deadline);
  if (remainingDays !== null && remainingDays <= 2) {
    return "Cao";
  }

  if (
    deadline ||
    countKeywords(sentence, MEDIUM_NECESSITY_KEYWORDS) >= 1
  ) {
    return "Trung bình";
  }

  return "Thấp";
}

function detectPriority(difficulty, necessity, deadline) {
  const difficultyScore = {
    Dễ: 1,
    "Trung bình": 2,
    Khó: 3,
  };

  const necessityScore = {
    Thấp: 1,
    "Trung bình": 2,
    Cao: 3,
  };

  let score =
    (difficultyScore[difficulty] || 1) +
    (necessityScore[necessity] || 1);

  const remainingDays = daysUntil(deadline);
  if (remainingDays !== null && remainingDays <= 1) {
    score += 2;
  } else if (remainingDays !== null && remainingDays <= 3) {
    score += 1;
  }

  if (score >= 5) {
    return "Cao";
  }

  if (score >= 3) {
    return "Trung bình";
  }

  return "Thấp";
}

function detectTaskDomain(sentence) {
  const searchable = toSearchText(sentence);

  if (
    searchable.includes("machine learning") ||
    searchable.includes("mo hinh") ||
    /\bai\b/.test(searchable)
  ) {
    return "Machine Learning";
  }

  if (
    searchable.includes("database") ||
    searchable.includes("co so du lieu")
  ) {
    return "Database";
  }

  if (
    searchable.includes("tieng anh") ||
    searchable.includes("english")
  ) {
    return "English";
  }

  if (containsKeyword(sentence, MEETING_KEYWORDS)) {
    return "Meeting";
  }

  if (containsKeyword(sentence, WORK_KEYWORDS)) {
    return "Work";
  }

  return "General";
}

function createSuggestedSteps(domain, type) {
  if (domain === "Machine Learning") {
    return [
      "Đọc và xác định yêu cầu nhiệm vụ",
      "Xác định bài toán và dữ liệu cần dùng",
      "Chuẩn bị, làm sạch và kiểm tra dữ liệu",
      "Xây dựng hoặc điều chỉnh mô hình",
      "Đánh giá kết quả và ghi nhận nhận xét",
      "Hoàn thiện báo cáo hoặc phần nộp",
    ];
  }

  if (domain === "Database") {
    return [
      "Đọc kỹ yêu cầu dữ liệu",
      "Xác định bảng, trường và quan hệ cần xử lý",
      "Thiết kế hoặc kiểm tra cơ sở dữ liệu",
      "Thực hiện truy vấn hoặc nội dung báo cáo",
      "Kiểm tra kết quả trước khi nộp",
    ];
  }

  if (domain === "English") {
    return [
      "Xác định chủ đề và yêu cầu chính",
      "Tổng hợp từ vựng hoặc ý chính cần dùng",
      "Chuẩn bị nội dung tiếng Anh",
      "Luyện nói, viết hoặc phát âm",
      "Kiểm tra và hoàn thiện trước deadline",
    ];
  }

  if (domain === "Meeting" || type === "Meeting") {
    return [
      "Kiểm tra thời gian và địa điểm cuộc họp",
      "Xác định nội dung cần trao đổi",
      "Chuẩn bị tài liệu hoặc câu hỏi liên quan",
      "Tham gia cuộc họp đúng giờ",
      "Ghi lại action items sau cuộc họp",
    ];
  }

  if (type === "Assignment") {
    return [
      "Đọc kỹ yêu cầu bài tập",
      "Chia nhỏ các phần cần làm",
      "Thực hiện từng phần theo mức ưu tiên",
      "Kiểm tra lỗi và hoàn thiện",
      "Nộp bài trước deadline",
    ];
  }

  return [
    "Xác định mục tiêu công việc",
    "Đọc và kiểm tra yêu cầu",
    "Chia nhỏ nhiệm vụ cần làm",
    "Thực hiện từng phần",
    "Kiểm tra kết quả và cập nhật trạng thái",
  ];
}

function cleanTitle(sentence) {
  return sentence
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, "")
    .replace(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?/g, "")
    .replace(/\b([01]?\d|2[0-3])(?:[:h]| giờ)(?:\s*[0-5]\d)?\b/gi, "")
    .replace(/\b(trước ngày|ngày|lúc|vào lúc|deadline|hạn)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim()
    .slice(0, 120);
}

function extractBetterTitle(sentence, domain, type) {
  const searchable = toSearchText(sentence);

  if (domain === "Machine Learning") {
    if (searchable.includes("do an")) {
      return "Đồ án Machine Learning";
    }

    if (searchable.includes("bao cao")) {
      return "Báo cáo Machine Learning";
    }

    return "Machine Learning";
  }

  if (domain === "Database") {
    if (searchable.includes("bao cao")) {
      return "Báo cáo cơ sở dữ liệu";
    }

    if (searchable.includes("bai tap")) {
      return "Bài tập cơ sở dữ liệu";
    }

    return "Cơ sở dữ liệu";
  }

  if (domain === "English") {
    if (
      searchable.includes("thuyet trinh") ||
      searchable.includes("presentation")
    ) {
      return "Bài thuyết trình tiếng Anh";
    }

    return "Tiếng Anh";
  }

  if (type === "Meeting") {
    return searchable.includes("nhom") ? "Họp nhóm" : "Cuộc họp";
  }

  const title = cleanTitle(sentence);
  return title || "Nhiệm vụ từ tài liệu";
}

function detectDocumentPurpose(text) {
  const searchable = toSearchText(text);

  const englishVocabularySignals = [
    "tu vung tieng anh",
    "vocabulary",
    "cum tu",
    "topic:",
    "travel",
    "du lich",
    "phat am",
  ];

  if (
    englishVocabularySignals.filter((keyword) =>
      searchable.includes(toSearchText(keyword))
    ).length >= 3
  ) {
    return "ENGLISH_VOCABULARY";
  }

  if (containsKeyword(text, MEETING_KEYWORDS)) {
    return "MEETING_DOCUMENT";
  }

  if (searchable.includes("email") || searchable.includes("kinh gui")) {
    return "WORK_EMAIL";
  }

  if (searchable.includes("ke hoach") || searchable.includes("du an")) {
    return "PROJECT_PLAN";
  }

  if (containsKeyword(text, STUDY_KEYWORDS)) {
    return "STUDY_DOCUMENT";
  }

  return "GENERAL_TASK_DOCUMENT";
}

function createLearningTaskFromDocument(text) {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "";

  return {
    id: "learning-task-1",
    title: toSearchText(firstLine).includes("travel")
      ? "Học từ vựng tiếng Anh chủ đề Travel / Du lịch"
      : "Học nội dung trong tài liệu",
    description:
      "Ôn tập nội dung trong tài liệu, ghi nhớ ý chính, cách dùng và luyện áp dụng theo ngữ cảnh.",
    category: "Study",
    type: "Learning",
    domain: "English",
    difficulty: "Trung bình",
    necessity: "Trung bình",
    priority: "Trung bình",
    startDate: "",
    deadline: "",
    startTime: "",
    endTime: "",
    estimate: "Chọn thời gian",
    reminder: "Không nhắc",
    assignee: "Tôi",
    status: "To do",
    completed: false,
    suggestedSteps: [
      "Đọc toàn bộ nội dung tài liệu",
      "Chia nội dung thành các nhóm nhỏ",
      "Ghi nhớ ý chính và ví dụ quan trọng",
      "Tự kiểm tra lại bằng câu hỏi ngắn",
      "Ôn lại các phần chưa chắc",
    ],
    sourceText: text.slice(0, 1000),
  };
}

function extractAfterColon(text) {
  return String(text || "")
    .split(":")
    .slice(1)
    .join(":")
    .trim();
}

function trimTrailingTaskContext(text) {
  return String(text || "")
    .replace(
      /\s*(hạn cuối|yêu cầu hoàn thành|người học|người phụ trách|thời gian bắt đầu|nên bắt đầu|deadline)\b.*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function findSentenceBySignal(text, signal) {
  return splitSentences(text).find((sentence) =>
    cleanSearchText(sentence).includes(signal)
  );
}

function extractKnowledgeTaskSpec(text) {
  const normalizedText = normalizeText(text);
  const searchable = cleanSearchText(normalizedText);

  if (
    !searchable.includes("tai lieu kien thuc") ||
    !searchable.includes("nhiem vu lien quan")
  ) {
    return null;
  }

  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const topicLine = lines.find((line) =>
    cleanSearchText(line).startsWith("tai lieu kien thuc")
  );
  const topic = trimTrailingTaskContext(
    extractAfterColon(topicLine) || lines[0] || "nội dung trong tài liệu"
  );
  const taskSentence = findSentenceBySignal(normalizedText, "nhiem vu lien quan");
  const taskTitle = trimTrailingTaskContext(
    extractAfterColon(taskSentence) || `Học nội dung ${topic}`
  );
  const deadline = extractDate(normalizedText);
  const startTime = extractClockTime(normalizedText) || extractTime(normalizedText);

  return {
    topic,
    taskTitle,
    deadline,
    startTime,
  };
}

function extractClockTime(text) {
  const searchable = toSearchText(text);
  const contextualMatch = searchable.match(
    /(?:bat dau|luc|gio|tu)\D{0,40}([01]?\d|2[0-3]):([0-5]\d)\b/
  );
  const anyClockMatch = searchable.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const match = contextualMatch || anyClockMatch;

  if (!match) {
    return "";
  }

  return `${pad(match[1])}:${pad(match[2])}`;
}

function extractKnowledgeOnlySpec(text) {
  const normalizedText = normalizeText(text);
  const searchable = cleanSearchText(normalizedText);

  if (
    !searchable.includes("tai lieu kien thuc") ||
    searchable.includes("nhiem vu lien quan") ||
    searchable.includes("nhiem vu 1")
  ) {
    return null;
  }

  if (
    !searchable.includes("khong co deadline") &&
    !searchable.includes("khong co nhiem vu") &&
    !searchable.includes("chi giai thich")
  ) {
    return null;
  }

  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const topicLine = lines.find((line) =>
    cleanSearchText(line).startsWith("tai lieu kien thuc")
  );
  const topic = trimTrailingTaskContext(
    extractAfterColon(topicLine) || lines[0] || "nội dung trong tài liệu"
  );

  return {
    topic,
  };
}

function extractMultiKnowledgeTaskSpecs(text) {
  const normalizedText = normalizeText(text);
  const searchable = cleanSearchText(normalizedText);

  if (!searchable.includes("nhiem vu 1")) {
    return [];
  }

  return splitSentences(normalizedText)
    .filter((sentence) => /nhiệm\s*vụ\s*\d+/i.test(sentence))
    .map((sentence, index) => {
      const title = trimTrailingTaskContext(
        sentence
          .replace(/^.*?nhiệm\s*vụ\s*\d+\s*:\s*/i, "")
          .replace(/\s*,\s*(hạn|deadline|hoàn thành|bắt đầu)\b.*$/i, "")
      );

      return {
        index: index + 1,
        title,
        deadline: extractDate(sentence),
        startTime: extractClockTime(sentence) || extractTime(sentence),
        sourceText: sentence,
      };
    })
    .filter((spec) => spec.title);
}

function extractMultiKnowledgeTopics(text) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const topics = lines
    .filter((line) => /^phần\s*\d+\s*[-:]/i.test(line))
    .map((line) =>
      line
        .replace(/^phần\s*\d+\s*[-:]\s*/i, "")
        .replace(/:$/g, "")
        .trim()
    )
    .filter(Boolean);

  if (topics.length > 0) {
    return topics;
  }

  return extractMultiKnowledgeTaskSpecs(text)
    .map((spec) =>
      spec.title
        .replace(/^(ôn tập kiến thức|chuẩn bị slide thuyết trình|làm bài tập|tổng hợp|cập nhật|đặt lịch|lập kế hoạch|kiểm tra)\s+/i, "")
        .trim()
    )
    .filter(Boolean);
}

function createMultiKnowledgeTasksFromDocument(text) {
  const specs = extractMultiKnowledgeTaskSpecs(text);

  return specs.map((spec) => {
    const domainInfo = detectKnowledgeTaskDomain(
      {
        topic: spec.title,
        taskTitle: spec.title,
      },
      text
    );
    const startTime =
      spec.startTime || chooseStudyTime({ title: spec.title }, spec.index - 1);
    const minutes = estimateMinutes({ title: spec.title });

    return {
      id: `knowledge-task-${spec.index}`,
      title: spec.title,
      description: `Người dùng cần ${spec.title}.`,
      category: domainInfo.category,
      type: domainInfo.type,
      domain: domainInfo.domain,
      difficulty: domainInfo.category === "Work" ? "Trung bình" : "Dễ",
      necessity: spec.deadline ? "Trung bình" : "Thấp",
      priority: spec.deadline ? "Trung bình" : "Thấp",
      startDate: spec.deadline || "",
      deadline: spec.deadline || "",
      startTime,
      endTime: startTime ? addMinutes(startTime, minutes) : "",
      estimate: minutes >= 120 ? "2 giờ" : "1 giờ",
      reminder: spec.deadline ? "Trước 1 ngày" : "Trước 10 phút",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: createSuggestedSteps(domainInfo.domain, domainInfo.type),
      sourceText: spec.sourceText,
    };
  });
}

function detectKnowledgeTaskDomain(spec, text) {
  const searchable = cleanSearchText(
    `${spec?.topic || ""} ${spec?.taskTitle || ""} ${text}`
  );

  if (
    searchable.includes("bao cao") ||
    searchable.includes("kpi") ||
    searchable.includes("file") ||
    searchable.includes("chi phi") ||
    searchable.includes("tong hop") ||
    searchable.includes("van phong")
  ) {
    return {
      category: "Work",
      domain: "Work",
      type: searchable.includes("bao cao") ? "Report" : "Task",
    };
  }

  if (
    searchable.includes("kham") ||
    searchable.includes("suc khoe") ||
    searchable.includes("ho so ca nhan")
  ) {
    return {
      category: "Personal",
      domain: "Personal",
      type: searchable.includes("lich") ? "Appointment" : "Task",
    };
  }

  return {
    category: "Study",
    domain: searchable.includes("tieng anh") ? "English" : "General",
    type: "Learning",
  };
}

function createKnowledgeTaskFromDocument(text) {
  const spec = extractKnowledgeTaskSpec(text);

  if (!spec?.taskTitle) {
    return null;
  }

  const domainInfo = detectKnowledgeTaskDomain(spec, text);
  const startTime =
    spec.startTime || chooseStudyTime({ title: spec.taskTitle }, 0);
  const startDate = spec.deadline || "";
  const minutes = estimateMinutes({ title: spec.taskTitle });

  return {
    id: "knowledge-task-1",
    title: spec.taskTitle,
    description: `Dựa trên tài liệu về ${spec.topic}, người dùng cần ${spec.taskTitle}.`,
    category: domainInfo.category,
    type: domainInfo.type,
    domain: domainInfo.domain,
    difficulty: domainInfo.category === "Work" ? "Trung bình" : "Dễ",
    necessity: spec.deadline ? "Trung bình" : "Thấp",
    priority: spec.deadline ? "Trung bình" : "Thấp",
    startDate,
    deadline: spec.deadline || "",
    startTime,
    endTime: startTime ? addMinutes(startTime, minutes) : "",
    estimate: minutes >= 120 ? "2 giờ" : "1 giờ",
    reminder: spec.deadline ? "Trước 1 ngày" : "Trước 10 phút",
    assignee: "Tôi",
    status: "To do",
    completed: false,
    suggestedSteps: createSuggestedSteps(domainInfo.domain, domainInfo.type),
    sourceText: normalizeText(text).slice(0, 1000),
  };
}

function formatDisplayDate(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return "";
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function buildKnowledgeTaskSummary(text, tasks = []) {
  const spec = extractKnowledgeTaskSpec(text);

  if (!spec) {
    return null;
  }

  const contentSentences = splitSentences(text)
    .filter((sentence) => {
      const searchable = cleanSearchText(sentence);
      return (
        !searchable.includes("tai lieu kien thuc") &&
        !searchable.includes("nhiem vu lien quan") &&
        !searchable.includes("thoi gian bat dau") &&
        !searchable.includes("han cuoi") &&
        !searchable.includes("yeu cau hoan thanh")
      );
    })
    .slice(0, 3);
  const deadlinePart = spec.deadline
    ? ` trước ngày ${formatDisplayDate(spec.deadline)}`
    : "";
  const timePart = spec.startTime
    ? ` Thời gian bắt đầu gợi ý là ${spec.startTime}.`
    : "";
  const overview = `Tài liệu cung cấp kiến thức về ${spec.topic} và yêu cầu ${spec.taskTitle}${deadlinePart}.${timePart}`;

  return {
    overview,
    mainIdeas: contentSentences,
    keyDetails: [
      spec.deadline ? `Deadline: ${formatDisplayDate(spec.deadline)}` : "",
      spec.startTime ? `Giờ bắt đầu gợi ý: ${spec.startTime}` : "",
    ].filter(Boolean),
    nextActions:
      Array.isArray(tasks) && tasks.length > 0
        ? tasks.slice(0, 3).map((task) => task.title || task.description)
        : [spec.taskTitle],
  };
}

function buildKnowledgeOnlySummary(text) {
  const spec = extractKnowledgeOnlySpec(text);

  if (!spec) {
    return null;
  }

  const contentSentences = splitSentences(text)
    .filter((sentence) => {
      const searchable = cleanSearchText(sentence);
      return (
        !searchable.includes("tai lieu kien thuc") &&
        !searchable.includes("khong co deadline") &&
        !searchable.includes("khong co nhiem vu") &&
        !searchable.includes("chi giai thich")
      );
    })
    .slice(0, 3);

  return {
    overview: `Tài liệu cung cấp kiến thức về ${spec.topic}, nhưng không có nhiệm vụ cụ thể cần tạo lịch.`,
    mainIdeas: contentSentences,
    keyDetails: [],
    nextActions: [
      "Có thể đọc để hiểu nội dung, nhưng chưa cần tạo Task List/Calendar nếu người dùng chưa yêu cầu.",
    ],
  };
}

function buildMultiKnowledgeTaskSummary(text, tasks = []) {
  const specs = extractMultiKnowledgeTaskSpecs(text);

  if (specs.length === 0) {
    return null;
  }

  const topics = extractMultiKnowledgeTopics(text).slice(0, specs.length);
  const deadlineList = specs
    .map((spec) => formatDisplayDate(spec.deadline))
    .filter(Boolean)
    .join(" và ");
  const topicText =
    topics.length > 0 ? topics.join(" và ") : specs.map((spec) => spec.title).join(" và ");
  const overview = deadlineList
    ? `Tài liệu gồm kiến thức về ${topicText}. Có ${specs.length} nhiệm vụ cần tạo lịch với deadline lần lượt là ${deadlineList}.`
    : `Tài liệu gồm kiến thức về ${topicText}. Có ${specs.length} nhiệm vụ cần tạo lịch.`;

  return {
    overview,
    mainIdeas: specs.map((spec) => {
      const parts = [spec.title];
      if (spec.deadline) {
        parts.push(`deadline ${formatDisplayDate(spec.deadline)}`);
      }
      if (spec.startTime) {
        parts.push(`bắt đầu ${spec.startTime}`);
      }
      return parts.join(" - ");
    }),
    keyDetails: [],
    nextActions:
      Array.isArray(tasks) && tasks.length > 0
        ? tasks.map((task) => task.title || task.description).slice(0, 5)
        : specs.map((spec) => spec.title),
  };
}

function isStructuredDataRow(sentence) {
  const text = String(sentence || "");
  const searchable = cleanSearchText(text);
  const separators = (text.match(/\s\|\s|,|;/g) || []).length;
  const fieldLabels = [
    "ma nhan vien",
    "ho va ten",
    "ngay sinh",
    "phong ban",
    "chuc vu",
    "doanh thu",
    "so luong",
    "trang thai",
    "chi nhanh",
    "san pham",
  ].filter((label) => searchable.includes(label)).length;

  return (
    (separators >= 2 && fieldLabels >= 2) ||
    (/^[A-Z]{1,5}\d{2,}/i.test(text.trim()) && fieldLabels >= 1)
  );
}

function hasActionVerb(sentence) {
  const searchable = cleanSearchText(sentence);
  return [
    "cap nhat",
    "bo sung",
    "dien",
    "gui",
    "nop",
    "hoan thanh",
    "kiem tra",
    "doi soat",
    "ra soat",
    "chuan bi",
    "thiet ke",
    "xay dung",
    "code",
    "sua",
    "fix",
    "bao cao",
    "nhac",
    "hop",
    "lam",
    "hoc",
    "on",
  ].some((verb) => searchable.includes(verb));
}

function hasTaskIntentSignal(sentence) {
  const searchable = cleanSearchText(sentence);

  return [
    "nhiem vu",
    "viec can lam",
    "can ",
    "phai ",
    "yeu cau ",
    "han ",
    "deadline",
    "lich",
    "nhac",
    "cap nhat",
    "bo sung",
    "dien",
    "gui",
    "nop",
    "hoan thanh",
    "kiem tra",
    "doi soat",
    "ra soat",
    "chuan bi",
    "thiet ke",
    "xay dung",
    "thuc hien",
    "bao cao",
    "bai tap",
    "du an",
    "thuyet trinh",
    "hop",
    "lam",
    "hoc",
    "on",
  ].some((signal) => searchable.includes(signal));
}

function hasNoActionSignal(text) {
  const searchable = cleanSearchText(text);
  return [
    "khong co nhiem vu",
    "khong co deadline",
    "khong co nguoi phu trach",
    "khong co thoi gian",
    "chua giao nguoi xu ly",
    "chua co yeu cau xu ly",
    "chi mo ta khai niem",
    "chi la khai niem",
    "chi dung de tham khao",
    "chi la tai lieu tham khao",
    "du lieu thong ke hien trang",
    "chua giao",
  ].some((signal) => searchable.includes(signal));
}

function shouldCreateTask(sentence) {
  if (isStructuredDataRow(sentence)) {
    return false;
  }

  if (isInformationalSentence(sentence)) {
    return false;
  }

  if (hasNoActionSignal(sentence)) {
    return false;
  }

  if (
    (containsKeyword(sentence, TASK_KEYWORDS) || hasTaskIntentSignal(sentence)) &&
    hasActionVerb(sentence)
  ) {
    return true;
  }

  return (Boolean(extractDate(sentence)) || Boolean(extractTime(sentence))) && hasActionVerb(sentence);
}

function createTaskFromSentence(sentence, index) {
  const deadline = extractDate(sentence);
  const startTime = extractTime(sentence);
  const endTime = extractEndTime(sentence, startTime);
  const type = detectType(sentence);
  const domain = detectTaskDomain(sentence);
  const category = detectCategory(sentence, type);
  const difficulty = detectDifficulty(sentence);
  const necessity = detectNecessity(sentence, deadline);
  const priority = detectPriority(difficulty, necessity, deadline);

  return {
    id: `extracted-${index + 1}`,
    title: extractBetterTitle(sentence, domain, type),
    description: sentence,
    category,
    type,
    domain,
    difficulty,
    necessity,
    priority,
    startDate: deadline,
    deadline,
    startTime,
    endTime,
    estimate: "Chọn thời gian",
    reminder:
      necessity === "Cao"
        ? "Trước 1 ngày"
        : type === "Meeting"
        ? "Trước 10 phút"
        : "Không nhắc",
    assignee: "Tôi",
    status: "To do",
    completed: false,
    suggestedSteps: createSuggestedSteps(domain, type),
    sourceText: sentence,
  };
}

function isKpiUpdateNotice(text, file) {
  const searchable = cleanSearchText(text);
  const fileName = cleanSearchText(file?.originalname || "");
  const hasKpi = searchable.includes("kpi") || fileName.includes("kpi");
  const hasUpdateSignal =
    searchable.includes("cap nhat") ||
    searchable.includes("bo sung") ||
    searchable.includes("dien") ||
    searchable.includes("file") ||
    searchable.includes("truong nhom") ||
    searchable.includes("gui");

  return hasKpi && hasUpdateSignal;
}

function isReferenceProcessDocument(text, file) {
  const searchable = cleanSearchText(text);
  const fileName = cleanSearchText(file?.originalname || "");
  const processSignals = [
    "quy trinh",
    "nghiep vu",
    "tham khao",
    "quan ly don hang",
    "don hang",
    "tiep nhan",
    "xac nhan",
    "kiem kho",
    "dieu phoi",
    "doi tra",
    "trang thai giao hang",
    "ton kho",
  ];
  const negativeActionSignals = [
    "khong co nhiem vu",
    "khong co deadline",
    "khong co nguoi phu trach",
    "khong co thoi gian",
    "chi la tai lieu tham khao",
    "tai lieu tham khao",
  ];
  const processScore = processSignals.filter((signal) =>
    searchable.includes(signal)
  ).length;
  const hasNegativeActionSignal = negativeActionSignals.some((signal) =>
    searchable.includes(signal)
  );

  return (
    processScore >= 3 ||
    (fileName.includes("quan ly don hang") && processScore >= 1) ||
    (hasNegativeActionSignal && processScore >= 1)
  );
}

function isTransportContractDocument(text, file) {
  const searchable = cleanSearchText(text);
  const fileName = cleanSearchText(file?.originalname || "");
  const definitionOnly =
    (searchable.includes("chi mo ta khai niem") ||
      searchable.includes("chua co yeu cau xu ly") ||
      searchable.includes("chi la khai niem") ||
      searchable.includes("phan nay chi mo ta"));

  if (definitionOnly) {
    return false;
  }

  return (
    (searchable.includes("hop dong") || fileName.includes("hop dong")) &&
    (searchable.includes("van chuyen") ||
      searchable.includes("don hang") ||
      searchable.includes("noi thanh") ||
      searchable.includes("giao hang") ||
      searchable.includes("ben a") ||
      searchable.includes("ben b"))
  );
}

function extractAllIsoDates(text) {
  return splitSentences(text)
    .flatMap((sentence) => {
      const dates = [];
      const numericPatterns = [
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
        /(\d{1,2})-(\d{1,2})-(\d{4})/g,
      ];

      for (const pattern of numericPatterns) {
        for (const match of sentence.matchAll(pattern)) {
          dates.push(createDate(match[3], match[2], match[1]));
        }
      }

      return dates;
    })
    .filter(Boolean)
    .sort();
}

function createKpiUpdateTasks(text) {
  const searchable = cleanSearchText(text);
  const preview = normalizeText(text).slice(0, 1200);
  const dates = extractAllIsoDates(text);
  const deadline = dates[dates.length - 1] || addPlannedDays(1);
  const startDate =
    dates.find((date) => date < deadline) || addPlannedDays(0);
  const hasSendAction =
    searchable.includes("gui") ||
    searchable.includes("nop") ||
    searchable.includes("truong nhom") ||
    searchable.includes("leader");

  const tasks = [
    {
      id: "kpi-update-1",
      title: "Cập nhật dữ liệu KPI tháng 6",
      description:
        "Hoàn thiện dữ liệu KPI theo thông báo, tập trung vào các ô còn trống, trạng thái hoàn thành và số lượng hồ sơ/số liệu liên quan.",
      category: "Work",
      type: "Task",
      domain: "KPI",
      difficulty: "Trung bình",
      necessity: "Cao",
      priority: "Cao",
      startDate,
      deadline,
      startTime: "09:00",
      endTime: "10:30",
      estimate: "1 giờ 30 phút",
      reminder: "Trước 1 ngày",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: [
        "Mở file KPI tháng 6 và kiểm tra các ô còn trống",
        "Bổ sung trạng thái hoàn thành và số lượng hồ sơ/số liệu",
        "Đối chiếu dữ liệu với báo cáo hoặc thông tin phòng ban",
        "Rà soát lỗi thiếu, trùng hoặc sai định dạng trước khi gửi",
      ],
      sourceText: preview,
    },
  ];

  if (hasSendAction) {
    tasks.push({
      id: "kpi-update-2",
      title: "Gửi file KPI cho Trưởng nhóm",
      description:
        "Gửi file KPI sau khi đã cập nhật và đối chiếu xong, sau đó theo dõi phản hồi xác nhận.",
      category: "Work",
      type: "Task",
      domain: "KPI",
      difficulty: "Dễ",
      necessity: "Trung bình",
      priority: "Trung bình",
      startDate: deadline,
      deadline,
      startTime: "16:00",
      endTime: "16:30",
      estimate: "30 phút",
      reminder: "Trước 30 phút",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: [
        "Kiểm tra file lần cuối trước khi gửi",
        "Gửi file KPI cho Trưởng nhóm hoặc người phụ trách",
        "Ghi nhận thời điểm đã gửi",
        "Theo dõi phản hồi/xác nhận sau khi gửi",
      ],
      sourceText: preview,
    });
  }

  return tasks;
}

function createReferenceProcessTasks(text) {
  const searchable = cleanSearchText(text);
  const preview = normalizeText(text).slice(0, 1200);
  const isOrderProcess =
    searchable.includes("don hang") ||
    searchable.includes("quan ly don hang");

  if (!isOrderProcess) {
    return [
      {
        id: "reference-process-1",
        title: "Nghiên cứu quy trình nghiệp vụ",
        description:
          "Đọc hiểu tài liệu tham khảo, rút ra các bước nghiệp vụ chính và ghi lại điểm cần áp dụng.",
        category: "Work",
        type: "Task",
        domain: "Business Process",
        difficulty: "Dễ",
        necessity: "Thấp",
        priority: "Thấp",
        startDate: addPlannedDays(0),
        deadline: addPlannedDays(0),
        startTime: "09:00",
        endTime: "10:00",
        estimate: "1 giờ",
        reminder: "Không nhắc",
        assignee: "Tôi",
        status: "To do",
        completed: false,
        suggestedSteps: [
          "Đọc mục tiêu và phạm vi tài liệu",
          "Gạch các bước nghiệp vụ chính",
          "Ghi lại điểm cần áp dụng hoặc cần hỏi thêm",
        ],
        sourceText: preview,
      },
    ];
  }

  return [
    {
      id: "order-process-reference-1",
      title: "Nghiên cứu quy trình Quản lý đơn hàng",
      description:
        "Đọc hiểu quy trình quản lý đơn hàng và ghi lại các điểm cần áp dụng trong vận hành.",
      category: "Work",
      type: "Task",
      domain: "Order Management",
      difficulty: "Dễ",
      necessity: "Trung bình",
      priority: "Trung bình",
      startDate: addPlannedDays(0),
      deadline: addPlannedDays(0),
      startTime: "09:00",
      endTime: "10:00",
      estimate: "1 giờ",
      reminder: "Không nhắc",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: [
        "Đọc hiểu các bước: Tiếp nhận, xác nhận, kiểm kho, điều phối, đổi trả",
        "Ghi lại các trạng thái đơn hàng cần theo dõi",
        "Lưu ý việc cập nhật trạng thái đúng hạn để tránh sai lệch báo cáo",
      ],
      sourceText: preview,
    },
    {
      id: "order-process-reference-2",
      title: "Rà soát dữ liệu đơn hàng định kỳ",
      description:
        "Kiểm tra lại trạng thái giao hàng và dữ liệu tồn kho theo quy trình nghiệp vụ nội bộ.",
      category: "Work",
      type: "Task",
      domain: "Order Management",
      difficulty: "Dễ",
      necessity: "Thấp",
      priority: "Thấp",
      startDate: addPlannedDays(3),
      deadline: addPlannedDays(3),
      startTime: "09:00",
      endTime: "09:45",
      estimate: "45 phút",
      reminder: "Không nhắc",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: [
        "Kiểm tra trạng thái đơn hàng đang mở",
        "Đối chiếu tồn kho với trạng thái xử lý",
        "Ghi lại đơn hàng chậm cập nhật hoặc cần xác minh",
      ],
      sourceText: preview,
    },
  ];
}

function createTransportContractTasks(text) {
  const preview = normalizeText(text).slice(0, 1200);
  const dates = extractAllIsoDates(text);
  const deadline = dates[0] || "";
  const searchable = cleanSearchText(text);
  const hasPayment =
    searchable.includes("thanh toan") ||
    searchable.includes("chi phi") ||
    searchable.includes("hoa don") ||
    searchable.includes("cong no");
  const hasKpi =
    searchable.includes("kpi") ||
    searchable.includes("sla") ||
    searchable.includes("trang thai") ||
    searchable.includes("cap nhat");

  return [
    {
      id: "transport-contract-1",
      title: "Kiểm tra điều khoản vận chuyển",
      description:
        "Rà soát phạm vi dịch vụ, trách nhiệm Bên A/B, quy trình tiếp nhận và cập nhật trạng thái đơn hàng trong hợp đồng.",
      category: "Work",
      type: "Task",
      domain: "Contract",
      difficulty: "Trung bình",
      necessity: "Cao",
      priority: "Cao",
      startDate: deadline,
      deadline,
      startTime: "",
      endTime: "",
      estimate: "1 giờ",
      reminder: deadline ? "Trước 1 ngày" : "Không nhắc",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: [
        "Đọc phạm vi dịch vụ vận chuyển",
        "Đánh dấu trách nhiệm của từng bên",
        "Kiểm tra quy định cập nhật trạng thái đơn hàng",
        "Ghi lại điều khoản cần hỏi lại hoặc xác nhận",
      ],
      sourceText: preview,
    },
    hasPayment
      ? {
          id: "transport-contract-2",
          title: "Đối soát điều khoản thanh toán",
          description:
            "Kiểm tra cách tính phí, hóa đơn, công nợ và điều kiện thanh toán trong hợp đồng vận chuyển.",
          category: "Work",
          type: "Task",
          domain: "Contract",
          difficulty: "Trung bình",
          necessity: "Cao",
          priority: "Cao",
          startDate: "",
          deadline: "",
          startTime: "",
          endTime: "",
          estimate: "45 phút",
          reminder: "Không nhắc",
          assignee: "Tôi",
          status: "To do",
          completed: false,
          suggestedSteps: [
            "Tìm điều khoản thanh toán",
            "Kiểm tra thời hạn thanh toán và chứng từ cần có",
            "Đánh dấu chi phí/phụ phí nếu có",
            "Ghi câu hỏi cần xác nhận với đối tác",
          ],
          sourceText: preview,
        }
      : null,
    hasKpi
      ? {
          id: "transport-contract-3",
          title: "Rà soát KPI vận chuyển",
          description:
            "Rà soát KPI/SLA hoặc yêu cầu cập nhật trạng thái đơn hàng để tránh vi phạm cam kết vận hành.",
          category: "Work",
          type: "Task",
          domain: "Contract",
          difficulty: "Trung bình",
          necessity: "Trung bình",
          priority: "Trung bình",
          startDate: "",
          deadline: "",
          startTime: "",
          endTime: "",
          estimate: "45 phút",
          reminder: "Không nhắc",
          assignee: "Tôi",
          status: "To do",
          completed: false,
          suggestedSteps: [
            "Tìm các chỉ số KPI/SLA trong hợp đồng",
            "Ghi lại mốc cập nhật trạng thái cần tuân thủ",
            "Xác định rủi ro nếu cập nhật chậm",
            "Đề xuất cách theo dõi định kỳ",
          ],
          sourceText: preview,
        }
      : null,
  ].filter(Boolean);
}

function dedupeTasks(tasks) {
  const seen = new Set();

  return tasks.filter((task) => {
    const key = toSearchText(
      `${task.title}-${task.deadline}-${task.startTime}`
    );

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function addPlannedDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function getNextAnnualDate(day, month) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const candidate = new Date(currentYear, Number(month) - 1, Number(day));
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  if (candidate < todayDate) {
    candidate.setFullYear(currentYear + 1);
  }

  return toIsoDate(candidate);
}

function extractEmployeeBirthdayRows(text) {
  return String(text || "")
    .split(/\n|(?=Mã nhân viên\s*:)|(?=Ma nhan vien\s*:)/i)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line, index) => {
      const nameMatch = line.match(
        /(?:Họ\s*và\s*tên|Ho\s*va\s*ten|Tên|Ten)\s*:\s*([^|,\n]+)/i
      );
      const birthdayMatch = line.match(
        /(?:Ngày\s*sinh|Ngay\s*sinh)\s*:\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i
      );

      if (!nameMatch || !birthdayMatch) {
        return null;
      }

      const employeeId =
        line.match(/(?:Mã\s*nhân\s*viên|Ma\s*nhan\s*vien)\s*:\s*([^|,\n]+)/i)?.[1]?.trim() ||
        "";
      const department =
        line.match(/(?:Phòng\s*ban|Phong\s*ban)\s*:\s*([^|,\n]+)/i)?.[1]?.trim() ||
        "";
      const role =
        line.match(/(?:Chức\s*vụ|Chuc\s*vu)\s*:\s*([^|,\n]+)/i)?.[1]?.trim() ||
        "";
      const day = birthdayMatch[1].padStart(2, "0");
      const month = birthdayMatch[2].padStart(2, "0");
      const birthYear = birthdayMatch[3] || "";

      return {
        id: employeeId || `birthday-${index + 1}`,
        name: nameMatch[1].trim(),
        employeeId,
        department,
        role,
        birthdayText: `${day}/${month}${birthYear ? `/${birthYear}` : ""}`,
        nextBirthday: getNextAnnualDate(day, month),
        sourceText: line,
      };
    })
    .filter(Boolean);
}

function isEmployeeBirthdayList(text) {
  const searchable = cleanSearchText(text);
  const rows = extractEmployeeBirthdayRows(text);
  const hasBirthdayListSignal =
    searchable.includes("danh sach sinh nhat") ||
    searchable.includes("lich sinh nhat") ||
    searchable.includes("nhac sinh nhat") ||
    searchable.includes("sinh nhat nhan vien");

  return (
    (searchable.includes("ngay sinh") || searchable.includes("sinh nhat")) &&
    (searchable.includes("ho va ten") || searchable.includes("nhan vien")) &&
    rows.length > 0 &&
    (rows.length >= 2 || hasBirthdayListSignal)
  );
}

function createEmployeeBirthdayReminderTasks(text) {
  return extractEmployeeBirthdayRows(text)
    .map((person) => ({
      id: `birthday-${cleanSearchText(person.id || person.name).replace(/\s+/g, "-")}`,
      title: `Nhắc sinh nhật ${person.name}`,
      description: [
        `Sinh nhật: ${person.birthdayText}.`,
        person.employeeId ? `Mã nhân viên: ${person.employeeId}.` : "",
        person.department ? `Phòng ban: ${person.department}.` : "",
        person.role ? `Chức vụ: ${person.role}.` : "",
        `Nguồn dữ liệu: ${person.sourceText}`,
      ]
        .filter(Boolean)
        .join("\n"),
      category: "Work",
      type: "Reminder",
      domain: "Human Resources",
      difficulty: "Dễ",
      necessity: "Trung bình",
      priority: "Trung bình",
      startDate: person.nextBirthday,
      deadline: person.nextBirthday,
      startTime: "09:00",
      endTime: "09:15",
      estimate: "15 phút",
      reminder: "Trước 1 ngày",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: [
        "Kiểm tra lại thông tin ngày sinh trong file gốc.",
        "Chuẩn bị lời chúc hoặc thông báo nội bộ nếu cần.",
        "Cập nhật trạng thái sau khi đã nhắc/chúc mừng.",
      ],
      sourceText: person.sourceText,
    }))
    .slice(0, 8);
}

function cleanSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Ä‘/g, "d");
}

function countExerciseSections(text) {
  return normalizeText(text)
    .split("\n")
    .filter((line) => /^\s*(bài|bai)\s*\d+/i.test(line.trim())).length;
}

function isExerciseDocument(text) {
  const searchable = cleanSearchText(text);
  const exerciseCount = countExerciseSections(text);
  const exerciseSignals = [
    "bai tap",
    "loi giai",
    "dap an",
    "dung",
    "sai",
    "phuong phap so dem",
    "tap hop",
    "ham",
  ];

  return (
    exerciseCount >= 3 ||
    (exerciseCount >= 1 &&
      exerciseSignals.filter((signal) => searchable.includes(signal)).length >= 2)
  );
}

function isPresentationDocument(text) {
  const searchable = cleanSearchText(text);
  const signals = [
    "thuyet trinh",
    "presentation",
    "slide",
    "mo dau",
    "ket luan",
    "k-means",
    "clustering",
    "bao cao mieng",
  ];

  return (
    !isExerciseDocument(text) &&
    signals.filter((signal) => searchable.includes(signal)).length >= 2
  );
}

function isProgrammingProjectDocument(text, file) {
  const searchable = cleanSearchText(text);
  const fileName = cleanSearchText(file?.originalname || "");
  const technicalSignals = [
    "python",
    "mysql",
    "sql",
    "database",
    "co so du lieu",
    "cli",
    "menu",
    "crud",
    "dang ky",
    "tra cuu",
    "mssv",
    "sinh vien",
    "ma khoa",
    "lap trinh",
    "source code",
    "he thong",
    "phan mem",
    "chuc nang",
  ];
  const technicalScore = technicalSignals.filter((signal) =>
    searchable.includes(signal)
  ).length;

  return (
    technicalScore >= 3 ||
    ((fileName.includes("python") ||
      fileName.includes("lap trinh") ||
      fileName.includes("phan mem")) &&
      technicalScore >= 1)
  );
}

function isStudyTheoryDocument(text, file) {
  const searchable = cleanSearchText(text);
  const fileName = cleanSearchText(file?.originalname || "");

  if (isProgrammingProjectDocument(text, file)) {
    return false;
  }

  const studySignals = [
    "ly thuyet",
    "chuong",
    "bai hoc",
    "cau ",
    "vat ly",
    "hoa hoc",
    "sinh hoc",
    "toan hoc",
    "tin hoc",
    "ky thuat",
    "cong nghe thong tin",
    "lap trinh",
    "thuat toan",
    "anh sang",
    "tan sac",
    "thau kinh",
    "lang kinh",
    "khuc xa",
    "song anh sang",
    "cong thuc",
    "dinh nghia",
    "karnaugh",
    "k-map",
    "k map",
    "boolean",
    "logic",
    "ham boolean",
    "mach so",
    "bieu do",
    "bien trong ham",
    "toi gian",
    "bang chan tri",
  ];
  const officeSignals = [
    "doanh thu",
    "khach hang",
    "nhan vien",
    "hop dong",
    "hoa don",
    "cong no",
    "phong ban",
    "du an",
    "ke hoach kinh doanh",
  ];
  const studyScore = studySignals.filter((signal) =>
    searchable.includes(signal)
  ).length;
  const officeScore = officeSignals.filter((signal) =>
    searchable.includes(signal)
  ).length;
  const fileNameLooksStudy =
    fileName.includes("ly thuyet") ||
    fileName.includes("chuong") ||
    fileName.includes("bai hoc") ||
    fileName.includes("vat ly") ||
    fileName.includes("hoa hoc") ||
    fileName.includes("sinh hoc") ||
    fileName.includes("karnaugh") ||
    fileName.includes("k-map") ||
    fileName.includes("boolean") ||
    fileName.includes("logic") ||
    fileName.includes("mach so");

  return (
    !isExerciseDocument(text) &&
    !isPresentationDocument(text) &&
    (studyScore >= 2 || fileNameLooksStudy) &&
    officeScore === 0
  );
}

function inferPresentationTopic(text) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine =
    lines.find((line) => /k-?means|clustering|thuyết trình|thuyet trinh|presentation/i.test(line)) ||
    lines[0] ||
    "bài thuyết trình";

  if (/k-?means/i.test(titleLine)) {
    return "K-Means Clustering";
  }

  return titleLine
    .replace(/thuyết trình|thuyet trinh|presentation/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "bài thuyết trình";
}

function createPlannedTask({
  id,
  title,
  description,
  startDate,
  startTime,
  endTime,
  priority,
  difficulty,
  suggestedSteps,
  sourceText,
}) {
  return {
    id,
    title,
    description,
    category: "Study",
    type: "Task",
    domain: "Presentation",
    difficulty,
    necessity: "Trung bình",
    priority,
    startDate,
    deadline: startDate,
    startTime,
    endTime,
    estimate: "1-2 giờ",
    reminder: "Trước 1 ngày",
    assignee: "Tôi",
    status: "To do",
    completed: false,
    suggestedSteps,
    sourceText,
  };
}

function createPresentationPlanTasks(text) {
  const topic = inferPresentationTopic(text);
  const preview = normalizeText(text).slice(0, 1200);

  return [
    createPlannedTask({
      id: "presentation-plan-1",
      title: `Chốt dàn ý thuyết trình ${topic}`,
      description:
        "Đọc lại tài liệu, xác định mục tiêu bài nói và chia nội dung thành các phần chính.",
      startDate: addPlannedDays(0),
      startTime: "19:00",
      endTime: "20:00",
      priority: "Cao",
      difficulty: "Trung bình",
      suggestedSteps: [
        "Xác định người nghe và thời lượng trình bày",
        "Chia bài nói thành mở đầu, nội dung chính và kết luận",
        "Chọn 3-5 ý quan trọng nhất cần nhấn mạnh",
        "Loại bỏ các đoạn quá dài hoặc trùng ý",
      ],
      sourceText: preview,
    }),
    createPlannedTask({
      id: "presentation-plan-2",
      title: `Chuẩn bị slide và ví dụ cho ${topic}`,
      description:
        "Chuyển nội dung tài liệu thành slide ngắn gọn, có ví dụ hoặc hình minh họa dễ hiểu.",
      startDate: addPlannedDays(1),
      startTime: "19:00",
      endTime: "21:00",
      priority: "Cao",
      difficulty: "Khó",
      suggestedSteps: [
        "Tạo slide tiêu đề và mục lục",
        "Mỗi ý chính đưa vào 1-2 slide ngắn",
        "Thêm ví dụ minh họa hoặc sơ đồ nếu cần",
        "Kiểm tra font, màu, bố cục và lỗi chính tả",
      ],
      sourceText: preview,
    }),
    createPlannedTask({
      id: "presentation-plan-3",
      title: `Luyện nói thuyết trình ${topic}`,
      description:
        "Tập trình bày theo thời lượng mong muốn, kiểm tra mạch nói và cách chuyển ý.",
      startDate: addPlannedDays(2),
      startTime: "20:00",
      endTime: "21:00",
      priority: "Trung bình",
      difficulty: "Trung bình",
      suggestedSteps: [
        "Đọc thử toàn bộ bài nói một lần",
        "Bấm giờ để kiểm tra thời lượng",
        "Ghi chú những đoạn nói chưa tự nhiên",
        "Luyện lại phần mở đầu và kết luận",
      ],
      sourceText: preview,
    }),
    createPlannedTask({
      id: "presentation-plan-4",
      title: `Rà soát lần cuối bài thuyết trình ${topic}`,
      description:
        "Kiểm tra slide, nội dung nói, câu hỏi có thể gặp và chuẩn bị file trước buổi trình bày.",
      startDate: addPlannedDays(3),
      startTime: "19:30",
      endTime: "20:30",
      priority: "Trung bình",
      difficulty: "Dễ",
      suggestedSteps: [
        "Kiểm tra file slide mở được bình thường",
        "Chuẩn bị bản dự phòng hoặc file PDF",
        "Tự đặt 3 câu hỏi có thể bị hỏi",
        "Sắp xếp tài liệu cần mang theo",
      ],
      sourceText: preview,
    }),
  ];
}

function inferStudyTopic(text) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine =
    lines.find((line) => /^chuong|^chương|phuong phap|phương pháp/i.test(line)) ||
    lines[0] ||
    "tài liệu học tập";

  return titleLine.replace(/\s+/g, " ").trim();
}

function createExercisePlanTasks(text) {
  const topic = inferStudyTopic(text);
  const preview = normalizeText(text).slice(0, 1200);

  return [
    createPlannedTask({
      id: "exercise-plan-1",
      title: `Đọc và phân loại bài tập ${topic}`,
      description:
        "Xác định đây là tài liệu bài tập/lời giải, đánh dấu bài đã hiểu, bài chưa chắc và bài cần hỏi lại.",
      startDate: addPlannedDays(0),
      startTime: "19:00",
      endTime: "20:00",
      priority: "Cao",
      difficulty: "Trung bình",
      suggestedSteps: [
        "Đọc tiêu đề chương và danh sách bài",
        "Đánh dấu bài đã hiểu, bài chưa hiểu và bài cần hỏi lại",
        "Tách các bài giống dạng thành từng nhóm",
        "Ghi lại câu hỏi hoặc lỗi sai thường gặp",
      ],
      sourceText: preview,
    }),
    createPlannedTask({
      id: "exercise-plan-2",
      title: `Làm lại các bài chưa chắc trong ${topic}`,
      description:
        "Tự làm lại các bài/câu chưa chắc trước khi nhìn đáp án hoặc lời giải.",
      startDate: addPlannedDays(1),
      startTime: "19:00",
      endTime: "21:00",
      priority: "Cao",
      difficulty: "Khó",
      suggestedSteps: [
        "Chọn 3-5 bài/câu chưa chắc nhất",
        "Viết lại cách làm từng bài theo từng bước",
        "So sánh với đáp án/lời giải trong tài liệu",
        "Ghi chú phần sai hoặc phần cần hỏi giảng viên/bạn bè",
      ],
      sourceText: preview,
    }),
    createPlannedTask({
      id: "exercise-plan-3",
      title: `Tóm tắt công thức và dạng bài ${topic}`,
      description:
        "Rút ra công thức, định nghĩa, dạng bài và mẹo nhận diện để ôn lại nhanh.",
      startDate: addPlannedDays(2),
      startTime: "20:00",
      endTime: "21:00",
      priority: "Trung bình",
      difficulty: "Trung bình",
      suggestedSteps: [
        "Ghi các khái niệm/công thức chính",
        "Mỗi dạng bài ghi 1 ví dụ mẫu",
        "Viết checklist nhận diện dạng bài",
        "Tạo 5 câu tự kiểm tra ngắn",
      ],
      sourceText: preview,
    }),
    createPlannedTask({
      id: "exercise-plan-4",
      title: `Ôn kiểm tra nhanh ${topic}`,
      description:
        "Làm lại một số câu đại diện để kiểm tra đã thật sự hiểu hay chưa.",
      startDate: addPlannedDays(3),
      startTime: "19:30",
      endTime: "20:30",
      priority: "Trung bình",
      difficulty: "Dễ",
      suggestedSteps: [
        "Chọn mỗi dạng bài 1 câu đại diện",
        "Tự làm không nhìn đáp án",
        "Kiểm tra lại kết quả và lý do sai",
        "Chốt danh sách phần cần ôn thêm",
      ],
      sourceText: preview,
    }),
  ];
}

function createGeneralStudyPlanTasks(text) {
  const topic = inferStudyTopic(text);
  const preview = normalizeText(text).slice(0, 1200);

  return [
    createPlannedTask({
      id: "study-plan-1",
      title: `Đọc hiểu tài liệu ${topic}`,
      description:
        "Đọc tài liệu để xác định ý chính, khái niệm quan trọng và phần cần xử lý tiếp.",
      startDate: addPlannedDays(0),
      startTime: "19:00",
      endTime: "20:00",
      priority: "Cao",
      difficulty: "Trung bình",
      suggestedSteps: [
        "Đọc lướt toàn bộ tài liệu",
        "Gạch các tiêu đề và ý chính",
        "Đánh dấu phần chưa hiểu",
        "Ghi câu hỏi cần hỏi lại",
      ],
      sourceText: preview,
    }),
    createPlannedTask({
      id: "study-plan-2",
      title: `Tóm tắt và ghi chú ${topic}`,
      description:
        "Chuyển nội dung tài liệu thành ghi chú ngắn để dễ ôn tập hoặc làm việc tiếp.",
      startDate: addPlannedDays(1),
      startTime: "20:00",
      endTime: "21:00",
      priority: "Trung bình",
      difficulty: "Trung bình",
      suggestedSteps: [
        "Tóm tắt mỗi mục thành 3-5 ý",
        "Ghi ví dụ hoặc dữ kiện quan trọng",
        "Tách việc cần làm nếu tài liệu có yêu cầu hành động",
        "Kiểm tra lại phần còn thiếu",
      ],
      sourceText: preview,
    }),
  ];
}

function inferProgrammingTopic(text) {
  const searchable = cleanSearchText(text);

  if (searchable.includes("python")) {
    if (searchable.includes("sinh vien") || searchable.includes("mssv")) {
      return "hệ thống quản lý sinh viên bằng Python";
    }

    return "dự án Python";
  }

  if (searchable.includes("mysql") || searchable.includes("co so du lieu")) {
    return "hệ thống cơ sở dữ liệu";
  }

  return "dự án phần mềm";
}

function createTechnicalProjectTask({
  id,
  title,
  description,
  startOffset,
  startTime,
  endTime,
  priority,
  difficulty,
  steps,
  sourceText,
}) {
  return {
    id,
    title,
    description,
    category: "Study",
    type: "Task",
    domain: "Software Project",
    difficulty,
    necessity: "Cao",
    priority,
    startDate: addPlannedDays(startOffset),
    deadline: addPlannedDays(startOffset),
    startTime,
    endTime,
    estimate: "1-2 giờ",
    reminder: "Trước 1 ngày",
    assignee: "Tôi",
    status: "To do",
    completed: false,
    suggestedSteps: steps,
    sourceText,
  };
}

function createProgrammingProjectPlanTasks(text) {
  const topic = inferProgrammingTopic(text);
  const searchable = cleanSearchText(text);
  const preview = normalizeText(text).slice(0, 1200);
  const hasMySql = searchable.includes("mysql") || searchable.includes("co so du lieu");
  const hasCli = searchable.includes("cli") || searchable.includes("menu");
  const hasRegistration =
    searchable.includes("dang ky") ||
    searchable.includes("tra cuu") ||
    searchable.includes("mssv");

  return [
    hasMySql
      ? createTechnicalProjectTask({
          id: "programming-project-1",
          title: "Thiết kế Database MySQL",
          description: `Xác định bảng, khóa chính/khóa ngoại và dữ liệu cần lưu cho ${topic}.`,
          startOffset: 0,
          startTime: "19:00",
          endTime: "20:30",
          priority: "Cao",
          difficulty: "Khó",
          steps: [
            "Liệt kê các thực thể chính trong đề tài",
            "Thiết kế bảng và trường dữ liệu cần có",
            "Xác định khóa chính, khóa ngoại và quan hệ",
            "Tạo script SQL và dữ liệu mẫu để test",
          ],
          sourceText: preview,
        })
      : null,
    hasCli
      ? createTechnicalProjectTask({
          id: "programming-project-2",
          title: "Xây dựng CLI điều hướng",
          description: `Code menu điều hướng để người dùng thao tác với các chức năng chính của ${topic}.`,
          startOffset: 1,
          startTime: "19:00",
          endTime: "20:30",
          priority: "Cao",
          difficulty: "Trung bình",
          steps: [
            "Xác định danh sách menu cần có",
            "Code vòng lặp nhận lựa chọn người dùng",
            "Điều hướng từng lựa chọn tới đúng hàm xử lý",
            "Bẫy lỗi nhập sai lựa chọn",
          ],
          sourceText: preview,
        })
      : null,
    hasRegistration
      ? createTechnicalProjectTask({
          id: "programming-project-3",
          title: "Code chức năng Đăng ký",
          description:
            "Hoàn thiện luồng đăng ký/tra cứu dữ liệu theo mã sinh viên hoặc khóa học trong hệ thống.",
          startOffset: 2,
          startTime: "19:00",
          endTime: "21:00",
          priority: "Cao",
          difficulty: "Khó",
          steps: [
            "Xác định input bắt buộc của chức năng",
            "Kiểm tra dữ liệu tồn tại trong database",
            "Ghi dữ liệu đăng ký hoặc trả kết quả tra cứu",
            "Xử lý trường hợp trùng, thiếu hoặc sai dữ liệu",
          ],
          sourceText: preview,
        })
      : null,
    createTechnicalProjectTask({
      id: "programming-project-4",
      title: "Kiểm thử hệ thống",
      description:
        "Chạy thử toàn bộ luồng chính, kiểm tra lỗi nhập liệu, lỗi database và kết quả hiển thị.",
      startOffset: 3,
      startTime: "20:00",
      endTime: "21:00",
      priority: "Trung bình",
      difficulty: "Trung bình",
      steps: [
        "Tạo dữ liệu mẫu để test",
        "Test từng menu/chức năng chính",
        "Ghi lại lỗi phát sinh và cách sửa",
        "Chạy lại sau khi sửa để xác nhận",
      ],
      sourceText: preview,
    }),
    createTechnicalProjectTask({
      id: "programming-project-5",
      title: "Hoàn thiện báo cáo",
      description:
        "Bổ sung hướng dẫn sử dụng, mô tả chức năng, hình ảnh minh họa và chỉnh sửa các phần mở đầu/kết luận.",
      startOffset: 4,
      startTime: "19:30",
      endTime: "20:30",
      priority: "Trung bình",
      difficulty: "Dễ",
      steps: [
        "Viết hướng dẫn chạy chương trình",
        "Chụp màn hình các chức năng chính",
        "Bổ sung mô tả database và luồng xử lý",
        "Rà soát lời cảm ơn, kết luận và định dạng báo cáo",
      ],
      sourceText: preview,
    }),
  ].filter(Boolean);
}

function inferDocumentTitle(text) {
  const firstLine =
    normalizeText(text)
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "tài liệu";

  return firstLine.replace(/\s+/g, " ").slice(0, 90);
}

function detectActionDocumentType(text, file) {
  const searchable = cleanSearchText(text);
  const fileName = cleanSearchText(file?.originalname || "");

  if (isEmployeeBirthdayList(text)) {
    return "EMPLOYEE_BIRTHDAY_LIST";
  }

  if (/\.(xlsx|xls|csv)$/i.test(file?.originalname || "")) {
    return "SPREADSHEET_DATA";
  }

  if (isTransportContractDocument(text, file)) {
    return "TRANSPORT_CONTRACT_DOCUMENT";
  }

  if (isKpiUpdateNotice(text, file)) {
    return "KPI_UPDATE_NOTICE";
  }

  if (isReferenceProcessDocument(text, file)) {
    return "REFERENCE_PROCESS_DOCUMENT";
  }

  if (isProgrammingProjectDocument(text, file)) {
    return "";
  }

  if (isStudyTheoryDocument(text, file)) {
    return "";
  }

  if (
    searchable.includes("bien ban hop") ||
    searchable.includes("minutes") ||
    (containsKeyword(text, MEETING_KEYWORDS) &&
      (searchable.includes("action item") ||
        searchable.includes("nguoi phu trach") ||
        searchable.includes("noi dung hop") ||
        searchable.includes("ket luan")))
  ) {
    return "MEETING_MINUTES_DOCUMENT";
  }

  if (
    searchable.includes("email") ||
    searchable.includes("kinh gui") ||
    searchable.includes("dear ") ||
    searchable.includes("subject:") ||
    searchable.includes("from:") ||
    searchable.includes("to:")
  ) {
    return "WORK_EMAIL_DOCUMENT";
  }

  if (
    searchable.includes("ke hoach") ||
    searchable.includes("du an") ||
    searchable.includes("milestone") ||
    searchable.includes("timeline") ||
    searchable.includes("deliverable") ||
    fileName.includes("project")
  ) {
    return "PROJECT_PLAN_DOCUMENT";
  }

  if (
    searchable.includes("bao cao") ||
    searchable.includes("tong ket") ||
    searchable.includes("phan tich") ||
    searchable.includes("chi so") ||
    searchable.includes("doanh thu") ||
    searchable.includes("ket qua")
  ) {
    return "BUSINESS_REPORT_DOCUMENT";
  }

  if (
    searchable.includes("hop dong") ||
    searchable.includes("chinh sach") ||
    searchable.includes("quy dinh") ||
    searchable.includes("dieu khoan") ||
    searchable.includes("phap ly")
  ) {
    return "POLICY_OR_CONTRACT_DOCUMENT";
  }

  if (
    searchable.includes("nhan vien") ||
    searchable.includes("phong ban") ||
    searchable.includes("ung vien") ||
    searchable.includes("luong") ||
    searchable.includes("cham cong")
  ) {
    return "HR_DOCUMENT";
  }

  if (
    searchable.includes("hoa don") ||
    searchable.includes("ngan sach") ||
    searchable.includes("chi phi") ||
    searchable.includes("cong no") ||
    searchable.includes("thanh toan")
  ) {
    return "FINANCE_DOCUMENT";
  }

  return "";
}

function createOfficeTask({
  id,
  title,
  description,
  domain,
  startOffset,
  startTime,
  priority = "Trung bình",
  difficulty = "Trung bình",
  steps,
  sourceText,
}) {
  const startDate = addPlannedDays(startOffset);
  const duration = difficulty === "Khó" ? 120 : 60;

  return {
    id,
    title,
    description,
    category: "Work",
    type: "Task",
    domain,
    difficulty,
    necessity: priority === "Cao" ? "Cao" : "Trung bình",
    priority,
    startDate,
    deadline: startDate,
    startTime,
    endTime: addMinutes(startTime, duration),
    estimate: duration >= 120 ? "2 giờ" : "1 giờ",
    reminder: "Trước 30 phút",
    assignee: "Tôi",
    status: "To do",
    completed: false,
    suggestedSteps: steps,
    sourceText,
  };
}

function createOfficeWorkflowTasks(text, documentType) {
  const topic = inferDocumentTitle(text);
  const preview = normalizeText(text).slice(0, 1200);

  if (documentType === "MEETING_MINUTES_DOCUMENT") {
    const searchable = cleanSearchText(text);
    const meetingTasks = [];

    if (searchable.includes("kiem tra")) {
      meetingTasks.push(
        createOfficeTask({
          id: "meeting-action-check-1",
          title: "Kiểm tra hồ sơ trễ hạn",
          description:
            "Kiểm tra danh sách hồ sơ trễ hạn hoặc các nội dung được kết luận trong cuộc họp.",
          domain: "Meeting",
          startOffset: 0,
          startTime: "09:00",
          priority: "Cao",
          steps: [
            "Mở lại biên bản họp và xác định danh sách cần kiểm tra",
            "Đối chiếu hồ sơ trễ hạn với dữ liệu hiện có",
            "Ghi lại điểm thiếu hoặc cần bổ sung",
          ],
          sourceText: preview,
        })
      );
    }

    if (searchable.includes("gui bao cao") || searchable.includes("bao cao tong hop")) {
      meetingTasks.push(
        createOfficeTask({
          id: "meeting-action-report-1",
          title: "Gửi báo cáo tổng hợp",
          description:
            "Chuẩn bị và gửi báo cáo tổng hợp theo kết luận cuộc họp, ưu tiên đúng deadline đã nêu.",
          domain: "Meeting",
          startOffset: 1,
          startTime: extractTime(text) || "09:00",
          priority: "Cao",
          steps: [
            "Tổng hợp kết quả kiểm tra hồ sơ",
            "Soạn báo cáo ngắn gọn theo nội dung cuộc họp",
            "Gửi báo cáo cho người/bộ phận liên quan",
          ],
          sourceText: preview,
        })
      );
    }

    if (meetingTasks.length > 0) {
      const deadline = extractDate(text);
      return meetingTasks.map((task) => ({
        ...task,
        startDate: deadline || task.startDate,
        deadline: deadline || task.deadline,
      }));
    }
  }

  const presets = {
    MEETING_MINUTES_DOCUMENT: {
      domain: "Meeting",
      titles: [
        `Tổng hợp action items từ ${topic}`,
        `Tạo lịch nhắc cho các việc sau họp`,
        `Theo dõi tiến độ sau họp`,
      ],
      steps: [
        ["Đọc kết luận cuộc họp", "Liệt kê người phụ trách", "Tách deadline và việc cần làm", "Xác nhận lại việc chưa rõ"],
        ["Chọn việc có hạn gần", "Đặt reminder theo deadline", "Thêm lịch họp/nhắc việc nếu cần", "Kiểm tra trùng lịch"],
        ["Cập nhật trạng thái từng action item", "Nhắc lại người phụ trách", "Ghi chú rủi ro hoặc việc bị chậm"],
      ],
    },
    WORK_EMAIL_DOCUMENT: {
      domain: "Email",
      titles: [
        `Xác định yêu cầu chính trong email ${topic}`,
        `Chuẩn bị phản hồi hoặc việc cần xử lý`,
        `Đặt lịch nhắc theo hạn trong email`,
      ],
      steps: [
        ["Xác định người gửi và mục đích email", "Gạch yêu cầu chính", "Tìm hạn phản hồi/hạn xử lý", "Đánh dấu thông tin cần hỏi lại"],
        ["Soạn nội dung phản hồi", "Chuẩn bị file hoặc dữ liệu liên quan", "Kiểm tra người nhận CC/BCC", "Gửi hoặc lưu nháp"],
        ["Tìm ngày giờ trong email", "Tạo reminder trước hạn", "Theo dõi trạng thái đã phản hồi/chưa phản hồi"],
      ],
    },
    PROJECT_PLAN_DOCUMENT: {
      domain: "Project",
      titles: [
        `Tách milestone và deliverable từ ${topic}`,
        `Lập lịch thực hiện cho dự án`,
        `Theo dõi rủi ro và việc cần xác nhận`,
      ],
      steps: [
        ["Đọc mục tiêu dự án", "Liệt kê milestone", "Tách deliverable thành task", "Xác định phụ thuộc giữa các việc"],
        ["Ưu tiên milestone gần nhất", "Gán ngày bắt đầu và deadline", "Đặt reminder cho mốc quan trọng", "Kiểm tra nguồn lực cần có"],
        ["Ghi rủi ro", "Ghi việc cần hỏi lại", "Cập nhật tiến độ định kỳ"],
      ],
    },
    BUSINESS_REPORT_DOCUMENT: {
      domain: "Report",
      titles: [
        `Tóm tắt insight chính từ ${topic}`,
        `Rút hành động cần làm từ báo cáo`,
        `Chuẩn bị phần trình bày hoặc gửi báo cáo`,
      ],
      steps: [
        ["Đọc mục tiêu báo cáo", "Gạch số liệu/kết luận quan trọng", "Tìm điểm bất thường", "Viết tóm tắt 5 dòng"],
        ["Chuyển insight thành việc cần làm", "Ưu tiên việc ảnh hưởng cao", "Gán người xử lý nếu có", "Đặt deadline theo mốc báo cáo"],
        ["Kiểm tra số liệu", "Chuẩn bị slide/email tóm tắt nếu cần", "Gửi cho người liên quan"],
      ],
    },
    POLICY_OR_CONTRACT_DOCUMENT: {
      domain: "Policy",
      titles: [
        `Kiểm tra điểm quan trọng trong ${topic}`,
        `Liệt kê việc cần xác nhận hoặc phê duyệt`,
        `Tạo nhắc nhở cho hạn hiệu lực/hạn phản hồi`,
      ],
      steps: [
        ["Đọc điều khoản/quy định chính", "Đánh dấu nghĩa vụ và quyền lợi", "Tìm điều khoản rủi ro", "Ghi câu hỏi cần xác nhận"],
        ["Tách việc cần ký/duyệt/bổ sung", "Xác định người phụ trách", "Chuẩn bị tài liệu đi kèm"],
        ["Tìm ngày hiệu lực/hết hạn", "Đặt reminder trước hạn", "Theo dõi trạng thái phê duyệt"],
      ],
    },
    HR_DOCUMENT: {
      domain: "HR",
      titles: [
        `Tổng hợp thông tin nhân sự từ ${topic}`,
        `Rút việc HR cần xử lý`,
        `Tạo lịch nhắc cho mốc nhân sự`,
      ],
      steps: [
        ["Tách dữ liệu theo nhân viên/ứng viên", "Kiểm tra phòng ban/chức danh", "Đánh dấu thông tin thiếu", "Tóm tắt theo từng người"],
        ["Liệt kê việc cần liên hệ/cập nhật", "Ưu tiên việc có hạn gần", "Gán người xử lý nếu có"],
        ["Tìm ngày phỏng vấn/hạn hợp đồng/kỳ lương", "Đặt reminder", "Theo dõi trạng thái"],
      ],
    },
    FINANCE_DOCUMENT: {
      domain: "Finance",
      titles: [
        `Tổng hợp số liệu tài chính từ ${topic}`,
        `Kiểm tra khoản cần thanh toán/xử lý`,
        `Tạo lịch nhắc hạn thanh toán hoặc báo cáo`,
      ],
      steps: [
        ["Tách khoản thu/chi/công nợ", "Kiểm tra số tiền và ngày", "Đánh dấu khoản bất thường", "Tóm tắt tổng quan"],
        ["Liệt kê khoản cần xử lý", "Ưu tiên khoản đến hạn", "Chuẩn bị chứng từ cần có"],
        ["Tìm hạn thanh toán/báo cáo", "Đặt reminder trước hạn", "Cập nhật trạng thái đã xử lý"],
      ],
    },
  };

  const preset = presets[documentType];
  if (!preset) {
    return [];
  }

  return preset.titles.map((title, index) =>
    createOfficeTask({
      id: `${documentType.toLowerCase()}-${index + 1}`,
      title,
      description:
        "Đọc tài liệu, hiểu nội dung chính và chuyển thành việc cụ thể để theo dõi.",
      domain: preset.domain,
      startOffset: index,
      startTime: index === 0 ? "09:00" : "14:00",
      priority: index === 0 ? "Cao" : "Trung bình",
      difficulty: index === 0 ? "Trung bình" : "Dễ",
      steps: preset.steps[index],
      sourceText: preview,
    })
  );
}

function getOfficeDomain(documentType) {
  const domains = {
    KPI_UPDATE_NOTICE: "KPI",
    TRANSPORT_CONTRACT_DOCUMENT: "Contract",
    REFERENCE_PROCESS_DOCUMENT: "Business Process",
    MEETING_MINUTES_DOCUMENT: "Meeting",
    WORK_EMAIL_DOCUMENT: "Email",
    PROJECT_PLAN_DOCUMENT: "Project",
    BUSINESS_REPORT_DOCUMENT: "Report",
    POLICY_OR_CONTRACT_DOCUMENT: "Policy",
    HR_DOCUMENT: "HR",
    FINANCE_DOCUMENT: "Finance",
    SPREADSHEET_DATA: "Data Analysis",
  };

  return domains[documentType] || "Work";
}

function normalizeTasksForDocumentType(tasks, documentType) {
  if (!documentType || !Array.isArray(tasks)) {
    return tasks;
  }

  const officeTypes = new Set([
    "KPI_UPDATE_NOTICE",
    "TRANSPORT_CONTRACT_DOCUMENT",
    "REFERENCE_PROCESS_DOCUMENT",
    "MEETING_MINUTES_DOCUMENT",
    "WORK_EMAIL_DOCUMENT",
    "PROJECT_PLAN_DOCUMENT",
    "BUSINESS_REPORT_DOCUMENT",
    "POLICY_OR_CONTRACT_DOCUMENT",
    "HR_DOCUMENT",
    "FINANCE_DOCUMENT",
    "SPREADSHEET_DATA",
  ]);

  if (!officeTypes.has(documentType)) {
    return tasks;
  }

  const domain = getOfficeDomain(documentType);

  return tasks.map((task) => ({
    ...task,
    category:
      documentType === "MEETING_MINUTES_DOCUMENT" && task.type === "Meeting"
        ? "Meeting"
        : "Work",
    type:
      documentType === "MEETING_MINUTES_DOCUMENT" && task.type === "Meeting"
        ? "Meeting"
        : task.type === "Deadline"
        ? "Deadline"
        : "Task",
    domain,
    suggestedSteps:
      task.suggestedSteps?.length > 0
        ? task.suggestedSteps
        : createOfficeWorkflowTasks(task.sourceText || task.description || "", documentType)[0]
            ?.suggestedSteps || [],
  }));
}

function shouldCollapseToStudyPlan(text, tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return false;
  }

  const searchable = cleanSearchText(text);
  const noScheduleCount = tasks.filter(
    (task) => !task.deadline && !task.startDate && !task.startTime
  ).length;

  return (
    tasks.length > 8 &&
    noScheduleCount / tasks.length > 0.6 &&
    (searchable.includes("hoc") ||
      searchable.includes("bai") ||
      searchable.includes("noi dung") ||
      searchable.includes("chu de"))
  );
}

function addMinutes(time, minutes) {
  const [hour, minute] = String(time || "19:00")
    .split(":")
    .map(Number);
  const date = new Date();
  date.setHours(hour || 19, minute || 0, 0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function chooseStudyTime(task, index) {
  const title = cleanSearchText(task?.title || "");
  const type = cleanSearchText(task?.type || "");

  if (type.includes("meeting")) {
    return "09:00";
  }

  if (
    title.includes("on") ||
    title.includes("hoc") ||
    title.includes("tu vung") ||
    title.includes("noi dung")
  ) {
    return index % 2 === 0 ? "19:30" : "20:30";
  }

  if (title.includes("slide") || title.includes("bao cao")) {
    return "19:00";
  }

  return index % 2 === 0 ? "19:00" : "20:00";
}

function estimateMinutes(task) {
  const difficulty = cleanSearchText(task?.difficulty || "");
  const title = cleanSearchText(task?.title || "");

  if (difficulty.includes("kho") || title.includes("slide")) {
    return 120;
  }

  if (title.includes("tu vung") || title.includes("on") || title.includes("hoc")) {
    return 60;
  }

  return 90;
}

function applySuggestedSchedule(tasks) {
  return tasks.map((task, index) => {
    const hasDate = Boolean(task.startDate || task.deadline);
    const hasTime = Boolean(task.startTime);
    const shouldAutoSchedule =
      hasDate ||
      hasTime ||
      ["Study", "Personal", "Meeting"].includes(task.category) ||
      ["Learning", "Assignment", "Meeting"].includes(task.type);
    const startDate =
      task.startDate ||
      task.deadline ||
      (shouldAutoSchedule ? addPlannedDays(index) : "");
    const startTime =
      task.startTime || (shouldAutoSchedule ? chooseStudyTime(task, index) : "");
    const endTime =
      task.endTime || (startTime ? addMinutes(startTime, estimateMinutes(task)) : "");

    return {
      ...task,
      startDate,
      deadline: task.deadline || startDate,
      startTime,
      endTime,
      estimate:
        task.estimate &&
        !cleanSearchText(task.estimate).includes("chon thoi gian")
        ? task.estimate
        : estimateMinutes(task) >= 120
        ? "2 giờ"
        : estimateMinutes(task) === 60
        ? "1 giờ"
        : "1 giờ 30 phút",
      reminder:
        !startTime
          ? "Không nhắc"
          :
        !hasTime
          ? "Trước 10 phút"
          : task.reminder &&
        !cleanSearchText(task.reminder).includes("khong nhac")
          ? task.reminder
          : "Trước 10 phút",
    };
  });
}

export function normalizeExtractedTasks(text, tasks) {
  const finalizeTasks = (items) =>
    dedupeTasks(
      (Array.isArray(items) ? items : [])
        .map(sanitizeTaskForOutput)
        .filter(Boolean)
    ).slice(0, 8);

  if (extractKnowledgeOnlySpec(text)) {
    return [];
  }

  const actionDocumentType = detectActionDocumentType(text);
  const multiKnowledgeTaskSpecs = extractMultiKnowledgeTaskSpecs(text);
  const knowledgeTaskSpec = extractKnowledgeTaskSpec(text);

  if (hasNoActionSignal(text)) {
    return [];
  }

  if (
    (knowledgeTaskSpec || multiKnowledgeTaskSpecs.length > 0) &&
    Array.isArray(tasks) &&
    tasks.length > 0
  ) {
    return finalizeTasks(applySuggestedSchedule(dedupeTasks(tasks).slice(0, 12)));
  }

  if (actionDocumentType === "EMPLOYEE_BIRTHDAY_LIST") {
    return finalizeTasks(createEmployeeBirthdayReminderTasks(text));
  }

  if (isPresentationDocument(text)) {
    return createPresentationPlanTasks(text);
  }

  if (isExerciseDocument(text)) {
    return createExercisePlanTasks(text);
  }

  if (isStudyTheoryDocument(text)) {
    return createGeneralStudyPlanTasks(text);
  }

  if (actionDocumentType === "KPI_UPDATE_NOTICE") {
    return finalizeTasks(createKpiUpdateTasks(text));
  }

  if (actionDocumentType === "TRANSPORT_CONTRACT_DOCUMENT") {
    return finalizeTasks(createTransportContractTasks(text));
  }

  if (actionDocumentType === "REFERENCE_PROCESS_DOCUMENT") {
    return [];
  }

  if (shouldCollapseToStudyPlan(text, tasks)) {
    return createGeneralStudyPlanTasks(text);
  }

  if (
    actionDocumentType &&
    actionDocumentType !== "SPREADSHEET_DATA" &&
    (!Array.isArray(tasks) || tasks.length === 0)
  ) {
    return finalizeTasks(createOfficeWorkflowTasks(text, actionDocumentType));
  }

  const contextualTasks = normalizeTasksForDocumentType(
    Array.isArray(tasks) ? tasks : [],
    actionDocumentType
  );

  const finalTasks = finalizeTasks(
    applySuggestedSchedule(dedupeTasks(contextualTasks).slice(0, 12))
  );

  if (
    finalTasks.length === 0 &&
    actionDocumentType &&
    actionDocumentType !== "SPREADSHEET_DATA"
  ) {
    return finalizeTasks(createOfficeWorkflowTasks(text, actionDocumentType));
  }

  return finalTasks;
}

export function inferLocalDocumentMetadata(text, file) {
  if (isTransportContractDocument(text, file)) {
    return {
      documentType: "TRANSPORT_CONTRACT_DOCUMENT",
      documentPurpose:
        "Hợp đồng vận chuyển. Cần kiểm tra điều khoản dịch vụ, trách nhiệm các bên, thanh toán, KPI/SLA, hiệu lực và rủi ro vận hành; mọi ngày tháng/task phải được xác thực trước khi tạo lịch.",
    };
  }

  if (isKpiUpdateNotice(text, file)) {
    return {
      documentType: "KPI_UPDATE_NOTICE",
      documentPurpose:
        "Thông báo cập nhật KPI. Cần trích xuất đúng việc phải làm, deadline và người nhận; không biến định nghĩa/giải thích KPI thành task.",
    };
  }

  if (isTransportContractDocument(text, file)) {
    return {
      documentType: "TRANSPORT_CONTRACT_DOCUMENT",
      documentPurpose:
        "Hợp đồng vận chuyển. Cần kiểm tra điều khoản dịch vụ, trách nhiệm các bên, thanh toán, KPI/SLA, hiệu lực và rủi ro vận hành; mọi ngày tháng/task phải được xác thực trước khi tạo lịch.",
    };
  }

  if (isReferenceProcessDocument(text, file)) {
    return {
      documentType: "REFERENCE_PROCESS_DOCUMENT",
      documentPurpose:
        "Tài liệu tham khảo quy trình/nghiệp vụ. Cần tóm tắt và trả lời câu hỏi theo nội dung; chỉ tạo task đọc hiểu/áp dụng gọn, không tách từng câu mô tả thành task.",
    };
  }

  if (isProgrammingProjectDocument(text, file)) {
    return {
      documentType: "PROGRAMMING_PROJECT_DOCUMENT",
      documentPurpose:
        "Tài liệu dự án lập trình/phần mềm. Cần bỏ qua bìa, lời cảm ơn, mục lục và tập trung vào yêu cầu kỹ thuật, database, chức năng, kiểm thử và báo cáo.",
    };
  }

  const multiKnowledgeTaskSpecs = extractMultiKnowledgeTaskSpecs(text);

  if (multiKnowledgeTaskSpecs.length > 0) {
    return {
      documentType: "MULTI_KNOWLEDGE_WITH_TASKS",
      documentPurpose:
        "Tài liệu tổng hợp kiến thức có nhiều nhiệm vụ. Cần tóm tắt từng phần, tách mỗi nhiệm vụ thành task riêng, giữ đúng deadline và giờ bắt đầu.",
    };
  }

  const knowledgeTaskSpec = extractKnowledgeTaskSpec(text);

  if (knowledgeTaskSpec) {
    return {
      documentType: "KNOWLEDGE_WITH_TASK",
      documentPurpose:
        "Tài liệu kiến thức có nhiệm vụ liên quan. Cần tóm tắt nội dung, nhận diện việc cần làm, deadline, giờ bắt đầu và tạo lịch nhắc nếu người dùng đồng ý.",
    };
  }

  const knowledgeOnlySpec = extractKnowledgeOnlySpec(text);

  if (knowledgeOnlySpec) {
    return {
      documentType: "KNOWLEDGE_ONLY",
      documentPurpose:
        "Tài liệu chỉ cung cấp kiến thức, chưa có nhiệm vụ cụ thể hoặc deadline để tạo lịch. Nên tóm tắt và hỏi người dùng có muốn tạo task học/đọc lại không.",
    };
  }

  if (isStudyTheoryDocument(text, file)) {
    return {
      documentType: "STUDY_THEORY_DOCUMENT",
      documentPurpose:
        "Tài liệu học tập/lý thuyết. Cần tóm tắt khái niệm chính, công thức/hiện tượng quan trọng, ví dụ minh họa và tạo kế hoạch đọc hiểu/ôn tập nếu người dùng muốn.",
    };
  }

  const actionDocumentType = detectActionDocumentType(text, file);
  const purposeByType = {
    EMPLOYEE_BIRTHDAY_LIST:
      "Danh sách nhân viên có ngày sinh. Cần tạo reminder sinh nhật ngắn gọn, giữ mã nhân viên/phòng ban/chức vụ trong mô tả và không biến từng dòng dữ liệu thành tiêu đề dài.",
    SPREADSHEET_DATA:
      "Bảng dữ liệu cần tổng hợp, phân tích theo dòng/cột và rút ra hành động cần làm.",
    MEETING_MINUTES_DOCUMENT:
      "Biên bản hoặc nội dung họp. Cần rút action items, người phụ trách, deadline và lịch nhắc sau họp.",
    WORK_EMAIL_DOCUMENT:
      "Email công việc. Cần xác định yêu cầu chính, phản hồi cần gửi và hạn xử lý nếu có.",
    PROJECT_PLAN_DOCUMENT:
      "Kế hoạch dự án. Cần tách milestone, deliverable, deadline, người phụ trách và rủi ro.",
    BUSINESS_REPORT_DOCUMENT:
      "Báo cáo công việc/kinh doanh. Cần tóm tắt insight, điểm bất thường và hành động tiếp theo.",
    POLICY_OR_CONTRACT_DOCUMENT:
      "Hợp đồng/chính sách/quy định. Cần kiểm tra điều khoản quan trọng, rủi ro và hạn hiệu lực/phản hồi.",
    HR_DOCUMENT:
      "Tài liệu nhân sự. Cần tổng hợp theo nhân viên/ứng viên/phòng ban và rút việc cần xử lý.",
    FINANCE_DOCUMENT:
      "Tài liệu tài chính. Cần tổng hợp số liệu, khoản cần thanh toán/xử lý và hạn nhắc việc.",
  };

  if (isExerciseDocument(text)) {
    return {
      documentType: "STUDY_EXERCISE_DOCUMENT",
      documentPurpose:
        "Tài liệu học tập dạng bài tập/lời giải. Nên dùng để ôn tập, làm lại bài, tóm tắt dạng bài và tạo lịch học.",
    };
  }

  if (isPresentationDocument(text)) {
    return {
      documentType: "PRESENTATION_DOCUMENT",
      documentPurpose:
        "Tài liệu có dấu hiệu phục vụ thuyết trình. Nên dùng để lập dàn ý, chuẩn bị slide và luyện trình bày.",
    };
  }

  if (actionDocumentType) {
    return {
      documentType: actionDocumentType,
      documentPurpose: purposeByType[actionDocumentType],
    };
  }

  if (file && /\.(xlsx|xls|csv)$/i.test(file.originalname || "")) {
    return {
      documentType: "SPREADSHEET_DATA",
      documentPurpose:
        "Bảng dữ liệu cần tổng hợp, phân tích theo dòng/cột và rút ra hành động cần làm.",
    };
  }

  return {
    documentType: "LOCAL_ANALYSIS",
    documentPurpose:
      "Tài liệu văn bản cần đọc hiểu, tóm tắt và chuyển thành các việc cần làm nếu có yêu cầu rõ.",
  };
}

export function buildDocumentIntelligence(text, tasks = []) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return {
      documentSummary: {
        overview:
          "Tài liệu chưa có đủ nội dung văn bản để phân tích.",
        mainIdeas: [],
        keyDetails: [],
        nextActions: [],
      },
      documentSections: [],
      documentChunks: [],
      keywords: [],
    };
  }

  const sections = buildDocumentSections(normalizedText);
  const chunks = buildDocumentChunks(sections);
  const keywords = extractDocumentKeywords(normalizedText);
  const summary = buildDocumentSummary(normalizedText, sections, tasks);

  return {
    documentSummary: summary,
    documentSections: sections,
    documentChunks: chunks,
    keywords,
  };
}

export function extractTasks(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return [];
  }

  if (isProgrammingProjectDocument(normalizedText)) {
    return normalizeExtractedTasks(
      normalizedText,
      createProgrammingProjectPlanTasks(normalizedText)
    );
  }

  if (extractKnowledgeOnlySpec(normalizedText)) {
    return [];
  }

  const multiKnowledgeTasks = createMultiKnowledgeTasksFromDocument(normalizedText);
  if (multiKnowledgeTasks.length > 0) {
    return normalizeExtractedTasks(normalizedText, multiKnowledgeTasks);
  }

  const knowledgeTask = createKnowledgeTaskFromDocument(normalizedText);
  if (knowledgeTask) {
    return normalizeExtractedTasks(normalizedText, [knowledgeTask]);
  }

  const documentPurpose = detectDocumentPurpose(normalizedText);
  if (documentPurpose === "ENGLISH_VOCABULARY") {
    return normalizeExtractedTasks(normalizedText, [
      createLearningTaskFromDocument(normalizedText),
    ]);
  }

  const sentences = splitSentences(normalizedText);
  const tasks = sentences
    .filter(shouldCreateTask)
    .map((sentence, index) => createTaskFromSentence(sentence, index));

  const uniqueTasks = normalizeExtractedTasks(normalizedText, tasks);

  if (uniqueTasks.length === 0 && documentPurpose === "STUDY_DOCUMENT") {
    return normalizeExtractedTasks(normalizedText, [
      createLearningTaskFromDocument(normalizedText),
    ]);
  }

  return uniqueTasks;
}
