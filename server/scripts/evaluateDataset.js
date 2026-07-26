import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDocumentIntelligence,
  extractTasks,
  inferLocalDocumentMetadata,
} from "../utils/extractTasks.js";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const projectRoot = path.resolve(serverRoot, "..");

function parseArgs(argv) {
  const args = {
    input: "server/data/tamcam-vietnamese-test.jsonl",
    output: "",
    limit: 0,
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
    } else if (!arg.startsWith("--")) {
      args.input = arg;
    }
  }

  return args;
}

function readJsonl(filePath, limit = 0) {
  const resolvedPath = resolveProjectPath(filePath, true);
  const lines = fs
    .readFileSync(resolvedPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selectedLines = limit > 0 ? lines.slice(0, limit) : lines;

  return selectedLines.map((line) => JSON.parse(line));
}

function ensureDirectory(filePath) {
  const directory = path.dirname(resolveProjectPath(filePath));

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }
}

function resolveProjectPath(filePath, mustExist = false) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  if (filePath.startsWith("server/")) {
    const rootPath = path.resolve(projectRoot, filePath);

    if (!mustExist || fs.existsSync(rootPath)) {
      return rootPath;
    }
  }

  const cwdPath = path.resolve(filePath);

  if (!mustExist || fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  const rootPath = path.resolve(projectRoot, filePath);

  if (!mustExist || fs.existsSync(rootPath)) {
    return rootPath;
  }

  const serverPath = filePath.startsWith("server/")
    ? path.resolve(projectRoot, filePath)
    : path.resolve(serverRoot, filePath);

  return serverPath;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/-:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const stopWords = new Set([
    "tai",
    "lieu",
    "kien",
    "thuc",
    "nguoi",
    "dung",
    "can",
    "va",
    "ve",
    "cho",
    "toi",
    "nay",
    "cac",
    "mot",
    "duoc",
    "dua",
    "vao",
    "lich",
  ]);

  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function f1Score(expectedText, predictedText) {
  const expectedTokens = tokenize(expectedText);
  const predictedTokens = tokenize(predictedText);

  if (expectedTokens.length === 0 && predictedTokens.length === 0) {
    return 1;
  }

  if (expectedTokens.length === 0 || predictedTokens.length === 0) {
    return 0;
  }

  const predictedCounts = new Map();
  predictedTokens.forEach((token) => {
    predictedCounts.set(token, (predictedCounts.get(token) || 0) + 1);
  });

  let overlap = 0;
  expectedTokens.forEach((token) => {
    const count = predictedCounts.get(token) || 0;

    if (count > 0) {
      overlap += 1;
      predictedCounts.set(token, count - 1);
    }
  });

  const precision = overlap / predictedTokens.length;
  const recall = overlap / expectedTokens.length;

  if (precision + recall === 0) {
    return 0;
  }

  return (2 * precision * recall) / (precision + recall);
}

function normalizeDate(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const year =
      slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  return normalizeText(text);
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})(?::|h)(\d{2})?$/);

  if (!match) {
    return text;
  }

  return `${match[1].padStart(2, "0")}:${(match[2] || "00").padStart(2, "0")}`;
}

function summarizePrediction(intelligence) {
  const summary = intelligence.documentSummary || {};
  const mainIdeas = Array.isArray(summary.mainIdeas) ? summary.mainIdeas : [];
  const keyDetails = Array.isArray(summary.keyDetails) ? summary.keyDetails : [];

  return [
    summary.overview,
    ...mainIdeas.slice(0, 4),
    ...keyDetails.slice(0, 3),
  ]
    .filter(Boolean)
    .join(" ");
}

function findBestTaskMatch(expectedTask, predictedTasks, usedIndexes) {
  let bestMatch = null;
  let bestScore = -1;

  predictedTasks.forEach((predictedTask, index) => {
    if (usedIndexes.has(index)) {
      return;
    }

    const score = f1Score(
      expectedTask.title || expectedTask.description,
      predictedTask.title || predictedTask.description
    );

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        index,
        task: predictedTask,
        score,
      };
    }
  });

  return bestMatch;
}

function evaluateExample(example, index) {
  const documentText = example.input?.documentText || "";
  const expectedOutput = example.expectedOutput || {};
  const expectedTasks = Array.isArray(expectedOutput.tasks)
    ? expectedOutput.tasks
    : [];
  const predictedTasks = extractTasks(documentText);
  const intelligence = buildDocumentIntelligence(documentText, predictedTasks);
  const metadata = inferLocalDocumentMetadata(documentText);
  const predictedSummary = summarizePrediction(intelligence);
  const expectedHasTask = expectedTasks.length > 0;
  const predictedHasTask = predictedTasks.length > 0;
  const usedPredictedTaskIndexes = new Set();
  const matchedTasks = expectedTasks.map((expectedTask) => {
    const match = findBestTaskMatch(
      expectedTask,
      predictedTasks,
      usedPredictedTaskIndexes
    );

    if (match) {
      usedPredictedTaskIndexes.add(match.index);
    }

    return {
      expectedTask,
      predictedTask: match?.task || null,
      titleF1: match?.score || 0,
      deadlineMatch:
        normalizeDate(expectedTask.deadline) ===
        normalizeDate(match?.task?.deadline),
      startTimeMatch:
        normalizeTime(expectedTask.startTime) ===
        normalizeTime(match?.task?.startTime),
    };
  });

  const expectedDeadlineTasks = matchedTasks.filter(
    (match) => match.expectedTask.deadline
  );
  const expectedStartTimeTasks = matchedTasks.filter(
    (match) => match.expectedTask.startTime
  );
  const averageTitleF1 =
    matchedTasks.length > 0
      ? matchedTasks.reduce((sum, match) => sum + match.titleF1, 0) /
        matchedTasks.length
      : expectedHasTask === predictedHasTask
      ? 1
      : 0;

  return {
    index,
    id: example.id || `example-${index + 1}`,
    expected: {
      hasTask: expectedHasTask,
      taskCount: expectedTasks.length,
      summary: expectedOutput.summary || "",
      metadata: expectedOutput.metadata || {},
    },
    predicted: {
      hasTask: predictedHasTask,
      taskCount: predictedTasks.length,
      summary: predictedSummary,
      documentType: metadata.documentType,
    },
    metrics: {
      hasTaskCorrect: expectedHasTask === predictedHasTask,
      taskCountExact: expectedTasks.length === predictedTasks.length,
      summaryF1: f1Score(expectedOutput.summary, predictedSummary),
      averageTitleF1,
      deadlineAccuracy:
        expectedDeadlineTasks.length > 0
          ? expectedDeadlineTasks.filter((match) => match.deadlineMatch).length /
            expectedDeadlineTasks.length
          : null,
      startTimeAccuracy:
        expectedStartTimeTasks.length > 0
          ? expectedStartTimeTasks.filter((match) => match.startTimeMatch).length /
            expectedStartTimeTasks.length
          : null,
    },
    matchedTasks,
  };
}

function average(values) {
  const validValues = values.filter((value) => typeof value === "number");

  if (validValues.length === 0) {
    return null;
  }

  return (
    validValues.reduce((sum, value) => sum + value, 0) / validValues.length
  );
}

function summarizeResults(results) {
  return {
    total: results.length,
    hasTaskAccuracy: average(
      results.map((result) => Number(result.metrics.hasTaskCorrect))
    ),
    taskCountExactAccuracy: average(
      results.map((result) => Number(result.metrics.taskCountExact))
    ),
    summaryF1: average(results.map((result) => result.metrics.summaryF1)),
    titleF1: average(results.map((result) => result.metrics.averageTitleF1)),
    deadlineAccuracy: average(
      results.map((result) => result.metrics.deadlineAccuracy)
    ),
    startTimeAccuracy: average(
      results.map((result) => result.metrics.startTimeAccuracy)
    ),
  };
}

const args = parseArgs(process.argv);
const examples = readJsonl(args.input, args.limit);
const results = examples.map(evaluateExample);
const summary = summarizeResults(results);
const failureSamples = results
  .filter(
    (result) =>
      !result.metrics.hasTaskCorrect ||
      !result.metrics.taskCountExact ||
      result.metrics.summaryF1 < 0.35 ||
      result.metrics.averageTitleF1 < 0.45 ||
      result.metrics.deadlineAccuracy === 0 ||
      result.metrics.startTimeAccuracy === 0
  )
  .slice(0, 20);
const report = {
  input: args.input,
  generatedAt: new Date().toISOString(),
  summary,
  failureSamples,
};

if (args.output) {
  ensureDirectory(args.output);
  fs.writeFileSync(
    resolveProjectPath(args.output),
    JSON.stringify(report, null, 2),
    "utf-8"
  );
}

console.log(JSON.stringify(summary, null, 2));

if (args.output) {
  console.log(`Report written to ${args.output}`);
}
