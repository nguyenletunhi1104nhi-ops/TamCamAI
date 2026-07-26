import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractTasks } from "../utils/extractTasks.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");

function resolveProjectPath(filePath, mustExist = false) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  const rootPath = path.resolve(projectRoot, filePath);
  if (!mustExist || fs.existsSync(rootPath)) {
    return rootPath;
  }

  return path.resolve(serverRoot, filePath);
}

function parseArgs(argv) {
  const args = {
    input: "server/data/tamcam-anti-junk-task-test.jsonl",
    output: "server/reports/tamcam-anti-junk-task-test.json",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      args.output = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function readJsonl(filePath) {
  return fs
    .readFileSync(resolveProjectPath(filePath, true), "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function ensureDirectory(filePath) {
  const directory = path.dirname(resolveProjectPath(filePath));
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, phrases = []) {
  const normalized = normalizeText(text);
  return phrases.some((phrase) => normalized.includes(normalizeText(phrase)));
}

function requiredCoverage(tasks, requiredPhrases = []) {
  if (requiredPhrases.length === 0) {
    return 1;
  }

  const combinedTitles = tasks.map((task) => task.title || "").join(" ");
  const matched = requiredPhrases.filter((phrase) =>
    includesAny(combinedTitles, [phrase])
  ).length;

  return matched / requiredPhrases.length;
}

function evaluateExample(example, index) {
  const documentText = example.input?.documentText || "";
  const expected = example.expectedOutput || {};
  const tasks = extractTasks(documentText);
  const titles = tasks.map((task) => task.title || "");
  const combinedTitles = titles.join(" ");
  const shouldHaveTasks = Boolean(expected.shouldHaveTasks);
  const hasTasks = tasks.length > 0;
  const forbiddenHit = includesAny(combinedTitles, expected.forbiddenTitleContains || []);
  const minTaskCount = Number(expected.minTaskCount || expected.expectedTaskCount || 0);
  const taskCountOk =
    typeof expected.expectedTaskCount === "number"
      ? tasks.length === expected.expectedTaskCount
      : !shouldHaveTasks || tasks.length >= minTaskCount;
  const requiredTitleCoverage = requiredCoverage(
    tasks,
    expected.requiredTitleContains || []
  );

  return {
    index,
    id: example.id || `anti-junk-${index + 1}`,
    category: example.category || "unknown",
    expected: {
      shouldHaveTasks,
      minTaskCount,
      requiredTitleContains: expected.requiredTitleContains || [],
      forbiddenTitleContains: expected.forbiddenTitleContains || [],
    },
    predicted: {
      taskCount: tasks.length,
      titles,
    },
    metrics: {
      hasTaskCorrect: shouldHaveTasks === hasTasks,
      junkBlocked: shouldHaveTasks ? !forbiddenHit : !hasTasks && !forbiddenHit,
      forbiddenTitleClean: !forbiddenHit,
      taskCountOk,
      requiredTitleCoverage,
      passed:
        shouldHaveTasks === hasTasks &&
        !forbiddenHit &&
        taskCountOk &&
        requiredTitleCoverage === 1,
    },
  };
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function summarize(results) {
  const negativeCases = results.filter((result) => !result.expected.shouldHaveTasks);
  const positiveCases = results.filter((result) => result.expected.shouldHaveTasks);

  return {
    total: results.length,
    negativeCases: negativeCases.length,
    positiveCases: positiveCases.length,
    passRate: average(results.map((result) => result.metrics.passed)),
    junkBlockAccuracy: average(negativeCases.map((result) => result.metrics.junkBlocked)),
    validActionKeepAccuracy: average(
      positiveCases.map((result) => result.metrics.hasTaskCorrect && result.metrics.taskCountOk)
    ),
    forbiddenTitleCleanRate: average(results.map((result) => result.metrics.forbiddenTitleClean)),
    requiredTitleCoverage: average(
      positiveCases.map((result) => result.metrics.requiredTitleCoverage)
    ),
  };
}

const args = parseArgs(process.argv);
const examples = readJsonl(args.input);
const results = examples.map(evaluateExample);
const summary = summarize(results);
const report = {
  input: args.input,
  generatedAt: new Date().toISOString(),
  summary,
  failureSamples: results.filter((result) => !result.metrics.passed).slice(0, 20),
};

ensureDirectory(args.output);
fs.writeFileSync(resolveProjectPath(args.output), JSON.stringify(report, null, 2), "utf-8");

console.log(JSON.stringify(summary, null, 2));
console.log(`Report written to ${args.output}`);
