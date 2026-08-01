const DEFAULT_AI_BASE_URL = "https://tamcamai-1.onrender.com";

const aiBaseUrl = (
  process.env.VITE_AI_SERVICE_BASE_URL ||
  process.env.AI_SERVICE_BASE_URL ||
  DEFAULT_AI_BASE_URL
).replace(/\/+$/, "");

const cases = [
  {
    name: "employee birthday reminders from table",
    payload: {
      message: "tôi muốn tạo lịch nhắc ngày sinh nhật cho các nhân viên",
      tasks: [],
      documents: [
        {
          fileName: "Danh sach nhan vien.xlsx",
          textPreview: [
            "Mã nhân viên | Họ và tên | Ngày sinh | Phòng ban | Chức vụ",
            "NV001 | Nguyễn Minh Anh | 10/07/1996 | Kinh doanh | Nhân viên",
            "NV002 | Trần Thu Hà | 15/07/1997 | Kho vận | Nhân viên",
          ].join("\n"),
        },
      ],
      conversationId: "eval-birthday-table",
      userId: "eval",
    },
    expect: (data) => {
      const tasks = Array.isArray(data.suggestedTasks) ? data.suggestedTasks : [];
      return (
        data.intent === "CREATE_TASK_DRAFT" &&
        tasks.length === 2 &&
        tasks.every((task) => task.repeat === "yearly") &&
        tasks.some((task) => String(task.title || "").includes("Nguyễn Minh Anh")) &&
        tasks.some((task) => String(task.title || "").includes("Trần Thu Hà"))
      );
    },
  },
  {
    name: "daily check-in reminder keeps requested time",
    payload: {
      message: "tạo lịch nhắc nhở mỗi ngày tôi phải chấm công vào lúc 8h sáng",
      tasks: [],
      documents: [],
      conversationId: "eval-daily-reminder",
      userId: "eval",
    },
    expect: (data) => {
      const task = Array.isArray(data.suggestedTasks) ? data.suggestedTasks[0] : null;
      return (
        data.intent === "CREATE_TASK_DRAFT" &&
        task &&
        task.repeat === "daily" &&
        task.startTime === "08:00"
      );
    },
  },
  {
    name: "birthday request clarifies when no employee data",
    payload: {
      message: "tạo lịch nhắc sinh nhật cho các nhân viên",
      tasks: [],
      documents: [
        {
          fileName: "Thong bao KPI.docx",
          textPreview: "Đây là thông báo cập nhật KPI tháng 7, không có danh sách nhân viên hoặc ngày sinh.",
        },
      ],
      conversationId: "eval-birthday-missing-data",
      userId: "eval",
    },
    expect: (data) => {
      const tasks = Array.isArray(data.suggestedTasks) ? data.suggestedTasks : [];
      return data.intent === "CLARIFY" && tasks.length === 0 && data.requiresClarification === true;
    },
  },
  {
    name: "study planner creates study sessions from active study tasks",
    payload: {
      message: "sap xep lich hoc hop li cho toi",
      tasks: [
        {
          title: "On tap Python",
          description: "Lam bai tap ve ham, list va file",
          category: "Study",
          priority: "Cao",
          necessity: "Cao",
          deadline: "2026-08-05",
          completed: false,
        },
        {
          title: "Hoc tu vung tieng Anh",
          description: "On 30 tu vung chu de cong viec",
          category: "Study",
          priority: "Trung binh",
          necessity: "Trung binh",
          deadline: "2026-08-08",
          completed: false,
        },
      ],
      documents: [],
      conversationId: "eval-study-planner",
      userId: "eval",
    },
    expect: (data) => {
      const tasks = Array.isArray(data.suggestedTasks) ? data.suggestedTasks : [];
      return (
        data.intent === "CREATE_TASK_DRAFT" &&
        tasks.length >= 2 &&
        tasks.every((task) => task.category === "Study") &&
        tasks.every((task) => typeof task.startTime === "string" && task.startTime.length === 5)
      );
    },
  },
  {
    name: "study planner understands subjects from natural language",
    payload: {
      message: "minh can hoc Toan, Anh, Python trong 2 tuan, ranh 19h30 moi toi",
      tasks: [],
      documents: [],
      conversationId: "eval-study-planner-subjects",
      userId: "eval",
    },
    expect: (data) => {
      const tasks = Array.isArray(data.suggestedTasks) ? data.suggestedTasks : [];
      return (
        data.intent === "CREATE_TASK_DRAFT" &&
        tasks.length >= 3 &&
        tasks.every((task) => task.category === "Study") &&
        tasks.every((task) => task.startTime === "19:30") &&
        tasks.some((task) => String(task.title || "").includes("Toan")) &&
        tasks.some((task) => String(task.title || "").includes("Python"))
      );
    },
  },
];

async function postChat(payload) {
  const response = await fetch(`${aiBaseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return data;
}

let failed = 0;

console.log("TamCam AI chat evaluation");
console.log(`AI base URL: ${aiBaseUrl}\n`);

for (const testCase of cases) {
  try {
    const data = await postChat(testCase.payload);
    const ok = testCase.expect(data);
    const suggestedTaskCount = Array.isArray(data.suggestedTasks)
      ? data.suggestedTasks.length
      : 0;

    if (!ok) {
      failed += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(
        JSON.stringify(
          {
            intent: data.intent,
            confidenceLevel: data.confidenceLevel,
            suggestedTaskCount,
            answer: String(data.answer || data.reply || "").slice(0, 300),
            suggestedTasks: (data.suggestedTasks || []).slice(0, 3),
          },
          null,
          2
        )
      );
      continue;
    }

    console.log(`PASS ${testCase.name}`);
    console.log(`     intent: ${data.intent}`);
    console.log(`     suggestedTasks: ${suggestedTaskCount}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(`     ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`\nAI chat evaluation failed: ${failed}/${cases.length} case(s) failed.`);
  process.exit(1);
}

console.log(`\nAI chat evaluation passed: ${cases.length}/${cases.length} case(s) passed.`);
