const ACTIONS = [
  "direct_answer",
  "structured_analysis",
  "ask_clarifying_question",
  "suggest_task_draft",
  "data_insight_first",
];

const DEFAULT_ALPHA = 0.35;
const DEFAULT_GAMMA = 0.75;
const DEFAULT_EPSILON = 0.08;

export const Q_LEARNING_STORAGE_KEY = "tamcam-q-learning-policy";

export function classifyQlState(message = "") {
  const text = String(message).toLowerCase();

  if (
    text.includes("excel") ||
    text.includes("csv") ||
    text.includes("du lieu") ||
    text.includes("dữ liệu") ||
    text.includes("bieu do") ||
    text.includes("biểu đồ") ||
    text.includes("du bao") ||
    text.includes("dự báo")
  ) {
    return "data_analysis";
  }

  if (
    text.includes("file") ||
    text.includes("tai lieu") ||
    text.includes("tài liệu") ||
    text.includes("tom tat") ||
    text.includes("tóm tắt") ||
    text.includes("noi dung") ||
    text.includes("nội dung")
  ) {
    return "document_qa";
  }

  if (
    text.includes("tao task") ||
    text.includes("tạo task") ||
    text.includes("chia nhiem vu") ||
    text.includes("chia nhiệm vụ") ||
    text.includes("checklist")
  ) {
    return "task_planning";
  }

  if (
    text.includes("lich") ||
    text.includes("lịch") ||
    text.includes("nhac") ||
    text.includes("nhắc") ||
    text.includes("deadline") ||
    text.includes("may gio") ||
    text.includes("mấy giờ")
  ) {
    return "schedule";
  }

  if (
    text.includes("loi") ||
    text.includes("lỗi") ||
    text.includes("khong duoc") ||
    text.includes("không được") ||
    text.includes("failed") ||
    text.includes("permission")
  ) {
    return "error_help";
  }

  return "general_qa";
}

export function createInitialQTable() {
  return {
    data_analysis: {
      direct_answer: 0.1,
      structured_analysis: 0.6,
      ask_clarifying_question: 0.15,
      suggest_task_draft: 0.2,
      data_insight_first: 0.7,
    },
    document_qa: {
      direct_answer: 0.25,
      structured_analysis: 0.65,
      ask_clarifying_question: 0.2,
      suggest_task_draft: 0.15,
      data_insight_first: 0.05,
    },
    task_planning: {
      direct_answer: 0.15,
      structured_analysis: 0.35,
      ask_clarifying_question: 0.25,
      suggest_task_draft: 0.75,
      data_insight_first: 0.05,
    },
    schedule: {
      direct_answer: 0.25,
      structured_analysis: 0.2,
      ask_clarifying_question: 0.45,
      suggest_task_draft: 0.55,
      data_insight_first: 0.05,
    },
    error_help: {
      direct_answer: 0.7,
      structured_analysis: 0.2,
      ask_clarifying_question: 0.1,
      suggest_task_draft: 0,
      data_insight_first: 0,
    },
    general_qa: {
      direct_answer: 0.55,
      structured_analysis: 0.25,
      ask_clarifying_question: 0.2,
      suggest_task_draft: 0.1,
      data_insight_first: 0.05,
    },
  };
}

export function loadQTable() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(Q_LEARNING_STORAGE_KEY) || "null"
    );
    const initial = createInitialQTable();

    if (!stored || typeof stored !== "object") {
      return initial;
    }

    return Object.fromEntries(
      Object.entries(initial).map(([state, actions]) => [
        state,
        {
          ...actions,
          ...(stored[state] || {}),
        },
      ])
    );
  } catch {
    return createInitialQTable();
  }
}

export function saveQTable(qTable) {
  localStorage.setItem(Q_LEARNING_STORAGE_KEY, JSON.stringify(qTable));
}

export function chooseQAction(qTable, state, epsilon = DEFAULT_EPSILON) {
  const actionValues = qTable[state] || qTable.general_qa || {};

  if (Math.random() < epsilon) {
    return ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  }

  return ACTIONS.reduce((bestAction, action) => {
    const currentValue = Number(actionValues[action] ?? 0);
    const bestValue = Number(actionValues[bestAction] ?? 0);

    return currentValue > bestValue ? action : bestAction;
  }, ACTIONS[0]);
}

export function updateQValue({
  qTable,
  state,
  action,
  reward,
  nextState = state,
  alpha = DEFAULT_ALPHA,
  gamma = DEFAULT_GAMMA,
}) {
  const nextTable = {
    ...qTable,
    [state]: {
      ...(qTable[state] || {}),
    },
  };
  const currentValue = Number(nextTable[state][action] ?? 0);
  const nextActionValues = qTable[nextState] || {};
  const maxNextValue = Math.max(
    0,
    ...ACTIONS.map((item) => Number(nextActionValues[item] ?? 0))
  );

  nextTable[state][action] =
    currentValue + alpha * (reward + gamma * maxNextValue - currentValue);

  return nextTable;
}

export function describeQPolicy(qTable, state, action) {
  const actionHints = {
    direct_answer:
      "Trả lời trực tiếp, tránh vòng vo, không lặp câu mẫu.",
    structured_analysis:
      "Trả lời có cấu trúc rõ: đây là gì, dữ liệu/nội dung chính, điểm đáng chú ý, nên làm gì.",
    ask_clarifying_question:
      "Nếu thiếu ngữ cảnh quan trọng, hỏi lại một câu ngắn trước khi tạo task hoặc kết luận.",
    suggest_task_draft:
      "Nếu có hành động rõ, đề xuất task nháp với tên ngắn, mô tả đầy đủ và checklist; không tự lưu.",
    data_insight_first:
      "Ưu tiên insight số liệu, bất thường, xu hướng, biểu đồ và dự báo; không biến từng dòng dữ liệu thành task.",
  };
  const stateScores = qTable[state] || {};
  const sortedScores = ACTIONS.map((item) => ({
    action: item,
    value: Number(stateScores[item] ?? 0),
  })).sort((first, second) => second.value - first.value);

  return [
    `Q_STATE: ${state}`,
    `Q_ACTION: ${action}`,
    `Q_POLICY_HINT: ${actionHints[action] || actionHints.direct_answer}`,
    `Q_VALUES: ${sortedScores
      .map((item) => `${item.action}=${item.value.toFixed(2)}`)
      .join(", ")}`,
  ].join("\n");
}
