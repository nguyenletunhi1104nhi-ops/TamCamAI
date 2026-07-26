import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import {
  buildDocumentIntelligence,
  extractTasks,
  inferLocalDocumentMetadata,
  normalizeExtractedTasks,
} from "./utils/extractTasks.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL ||
  "http://127.0.0.1:8000/analyze-document";
const CLIENT_ORIGINS = (
  process.env.CLIENT_ORIGINS ||
  process.env.CLIENT_ORIGIN ||
  "http://localhost:5173,http://localhost:5175"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CLIENT_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
  })
);
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function decodeFileName(fileName) {
  return Buffer.from(fileName, "latin1").toString("utf8");
}

function buildFileInfo(file) {
  return {
    name: decodeFileName(file.originalname),
    size: file.size,
    type: file.mimetype,
  };
}

function getFileExtension(file) {
  return file.originalname
    .split(".")
    .pop()
    ?.toLowerCase();
}

function isSpreadsheetFile(file) {
  return ["xlsx", "xls", "csv"].includes(getFileExtension(file));
}

function isPlainTextFile(extension) {
  return [
    "txt",
    "md",
    "markdown",
    "json",
    "html",
    "htm",
    "rtf",
    "log",
    "xml",
    "js",
    "jsx",
    "ts",
    "tsx",
    "css",
  ].includes(extension);
}

function stripMarkup(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\'[0-9a-f]{2}/gi, " ")
    .replace(/[{}\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvRows(text) {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(/,|;|\t/)
        .map((cell) => cell.trim())
    )
    .filter((row) => row.some(Boolean));
}

function rowsToAnalysisText(rows, sheetName = "Sheet1") {
  if (!rows.length) {
    return `BANG DU LIEU: ${sheetName}\nKhong co dong du lieu.`;
  }

  const headers = rows[0].map((header, index) =>
    header || `Cot ${index + 1}`
  );
  const dataRows = rows.slice(1);
  const lines = [
    `BANG DU LIEU: ${sheetName}`,
    `Tong so dong du lieu: ${dataRows.length}`,
    `Cot: ${headers.join(" | ")}`,
    "",
    "DU LIEU THEO TUNG DONG:",
  ];

  dataRows.slice(0, 200).forEach((row, index) => {
    const values = headers.map((header, cellIndex) => {
      const value = row[cellIndex] || "";
      return `${header}: ${value}`;
    });

    lines.push(`${index + 1}. ${values.join(" | ")}`);
  });

  if (dataRows.length > 200) {
    lines.push(`... Con ${dataRows.length - 200} dong chua hien thi.`);
  }

  return lines.join("\n");
}

function parseNumberValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const rawValue = String(value).trim();

  if (!rawValue) {
    return null;
  }

  const normalized = rawValue
    .replace(/[%₫$€£]/g, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function formatInsightNumber(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number(value.toFixed(2)).toLocaleString("vi-VN");
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  const directDate = new Date(rawValue);

  if (!Number.isNaN(directDate.getTime())) {
    return directDate;
  }

  const match = rawValue.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : new Date().getFullYear());
  const parsed = new Date(year, month - 1, day);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toPeriodKey(date, granularity = "month") {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return granularity === "day" ? `${year}-${month}-${day}` : `${year}-${month}`;
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function computeCorrelation(firstValues, secondValues) {
  const pairs = firstValues
    .map((value, index) => [value, secondValues[index]])
    .filter(([first, second]) => first !== null && second !== null);

  if (pairs.length < 3) {
    return null;
  }

  const firstAverage = pairs.reduce((total, [first]) => total + first, 0) / pairs.length;
  const secondAverage = pairs.reduce((total, [, second]) => total + second, 0) / pairs.length;
  const numerator = pairs.reduce(
    (total, [first, second]) => total + (first - firstAverage) * (second - secondAverage),
    0
  );
  const firstVariance = pairs.reduce((total, [first]) => total + (first - firstAverage) ** 2, 0);
  const secondVariance = pairs.reduce((total, [, second]) => total + (second - secondAverage) ** 2, 0);
  const denominator = Math.sqrt(firstVariance * secondVariance);

  return denominator ? numerator / denominator : null;
}

function computeLinearForecast(points) {
  const values = points
    .map((point, index) => ({
      x: index + 1,
      y: Number(point.total),
    }))
    .filter((point) => Number.isFinite(point.y));

  if (values.length < 3) {
    return null;
  }

  const xAverage = values.reduce((total, point) => total + point.x, 0) / values.length;
  const yAverage = values.reduce((total, point) => total + point.y, 0) / values.length;
  const numerator = values.reduce(
    (total, point) => total + (point.x - xAverage) * (point.y - yAverage),
    0
  );
  const denominator = values.reduce(
    (total, point) => total + (point.x - xAverage) ** 2,
    0
  );
  const slope = denominator ? numerator / denominator : 0;
  const intercept = yAverage - slope * xAverage;
  const fittedValues = values.map((point) => ({
    ...point,
    fitted: intercept + slope * point.x,
  }));
  const mae =
    fittedValues.reduce((total, point) => total + Math.abs(point.y - point.fitted), 0) /
    fittedValues.length;
  const yVariance = values.reduce(
    (total, point) => total + (point.y - yAverage) ** 2,
    0
  );
  const residualVariance = fittedValues.reduce(
    (total, point) => total + (point.y - point.fitted) ** 2,
    0
  );
  const rSquared = yVariance ? Math.max(0, 1 - residualVariance / yVariance) : 0;
  const nextX = values.length + 1;
  const forecast = intercept + slope * nextX;
  const recentAverage =
    values.slice(-3).reduce((total, point) => total + point.y, 0) /
    Math.min(3, values.length);
  const blendedForecast = forecast * 0.7 + recentAverage * 0.3;
  const intervalRadius = Math.max(mae * 1.5, Math.abs(blendedForecast) * 0.05);

  return {
    forecast: blendedForecast,
    lowerBound: blendedForecast - intervalRadius,
    upperBound: blendedForecast + intervalRadius,
    slope,
    intercept,
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

function analyzeSpreadsheetRows(rows, sheetName = "Sheet1") {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      sheetName,
      rowCount: 0,
      columnCount: 0,
      numericColumns: [],
      groupInsights: [],
      chartSuggestions: [],
    };
  }

  const headers = rows[0].map((header, index) =>
    String(header || `Cột ${index + 1}`).trim()
  );
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell || "").trim()));
  const numericColumns = headers
    .map((header, columnIndex) => {
      const values = dataRows
        .map((row) => parseNumberValue(row[columnIndex]))
        .filter((value) => value !== null);

      if (values.length < Math.max(2, Math.ceil(dataRows.length * 0.35))) {
        return null;
      }

      const sum = values.reduce((total, value) => total + value, 0);
      const min = Math.min(...values);
      const max = Math.max(...values);

      return {
        name: header,
        count: values.length,
        sum,
        average: sum / values.length,
        min,
        max,
      };
    })
    .filter(Boolean);

  const dimensionColumns = headers
    .map((header, columnIndex) => {
      const values = dataRows
        .map((row) => String(row[columnIndex] || "").trim())
        .filter(Boolean);
      const uniqueValues = [...new Set(values)];

      if (
        uniqueValues.length >= 2 &&
        uniqueValues.length <= Math.min(20, Math.max(2, dataRows.length * 0.7)) &&
        !numericColumns.some((column) => column.name === header)
      ) {
        return {
          name: header,
          columnIndex,
          uniqueCount: uniqueValues.length,
        };
      }

      return null;
    })
    .filter(Boolean);

  const groupInsights = [];
  const mainMetric = numericColumns[0];
  const mainDimension = dimensionColumns[0];

  if (mainMetric && mainDimension) {
    const metricIndex = headers.indexOf(mainMetric.name);
    const groups = new Map();

    dataRows.forEach((row) => {
      const groupName = String(row[mainDimension.columnIndex] || "Khác").trim() || "Khác";
      const value = parseNumberValue(row[metricIndex]);

      if (value === null) {
        return;
      }

      const current = groups.get(groupName) || {
        group: groupName,
        total: 0,
        count: 0,
      };

      current.total += value;
      current.count += 1;
      groups.set(groupName, current);
    });

    const sortedGroups = [...groups.values()].sort((a, b) => b.total - a.total);

    if (sortedGroups.length > 0) {
      groupInsights.push({
        dimension: mainDimension.name,
        metric: mainMetric.name,
        topGroups: sortedGroups.slice(0, 5),
        bottomGroups: sortedGroups.slice(-5).reverse(),
      });
    }
  }

  const chartSuggestions = [];

  if (mainDimension && numericColumns.length > 0) {
    chartSuggestions.push(
      `Biểu đồ cột: so sánh ${numericColumns[0].name} theo ${mainDimension.name}`
    );
  }

  if (numericColumns.length >= 2) {
    chartSuggestions.push(
      `Biểu đồ scatter/cột nhóm: so sánh ${numericColumns[0].name} và ${numericColumns[1].name}`
    );
  }

  if (headers.some((header) => /ngày|date|tháng|month|time|năm/i.test(header))) {
    chartSuggestions.push("Biểu đồ đường: xem xu hướng theo thời gian");
  }

  return {
    sheetName,
    rowCount: dataRows.length,
    columnCount: headers.length,
    columns: headers,
    numericColumns,
    dimensionColumns,
    groupInsights,
    chartSuggestions,
  };
}

function classifySpreadsheetColumns(headers, dataRows, numericColumns, dimensionColumns, dateColumns = []) {
  const numericNames = new Set(numericColumns.map((column) => column.name));
  const dimensionNames = new Set(dimensionColumns.map((column) => column.name));
  const dateNames = new Set(dateColumns.map((column) => column.name));

  return headers.map((header, columnIndex) => {
    const sampleValues = dataRows
      .map((row) => String(row[columnIndex] || "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const normalizedHeader = header.toLowerCase();
    const role = dateNames.has(header)
      ? "date"
      : numericNames.has(header)
      ? "metric"
      : dimensionNames.has(header)
      ? "dimension"
      : /ghi chú|note|mô tả|mo ta|nội dung|noi dung/i.test(normalizedHeader)
      ? "text"
      : "attribute";

    return {
      name: header,
      role,
      sampleValues,
    };
  });
}

function buildGroupInsights(headers, dataRows, numericColumns, dimensionColumns) {
  const insights = [];

  dimensionColumns.slice(0, 4).forEach((dimensionColumn) => {
    numericColumns.slice(0, 4).forEach((metricColumn) => {
      const metricIndex = headers.indexOf(metricColumn.name);

      if (metricIndex < 0) {
        return;
      }

      const groups = new Map();
      dataRows.forEach((row) => {
        const groupName = String(row[dimensionColumn.columnIndex] || "Khác").trim() || "Khác";
        const value = parseNumberValue(row[metricIndex]);

        if (value === null) {
          return;
        }

        const current = groups.get(groupName) || {
          group: groupName,
          total: 0,
          count: 0,
          average: 0,
        };

        current.total += value;
        current.count += 1;
        current.average = current.total / current.count;
        groups.set(groupName, current);
      });

      const sortedGroups = [...groups.values()].sort((first, second) => second.total - first.total);

      if (sortedGroups.length > 0) {
        insights.push({
          dimension: dimensionColumn.name,
          metric: metricColumn.name,
          topGroups: sortedGroups.slice(0, 5),
          bottomGroups: sortedGroups.slice(-5).reverse(),
        });
      }
    });
  });

  return insights;
}

function buildSpreadsheetKeyFindings({
  sheetName,
  rowCount,
  numericColumns,
  groupInsights,
  qualityChecks,
  outliers,
  correlations,
  timeSeries,
  predictions,
}) {
  const findings = [];
  const strongestMetric = [...numericColumns].sort((first, second) => Math.abs(second.sum) - Math.abs(first.sum))[0];

  if (strongestMetric) {
    findings.push(
      `${sheetName}: chỉ số lớn nhất theo tổng là ${strongestMetric.name} = ${formatInsightNumber(strongestMetric.sum)} trên ${rowCount} dòng.`
    );
  }

  const firstGroup = groupInsights[0];
  const topGroup = firstGroup?.topGroups?.[0];
  const bottomGroup = firstGroup?.bottomGroups?.[0];
  if (firstGroup && topGroup) {
    findings.push(
      `Nhóm nổi bật nhất: ${topGroup.group} cao nhất theo ${firstGroup.metric} (${formatInsightNumber(topGroup.total)}).`
    );
  }
  if (firstGroup && bottomGroup && bottomGroup.group !== topGroup?.group) {
    findings.push(
      `Nhóm thấp nhất cần chú ý: ${bottomGroup.group} theo ${firstGroup.metric} (${formatInsightNumber(bottomGroup.total)}).`
    );
  }

  if (qualityChecks.missingCellCount > 0) {
    findings.push(`Dữ liệu còn ${qualityChecks.missingCellCount} ô thiếu, nên làm sạch trước khi ra quyết định.`);
  }

  if (qualityChecks.duplicateRows > 0) {
    findings.push(`Có ${qualityChecks.duplicateRows} dòng trùng lặp cần kiểm tra để tránh tính sai tổng.`);
  }

  if (outliers.length > 0) {
    findings.push(`Có ${outliers.length} cột phát hiện giá trị bất thường, ưu tiên kiểm tra ${outliers[0].column}.`);
  }

  if (correlations.length > 0) {
    const correlation = correlations[0];
    findings.push(
      `${correlation.firstColumn} và ${correlation.secondColumn} có tương quan ${correlation.strength} (${Number(correlation.correlation).toFixed(2)}).`
    );
  }

  if (timeSeries.length > 0) {
    const trend = timeSeries[0];
    const trendText = trend.trend === "up" ? "tăng" : trend.trend === "down" ? "giảm" : "ổn định";
    findings.push(`${trend.metric} đang có xu hướng ${trendText} theo ${trend.dateColumn}.`);
  }

  if (predictions.length > 0) {
    const prediction = predictions[0];
    findings.push(
      `Dự báo kỳ tiếp theo cho ${prediction.metric}: khoảng ${formatInsightNumber(prediction.nextPeriodForecast)} (${prediction.confidence}).`
    );
  }

  return findings.slice(0, 8);
}

function buildSpreadsheetRecommendedActions({ qualityChecks, outliers, predictions, groupInsights }) {
  const actions = [];

  if (qualityChecks.missingCellCount > 0 || qualityChecks.duplicateRows > 0) {
    actions.push("Làm sạch dữ liệu: bổ sung ô thiếu và xử lý dòng trùng trước khi báo cáo.");
  }

  if (outliers.length > 0) {
    actions.push(`Kiểm tra các giá trị bất thường ở cột ${outliers[0].column} để tránh kết luận sai.`);
  }

  predictions
    .map((prediction) => prediction.recommendedAction)
    .filter(Boolean)
    .slice(0, 3)
    .forEach((action) => actions.push(action));

  const firstGroup = groupInsights[0];
  const bottomGroup = firstGroup?.bottomGroups?.[0];
  if (bottomGroup) {
    actions.push(`Xem lại nhóm ${bottomGroup.group} vì đang thấp nhất theo ${firstGroup.metric}.`);
  }

  if (actions.length === 0) {
    actions.push("Tạo dashboard đơn giản để theo dõi các cột số chính và nhóm nổi bật.");
  }

  return [...new Set(actions)].slice(0, 6);
}

function analyzeSpreadsheetRowsV2(rows, sheetName = "Sheet1") {
  const base = analyzeSpreadsheetRows(rows, sheetName);

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ...base,
      qualityChecks: {
        duplicateRows: 0,
        missingByColumn: [],
        missingCellCount: 0,
        rowCount: 0,
      },
      outliers: [],
      correlations: [],
      timeSeries: [],
      predictions: [],
    };
  }

  const headers = rows[0].map((header, index) =>
    String(header || `Column ${index + 1}`).trim()
  );
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim()));
  const rowSample = dataRows.slice(0, 200).map((row, rowIndex) => {
    const record = {
      __rowNumber: rowIndex + 2,
    };
    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex] ?? "";
    });
    return record;
  });
  const serializedRows = dataRows.map((row) =>
    headers.map((_, index) => String(row[index] || "").trim()).join("|")
  );
  const duplicateRows = serializedRows.length - new Set(serializedRows).size;
  const missingByColumn = headers
    .map((header, columnIndex) => {
      const missingCount = dataRows.filter(
        (row) => !String(row[columnIndex] || "").trim()
      ).length;

      return {
        name: header,
        missingCount,
        missingRate: dataRows.length ? missingCount / dataRows.length : 0,
      };
    })
    .filter((column) => column.missingCount > 0);
  const numericColumns = base.numericColumns.map((column) => ({
    ...column,
    columnIndex: headers.indexOf(column.name),
  }));
  const outliers = numericColumns
    .filter((column) => column.columnIndex >= 0)
    .map((column) => {
      const values = dataRows
        .map((row, rowIndex) => ({
          rowIndex: rowIndex + 2,
          value: parseNumberValue(row[column.columnIndex]),
        }))
        .filter((item) => item.value !== null);
      const sortedValues = values.map((item) => item.value).sort((a, b) => a - b);
      const q1 = percentile(sortedValues, 0.25);
      const q3 = percentile(sortedValues, 0.75);
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      const examples = values
        .filter((item) => item.value < lowerBound || item.value > upperBound)
        .sort(
          (first, second) =>
            Math.abs(second.value - column.average) -
            Math.abs(first.value - column.average)
        )
        .slice(0, 5);

      return {
        column: column.name,
        lowerBound,
        upperBound,
        count: examples.length,
        examples,
      };
    })
    .filter((item) => item.count > 0);
  const correlations = [];

  for (let firstIndex = 0; firstIndex < numericColumns.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < numericColumns.length; secondIndex += 1) {
      const firstColumn = numericColumns[firstIndex];
      const secondColumn = numericColumns[secondIndex];

      if (firstColumn.columnIndex < 0 || secondColumn.columnIndex < 0) {
        continue;
      }

      const firstValues = dataRows.map((row) => parseNumberValue(row[firstColumn.columnIndex]));
      const secondValues = dataRows.map((row) => parseNumberValue(row[secondColumn.columnIndex]));
      const correlation = computeCorrelation(firstValues, secondValues);

      if (correlation !== null && Math.abs(correlation) >= 0.45) {
        correlations.push({
          firstColumn: firstColumn.name,
          secondColumn: secondColumn.name,
          correlation,
          strength: Math.abs(correlation) >= 0.75 ? "strong" : "moderate",
        });
      }
    }
  }

  const dateColumns = headers
    .map((header, columnIndex) => {
      const parsedDates = dataRows
        .map((row) => parseDateValue(row[columnIndex]))
        .filter(Boolean);

      if (
        parsedDates.length >= Math.max(3, Math.ceil(dataRows.length * 0.35)) ||
        /ngày|date|tháng|month|time|năm/i.test(header)
      ) {
        return {
          name: header,
          columnIndex,
          parsedCount: parsedDates.length,
        };
      }

      return null;
    })
    .filter(Boolean);
  const allGroupInsights = buildGroupInsights(
    headers,
    dataRows,
    numericColumns,
    base.dimensionColumns || []
  );
  const timeSeries = [];
  const predictions = [];

  if (dateColumns.length > 0 && numericColumns.length > 0) {
    const dateColumn = dateColumns[0];
    const metricColumns = numericColumns
      .filter((column) => column.columnIndex >= 0)
      .slice(0, 4);

    metricColumns.forEach((metricColumn) => {
      const periods = new Map();

      dataRows.forEach((row) => {
        const date = parseDateValue(row[dateColumn.columnIndex]);
        const value = parseNumberValue(row[metricColumn.columnIndex]);

        if (!date || value === null) {
          return;
        }

        const periodKey = toPeriodKey(date, dataRows.length > 90 ? "month" : "day");
        const current = periods.get(periodKey) || {
          period: periodKey,
          total: 0,
          count: 0,
        };

        current.total += value;
        current.count += 1;
        periods.set(periodKey, current);
      });

      const points = [...periods.values()].sort((first, second) =>
        first.period.localeCompare(second.period)
      );

      if (points.length >= 2) {
        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];
        const change = lastPoint.total - firstPoint.total;
        const trend =
          Math.abs(change) < Math.max(1, Math.abs(firstPoint.total) * 0.05)
            ? "stable"
            : change > 0
            ? "up"
            : "down";

        timeSeries.push({
          dateColumn: dateColumn.name,
          metric: metricColumn.name,
          points,
          trend,
          change,
          changeRate: firstPoint.total ? change / Math.abs(firstPoint.total) : null,
        });

        const forecast = computeLinearForecast(points);

        if (forecast) {
          const latestValue = Number(lastPoint.total) || 0;
          const expectedChange = forecast.forecast - latestValue;
          const expectedChangeRate = latestValue
            ? expectedChange / Math.abs(latestValue)
            : null;
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
              ? "tăng"
              : forecast.trendDirection === "down"
              ? "giảm"
              : "ổn định";

          predictions.push({
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
            reason:
              `Dự báo dựa trên hồi quy tuyến tính theo thời gian, pha thêm trung bình 3 kỳ gần nhất. Xu hướng hiện tại: ${trendText}.`,
            recommendedAction:
              forecast.trendDirection === "down"
                ? `Kiểm tra nguyên nhân ${metricColumn.name} đang giảm và chuẩn bị phương án cải thiện.`
                : forecast.trendDirection === "up"
                ? `Theo dõi ${metricColumn.name} đang tăng và chuẩn bị nguồn lực nếu xu hướng tiếp tục.`
                : `Tiếp tục theo dõi ${metricColumn.name}; hiện xu hướng khá ổn định.`,
          });
        }

        if (false && points.length >= 3) {
          const recentPoints = points.slice(-3);
          const recentAverage =
            recentPoints.reduce((total, point) => total + point.total, 0) /
            recentPoints.length;
          const lastGrowth =
            points[points.length - 1].total - points[points.length - 2].total;

          predictions.push({
            metric: metricColumn.name,
            method: "moving_average_3_periods",
            nextPeriodForecast: recentAverage + lastGrowth * 0.3,
            confidence: points.length >= 6 ? "MEDIUM" : "LOW",
            reason:
              "Dự báo baseline dựa trên trung bình 3 kỳ gần nhất và một phần xu hướng kỳ cuối.",
          });
        }
      }
    });
  }

  return {
    ...base,
    qualityChecks: {
      duplicateRows,
      missingByColumn,
      missingCellCount: missingByColumn.reduce(
        (total, column) => total + column.missingCount,
        0
      ),
      rowCount: dataRows.length,
    },
    rowSample,
    columnRoles: classifySpreadsheetColumns(
      headers,
      dataRows,
      numericColumns,
      base.dimensionColumns || [],
      dateColumns
    ),
    numericColumns,
    groupInsights: allGroupInsights.length > 0 ? allGroupInsights : base.groupInsights,
    outliers,
    correlations,
    timeSeries,
    predictions,
    keyFindings: buildSpreadsheetKeyFindings({
      sheetName,
      rowCount: dataRows.length,
      numericColumns,
      groupInsights: allGroupInsights.length > 0 ? allGroupInsights : base.groupInsights,
      qualityChecks: {
        duplicateRows,
        missingByColumn,
        missingCellCount: missingByColumn.reduce(
          (total, column) => total + column.missingCount,
          0
        ),
        rowCount: dataRows.length,
      },
      outliers,
      correlations,
      timeSeries,
      predictions,
    }),
    recommendedActions: buildSpreadsheetRecommendedActions({
      qualityChecks: {
        duplicateRows,
        missingByColumn,
        missingCellCount: missingByColumn.reduce(
          (total, column) => total + column.missingCount,
          0
        ),
        rowCount: dataRows.length,
      },
      outliers,
      predictions,
      groupInsights: allGroupInsights.length > 0 ? allGroupInsights : base.groupInsights,
    }),
    chartSuggestions: [
      ...new Set([
        ...base.chartSuggestions,
        ...(timeSeries.length > 0
          ? ["Biểu đồ đường: xem xu hướng theo thời gian"]
          : []),
      ]),
    ],
  };
}

async function extractSpreadsheetDataInsights(file) {
  if (!isSpreadsheetFile(file)) {
    return null;
  }

  const extension = getFileExtension(file);
  let sheets = [];

  if (extension === "csv") {
    sheets = [
      analyzeSpreadsheetRowsV2(
        parseCsvRows(file.buffer.toString("utf-8")),
        decodeFileName(file.originalname)
      ),
    ];
  } else {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(file.buffer, {
      type: "buffer",
      cellDates: true,
    });

    sheets = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      return analyzeSpreadsheetRowsV2(rows, sheetName);
    });
  }

  const totalRows = sheets.reduce((total, sheet) => total + sheet.rowCount, 0);
  const numericColumns = sheets.flatMap((sheet) =>
    sheet.numericColumns.map((column) => ({
      ...column,
      sheetName: sheet.sheetName,
    }))
  );
  const chartSuggestions = [
    ...new Set(sheets.flatMap((sheet) => sheet.chartSuggestions)),
  ];
  const groupInsights = sheets.flatMap((sheet) =>
    sheet.groupInsights.map((insight) => ({
      ...insight,
      sheetName: sheet.sheetName,
    }))
  );

  const qualityChecks = sheets.map((sheet) => ({
    sheetName: sheet.sheetName,
    ...(sheet.qualityChecks || {}),
  }));
  const columnRoles = sheets.flatMap((sheet) =>
    (sheet.columnRoles || []).map((column) => ({
      ...column,
      sheetName: sheet.sheetName,
    }))
  );
  const keyFindings = sheets.flatMap((sheet) =>
    (sheet.keyFindings || []).map((finding) => `[${sheet.sheetName}] ${finding}`)
  );
  const outliers = sheets.flatMap((sheet) =>
    (sheet.outliers || []).map((outlier) => ({
      ...outlier,
      sheetName: sheet.sheetName,
    }))
  );
  const correlations = sheets.flatMap((sheet) =>
    (sheet.correlations || []).map((correlation) => ({
      ...correlation,
      sheetName: sheet.sheetName,
    }))
  );
  const timeSeries = sheets.flatMap((sheet) =>
    (sheet.timeSeries || []).map((series) => ({
      ...series,
      sheetName: sheet.sheetName,
    }))
  );
  const predictions = sheets.flatMap((sheet) =>
    (sheet.predictions || []).map((prediction) => ({
      ...prediction,
      sheetName: sheet.sheetName,
    }))
  );
  const predictiveActions = predictions
    .map((prediction) => prediction.recommendedAction)
    .filter(Boolean);
  const recommendedActions = [
    ...new Set([
      ...sheets.flatMap((sheet) => sheet.recommendedActions || []),
      ...predictiveActions,
    ]),
  ].slice(0, 8);

  const summaryLines = [
    `Có ${sheets.length} sheet/bảng với ${totalRows} dòng dữ liệu.`,
    numericColumns.length > 0
      ? `Phát hiện ${numericColumns.length} cột số có thể phân tích.`
      : "Chưa phát hiện cột số đủ rõ để tính toán.",
    chartSuggestions.length > 0
      ? `Có thể trực quan hóa bằng: ${chartSuggestions.slice(0, 3).join("; ")}.`
      : "Chưa đủ cấu trúc để đề xuất biểu đồ chắc chắn.",
  ];

  summaryLines.push(
    outliers.length > 0
      ? `Phát hiện ${outliers.length} cột có giá trị bất thường cần kiểm tra.`
      : "Chưa phát hiện outlier rõ theo ngưỡng IQR."
  );
  summaryLines.push(
    predictions.length > 0
      ? `Có thể dự báo kỳ tiếp theo cho ${predictions.length} chỉ số có chuỗi thời gian.`
      : "Chưa đủ chuỗi thời gian để dự báo đáng tin."
  );
  if (keyFindings.length > 0) {
    summaryLines.push(`Insight nổi bật: ${keyFindings[0].replace(/^\[[^\]]+\]\s*/, "")}`);
  }

  return {
    type: "SPREADSHEET_NUMERIC_INSIGHTS",
    summary: summaryLines,
    sheets,
    columnRoles,
    keyFindings,
    numericColumns,
    qualityChecks,
    groupInsights,
    outliers,
    correlations,
    timeSeries,
    predictions,
    predictiveActions,
    recommendedActions,
    chartSuggestions,
  };
}

function createSpreadsheetTasks(file) {
  const fileName = decodeFileName(file.originalname);

  return [
    {
      title: `Tong hop du lieu tu ${fileName}`,
      description:
        "Kiem tra bang du lieu, tong hop theo tung nguoi/nhan vien va rut ra cac diem can chu y.",
      category: "Work",
      type: "Task",
      domain: "Data Analysis",
      difficulty: "Trung bình",
      necessity: "Cao",
      priority: "Cao",
      startDate: "",
      deadline: "",
      startTime: "08:00",
      endTime: "09:00",
      estimate: "1 giờ",
      reminder: "Đúng ngày",
      assignee: "Tôi",
      status: "To do",
      completed: false,
      suggestedSteps: [
        "Xac dinh cac cot chinh trong file",
        "Nhom du lieu theo tung nguoi hoac phong ban",
        "Tong hop so lieu quan trong",
        "Ghi lai cac bat thuong hoac viec can xu ly",
        "Xuat ket qua thanh danh sach viec can lam",
      ],
    },
  ];
}

function buildAnalyzeResponse({
  file,
  text,
  documentType,
  documentPurpose,
  analysisSource,
  tasks,
  dataInsights,
  dataAnalysis,
  summary,
  insights,
  anomalies,
  predictions,
  chartSuggestions,
  recommendedActions,
  suggestedTasks,
  isActionable,
  documentSummaryText,
}) {
  const normalizedTasks = normalizeExtractedTasks(
    text,
    Array.isArray(tasks) ? tasks : []
  );
  const intelligence = buildDocumentIntelligence(text, normalizedTasks);
  const nonActionableTypes = new Set([
    "REFERENCE_PROCESS_DOCUMENT",
    "KNOWLEDGE_ONLY",
    "GENERAL_DOCUMENT",
    "LOCAL_ANALYSIS",
  ]);
  const finalIsActionable =
    typeof isActionable === "boolean"
      ? isActionable && normalizedTasks.length > 0
      : normalizedTasks.length > 0 && !nonActionableTypes.has(documentType);

  if (dataInsights) {
    intelligence.documentSummary = {
      ...intelligence.documentSummary,
      keyDetails: [
        ...(intelligence.documentSummary?.keyDetails || []),
        ...dataInsights.summary,
      ],
      nextActions: [
        ...(intelligence.documentSummary?.nextActions || []),
        "Phân tích các cột số để tìm nhóm cao/thấp và điểm bất thường.",
        "Chọn biểu đồ phù hợp để trực quan hóa dữ liệu quan trọng.",
      ],
    };
  }

  return {
    success: true,
    file: buildFileInfo(file),
    documentType,
    documentPurpose,
    isActionable: finalIsActionable,
    documentSummaryText:
      documentSummaryText ||
      intelligence.documentSummary?.overview ||
      documentPurpose ||
      "",
    analysisSource,
    textLength: text.length,
    documentText: text,
    textPreview: text.slice(0, 1000),
    tasks: normalizedTasks,
    dataInsights: dataInsights || null,
    dataAnalysis: dataAnalysis || null,
    summary: typeof summary === "string" ? summary : "",
    insights: Array.isArray(insights) ? insights : dataInsights?.summary || [],
    anomalies: Array.isArray(anomalies) ? anomalies : dataInsights?.outliers || [],
    predictions: Array.isArray(predictions)
      ? predictions
      : dataInsights?.predictions || [],
    chartSuggestions: Array.isArray(chartSuggestions)
      ? chartSuggestions
      : dataInsights?.chartSuggestions || [],
    recommendedActions: Array.isArray(recommendedActions)
      ? recommendedActions
      : dataInsights?.recommendedActions || dataInsights?.predictiveActions || [],
    suggestedTasks: normalizeExtractedTasks(
      text,
      Array.isArray(suggestedTasks) ? suggestedTasks : []
    ),
    ...intelligence,
  };
}

function createFallbackAnalysis(file, text, reason, dataInsights = null) {
  const tasks = isSpreadsheetFile(file)
    ? createSpreadsheetTasks(file)
    : extractTasks(text);
  const metadata = inferLocalDocumentMetadata(text, file);

  console.warn(
    "Using local document analyzer fallback:",
    reason?.message || reason || "AI service unavailable"
  );

  return buildAnalyzeResponse({
    file,
    text,
    documentType: metadata.documentType,
    documentPurpose: metadata.documentPurpose,
    analysisSource: "local-analyzer",
    tasks,
    dataInsights,
  });
}

async function analyzeWithAiService(file, text, dataInsights = null) {
  const aiResponse = await fetch(AI_SERVICE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      file_name: file.originalname,
      data_insights: dataInsights,
    }),
    signal: AbortSignal.timeout(30000),
  });

  let aiData = null;

  try {
    aiData = await aiResponse.json();
  } catch {
    throw new Error(
      `AI service returned invalid JSON (${aiResponse.status})`
    );
  }

  console.log("Gemini analysis result:", aiData);

  if (!aiResponse.ok) {
    const error = new Error(
      aiData?.documentPurpose ||
        aiData?.message ||
        `AI service failed with HTTP ${aiResponse.status}`
    );
    error.status = aiResponse.status;
    throw error;
  }

  if (aiData?.success !== true) {
    throw new Error(
      aiData?.documentPurpose ||
        "AI service returned success=false"
    );
  }

  return buildAnalyzeResponse({
    file,
    text,
    documentType: aiData.documentType || "AI_ANALYSIS",
    documentPurpose:
      aiData.documentPurpose || "AI service analyzed the document.",
    analysisSource: "ai-service",
    tasks: aiData.isActionable === false ? [] : aiData.tasks,
    isActionable: Boolean(aiData.isActionable),
    documentSummaryText: aiData.documentSummary || "",
    dataInsights,
    dataAnalysis: aiData.dataAnalysis,
    summary: aiData.summary,
    insights: aiData.insights,
    anomalies: aiData.anomalies,
    predictions: aiData.predictions,
    chartSuggestions: aiData.chartSuggestions,
    recommendedActions: aiData.recommendedActions,
    suggestedTasks: aiData.suggestedTasks,
  });
}

async function extractText(file) {
  const extension = getFileExtension(file);

  if (isPlainTextFile(extension)) {
    const rawText = file.buffer.toString("utf-8");

    if (extension === "json") {
      try {
        return JSON.stringify(JSON.parse(rawText), null, 2);
      } catch {
        return rawText;
      }
    }

    if (extension === "html" || extension === "htm" || extension === "rtf") {
      return stripMarkup(rawText);
    }

    return rawText;
  }

  if (extension === "csv") {
    return rowsToAnalysisText(
      parseCsvRows(file.buffer.toString("utf-8")),
      decodeFileName(file.originalname)
    );
  }

  if (extension === "xlsx" || extension === "xls") {
    let XLSX;

    try {
      XLSX = await import("xlsx");
    } catch {
      throw new Error(
        "Server chua cai thu vien xlsx. Hay chay: cd server && npm install xlsx"
      );
    }

    const workbook = XLSX.read(file.buffer, {
      type: "buffer",
      cellDates: true,
    });
    const sheetTexts = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      return rowsToAnalysisText(rows, sheetName);
    });

    return sheetTexts.join("\n\n");
  }

  if (extension === "docx") {
    const result = await mammoth.extractRawText({
      buffer: file.buffer,
    });

    return result.value;
  }

  if (extension === "pdf") {
    const parser = new PDFParse({
      data: file.buffer,
    });

    try {
      const result = await parser.getText();

      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  return [
    `FILE KHONG CO BO DOC NOI DUNG CUC BO: ${decodeFileName(file.originalname)}`,
    `Kieu file: ${file.mimetype || extension || "unknown"}`,
    `Dung luong: ${file.size} bytes`,
    "TamCam AI da luu thong tin file, nhung server hien chua trich xuat duoc noi dung text tu dinh dang nay.",
    "Hay chuyen file sang PDF, DOCX, TXT, CSV hoac XLSX neu muon phan tich noi dung chi tiet.",
  ].join("\n");
}

app.get("/", (req, res) => {
  res.json({
    message: "TamCam AI Server is running",
  });
});

function getAiServiceBaseUrl() {
  try {
    const url = new URL(AI_SERVICE_URL);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return "";
  }
}

async function checkAiServiceHealth() {
  const baseUrl = getAiServiceBaseUrl();

  if (!baseUrl) {
    return {
      ok: false,
      status: "invalid-url",
      message: "AI_SERVICE_URL is not a valid URL.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(baseUrl, {
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      url: baseUrl,
      service: data.service || "TamCam AI Service",
      message: data.status || response.statusText,
    };
  } catch (error) {
    return {
      ok: false,
      status: error.name === "AbortError" ? "timeout" : "unreachable",
      url: baseUrl,
      message: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/health", async (req, res) => {
  const aiService = await checkAiServiceHealth();
  const allOk = aiService.ok;

  res.status(allOk ? 200 : 503).json({
    success: allOk,
    checkedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    services: {
      node: {
        ok: true,
        status: "running",
        port: PORT,
      },
      aiService,
      configuration: {
        aiServiceUrlConfigured: Boolean(AI_SERVICE_URL),
        clientOriginsConfigured: CLIENT_ORIGINS.length > 0,
        clientOrigins: CLIENT_ORIGINS,
      },
    },
  });
});

app.post(
  "/api/analyze-document",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded.",
        });
      }

      const text = await extractText(req.file);
      const dataInsights = await extractSpreadsheetDataInsights(req.file);
      let analysis;

      try {
        analysis = await analyzeWithAiService(req.file, text, dataInsights);
      } catch (error) {
        analysis = createFallbackAnalysis(req.file, text, error, dataInsights);
      }

      console.log("File:", req.file.originalname);
      console.log("Extracted characters:", text.length);
      console.log("Analysis source:", analysis.analysisSource);
      console.log("Detected tasks:", analysis.tasks.length);

      return res.json(analysis);
    } catch (error) {
      console.error("Analyze document error:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Cannot analyze document.",
      });
    }
  }
);

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Maximum file size is 10 MB.",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  next(error);
});

app.listen(PORT, () => {
  console.log(`TamCam AI Server running on port ${PORT}`);
});
