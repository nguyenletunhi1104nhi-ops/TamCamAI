import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");

const reportPaths = {
  dataset: "server/reports/tamcam-vietnamese-test-local.json",
  rag: "server/reports/tamcam-rag-qa-v2.json",
  antiJunk: "server/reports/tamcam-anti-junk-task-test.json",
  birthday: "server/reports/tamcam-birthday-reminder-test.json",
  predictive: "server/reports/tamcam-predictive-local.json",
  dataAgent: "server/reports/tamcam-data-analysis-agent-local.json",
  all: "server/reports/tamcam-ai-evaluation-summary.json",
};

function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

function runNodeScript(scriptPath, args = []) {
  execFileSync(
    process.execPath,
    [resolveProjectPath(scriptPath), ...args],
    {
      cwd: projectRoot,
      stdio: "inherit",
    }
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveProjectPath(filePath), "utf-8"));
}

function ensureDirectory(filePath) {
  const directory = path.dirname(resolveProjectPath(filePath));

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }
}

function clampScore(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function average(values) {
  const validValues = values.filter((value) => typeof value === "number");

  if (validValues.length === 0) {
    return 0;
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function computeScores(
  datasetSummary,
  ragSummary,
  antiJunkSummary,
  birthdaySummary,
  predictiveSummary,
  dataAgentSummary
) {
  const taskExtractionScore = average([
    datasetSummary.hasTaskAccuracy,
    datasetSummary.taskCountExactAccuracy,
    datasetSummary.titleF1,
    datasetSummary.deadlineAccuracy,
    datasetSummary.startTimeAccuracy,
  ].map(clampScore));
  const documentQaScore = average([
    ragSummary.evidenceHitRate,
    ragSummary.mustContainCoverage,
    ragSummary.answerF1,
  ].map(clampScore));
  const birthdayReminderScore = average([
    birthdaySummary.hasTaskAccuracy,
    birthdaySummary.taskCountExactAccuracy,
    birthdaySummary.titleF1,
    birthdaySummary.deadlineAccuracy,
    birthdaySummary.startTimeAccuracy,
  ].map(clampScore));
  const antiJunkScore = average([
    antiJunkSummary.passRate,
    antiJunkSummary.junkBlockAccuracy,
    antiJunkSummary.validActionKeepAccuracy,
    antiJunkSummary.forbiddenTitleCleanRate,
    antiJunkSummary.requiredTitleCoverage,
  ].map(clampScore));
  const predictiveScore = average([
    predictiveSummary.hasPredictionRate,
    predictiveSummary.trendAccuracy,
    predictiveSummary.forecastRangeAccuracy,
    predictiveSummary.riskAccuracy,
    predictiveSummary.actionCoverage,
  ].map(clampScore));
  const dataAnalysisAgentScore = average([
    dataAgentSummary.intentAccuracy,
    dataAgentSummary.columnSelectionAccuracy,
    dataAgentSummary.operationAccuracy,
    dataAgentSummary.numericAnswerAccuracy,
    dataAgentSummary.topKAccuracy,
  ].map(clampScore));
  const overallScore = [
    taskExtractionScore * 0.25,
    documentQaScore * 0.25,
    antiJunkScore * 0.1,
    birthdayReminderScore * 0.1,
    predictiveScore * 0.15,
    dataAnalysisAgentScore * 0.15,
  ].reduce((sum, score) => sum + score, 0);

  return {
    taskExtractionScore,
    documentQaScore,
    antiJunkScore,
    birthdayReminderScore,
    predictiveScore,
    dataAnalysisAgentScore,
    overallScore,
    overallScore10: Number((overallScore * 10).toFixed(2)),
  };
}

runNodeScript("server/scripts/evaluateDataset.js", [
  "--input",
  "server/data/tamcam-vietnamese-test.jsonl",
  "--output",
  reportPaths.dataset,
]);
runNodeScript("server/scripts/evaluateRagQa.js", [
  "--input",
  "server/data/tamcam-rag-qa-v2.jsonl",
  "--output",
  reportPaths.rag,
  "--top-k",
  "4",
]);
runNodeScript("server/scripts/evaluateAntiJunkTasks.js", [
  "--input",
  "server/data/tamcam-anti-junk-task-test.jsonl",
  "--output",
  reportPaths.antiJunk,
]);
runNodeScript("server/scripts/evaluateDataset.js", [
  "--input",
  "server/data/tamcam-birthday-reminder-test.jsonl",
  "--output",
  reportPaths.birthday,
]);
runNodeScript("server/scripts/evaluatePredictiveAnalytics.js", [
  "--input",
  "server/data/tamcam-predictive-test.jsonl",
  "--output",
  reportPaths.predictive,
]);
runNodeScript("server/scripts/evaluateDataAnalysisAgent.js", [
  "--output",
  reportPaths.dataAgent,
]);

const datasetReport = readJson(reportPaths.dataset);
const ragReport = readJson(reportPaths.rag);
const antiJunkReport = readJson(reportPaths.antiJunk);
const birthdayReport = readJson(reportPaths.birthday);
const predictiveReport = readJson(reportPaths.predictive);
const dataAgentReport = readJson(reportPaths.dataAgent);
const scores = computeScores(
  datasetReport.summary,
  ragReport.summary,
  antiJunkReport.summary,
  birthdayReport.summary,
  predictiveReport.summary,
  dataAgentReport.summary
);
const report = {
  generatedAt: new Date().toISOString(),
  modelConfig: {
    primaryModel: "gemini-2.5-flash",
    architecture:
      "Gemini + prompt + chat history + lightweight RAG + local fallback + predictive analytics + office reminder extraction",
  },
  scores,
  modules: {
    taskExtraction: datasetReport.summary,
    documentQaRag: ragReport.summary,
    antiJunkTasks: antiJunkReport.summary,
    birthdayReminders: birthdayReport.summary,
    predictiveAnalytics: predictiveReport.summary,
    dataAnalysisAgent: dataAgentReport.summary,
  },
  sourceReports: reportPaths,
};

ensureDirectory(reportPaths.all);
fs.writeFileSync(
  resolveProjectPath(reportPaths.all),
  JSON.stringify(report, null, 2),
  "utf-8"
);

console.log(JSON.stringify({
  overallScore10: scores.overallScore10,
  taskExtractionScore: scores.taskExtractionScore,
  documentQaScore: scores.documentQaScore,
  antiJunkScore: scores.antiJunkScore,
  birthdayReminderScore: scores.birthdayReminderScore,
  predictiveScore: scores.predictiveScore,
  dataAnalysisAgentScore: scores.dataAnalysisAgentScore,
}, null, 2));
console.log(`Report written to ${reportPaths.all}`);
