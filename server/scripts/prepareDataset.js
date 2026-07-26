import fs from "node:fs";
import path from "node:path";
import { normalizeDataset, toJsonl } from "../utils/documentTraining.js";

function readJson(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jsonl") {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    if (!String(error.message || "").includes("NaN")) {
      throw error;
    }

    console.warn(
      "Input contains non-standard NaN values. Converting NaN to null."
    );

    return JSON.parse(content.replace(/\bNaN\b/g, "null"));
  }
}

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }
}

const [, , inputPath, outputPath = "server/data/tamcam-training.jsonl"] =
  process.argv;

if (!inputPath) {
  console.error(
    "Usage: npm run prepare:dataset -- <input.json> <output.jsonl>"
  );
  process.exit(1);
}

const input = readJson(inputPath);
const normalizedRecords = normalizeDataset(input).filter(
  (record) => record.documentText
);
const output = toJsonl(
  normalizedRecords.map((record) => record.trainingExample)
);

ensureDirectory(outputPath);
fs.writeFileSync(outputPath, `${output}\n`, "utf-8");

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      records: normalizedRecords.length,
      examples: normalizedRecords.length,
    },
    null,
    2
  )
);
