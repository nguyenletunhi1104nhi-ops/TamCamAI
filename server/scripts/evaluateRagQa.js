import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");

function parseArgs(argv) {
  const args = {
    input: "server/data/tamcam-rag-qa-test.jsonl",
    output: "",
    limit: 0,
    topK: 4,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === "--limit") {
      args.limit = Number(argv[index + 1] || 0);
      index += 1;
    } else if (arg === "--top-k") {
      args.topK = Number(argv[index + 1] || 4);
      index += 1;
    } else if (!arg.startsWith("--")) {
      args.input = arg;
    }
  }
  return args;
}

function resolveProjectPath(filePath, mustExist = false) {
  if (path.isAbsolute(filePath)) return filePath;
  const rootPath = path.resolve(projectRoot, filePath);
  if (!mustExist || fs.existsSync(rootPath)) return rootPath;
  return path.resolve(serverRoot, filePath);
}

function ensureDirectory(filePath) {
  const directory = path.dirname(resolveProjectPath(filePath));
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
}

function readJsonl(filePath, limit = 0) {
  const lines = fs
    .readFileSync(resolveProjectPath(filePath, true), "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (limit > 0 ? lines.slice(0, limit) : lines).map((line) => JSON.parse(line));
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[đĐ]/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/%.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const stopWords = new Set([
    "tai", "lieu", "nay", "file", "noi", "dung", "gi", "la", "toi",
    "can", "nen", "nhu", "the", "nao", "cac", "va", "ve", "cho",
    "trong", "duoc", "co", "khong", "nhung", "mot", "cua",
  ]);
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function f1Score(expectedText, predictedText) {
  const expectedTokens = tokenize(expectedText);
  const predictedTokens = tokenize(predictedText);
  if (expectedTokens.length === 0 && predictedTokens.length === 0) return 1;
  if (expectedTokens.length === 0 || predictedTokens.length === 0) return 0;
  const counts = new Map();
  predictedTokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  let overlap = 0;
  expectedTokens.forEach((token) => {
    const count = counts.get(token) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(token, count - 1);
    }
  });
  const precision = overlap / predictedTokens.length;
  const recall = overlap / expectedTokens.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function classifyQuestionIntent(question, category = "") {
  const text = normalizeText(`${question} ${category}`);
  if (/multi_fact|gom nhung|bao gom|nhung phan nao|nhung so lieu|so lieu nao|neu nhung|liet ke nhung|cac thong tin|nhung yeu to|yeu to nao|nhac nhung/.test(text)) {
    return "MULTI_FACT_SYNTHESIS";
  }
  if (/deadline|han|moc thoi gian|hieu luc/.test(text)) return "DEADLINE_LOOKUP";
  if (/phu trach|ai lam|ai chiu/.test(text)) return "TASK_LOOKUP";
  if (/can lam gi|nen lam gi|viec can lam|task|workflow|checklist/.test(text)) return "TASK_LOOKUP";
  if (/quy trinh|cac buoc|lam nhu the nao/.test(text)) return "WORKFLOW_EXPLANATION";
  if (/vi sao|tai sao|nguyen nhan|rui ro|bat thuong/.test(text)) return "CAUSE_ANALYSIS";
  if (/so sanh|khac nhau|cao nhat|thap nhat|nhieu nhat|it nhat/.test(text)) return "COMPARISON";
  if (/nen ve bieu do|bieu do|de xuat|uu tien|khuyen nghi/.test(text)) return "RECOMMENDATION";
  if (/bao nhieu|may loai|cac loai|trang thai/.test(text)) return "MULTI_FACT_SYNTHESIS";
  if (/file nay|tai lieu nay|noi ve gi|la gi|tom tat|bang du lieu/.test(text)) return "DOCUMENT_OVERVIEW";
  return "FACT_LOOKUP";
}

function splitDocumentBlocks(text) {
  const blocks = [];
  const paragraphs = String(text || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    paragraphs.forEach((paragraph, index) => {
      if (paragraph.length >= 20) blocks.push({ index, heading: "", text: paragraph });
    });
  } else {
    String(text || "")
      .replace(/\r/g, "")
      .split(/(?<=[.!?])\s+/)
      .map((block) => block.replace(/\s+/g, " ").trim())
      .filter((block) => block.length >= 20)
      .forEach((block, index) => blocks.push({ index, heading: "", text: block }));
  }
  return blocks;
}

function getQuestionPhrases(question) {
  const words = tokenize(question);
  const phrases = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    phrases.push(`${words[index]} ${words[index + 1]}`);
  }
  for (let index = 0; index < words.length - 2; index += 1) {
    phrases.push(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
  }
  return phrases;
}

function scoreBlock(block, question, intent) {
  const normalizedBlock = normalizeText(`${block.heading || ""} ${block.text}`);
  const normalizedQuestion = normalizeText(question);
  const keywords = tokenize(question);
  const phrases = getQuestionPhrases(question);
  const keywordScore = keywords.filter((keyword) => normalizedBlock.includes(keyword)).length * 3;
  const phraseScore = phrases.filter((phrase) => normalizedBlock.includes(phrase)).length * 5;
  const numberScore = /\d/.test(normalizedBlock) && /\d|deadline|han|ngay|doanh thu|so lieu|ty le|diem/.test(normalizedQuestion) ? 4 : 0;
  const intentBoost = {
    DOCUMENT_OVERVIEW: /tai lieu|bao cao|bang|hop dong|ke hoach|muc tieu|la/.test(normalizedBlock) ? 18 : 0,
    FACT_LOOKUP: keywordScore > 0 || phraseScore > 0 ? 10 : 0,
    MULTI_FACT_SYNTHESIS: /gom|bao gom|cac|nhom|loai|trang thai|cot|tong hop|noi dung|so lieu|du lieu|moc|deadline|viec can|rui ro|quy trinh|\d/.test(normalizedBlock) ? 24 : 0,
    TASK_LOOKUP: /can|phai|yeu cau|phu trach|hoan thanh|thuc hien|chuan bi/.test(normalizedBlock) ? 26 : 0,
    DEADLINE_LOOKUP: /deadline|han|ngay|truoc ngay|hieu luc|\d{1,2}\/\d{1,2}/.test(normalizedBlock) ? 30 : 0,
    WORKFLOW_EXPLANATION: /quy trinh|buoc|tiep nhan|xu ly|kiem tra|cap nhat|dieu phoi|xac nhan/.test(normalizedBlock) ? 28 : 0,
    COMPARISON: /\d/.test(normalizedBlock) ? 18 : 0,
    CAUSE_ANALYSIS: /vi|do|nguyen nhan|rui ro|loi|cham|thieu|bat thuong|dan den/.test(normalizedBlock) ? 24 : 0,
    RECOMMENDATION: /nen|can|uu tien|de xuat|bieu do|giai phap|hanh dong/.test(normalizedBlock) ? 22 : 0,
  }[intent] || 0;
  return keywordScore + phraseScore + numberScore + intentBoost;
}

function retrieveRelevantBlocks(documentText, question, limit = 4) {
  const intent = classifyQuestionIntent(question);
  const blocks = splitDocumentBlocks(documentText);
  if (blocks.length === 0) return [];
  const evidenceLimit = {
    FACT_LOOKUP: 3,
    DEADLINE_LOOKUP: 4,
    TASK_LOOKUP: 5,
    WORKFLOW_EXPLANATION: 6,
    MULTI_FACT_SYNTHESIS: 6,
    CAUSE_ANALYSIS: 5,
    COMPARISON: 5,
    RECOMMENDATION: 5,
    DOCUMENT_OVERVIEW: 5,
  }[intent] || limit;

  const ranked = blocks
    .map((block) => ({ ...block, intent, score: scoreBlock(block, question, intent) }))
    .filter((block) => block.score > 0 || intent === "DOCUMENT_OVERVIEW")
    .sort((first, second) => second.score - first.score);
  if (intent === "MULTI_FACT_SYNTHESIS" && ranked.length === 0) {
    return blocks
      .map((block) => ({
        ...block,
        intent,
        score: /\d|gom|bao gom|noi dung|tong hop|quy trinh|rui ro|deadline/i.test(normalizeText(block.text)) ? 8 : 1,
      }))
      .sort((first, second) => second.score - first.score || first.index - second.index)
      .slice(0, evidenceLimit);
  }
  const selected = new Map();
  ranked.slice(0, evidenceLimit).forEach((block) => {
    [block.index - 1, block.index, block.index + 1].forEach((index) => {
      if (index >= 0 && index < blocks.length && !selected.has(index)) {
        selected.set(index, {
          ...blocks[index],
          intent,
          score: index === block.index ? block.score : Math.max(1, block.score - 2),
        });
      }
    });
  });
  const seen = new Set();
  return [...selected.values()]
    .sort((first, second) => second.score - first.score)
    .filter((block) => {
      const key = normalizeText(block.text).slice(0, 160);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, evidenceLimit);
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 15);
}

function buildLocalAnswer(question, retrievedBlocks) {
  if (retrievedBlocks.length === 0) {
    return "Mình chưa tìm thấy đủ thông tin trong tài liệu để kết luận chính xác.";
  }
  const intent = retrievedBlocks[0].intent || classifyQuestionIntent(question);
  const evidenceText = retrievedBlocks.map((block) => block.text).join(" ");
  const sentences = splitSentences(evidenceText);
  const topSentences = sentences.length > 0 ? sentences : retrievedBlocks.map((block) => block.text);
  const normalizedQuestion = normalizeText(question);

  if (intent === "FACT_LOOKUP") {
    if (/moc chinh/.test(normalizedQuestion)) {
      const sentence = topSentences.find((item) => /moc chinh/.test(normalizeText(item)));
      const match = sentence?.match(/mốc chính\s+là\s+[^.;,\n]+/i);
      if (match) return match[0].trim() + ".";
    }
    if (/bao nhieu|co bao nhieu/.test(normalizedQuestion)) {
      const questionTokens = tokenize(question);
      const sentence = topSentences.find((item) => {
        const normalizedSentence = normalizeText(item);
        return /\d/.test(normalizedSentence) && questionTokens.some((token) => normalizedSentence.includes(token));
      });
      if (sentence) {
        const numberMatch = sentence.match(/(?:có\s+)?\d+[^.,;]*?(?:trễ hạn|hồ sơ|hợp đồng|đơn|task|người|mốc)/i);
        if (numberMatch) return numberMatch[0].replace(/^có\s+/i, "Có ").trim() + ".";
      }
    }
    return topSentences[0].slice(0, 420);
  }
  if (intent === "DOCUMENT_OVERVIEW") {
    const overviewSentence =
      topSentences.find((sentence) => /tai lieu nay la|file nay la/.test(normalizeText(sentence))) ||
      topSentences[0];
    return overviewSentence.slice(0, 260);
  }
  if (intent === "DEADLINE_LOOKUP") {
    return topSentences
      .filter((sentence) => /deadline|han|ngay|hieu luc|\d{1,2}\/\d{1,2}/i.test(normalizeText(sentence)))
      .slice(0, 4)
      .join(" ");
  }
  if (intent === "WORKFLOW_EXPLANATION") {
    return topSentences.slice(0, 4).join(" ");
  }
  if (intent === "TASK_LOOKUP" || intent === "RECOMMENDATION") {
    return topSentences
      .filter((sentence) => /can|phai|yeu cau|phu trach|hoan thanh|nen|de xuat|uu tien/i.test(normalizeText(sentence)))
      .slice(0, 4)
      .join(" ") || topSentences.slice(0, 3).join(" ");
  }
  if (intent === "MULTI_FACT_SYNTHESIS") {
    const normalizedQuestion = normalizeText(question);
    const evidenceTextForIntent = normalizeText(evidenceText);

    if (/phan nao|gom nhung phan|noi dung gom|bao gom nhung phan/.test(normalizedQuestion)) {
      const contentSentence = topSentences.find((sentence) =>
        /noi dung|gom|bao gom|khai niem|muc luc|phan\s+\d/i.test(normalizeText(sentence))
      );
      if (contentSentence) return contentSentence.slice(0, 420);
    }

    if (/yeu to|nhac nhung|thong tin nao|nhung gi/.test(normalizedQuestion)) {
      const factors = [
        /moc chinh|deadline|han/.test(evidenceTextForIntent) ? "mốc chính" : "",
        /moc theo doi/.test(evidenceTextForIntent) ? "mốc theo dõi" : "",
        /viec can lam|nhiem vu|can lam/.test(evidenceTextForIntent) ? "việc cần làm" : "",
        /rui ro/.test(evidenceTextForIntent) ? "rủi ro" : "",
        /quy trinh|cac buoc/.test(evidenceTextForIntent) ? "quy trình" : "",
        /so lieu|tong hop|\d+%/.test(evidenceTextForIntent) ? "số liệu" : "",
      ].filter(Boolean);

      if (factors.length > 0) {
        const last = factors.pop();
        return `Có ${factors.length > 0 ? `${factors.join(", ")} và ${last}` : last}.`;
      }
    }

    const focusedSentences = topSentences.filter((sentence) => {
      const normalizedSentence = normalizeText(sentence);
      if (/so lieu|bao nhieu|thong ke/.test(normalizedQuestion)) {
        return /\d/.test(normalizedSentence);
      }
      if (/gom|bao gom|phan nao|yeu to|nhung gi|thong tin nao/.test(normalizedQuestion)) {
        return /gom|bao gom|noi dung|moc|deadline|viec can|rui ro|quy trinh|tong hop/.test(normalizedSentence);
      }
      return /\d|gom|bao gom|noi dung|moc|deadline|viec can|rui ro|quy trinh/.test(normalizedSentence);
    });
    return (focusedSentences.length > 0 ? focusedSentences : topSentences)
      .slice(0, 4)
      .join(" ")
      .slice(0, 720);
  }
  return topSentences.slice(0, 3).join(" ").slice(0, 700);
}

function containsExpectedEvidence(retrievedBlocks, evidence, mustContain = []) {
  const evidenceItems = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  const retrievedText = retrievedBlocks.map((block) => block.text).join(" ");
  const mustTerms = Array.isArray(mustContain) ? mustContain : [];
  if (
    mustTerms.length > 0 &&
    mustTerms.every((term) => normalizeText(retrievedText).includes(normalizeText(term)))
  ) {
    return true;
  }
  if (evidenceItems.length === 0) return false;
  return evidenceItems.some((item) => {
    const normalizedEvidence = normalizeText(item);
    return retrievedBlocks.some((block) => {
      const normalizedBlock = normalizeText(block.text);
      return normalizedBlock.includes(normalizedEvidence.slice(0, 80)) || f1Score(normalizedEvidence, normalizedBlock) >= 0.65;
    });
  });
}

function evidencePrecision(retrievedBlocks, evidence, mustContain = []) {
  const evidenceItems = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  if (retrievedBlocks.length === 0) return 0;
  if (evidenceItems.length === 0) return 1;
  const mustTerms = Array.isArray(mustContain) ? mustContain.map(normalizeText).filter(Boolean) : [];
  const relevantCount = retrievedBlocks.filter((block) =>
    evidenceItems.some((item) => f1Score(item, block.text) >= 0.45 || normalizeText(block.text).includes(normalizeText(item).slice(0, 50))) ||
    mustTerms.some((term) => normalizeText(block.text).includes(term))
  ).length;
  return relevantCount / retrievedBlocks.length;
}

function mustContainCoverage(answer, mustContain = []) {
  const normalizedAnswer = normalizeText(answer);
  const expectedItems = mustContain.filter(Boolean);
  if (expectedItems.length === 0) return 1;
  return expectedItems.filter((item) => normalizedAnswer.includes(normalizeText(item))).length / expectedItems.length;
}

function extractCriticalFacts(text) {
  const raw = String(text || "");
  const patterns = [
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}:\d{2}\b/g,
    /\b\d+(?:[.,]\d+)?\s*%/g,
    /\b\d+(?:[.,]\d+)?\s*(?:VND|vnd|triệu|trieu|tỷ|ty)\b/g,
    /\b\d+(?:[.,]\d+)?\s*(?:task|đơn|don|ngày|ngay|giờ|gio|hồ sơ|ho so)\b/g,
  ];
  return [...new Set(patterns.flatMap((pattern) => raw.match(pattern) || []))];
}

function criticalFactAccuracy(answer, retrievedBlocks) {
  const answerFacts = extractCriticalFacts(answer);
  if (answerFacts.length === 0) return 1;
  const evidenceText = normalizeText(retrievedBlocks.map((block) => block.text).join(" "));
  const supported = answerFacts.filter((fact) => evidenceText.includes(normalizeText(fact)));
  return supported.length / answerFacts.length;
}

function unsupportedFactRate(answer, retrievedBlocks) {
  return 1 - criticalFactAccuracy(answer, retrievedBlocks);
}

function evaluateQuestion(example, questionItem, questionIndex, topK) {
  const documentText = example.document?.documentText || example.document?.text || example.document?.textPreview || "";
  const expectedIntent = questionItem.intent || classifyQuestionIntent(questionItem.question, questionItem.category || example.category);
  const actualIntent = classifyQuestionIntent(questionItem.question, questionItem.category || example.category);
  const retrievedBlocks = retrieveRelevantBlocks(documentText, questionItem.question, topK);
  const answer = buildLocalAnswer(questionItem.question, retrievedBlocks);
  return {
    id: `${example.id || "example"}-q${questionIndex + 1}`,
    fileName: example.document?.fileName || "",
    question: questionItem.question,
    category: questionItem.category || example.category || "general",
    expectedAnswer: questionItem.expectedAnswer || "",
    answer,
    retrievedBlocks,
    metrics: {
      intentHit: actualIntent === expectedIntent,
      evidenceHit: containsExpectedEvidence(retrievedBlocks, questionItem.evidence, questionItem.mustContain),
      evidencePrecision: evidencePrecision(retrievedBlocks, questionItem.evidence, questionItem.mustContain),
      answerF1: f1Score(questionItem.expectedAnswer, answer),
      mustContainCoverage: mustContainCoverage(answer, questionItem.mustContain),
      criticalFactAccuracy: criticalFactAccuracy(answer, retrievedBlocks),
      unsupportedFactRate: unsupportedFactRate(answer, retrievedBlocks),
      fallbackUsed: retrievedBlocks.length === 0,
      topScore: retrievedBlocks[0]?.score || 0,
    },
  };
}

function average(values) {
  const validValues = values.filter((value) => typeof value === "number");
  if (validValues.length === 0) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function summarizeResults(results) {
  const categories = [...new Set(results.map((result) => result.category))];
  const byCategory = {};
  categories.forEach((category) => {
    const categoryResults = results.filter((result) => result.category === category);
    byCategory[category] = summarizeFlat(categoryResults);
  });
  return { ...summarizeFlat(results), byCategory };
}

function summarizeFlat(results) {
  return {
    totalQuestions: results.length,
    intentAccuracy: average(results.map((result) => Number(result.metrics.intentHit))),
    evidenceHitRate: average(results.map((result) => Number(result.metrics.evidenceHit))),
    evidencePrecision: average(results.map((result) => result.metrics.evidencePrecision)),
    answerF1: average(results.map((result) => result.metrics.answerF1)),
    mustContainCoverage: average(results.map((result) => result.metrics.mustContainCoverage)),
    criticalFactAccuracy: average(results.map((result) => result.metrics.criticalFactAccuracy)),
    unsupportedFactRate: average(results.map((result) => result.metrics.unsupportedFactRate)),
    fallbackRate: average(results.map((result) => Number(result.metrics.fallbackUsed))),
    averageTopScore: average(results.map((result) => result.metrics.topScore)),
  };
}

const args = parseArgs(process.argv);
const examples = readJsonl(args.input, args.limit);
const results = examples.flatMap((example) =>
  (example.questions || []).map((question, index) => evaluateQuestion(example, question, index, args.topK))
);
const summary = summarizeResults(results);
const failureSamples = results
  .filter((result) =>
    !result.metrics.evidenceHit ||
    result.metrics.answerF1 < 0.55 ||
    result.metrics.mustContainCoverage < 0.85 ||
    result.metrics.unsupportedFactRate > 0.02
  )
  .slice(0, 25);
const report = {
  input: args.input,
  generatedAt: new Date().toISOString(),
  summary,
  failureSamples,
};

if (args.output) {
  ensureDirectory(args.output);
  fs.writeFileSync(resolveProjectPath(args.output), JSON.stringify(report, null, 2), "utf-8");
}

console.log(JSON.stringify(summary, null, 2));
if (args.output) console.log(`Report written to ${args.output}`);
