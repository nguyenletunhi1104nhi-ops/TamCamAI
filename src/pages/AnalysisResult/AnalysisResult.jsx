import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiDatabase,
  FiFileText,
  FiList,
  FiTarget,
} from "react-icons/fi";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";
import {
  detectNewTaskConflicts,
  findFreeSlotFromDate,
} from "../../utils/scheduleUtils";
const PIE_COLORS = ["#ec4899", "#22c55e", "#f59e0b", "#60a5fa", "#8b5cf6"];

function formatFileSize(size) {
  if (!size) return "0 KB";

  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;

  return `${(size / 1024).toFixed(2)} KB`;
}

function formatDate(date) {
  if (!date) return "Chưa xác định";

  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "Chưa xác định";

  return parsedDate.toLocaleDateString("vi-VN");
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";

  return Number(number.toFixed(2)).toLocaleString("vi-VN");
}

function normalizeTaskSteps(task) {
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const suggestedSteps = Array.isArray(task.suggestedSteps)
    ? task.suggestedSteps
    : [];

  return (checklist.length ? checklist : suggestedSteps)
    .map((step) => String(step || "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function getConfidenceLevel(analysisData, tasks, dataInsights) {
  if (analysisData.analysisSource === "ai-service" && analysisData.textLength > 400) {
    return "Cao";
  }

  if (dataInsights || tasks.length > 0 || analysisData.textLength > 400) {
    return "Trung bình";
  }

  return "Thấp";
}

function getActionabilityText(isActionable, taskCount) {
  if (isActionable && taskCount > 0) {
    return "Có việc có thể tạo task";
  }

  return "Nên đọc/tóm tắt trước, chưa nên tự tạo task";
}

function getTaskSelectionKey(task, index) {
  return task.id || `draft-task-${index}`;
}

function normalizeStatus(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isTaskActive(task) {
  const status = normalizeStatus(task.status);
  return task.completed !== true && status !== "completed" && status !== "hoan thanh";
}

function getTaskDate(task) {
  return task.startDate || task.deadline || "";
}

function getMinutes(time) {
  const [hour, minute] = String(time || "").split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return hour * 60 + minute;
}

function toTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addDaysToIsoDate(dateString, days) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return "";

  date.setDate(date.getDate() + days);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function getTimeRange(task) {
  const start = getMinutes(task.startTime);

  if (start === null) return null;

  const end = getMinutes(task.endTime) ?? start + 60;

  return {
    start,
    end: Math.max(end, start + 15),
    duration: Math.max(end - start, 30),
  };
}

function findFreeImportSlot(taskToMove, selectedTasks, existingTasks) {
  return findFreeSlotFromDate(taskToMove, [...existingTasks, ...selectedTasks], {
    dateGetter: (task) => task.startDate || task.deadline || "",
  });
}

function detectScheduleConflicts(newTasks, existingTasks) {
  return detectNewTaskConflicts(newTasks, existingTasks, {
    getNewTaskId: (task, index) =>
      task.__selectionKey || getTaskSelectionKey(task, index),
  });
}

function AnalysisResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [savedDocumentId, setSavedDocumentId] = useState("");
  const [selectedTaskKeys, setSelectedTaskKeys] = useState([]);
  const [draftTasks, setDraftTasks] = useState([]);
  const [existingTasks, setExistingTasks] = useState([]);

  const analysisData =
    location.state?.analysisData ||
    (location.state?.tasks
      ? {
          success: true,
          file: {
            name: location.state.fileName,
            size: location.state.fileSize,
            type: location.state.fileType,
          },
          documentType: location.state.documentType,
          documentPurpose: location.state.documentPurpose,
          analysisSource: location.state.analysisSource,
          textLength: location.state.textLength,
          documentText: location.state.documentText,
          textPreview: location.state.textPreview,
          tasks: location.state.tasks,
        }
      : {});
  const uploadedFile = location.state?.file || null;
  const fileName = analysisData.file?.name || uploadedFile?.name || "Tài liệu";
  const fileSize = analysisData.file?.size || uploadedFile?.size || 0;
  const textPreview = analysisData.textPreview || "";
  const tasks = Array.isArray(analysisData.tasks) ? analysisData.tasks : [];
  const suggestedTasks = Array.isArray(analysisData.suggestedTasks)
    ? analysisData.suggestedTasks
    : [];
  const displayTasks = tasks.length ? tasks : suggestedTasks;
  const documentSummary =
    analysisData.documentSummary && typeof analysisData.documentSummary === "object"
      ? analysisData.documentSummary
      : null;
  const dataInsights =
    analysisData.dataInsights && typeof analysisData.dataInsights === "object"
      ? analysisData.dataInsights
      : null;
  const isActionable = Boolean(analysisData.isActionable && tasks.length > 0);
  const confidenceLevel = getConfidenceLevel(analysisData, tasks, dataInsights);

  const summaryMainIdeas = Array.isArray(documentSummary?.mainIdeas)
    ? documentSummary.mainIdeas
    : [];
  const summaryKeyDetails = Array.isArray(documentSummary?.keyDetails)
    ? documentSummary.keyDetails
    : [];
  const summaryNextActions = Array.isArray(documentSummary?.nextActions)
    ? documentSummary.nextActions
    : [];
  const dataSummary = Array.isArray(dataInsights?.summary)
    ? dataInsights.summary
    : Array.isArray(analysisData.insights)
      ? analysisData.insights
      : [];
  const numericColumns = Array.isArray(dataInsights?.numericColumns)
    ? dataInsights.numericColumns
    : [];
  const groupInsights = Array.isArray(dataInsights?.groupInsights)
    ? dataInsights.groupInsights
    : [];
  const keyFindings = Array.isArray(dataInsights?.keyFindings)
    ? dataInsights.keyFindings
    : [];
  const qualityChecks = Array.isArray(dataInsights?.qualityChecks)
    ? dataInsights.qualityChecks
    : [];
  const outliers = Array.isArray(dataInsights?.outliers)
    ? dataInsights.outliers
    : Array.isArray(analysisData.anomalies)
      ? analysisData.anomalies
      : [];
  const correlations = Array.isArray(dataInsights?.correlations)
    ? dataInsights.correlations
    : [];
  const timeSeries = Array.isArray(dataInsights?.timeSeries)
    ? dataInsights.timeSeries
    : [];
  const predictions = Array.isArray(dataInsights?.predictions)
    ? dataInsights.predictions
    : Array.isArray(analysisData.predictions)
      ? analysisData.predictions
      : [];
  const recommendedActions = Array.isArray(analysisData.recommendedActions)
    ? analysisData.recommendedActions
    : Array.isArray(dataInsights?.recommendedActions)
      ? dataInsights.recommendedActions
      : [];
  const chartSuggestions = Array.isArray(analysisData.chartSuggestions)
    ? analysisData.chartSuggestions
    : Array.isArray(dataInsights?.chartSuggestions)
      ? dataInsights.chartSuggestions
      : [];

  const primaryGroupInsight = groupInsights.find(
    (insight) => Array.isArray(insight.topGroups) && insight.topGroups.length > 0
  );
  const groupChartData = primaryGroupInsight
    ? primaryGroupInsight.topGroups.slice(0, 6).map((group) => ({
        name: String(group.group || "Nhóm"),
        value: Number(group.total) || 0,
      }))
    : [];
  const primaryTimeSeries = timeSeries.find(
    (series) => Array.isArray(series.points) && series.points.length >= 2
  );
  const timeSeriesChartData = primaryTimeSeries
    ? primaryTimeSeries.points.slice(-12).map((point) => ({
        period: point.period,
        value: Number(point.total) || 0,
      }))
    : [];
  const categoryChartData = useMemo(() => {
    const categoryMap = displayTasks.reduce((acc, task) => {
      const category = task.category || task.type || "Khác";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
  }, [displayTasks]);
  const editableTasks = isActionable ? draftTasks : displayTasks;
  const selectedImportTasks = useMemo(() => {
    return draftTasks
      .map((task, index) => ({
        ...task,
        __selectionKey: getTaskSelectionKey(task, index),
      }))
      .filter((task) => selectedTaskKeys.includes(task.__selectionKey));
  }, [draftTasks, selectedTaskKeys]);
  const scheduleConflicts = useMemo(
    () => detectScheduleConflicts(selectedImportTasks, existingTasks),
    [existingTasks, selectedImportTasks]
  );
  const scheduleConflictSuggestions = useMemo(() => {
    return scheduleConflicts.slice(0, 3).map((conflict) => ({
      conflict,
      slot: findFreeImportSlot(conflict.first, selectedImportTasks, existingTasks),
    }));
  }, [existingTasks, scheduleConflicts, selectedImportTasks]);

  useEffect(() => {
    if (!auth.currentUser) return undefined;

    const tasksQuery = query(
      collection(db, "tasks"),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setExistingTasks(
          snapshot.docs.map((taskDocument) => ({
            id: taskDocument.id,
            ...taskDocument.data(),
          }))
        );
      },
      (error) => {
        console.error("Get existing tasks for analysis import error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isActionable || tasks.length === 0) {
      setSelectedTaskKeys([]);
      setDraftTasks([]);
      return;
    }

    setDraftTasks(tasks);
    setSelectedTaskKeys(
      tasks.map((task, index) => getTaskSelectionKey(task, index))
    );
  }, [isActionable, tasks]);

  useEffect(() => {
    async function saveAnalyzedDocument() {
      if (
        savedDocumentId ||
        !auth.currentUser ||
        !analysisData.success ||
        !fileName
      ) {
        return;
      }

      const documentText =
        analysisData.documentText ||
        analysisData.text ||
        analysisData.textPreview ||
        "";

      if (!documentText) return;

      try {
        const documentRef = await addDoc(collection(db, "documents"), {
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          fileName,
          fileSize,
          fileType: analysisData.file?.type || uploadedFile?.type || "",
          documentType: analysisData.documentType || "",
          documentPurpose: analysisData.documentPurpose || "",
          analysisSource: analysisData.analysisSource || "Document Analysis",
          confidenceLevel,
          isActionable,
          text: documentText,
          textLength: analysisData.textLength || documentText.length,
          textPreview: analysisData.textPreview || documentText.slice(0, 1000),
          documentSummary: analysisData.documentSummary || null,
          documentSections: Array.isArray(analysisData.documentSections)
            ? analysisData.documentSections
            : [],
          documentChunks: Array.isArray(analysisData.documentChunks)
            ? analysisData.documentChunks
            : [],
          keywords: Array.isArray(analysisData.keywords)
            ? analysisData.keywords
            : [],
          dataInsights: analysisData.dataInsights || null,
          tasks,
          suggestedTasks,
          createdAt: serverTimestamp(),
        });

        setSavedDocumentId(documentRef.id);
      } catch (error) {
        console.error("Save analyzed document error:", error);
      }
    }

    saveAnalyzedDocument();
  }, [
    analysisData,
    confidenceLevel,
    fileName,
    fileSize,
    isActionable,
    savedDocumentId,
    suggestedTasks,
    tasks,
    uploadedFile,
  ]);

  async function handleImport() {
    if (!auth.currentUser) {
      alert("Bạn cần đăng nhập trước.");
      navigate("/login");
      return;
    }

    if (tasks.length === 0) {
      alert("Chưa có task đủ rõ để đưa vào Task List.");
      return;
    }

    if (selectedImportTasks.length === 0) {
      alert("Bạn chưa chọn task nào để import.");
      return;
    }

    if (scheduleConflicts.length > 0) {
      const firstConflict = scheduleConflicts[0];
      const shouldContinue = window.confirm(
        [
          `Có ${scheduleConflicts.length} lịch bị trùng trước khi import.`,
          `Ví dụ: "${firstConflict.first.title}" trùng với "${firstConflict.second.title}".`,
          "Bạn vẫn muốn import các task đã chọn chứ?",
        ].join("\n")
      );

      if (!shouldContinue) {
        return;
      }
    }

    try {
      setImporting(true);

      for (const item of selectedImportTasks) {
        const steps = normalizeTaskSteps(item);

        await addDoc(collection(db, "tasks"), {
          title: item.title || "Nhiệm vụ chưa có tiêu đề",
          category: item.category || "Work",
          type: item.type || "Task",
          domain: item.domain || "",
          difficulty: item.difficulty || "Trung bình",
          necessity: item.necessity || "Trung bình",
          priority: item.priority || "Trung bình",
          startDate: item.startDate || item.deadline || "",
          deadline: item.deadline || item.startDate || "",
          startTime: item.startTime || "",
          endTime: item.endTime || "",
          estimate: item.estimate || "",
          reminder: item.reminder || "Không nhắc",
          recurrence: item.recurrence || "",
          assignee: item.assignee || "Tôi",
          status: item.status || "To do",
          completed: false,
          description: item.description || item.sourceText || "",
          checklist: steps,
          suggestedSteps: steps,
          source: analysisData.analysisSource || "Document Analysis",
          sourceFile: fileName,
          sourceText: item.sourceText || item.description || "",
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      alert(`Đã import ${selectedImportTasks.length} task vào Task List.`);
      navigate("/tasks");
    } catch (error) {
      console.error("Import extracted tasks error:", error);
      alert("Không thể import task.");
    } finally {
      setImporting(false);
    }
  }

  function toggleTaskSelection(task, index) {
    const key = getTaskSelectionKey(task, index);

    setSelectedTaskKeys((currentKeys) =>
      currentKeys.includes(key)
        ? currentKeys.filter((currentKey) => currentKey !== key)
        : [...currentKeys, key]
    );
  }

  function selectAllTasks() {
    setSelectedTaskKeys(
      draftTasks.map((task, index) => getTaskSelectionKey(task, index))
    );
  }

  function clearTaskSelection() {
    setSelectedTaskKeys([]);
  }

  function updateDraftTask(index, field, value) {
    setDraftTasks((currentTasks) =>
      currentTasks.map((task, taskIndex) =>
        taskIndex === index ? { ...task, [field]: value } : task
      )
    );
  }

  function applyScheduleSuggestion(conflict, slot) {
    if (!conflict?.first?.tempId || !slot) return;

    setDraftTasks((currentTasks) =>
      currentTasks.map((task, index) => {
        const key = getTaskSelectionKey(task, index);

        if (key !== conflict.first.tempId) {
          return task;
        }

        return {
          ...task,
          deadline: slot.date,
          startDate: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
        };
      })
    );
  }

  function updateDraftChecklistStep(taskIndex, stepIndex, value) {
    setDraftTasks((currentTasks) =>
      currentTasks.map((task, currentTaskIndex) => {
        if (currentTaskIndex !== taskIndex) {
          return task;
        }

        const steps = normalizeTaskSteps(task);
        steps[stepIndex] = value;

        return {
          ...task,
          checklist: steps,
          suggestedSteps: steps,
        };
      })
    );
  }

  function addDraftChecklistStep(taskIndex) {
    setDraftTasks((currentTasks) =>
      currentTasks.map((task, currentTaskIndex) => {
        if (currentTaskIndex !== taskIndex) {
          return task;
        }

        const steps = [...normalizeTaskSteps(task), ""];

        return {
          ...task,
          checklist: steps,
          suggestedSteps: steps,
        };
      })
    );
  }

  function removeDraftChecklistStep(taskIndex, stepIndex) {
    setDraftTasks((currentTasks) =>
      currentTasks.map((task, currentTaskIndex) => {
        if (currentTaskIndex !== taskIndex) {
          return task;
        }

        const steps = normalizeTaskSteps(task).filter(
          (_, currentStepIndex) => currentStepIndex !== stepIndex
        );

        return {
          ...task,
          checklist: steps,
          suggestedSteps: steps,
        };
      })
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-green-50 border border-green-200 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="flex items-center gap-4">
          <FiCheckCircle className="text-5xl text-green-500 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              Phân tích hoàn tất
            </h1>
            <p className="text-gray-600 mt-1">
              Tấm Cám đã đọc tài liệu, tách nội dung, dữ liệu và task nháp nếu có.
            </p>
          </div>
        </div>

        <div className="bg-white border border-green-100 rounded-2xl px-6 py-4 min-w-[260px]">
          <p className="font-semibold line-clamp-1">{fileName}</p>
          <p className="text-gray-500 text-sm">{formatFileSize(fileSize)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          icon={<FiFileText />}
          title="Loại tài liệu"
          value={analysisData.documentType || "Chưa rõ"}
          note={analysisData.analysisSource || "Document Analysis"}
        />
        <MetricCard
          icon={<FiTarget />}
          title="Trạng thái"
          value={getActionabilityText(isActionable, tasks.length)}
          note={`${tasks.length} task có thể tạo`}
        />
        <MetricCard
          icon={<FiDatabase />}
          title="Độ tin cậy"
          value={confidenceLevel}
          note={`${analysisData.textLength || 0} ký tự đã đọc`}
        />
        <MetricCard
          icon={<FiBarChart2 />}
          title="Dữ liệu số"
          value={dataInsights ? "Có phân tích" : "Không có"}
          note={`${predictions.length} dự báo, ${outliers.length} bất thường`}
        />
      </div>

      <SectionCard title="Đây là file gì" eyebrow="Document Intelligence">
        <p className="text-gray-700 leading-7">
          {analysisData.documentSummaryText ||
            documentSummary?.overview ||
            analysisData.documentPurpose ||
            "Tài liệu này cần được đọc hiểu thêm trước khi tạo task."}
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <InfoPill label="Nguồn" value={analysisData.analysisSource || "local"} />
          <InfoPill label="Hành động" value={getActionabilityText(isActionable, tasks.length)} />
          <InfoPill label="Độ tin cậy" value={confidenceLevel} />
        </div>
      </SectionCard>

      <SectionCard title="Nội dung chính" eyebrow="Summary">
        {summaryMainIdeas.length === 0 && summaryKeyDetails.length === 0 ? (
          <p className="text-gray-500">
            Chưa có đủ nội dung để tóm tắt thành các ý rõ ràng.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ListBlock
              title="Ý chính"
              items={summaryMainIdeas.slice(0, 7)}
              emptyText="Chưa tách được ý chính."
            />
            <ListBlock
              title="Chi tiết đáng chú ý"
              items={summaryKeyDetails.slice(0, 7)}
              emptyText="Chưa có chi tiết nổi bật."
            />
          </div>
        )}
      </SectionCard>

      {(dataInsights || dataSummary.length > 0) && (
        <SectionCard title="Dữ liệu đáng chú ý" eyebrow="Data Analysis">
          <div className="space-y-6">
            <ListBlock
              title="Insight nhanh"
              items={[...dataSummary, ...keyFindings].slice(0, 8)}
              emptyText="Chưa có insight dữ liệu."
            />

            {(groupChartData.length > 0 || timeSeriesChartData.length > 0 || categoryChartData.length > 0) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {groupChartData.length > 0 && (
                  <ChartPanel
                    title={`So sánh theo ${primaryGroupInsight.dimension || "nhóm"}`}
                    subtitle={`Chỉ số: ${primaryGroupInsight.metric || "giá trị"}`}
                  >
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={groupChartData} layout="vertical">
                        <CartesianGrid stroke="#ffe4ef" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatNumber} />
                        <YAxis dataKey="name" type="category" width={110} />
                        <Tooltip formatter={(value) => formatNumber(value)} />
                        <Bar dataKey="value" fill="#ec4899" radius={[0, 10, 10, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                )}

                {timeSeriesChartData.length > 0 && (
                  <ChartPanel
                    title="Xu hướng theo thời gian"
                    subtitle={primaryTimeSeries.metric || "Chỉ số chính"}
                  >
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={timeSeriesChartData}>
                        <CartesianGrid stroke="#ffe4ef" vertical={false} />
                        <XAxis dataKey="period" />
                        <YAxis tickFormatter={formatNumber} />
                        <Tooltip formatter={(value) => formatNumber(value)} />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#ec4899"
                          strokeWidth={3}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                )}

                {groupChartData.length === 0 &&
                  timeSeriesChartData.length === 0 &&
                  categoryChartData.length > 0 && (
                    <ChartPanel title="Phân bổ task đề xuất" subtitle="Theo nhóm nhiệm vụ">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={95}
                          >
                            {categoryChartData.map((entry, index) => (
                              <Cell
                                key={entry.name}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartPanel>
                  )}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <DataDetailPanel
                title="EDA - chất lượng dữ liệu"
                items={qualityChecks.slice(0, 4).map((item) => {
                  const missingCellCount = item.missingCellCount || 0;
                  const duplicateRows = item.duplicateRows || 0;
                  return `${item.sheetName || "Sheet"}: ${missingCellCount} ô thiếu, ${duplicateRows} dòng trùng.`;
                })}
              />
              <DataDetailPanel
                title="Bất thường / tương quan"
                items={[
                  ...outliers.slice(0, 4).map((item) =>
                    `${item.column || "Cột"}: ${item.count || 0} giá trị bất thường.`
                  ),
                  ...correlations.slice(0, 3).map((item) =>
                    `${item.firstColumn} ↔ ${item.secondColumn}: tương quan ${Number(item.correlation || 0).toFixed(2)}.`
                  ),
                ]}
              />
            </div>
          </div>
        </SectionCard>
      )}

      {(recommendedActions.length > 0 || summaryNextActions.length > 0 || chartSuggestions.length > 0) && (
        <SectionCard title="Tấm Cám đề xuất làm gì tiếp" eyebrow="Recommended Actions">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ListBlock
              title="Hướng xử lý"
              items={[...recommendedActions, ...summaryNextActions].slice(0, 8)}
              emptyText="Chưa có hướng xử lý cụ thể."
            />
            <ListBlock
              title="Biểu đồ / cách xem dữ liệu"
              items={chartSuggestions.slice(0, 6)}
              emptyText="Chưa cần biểu đồ riêng."
            />
          </div>
        </SectionCard>
      )}

      {predictions.length > 0 && (
        <SectionCard title="Dự báo tầng 4" eyebrow="Predictive Analytics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {predictions.slice(0, 4).map((prediction, index) => (
              <div key={`prediction-${index}`} className="rounded-2xl border border-pink-100 bg-pink-50 p-5">
                <p className="font-bold text-gray-900">{prediction.metric}</p>
                <p className="mt-2 text-gray-700">
                  Kỳ tiếp theo khoảng{" "}
                  <span className="font-bold text-pink-500">
                    {formatNumber(prediction.nextPeriodForecast)}
                  </span>
                </p>
                {prediction.lowerBound !== undefined && prediction.upperBound !== undefined && (
                  <p className="mt-2 text-sm text-gray-600">
                    Khoảng dự báo: {formatNumber(prediction.lowerBound)} -{" "}
                    {formatNumber(prediction.upperBound)}
                  </p>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  Độ tin cậy {prediction.confidence || "LOW"} • Rủi ro{" "}
                  {prediction.riskLevel || "LOW"}
                </p>
                {prediction.recommendedAction && (
                  <p className="mt-3 text-sm text-gray-700">
                    Nên làm: {prediction.recommendedAction}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {textPreview && (
        <SectionCard title="Preview tài liệu" eyebrow="Raw Text">
          <pre className="whitespace-pre-wrap text-sm text-gray-600 bg-pink-50 rounded-2xl p-5 max-h-[220px] overflow-y-auto">
            {textPreview}
          </pre>
        </SectionCard>
      )}

      <SectionCard title="Task nháp từ tài liệu" eyebrow="Action Items">
        {!isActionable || displayTasks.length === 0 ? (
          <div className="border border-dashed border-pink-200 bg-pink-50 rounded-2xl p-6 text-gray-600">
            <div className="flex gap-3">
              <FiAlertTriangle className="text-pink-500 text-2xl shrink-0" />
              <div>
                <p className="font-semibold text-gray-900">
                  Chưa nên tự động tạo task từ tài liệu này.
                </p>
                <p className="mt-2">
                  Tấm Cám sẽ ưu tiên tóm tắt, giải thích và hỏi lại bạn nếu cần
                  biến nội dung này thành lịch/task cụ thể.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-pink-100 bg-pink-50 p-4">
              <div>
                <p className="font-semibold text-gray-900">
                  Đã chọn {selectedImportTasks.length}/{draftTasks.length} task để import
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Chỉ những task được chọn mới được đưa vào Task List và Calendar.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllTasks}
                  className="rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-600 hover:bg-pink-100"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={clearTaskSelection}
                  className="rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-pink-100"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            {scheduleConflicts.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex gap-3">
                  <FiAlertTriangle className="mt-0.5 shrink-0 text-2xl text-red-500" />
                  <div className="min-w-0">
                    <p className="font-semibold text-red-700">
                      Có {scheduleConflicts.length} lịch bị trùng trước khi import
                    </p>
                    <div className="mt-3 space-y-3 text-sm text-red-700">
                      {scheduleConflictSuggestions.map(({ conflict, slot }, conflictIndex) => (
                        <div
                          key={`${conflict.first.tempId}-${conflictIndex}`}
                          className="rounded-xl border border-red-100 bg-white/70 p-3"
                        >
                          <p>
                          {conflictIndex + 1}. "{conflict.first.title}" trùng với "
                          {conflict.second.title}" ngày {formatDate(conflict.first.taskDate)}.
                          </p>

                          {slot ? (
                            <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <p className="text-red-600">
                                Gợi ý: dời sang {formatDate(slot.date)}, {slot.startTime} -{" "}
                                {slot.endTime}.
                              </p>
                              <button
                                type="button"
                                onClick={() => applyScheduleSuggestion(conflict, slot)}
                                className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
                              >
                                Áp dụng giờ gợi ý
                              </button>
                            </div>
                          ) : (
                            <p className="mt-2 text-red-600">
                              Chưa tìm thấy khung trống đủ dài trong 7 ngày tới.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-red-600">
                      Bạn có thể sửa ngày/giờ ở task nháp bên dưới trước khi import.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {editableTasks.map((item, index) => {
              const steps = normalizeTaskSteps(item);
              const selectionKey = getTaskSelectionKey(item, index);
              const isSelected = selectedTaskKeys.includes(selectionKey);

              return (
                <div
                  key={item.id || index}
                  className={`border rounded-2xl p-5 transition ${
                    isSelected
                      ? "border-pink-300 bg-white"
                      : "border-pink-100 bg-gray-50/70 opacity-75"
                  }`}
                >
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div className="flex gap-3 min-w-0">
                      <label className="mt-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTaskSelection(item, index)}
                          className="h-5 w-5 accent-pink-500"
                          aria-label={`Chọn task ${item.title || index + 1}`}
                        />
                      </label>

                      <div className="min-w-0">
                        <label className="block">
                          <span className="text-sm font-semibold text-gray-600">
                            Tên task
                          </span>
                          <input
                            type="text"
                            value={item.title || ""}
                            onChange={(event) =>
                              updateDraftTask(index, "title", event.target.value)
                            }
                            className="mt-2 w-full rounded-xl border border-pink-100 px-4 py-3 font-bold text-gray-900 outline-none focus:border-pink-400"
                          />
                        </label>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-sm font-semibold text-gray-600">
                              Loại
                            </span>
                            <input
                              type="text"
                              value={item.type || "Task"}
                              onChange={(event) =>
                                updateDraftTask(index, "type", event.target.value)
                              }
                              className="mt-2 w-full rounded-xl border border-pink-100 px-4 py-2.5 text-gray-700 outline-none focus:border-pink-400"
                            />
                          </label>

                          <label className="block">
                            <span className="text-sm font-semibold text-gray-600">
                              Độ ưu tiên
                            </span>
                            <select
                              value={item.priority || "Trung bình"}
                              onChange={(event) =>
                                updateDraftTask(index, "priority", event.target.value)
                              }
                              className="mt-2 w-full rounded-xl border border-pink-100 px-4 py-2.5 text-gray-700 outline-none focus:border-pink-400"
                            >
                              <option value="Cao">Cao</option>
                              <option value="Trung bình">Trung bình</option>
                              <option value="Thấp">Thấp</option>
                            </select>
                          </label>
                        </div>

                        <label className="mt-3 block">
                          <span className="text-sm font-semibold text-gray-600">
                            Mô tả
                          </span>
                          <textarea
                            value={item.description || ""}
                            onChange={(event) =>
                              updateDraftTask(index, "description", event.target.value)
                            }
                            rows={3}
                            className="mt-2 w-full rounded-xl border border-pink-100 px-4 py-3 text-sm leading-6 text-gray-700 outline-none focus:border-pink-400"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="xl:text-right shrink-0">
                      <div className="grid grid-cols-1 gap-3 min-w-[220px]">
                        <label className="block text-left">
                          <span className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                            <FiCalendar /> Ngày
                          </span>
                          <input
                            type="date"
                            value={item.deadline || item.startDate || ""}
                            onChange={(event) => {
                              updateDraftTask(index, "deadline", event.target.value);
                              updateDraftTask(index, "startDate", event.target.value);
                            }}
                            className="mt-2 w-full rounded-xl border border-pink-100 px-4 py-2.5 text-gray-700 outline-none focus:border-pink-400"
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-left">
                            <span className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                              <FiClock /> Bắt đầu
                            </span>
                            <input
                              type="time"
                              value={item.startTime || ""}
                              onChange={(event) =>
                                updateDraftTask(index, "startTime", event.target.value)
                              }
                              className="mt-2 w-full rounded-xl border border-pink-100 px-3 py-2.5 text-gray-700 outline-none focus:border-pink-400"
                            />
                          </label>

                          <label className="block text-left">
                            <span className="text-sm font-semibold text-gray-600">
                              Kết thúc
                            </span>
                            <input
                              type="time"
                              value={item.endTime || ""}
                              onChange={(event) =>
                                updateDraftTask(index, "endTime", event.target.value)
                              }
                              className="mt-2 w-full rounded-xl border border-pink-100 px-3 py-2.5 text-gray-700 outline-none focus:border-pink-400"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-pink-50 p-4">
                      <p className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                        <FiList /> Checklist
                      </p>
                      {steps.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          Chưa có checklist. Bạn có thể thêm bước nhỏ trước khi import.
                        </p>
                      ) : (
                        <ul className="space-y-2 text-sm text-gray-700">
                          {steps.map((step, stepIndex) => (
                            <li key={`${index}-${stepIndex}`} className="flex gap-2">
                              <input
                                type="text"
                                value={step}
                                onChange={(event) =>
                                  updateDraftChecklistStep(
                                    index,
                                    stepIndex,
                                    event.target.value
                                  )
                                }
                                className="flex-1 rounded-xl border border-pink-100 bg-white px-3 py-2 outline-none focus:border-pink-400"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  removeDraftChecklistStep(index, stepIndex)
                                }
                                className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-pink-600 hover:bg-pink-100"
                              >
                                Xóa
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => addDraftChecklistStep(index)}
                        className="mt-3 rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-600 hover:bg-pink-100"
                      >
                        Thêm checklist
                      </button>
                    </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleImport}
          disabled={
            importing ||
            !isActionable ||
            tasks.length === 0 ||
            selectedImportTasks.length === 0
          }
          className="mt-6 w-full bg-green-500 hover:bg-green-600 text-white py-4 rounded-2xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importing
            ? "Đang import task..."
            : `Import ${selectedImportTasks.length} task vào Calendar & Task List`}
        </button>
      </SectionCard>
    </div>
  );
}

function MetricCard({ icon, title, value, note }) {
  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-6">
      <div className="text-3xl text-pink-500 mb-4">{icon}</div>
      <p className="text-gray-500">{title}</p>
      <h3 className="font-bold text-xl mt-2 line-clamp-2">{value}</h3>
      <p className="text-sm text-gray-500 mt-2">{note}</p>
    </div>
  );
}

function SectionCard({ title, eyebrow, children }) {
  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-6">
      <div className="mb-5">
        {eyebrow && <p className="text-pink-500 font-semibold mb-2">{eyebrow}</p>}
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-pink-100 bg-pink-50 px-4 py-3">
      <p className="text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900 mt-1">{value || "Chưa rõ"}</p>
    </div>
  );
}

function ListBlock({ title, items, emptyText }) {
  return (
    <div>
      <h3 className="font-bold text-lg mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-gray-500">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${title}-${index}`} className="flex gap-3 text-gray-700 leading-7">
              <span className="w-7 h-7 rounded-full bg-pink-50 text-pink-500 text-sm font-bold flex items-center justify-center shrink-0">
                {index + 1}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-pink-100 p-4">
      <div className="mb-4">
        <h3 className="font-bold text-lg">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function DataDetailPanel({ title, items }) {
  return (
    <div className="rounded-2xl border border-pink-100 p-4">
      <h3 className="font-bold text-lg mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-gray-500">Chưa phát hiện điểm đáng chú ý.</p>
      ) : (
        <div className="space-y-2 text-gray-700">
          {items.map((item, index) => (
            <p key={`${title}-${index}`}>{index + 1}. {item}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default AnalysisResult;
