import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");

function parseArgs(argv) {
  const args = {
    input: "server/data/tamcam-predictive-test.jsonl",
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

function ensureDirectory(filePath) {
  const directory = path.dirname(resolveProjectPath(filePath));

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function readJsonl(filePath, limit = 0) {
  const lines = fs
    .readFileSync(resolveProjectPath(filePath, true), "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selectedLines = limit > 0 ? lines.slice(0, limit) : lines;

  return selectedLines.map((line) => JSON.parse(line));
}

function parseNumberValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalizedValue = String(value)
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  const number = Number(normalizedValue);

  return Number.isFinite(number) ? number : null;
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const rawValue = String(value || "").trim();
  const parsedDate = new Date(rawValue);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  const match = rawValue.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : new Date().getFullYear());
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toPeriodKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function computeLinearForecast(points) {
  const values = points
    .map((point, index) => ({ x: index + 1, y: Number(point.total) }))
    .filter((point) => Number.isFinite(point.y));

  if (values.length < 3) {
    return null;
  }

  const xAverage = values.reduce((total, point) => total + point.x, 0) / values.length;
  const yAverage = values.reduce((total, point) => total + point.y, 0) / values.length;
  const numerator = values.reduce((total, point) => total + (point.x - xAverage) * (point.y - yAverage), 0);
  const denominator = values.reduce((total, point) => total + (point.x - xAverage) ** 2, 0);
  const slope = denominator ? numerator / denominator : 0;
  const intercept = yAverage - slope * xAverage;
  const fittedValues = values.map((point) => ({
    ...point,
    fitted: intercept + slope * point.x,
  }));
  const mae = fittedValues.reduce((total, point) => total + Math.abs(point.y - point.fitted), 0) / fittedValues.length;
  const yVariance = values.reduce((total, point) => total + (point.y - yAverage) ** 2, 0);
  const residualVariance = fittedValues.reduce((total, point) => total + (point.y - point.fitted) ** 2, 0);
  const rSquared = yVariance ? Math.max(0, 1 - residualVariance / yVariance) : 0;
  const nextX = values.length + 1;
  const linearForecast = intercept + slope * nextX;
  const recentValues = values.slice(-3);
  const recentAverage = recentValues.reduce((total, point) => total + point.y, 0) / recentValues.length;
  const forecast = linearForecast * 0.7 + recentAverage * 0.3;
  const intervalRadius = Math.max(mae * 1.5, Math.abs(forecast) * 0.05);

  return {
    forecast,
    lowerBound: forecast - intervalRadius,
    upperBound: forecast + intervalRadius,
    slope,
    mae,
    rSquared,
    trendDirection:
      Math.abs(slope) < Math.max(0.5, Math.abs(yAverage) * 0.015)
        ? "stable"
        : slope > 0
        ? "up"
        : "down",
    confidence:
      values.length >= 8 && rSquared >= 0.55
        ? "HIGH"
        : values.length >= 5 && rSquared >= 0.3
        ? "MEDIUM"
        : "LOW",
  };
}

function analyzeRows(rows, sheetName = "Sheet1") {
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const dateColumnIndex = headers.findIndex((header) =>
    /ngay|date|time|thang|nam/i.test(String(header || ""))
  );
  const numericColumns = headers
    .map((header, columnIndex) => {
      const values = dataRows
        .map((row) => parseNumberValue(row[columnIndex]))
        .filter((value) => value !== null);

      if (columnIndex === dateColumnIndex || values.length < 3) {
        return null;
      }

      return {
        name: String(header || `Column ${columnIndex + 1}`),
        columnIndex,
      };
    })
    .filter(Boolean);

  if (dateColumnIndex < 0 || numericColumns.length === 0) {
    return [];
  }

  return numericColumns.slice(0, 4).flatMap((metricColumn) => {
    const periods = new Map();

    dataRows.forEach((row) => {
      const date = parseDateValue(row[dateColumnIndex]);
      const value = parseNumberValue(row[metricColumn.columnIndex]);

      if (!date || value === null) {
        return;
      }

      const period = toPeriodKey(date);
      const current = periods.get(period) || { period, total: 0, count: 0 };
      current.total += value;
      current.count += 1;
      periods.set(period, current);
    });

    const points = [...periods.values()].sort((first, second) =>
      first.period.localeCompare(second.period)
    );
    const forecast = computeLinearForecast(points);

    if (!forecast) {
      return [];
    }

    const latestValue = Number(points[points.length - 1].total) || 0;
    const expectedChange = forecast.forecast - latestValue;
    const expectedChangeRate = latestValue ? expectedChange / Math.abs(latestValue) : null;
    const riskLevel =
      forecast.trendDirection === "stable" && Math.abs(expectedChangeRate || 0) < 0.05
        ? "LOW"
        : forecast.confidence === "LOW"
        ? "HIGH"
        : Math.abs(expectedChangeRate || 0) >= 0.2
        ? "MEDIUM"
        : "LOW";
    const trendText =
      forecast.trendDirection === "up"
        ? "tang"
        : forecast.trendDirection === "down"
        ? "giam"
        : "on dinh";

    return [
      {
        sheetName,
        metric: metricColumn.name,
        method: "linear_regression_with_recent_average",
        nextPeriodForecast: forecast.forecast,
        lowerBound: forecast.lowerBound,
        upperBound: forecast.upperBound,
        confidence: forecast.confidence,
        trendDirection: forecast.trendDirection,
        expectedChange,
        expectedChangeRate,
        riskLevel,
        mae: forecast.mae,
        rSquared: forecast.rSquared,
        recommendedAction:
          forecast.trendDirection === "down"
            ? `Kiem tra nguyen nhan ${metricColumn.name} dang giam va chuan bi phuong an cai thien.`
            : forecast.trendDirection === "up"
            ? `Theo doi ${metricColumn.name} dang tang va chuan bi nguon luc neu xu huong tiep tuc.`
            : `Tiep tuc theo doi ${metricColumn.name}; hien xu huong kha on dinh.`,
        reason: `Xu huong hien tai: ${trendText}.`,
      },
    ];
  });
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[đĐ]/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateExample(example, index) {
  const predictions = analyzeRows(example.rows || [], example.sheetName || example.id);
  const expected = example.expected || {};
  const selectedPrediction =
    predictions.find((prediction) => prediction.metric === expected.metric) ||
    predictions[0] ||
    null;
  const forecast = selectedPrediction?.nextPeriodForecast;
  const forecastInRange =
    typeof forecast === "number" &&
    (expected.minForecast === undefined || forecast >= expected.minForecast) &&
    (expected.maxForecast === undefined || forecast <= expected.maxForecast);
  const recommendedActionText = normalizeText(selectedPrediction?.recommendedAction || "");
  const actionCoverage = Array.isArray(expected.mustRecommend)
    ? expected.mustRecommend.filter((item) =>
        recommendedActionText.includes(normalizeText(item))
      ).length / Math.max(expected.mustRecommend.length, 1)
    : 1;

  return {
    index,
    id: example.id || `example-${index + 1}`,
    expected,
    prediction: selectedPrediction,
    metrics: {
      hasPrediction: Boolean(selectedPrediction),
      trendCorrect: selectedPrediction?.trendDirection === expected.trendDirection,
      forecastInRange,
      riskAllowed: expected.riskLevels
        ? expected.riskLevels.includes(selectedPrediction?.riskLevel)
        : true,
      actionCoverage,
      confidence: selectedPrediction?.confidence || "",
    },
  };
}

function average(values) {
  const validValues = values.filter((value) => typeof value === "number");

  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function summarizeResults(results) {
  return {
    total: results.length,
    hasPredictionRate: average(results.map((result) => Number(result.metrics.hasPrediction))),
    trendAccuracy: average(results.map((result) => Number(result.metrics.trendCorrect))),
    forecastRangeAccuracy: average(results.map((result) => Number(result.metrics.forecastInRange))),
    riskAccuracy: average(results.map((result) => Number(result.metrics.riskAllowed))),
    actionCoverage: average(results.map((result) => result.metrics.actionCoverage)),
  };
}

const args = parseArgs(process.argv);
const examples = readJsonl(args.input, args.limit);
const results = examples.map(evaluateExample);
const summary = summarizeResults(results);
const failureSamples = results
  .filter(
    (result) =>
      !result.metrics.hasPrediction ||
      !result.metrics.trendCorrect ||
      !result.metrics.forecastInRange ||
      !result.metrics.riskAllowed ||
      result.metrics.actionCoverage < 1
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
  fs.writeFileSync(resolveProjectPath(args.output), JSON.stringify(report, null, 2), "utf-8");
}

console.log(JSON.stringify(summary, null, 2));

if (args.output) {
  console.log(`Report written to ${args.output}`);
}



