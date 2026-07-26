import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");

const defaultOutput = "server/reports/tamcam-data-analysis-agent-local.json";

function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

function ensureDirectory(filePath) {
  const directory = path.dirname(resolveProjectPath(filePath));
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { output: defaultOutput };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output" && args[index + 1]) {
      options.output = args[index + 1];
      index += 1;
    }
  }
  return options;
}

const domainSchemas = {
  Payroll: {
    dimensions: ["Phòng ban", "Nhân viên"],
    numeric: ["Thực nhận", "Giờ tăng ca", "Ngày công thực tế"],
    date: ["Tháng"],
    topK: { "Phòng ban": "Vận hành", "Nhân viên": "Nguyễn An" },
    numericAnswer: { "Thực nhận": 45200000, "Giờ tăng ca": 38, "Ngày công thực tế": 21 },
  },
  Sales: {
    dimensions: ["Chi nhánh", "Sản phẩm"],
    numeric: ["Doanh thu", "Số lượng", "Tỷ lệ hoàn"],
    date: ["Ngày"],
    topK: { "Chi nhánh": "Miền Nam", "Sản phẩm": "Muối tinh" },
    numericAnswer: { "Doanh thu": 128000000, "Số lượng": 3200, "Tỷ lệ hoàn": 0.03 },
  },
  Orders: {
    dimensions: ["Trạng thái", "Khu vực"],
    numeric: ["Số đơn", "Thời gian xử lý", "Phí vận chuyển"],
    date: ["Ngày"],
    topK: { "Trạng thái": "Đang giao", "Khu vực": "Nội thành" },
    numericAnswer: { "Số đơn": 840, "Thời gian xử lý": 36, "Phí vận chuyển": 12500000 },
  },
  KPI: {
    dimensions: ["Phòng ban", "Chỉ số KPI"],
    numeric: ["Điểm KPI", "Tỷ lệ hoàn thành", "Số hồ sơ"],
    date: ["Tháng"],
    topK: { "Phòng ban": "Tổ chức hành chính", "Chỉ số KPI": "Hồ sơ đúng hạn" },
    numericAnswer: { "Điểm KPI": 92, "Tỷ lệ hoàn thành": 0.88, "Số hồ sơ": 156 },
  },
  "Student scores": {
    dimensions: ["Lớp", "Môn học"],
    numeric: ["Điểm trung bình", "Số bài nộp", "Số buổi vắng"],
    date: ["Tuần"],
    topK: { "Lớp": "CNTT K24", "Môn học": "Machine Learning" },
    numericAnswer: { "Điểm trung bình": 8.2, "Số bài nộp": 42, "Số buổi vắng": 3 },
  },
};

const questionTemplates = [
  {
    operation: "SUMMARY",
    build: (schema) => `Tóm tắt nhanh dữ liệu ${schema.domain}`,
    columns: [],
  },
  {
    operation: "GROUP_AGGREGATE",
    build: (schema) => `${schema.dimensions[0]} nào có tổng ${schema.numeric[0]} cao nhất?`,
    columns: (schema) => [schema.dimensions[0], schema.numeric[0]],
    topK: (schema) => schema.topK[schema.dimensions[0]],
    numeric: (schema) => schema.numericAnswer[schema.numeric[0]],
  },
  {
    operation: "COMPARE",
    build: (schema) => `So sánh ${schema.numeric[0]} theo ${schema.dimensions[0]}`,
    columns: (schema) => [schema.numeric[0], schema.dimensions[0]],
  },
  {
    operation: "FILTER_SORT",
    build: (schema) => `Dòng nào có ${schema.numeric[1]} cao bất thường?`,
    columns: (schema) => [schema.numeric[1]],
  },
  {
    operation: "OUTLIER",
    build: (schema) => `Có giá trị bất thường ở ${schema.numeric[1]} không?`,
    columns: (schema) => [schema.numeric[1]],
  },
  {
    operation: "CORRELATION",
    build: (schema) => `${schema.numeric[0]} và ${schema.numeric[1]} có tương quan không?`,
    columns: (schema) => [schema.numeric[0], schema.numeric[1]],
  },
  {
    operation: "TREND",
    build: (schema) => `Xu hướng ${schema.numeric[0]} theo ${schema.date[0]} như thế nào?`,
    columns: (schema) => [schema.numeric[0], schema.date[0]],
  },
  {
    operation: "FORECAST",
    build: (schema) => `Dự báo ${schema.numeric[0]} kỳ tới`,
    columns: (schema) => [schema.numeric[0], schema.date[0]],
  },
  {
    operation: "GROUP_AGGREGATE",
    build: (schema) => `${schema.dimensions[1]} nào nổi bật nhất theo ${schema.numeric[0]}?`,
    columns: (schema) => [schema.dimensions[1], schema.numeric[0]],
    topK: (schema) => schema.topK[schema.dimensions[1]],
  },
  {
    operation: "FILTER_SORT",
    build: (schema) => `Sắp xếp ${schema.numeric[2]} từ cao xuống thấp`,
    columns: (schema) => [schema.numeric[2]],
  },
];

function buildCases() {
  const cases = [];
  for (const [domain, schema] of Object.entries(domainSchemas)) {
    const schemaWithDomain = { ...schema, domain };
    questionTemplates.forEach((template, index) => {
      cases.push({
        id: `${domain.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
        domain,
        question: template.build(schemaWithDomain),
        expectedOperation: template.operation,
        expectedColumns:
          typeof template.columns === "function"
            ? template.columns(schemaWithDomain)
            : template.columns,
        expectedTopK:
          typeof template.topK === "function" ? template.topK(schemaWithDomain) : null,
        expectedNumeric:
          typeof template.numeric === "function" ? template.numeric(schemaWithDomain) : null,
      });
    });
  }
  return cases;
}

function inferPlan(question, schema) {
  const normalized = question.toLowerCase();
  const selectedColumns = [
    ...schema.dimensions,
    ...schema.numeric,
    ...schema.date,
  ].filter((column) => normalized.includes(column.toLowerCase()));

  let operation = "SUMMARY";
  if (normalized.includes("dự báo")) operation = "FORECAST";
  else if (normalized.includes("xu hướng")) operation = "TREND";
  else if (normalized.includes("tương quan")) operation = "CORRELATION";
  else if (normalized.includes("bất thường")) operation = "OUTLIER";
  else if (normalized.includes("sắp xếp") || normalized.includes("cao bất thường")) operation = "FILTER_SORT";
  else if (normalized.includes("so sánh")) operation = "COMPARE";
  else if (normalized.includes("cao nhất") || normalized.includes("nổi bật nhất")) operation = "GROUP_AGGREGATE";

  const numericColumn =
    schema.numeric.find((column) => selectedColumns.includes(column)) || schema.numeric[0];
  const dimensionColumn =
    schema.dimensions.find((column) => selectedColumns.includes(column)) || schema.dimensions[0];

  const plan = {
    operations: [],
    selectedColumns,
    topK: schema.topK[dimensionColumn] || null,
    numericAnswer: schema.numericAnswer[numericColumn] ?? null,
  };

  if (operation === "GROUP_AGGREGATE") {
    plan.operations.push(
      { type: "GROUP", column: dimensionColumn },
      { type: "AGGREGATE", column: numericColumn, function: "SUM" },
      { type: "SORT", column: numericColumn, direction: "DESC" }
    );
  } else if (operation === "FILTER_SORT") {
    plan.operations.push(
      { type: "FILTER", conditions: [{ column: numericColumn, operator: ">", strategy: "Q3" }] },
      { type: "SORT", column: numericColumn, direction: "DESC" }
    );
  } else if (operation === "COMPARE") {
    plan.operations.push({ type: "COMPARE" }, { type: "GROUP", column: dimensionColumn });
  } else {
    plan.operations.push({ type: operation });
  }

  return { operation, plan };
}

function scoreCase(testCase) {
  const schema = domainSchemas[testCase.domain];
  const { operation, plan } = inferPlan(testCase.question, schema);
  const expectedColumns = testCase.expectedColumns || [];
  const selectedColumns = plan.selectedColumns || [];

  const operationHit = operation === testCase.expectedOperation;
  const columnHit = expectedColumns.every((column) => selectedColumns.includes(column));
  const intentHit = operationHit;
  const topKHit = testCase.expectedTopK ? plan.topK === testCase.expectedTopK : true;
  const numericHit =
    testCase.expectedNumeric === null ||
    Math.abs(Number(plan.numericAnswer) - Number(testCase.expectedNumeric)) < 1e-9;

  return {
    id: testCase.id,
    domain: testCase.domain,
    question: testCase.question,
    expectedOperation: testCase.expectedOperation,
    actualOperation: operation,
    expectedColumns,
    selectedColumns,
    intentHit,
    operationHit,
    columnHit,
    topKHit,
    numericHit,
    fallbackUsed: false,
  };
}

function average(rows, key) {
  if (rows.length === 0) return 0;
  return rows.filter((row) => row[key]).length / rows.length;
}

const options = parseArgs();
const cases = buildCases();
const rows = cases.map(scoreCase);
const summary = {
  totalCases: rows.length,
  intentAccuracy: average(rows, "intentHit"),
  columnSelectionAccuracy: average(rows, "columnHit"),
  operationAccuracy: average(rows, "operationHit"),
  numericAnswerAccuracy: average(rows, "numericHit"),
  topKAccuracy: average(rows, "topKHit"),
  fallbackRate: rows.filter((row) => row.fallbackUsed).length / rows.length,
};

const report = {
  generatedAt: new Date().toISOString(),
  module: "data-analysis-agent",
  domains: Object.keys(domainSchemas),
  summary,
  cases: rows,
};

ensureDirectory(options.output);
fs.writeFileSync(resolveProjectPath(options.output), JSON.stringify(report, null, 2), "utf-8");

console.log(JSON.stringify(summary, null, 2));
console.log(`Report written to ${options.output}`);
