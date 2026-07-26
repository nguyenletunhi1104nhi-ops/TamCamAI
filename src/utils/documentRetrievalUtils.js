import { normalizeSearchText } from "./scheduleUtils";

const DOCUMENT_STOP_WORDS = new Set([
  "tai",
  "lieu",
  "nay",
  "vua",
  "upload",
  "noi",
  "gi",
  "tom",
  "tat",
  "tim",
  "doan",
  "ve",
  "cho",
  "toi",
  "xem",
  "co",
  "khong",
  "nhung",
  "cac",
  "chinh",
  "phan",
  "tich",
  "du",
  "dung",
  "giup",
  "minh",
  "ban",
  "hay",
  "la",
  "nhu",
  "the",
  "nao",
]);

export function getDocumentKeywords(userMessage) {
  return normalizeSearchText(userMessage)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !DOCUMENT_STOP_WORDS.has(word));
}

export function getQuestionPhrases(userMessage) {
  const normalizedMessage = normalizeSearchText(userMessage);
  const words = normalizedMessage
    .split(/\s+/)
    .filter((word) => word.length >= 3);
  const phrases = [];

  for (let index = 0; index < words.length - 1; index += 1) {
    phrases.push(`${words[index]} ${words[index + 1]}`);
  }

  for (let index = 0; index < words.length - 2; index += 1) {
    phrases.push(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
  }

  return phrases.filter((phrase) => phrase.length >= 8);
}

export function classifyDocumentQuestionIntent(userMessage) {
  const text = normalizeSearchText(userMessage);

  if (
    text.includes("con phan do") ||
    text.includes("no thi sao") ||
    text.includes("cai do") ||
    text.includes("chia tiep") ||
    text === "deadline" ||
    text.includes("con cai thu")
  ) {
    return "FOLLOW_UP_CONTEXT";
  }

  if (
    text.includes("gom nhung") ||
    text.includes("bao gom") ||
    text.includes("nhung phan nao") ||
    text.includes("nhung so lieu") ||
    text.includes("so lieu nao") ||
    text.includes("neu nhung") ||
    text.includes("liet ke nhung") ||
    text.includes("cac thong tin") ||
    text.includes("nhung yeu to") ||
    text.includes("yeu to nao") ||
    text.includes("nhac nhung")
  ) {
    return "MULTI_FACT_SYNTHESIS";
  }

  if (
    text.includes("workflow") ||
    text.includes("quy trinh") ||
    text.includes("cac buoc") ||
    text.includes("lam nhu the nao")
  ) {
    return "WORKFLOW_EXPLANATION";
  }

  if (
    text.includes("vi sao") ||
    text.includes("tai sao") ||
    text.includes("nguyen nhan") ||
    text.includes("do dau")
  ) {
    return "CAUSE_ANALYSIS";
  }

  if (
    text.includes("so sanh") ||
    text.includes("khac nhau") ||
    text.includes("cao hon") ||
    text.includes("thap hon")
  ) {
    return "COMPARISON";
  }

  if (
    text.includes("toi can lam gi") ||
    text.includes("can lam gi") ||
    text.includes("viec can lam") ||
    text.includes("nhiem vu") ||
    text.includes("task")
  ) {
    return "TASK_LOOKUP";
  }

  if (
    text.includes("deadline") ||
    /\bhan\b/.test(text) ||
    text.includes("han nop") ||
    text.includes("han xu ly") ||
    text.includes("moc thoi gian") ||
    text.includes("hieu luc")
  ) {
    return "DEADLINE_LOOKUP";
  }

  if (
    text.includes("nen lam") ||
    text.includes("uu tien") ||
    text.includes("de xuat") ||
    text.includes("khuyen nghi") ||
    text.includes("xu ly gi")
  ) {
    return "RECOMMENDATION";
  }

  if (
    text.includes("bao nhieu") ||
    text.includes("co tong") ||
    text.includes("may loai") ||
    text.includes("cac loai") ||
    text.includes("loai don") ||
    text.includes("trang thai")
  ) {
    return "MULTI_FACT_SYNTHESIS";
  }

  if (
    text.includes("tom tat") ||
    text.includes("noi dung") ||
    text.includes("noi ve gi") ||
    text.includes("noi gi") ||
    text.includes("file nay") ||
    text.includes("tai lieu nay") ||
    text.includes("day la file") ||
    text.includes("y chinh")
  ) {
    return "DOCUMENT_OVERVIEW";
  }

  if (
    text.includes("so lieu") ||
    text.includes("du lieu") ||
    text.includes("data") ||
    text.includes("cao nhat") ||
    text.includes("thap nhat") ||
    text.includes("bat thuong") ||
    text.includes("xu huong") ||
    text.includes("du bao") ||
    text.includes("bieu do")
  ) {
    return "MULTI_FACT_SYNTHESIS";
  }

  return "FACT_LOOKUP";
}

export function formatEvidenceLines(paragraphs, limit = 3, formatPoint = (value) => value) {
  return paragraphs
    .slice(0, limit)
    .map((paragraph, index) => `${index + 1}. ${formatPoint(paragraph, 300)}`);
}

export function splitEvidenceSentences(paragraphs) {
  return String((paragraphs || []).join(" "))
    .split(/(?<=[.!?。])\s+|;\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
