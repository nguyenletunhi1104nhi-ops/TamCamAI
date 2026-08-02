import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  Plus,
  Repeat,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";
import {
  addMinutesToTime as addScheduleMinutesToTime,
  detectNewTaskConflicts,
  findFreeSlotFromDate,
  getTaskDate as getScheduleTaskDate,
  getTaskMinutes,
  getTaskRange,
} from "../../utils/scheduleUtils";
import {
  formatTaskSchedule as formatTaskDraftSchedule,
  getTaskDraftChecklist,
  getTaskDraftHealth,
} from "../../utils/taskDraftUtils";
import {
  getDocumentFileName,
  getDocumentText,
  getLatestDocument as getLatestStoredDocument,
} from "../../utils/documentContextUtils";
import {
  classifyDocumentQuestionIntent as classifyDocumentQuestionIntentBase,
  formatEvidenceLines as formatEvidenceLinesBase,
  getDocumentKeywords as getDocumentKeywordsBase,
  getQuestionPhrases as getQuestionPhrasesBase,
  splitEvidenceSentences as splitEvidenceSentencesBase,
} from "../../utils/documentRetrievalUtils";
import {
  chooseQAction,
  classifyQlState,
  describeQPolicy,
  loadQTable,
  saveQTable,
  updateQValue,
} from "../../utils/qLearningPolicy";
import { sendChatMessage } from "../../services/chatApi";
import { createFriendlyChatErrorMessage, getApiErrorKind as getChatApiErrorKind } from "../../utils/chatErrorMessage";
import { normalizeChatResponse } from "../../utils/normalizeChatResponse";

function Chat() {
  const LOCAL_CHAT_STORAGE_KEY = "tamcam-chat-conversations";
  const LOCAL_DOCUMENT_STORAGE_KEY = "tamcam-chat-documents";
  const LOCAL_FEEDBACK_STORAGE_KEY = "tamcam-chat-feedback";
  const AI_CLOUD_HEALTH_CACHE_KEY = "tamcam-ai-cloud-health-v2";
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
  const AI_SERVICE_BASE_URL =
    import.meta.env.VITE_AI_SERVICE_BASE_URL || "http://127.0.0.1:8000";
  const DEFAULT_CHAT_SETTINGS = {
    defaultReminder: "Trước 30 phút",
    defaultTaskDuration: "90",
    compactTaskTitle: true,
    showConfidence: true,
  };
  const defaultMessages = [
    {
      id: 1,
      role: "assistant",
      content:
        "Xin chào! Tôi là TamCam AI. Tôi có thể giúp bạn kiểm tra công việc, deadline và tiến độ hiện tại.",
    },
  ];
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState(defaultMessages);
  const [uploadingChatFile, setUploadingChatFile] = useState(false);
  const [reviewingTaskDraft, setReviewingTaskDraft] = useState(null);
  const [reviewTaskQueue, setReviewTaskQueue] = useState([]);
  const [reviewTaskQueueIndex, setReviewTaskQueueIndex] = useState(0);
  const [reviewTaskInstruction, setReviewTaskInstruction] = useState("");
  const [rewritingTaskDraft, setRewritingTaskDraft] = useState(false);
  const [reviewTaskHistory, setReviewTaskHistory] = useState([]);
  const [createdTaskPreview, setCreatedTaskPreview] = useState(null);
  const [appSettings, setAppSettings] = useState(DEFAULT_CHAT_SETTINGS);
  const [aiCloudStatus, setAiCloudStatus] = useState(null);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState({});
  const [qTable, setQTable] = useState(() => loadQTable());

  const [loadingTasks, setLoadingTasks] = useState(true);
  const messagesEndRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const pendingScheduleTaskRef = useRef(null);

  const fixMojibake = (text) => {
    const value = String(text || "");

    const looksMojibake =
      value.includes("\u00c3") ||
      value.includes("\u00c4") ||
      value.includes("\u00c6") ||
      value.includes("\u00c2") ||
      value.includes("\u00e1\u00ba") ||
      value.includes("\u00e1\u00bb");

    if (!looksMojibake) {
      return value;
    }

    try {
      let decoded = value;

      for (let index = 0; index < 3; index += 1) {
        const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0) & 255);
        const nextValue = new TextDecoder("utf-8", {
          fatal: false,
        }).decode(bytes);

        if (nextValue.includes("\ufffd") || nextValue === decoded) {
          break;
        }

        decoded = nextValue;
      }

      return decoded;
    } catch {
      return value;
    }
  };

  const getConversationTitle = (chatMessages) => {
    const firstUserMessage = chatMessages.find(
      (item) => item.role === "user" && item.content
    );

    if (!firstUserMessage) {
      return "Chat mới";
    }

    return firstUserMessage.content.slice(0, 42);
  };

  const buildConversationSummarySnapshot = (chatMessages = []) => {
    const recentMessages = chatMessages
      .filter((item) => item?.content)
      .slice(-8)
      .map((item) => ({
        role: item.role,
        content: String(item.content).slice(0, 500),
        intent: item.intent || "",
      }));
    const latestUserMessage = [...recentMessages]
      .reverse()
      .find((item) => item.role === "user");
    const latestAssistantMessage = [...recentMessages]
      .reverse()
      .find((item) => item.role === "assistant");

    return {
      currentTopic: latestUserMessage?.content || "",
      currentState: latestAssistantMessage?.content || "",
      recentMessages,
      updatedAt: new Date().toISOString(),
    };
  };

  const getActiveConversationSummary = (conversationId = activeConversationId) => {
    const activeConversation = conversations.find(
      (conversation) => conversation.id === conversationId
    );

    return (
      activeConversation?.summary ||
      buildConversationSummarySnapshot(activeConversation?.messages || messages)
    );
  };

  const getAssistantTraceLabel = (chatMessage) => {
    const metadata = chatMessage?.metadata || {};
    const provider = metadata.provider || "";
    const model = chatMessage?.model || metadata.model || "";
    const intent = chatMessage?.primaryIntent || chatMessage?.intent || "";

    return [provider, model, intent].filter(Boolean).join(" • ");
  };

  const getChatUploadErrorMessage = (error) => {
    const rawMessage = String(error?.message || "").trim();
    const apiError = getApiErrorKind(error);

    if (apiError === "permission-denied") {
      return [
        "Tôi đã nhận file, nhưng Gemini hiện bị lỗi quyền truy cập API.",
        "Cụ thể là key/project đang bị từ chối quyền dùng model, nên phần phân tích thông minh chưa chạy được.",
        "Bạn đổi Gemini API key hoặc project có quyền dùng model rồi restart FastAPI, sau đó upload lại file nhé.",
      ].join("\n");
    }

    if (apiError === "quota-or-rate-limit") {
      return [
        "Tôi đã nhận file, nhưng Gemini đang hết quota hoặc bị giới hạn tốc độ.",
        "Bạn có thể thử lại sau, đổi key/project khác, hoặc tiếp tục dùng chế độ phân tích local tạm thời.",
      ].join("\n");
    }

    const isNetworkError =
      !rawMessage ||
      /failed to fetch|networkerror|load failed|fetch failed|econnrefused/i.test(
        rawMessage
      );

    if (isNetworkError) {
      return [
        "Tôi chưa kết nối được với server phân tích tài liệu.",
        `Bạn kiểm tra giúp tôi Node/Express server ở ${API_BASE_URL} đã chạy chưa, rồi upload lại file nhé.`,
        "Nếu server đang tắt thì file chưa được gửi đi, nên tôi chưa thể đọc nội dung để phân tích hoặc tạo workflow.",
      ].join("\n");
    }

    return (
      rawMessage ||
      "Tôi chưa phân tích được file này. Bạn thử file PDF, DOCX, TXT, Excel, CSV hoặc file văn bản khác nhé."
    );
  };

  const getCachedAiCloudStatus = () => {
    try {
      const cached = JSON.parse(
        sessionStorage.getItem(AI_CLOUD_HEALTH_CACHE_KEY) || "null"
      );

      if (!cached?.checkedAt || Date.now() - cached.checkedAt > 5 * 60 * 1000) {
        return null;
      }

      return cached;
    } catch {
      return null;
    }
  };

  const saveCachedAiCloudStatus = (status) => {
    try {
      sessionStorage.setItem(
        AI_CLOUD_HEALTH_CACHE_KEY,
        JSON.stringify({
          ...status,
          checkedAt: Date.now(),
        })
      );
    } catch {
      // Session storage is optional; the chat can still work without it.
    }
  };

  const getAiCloudStatusMessage = (status) => {
    if (!status || status.ok) {
      return "";
    }

    if (status.errorKind === "permission-denied") {
      return "AI provider đang bị lỗi quyền 403. Chat vẫn dùng được cho task/lịch local, nhưng phân tích thông minh cần kiểm tra API key hoặc project có quyền.";
    }

    if (status.errorKind === "quota-or-rate-limit") {
      return "AI provider đang hết quota hoặc bị giới hạn tốc độ. Bạn vẫn có thể dùng các thao tác local, còn câu hỏi mở có thể kém thông minh hơn.";
    }

    if (status.errorKind === "network") {
      return "Chưa kiểm tra được AI provider vì AI service chưa kết nối ổn định. Hãy kiểm tra FastAPI trước khi demo.";
    }

    return "AI cloud chưa sẵn sàng. Hãy kiểm tra /health hoặc chạy npm run health:ai trước khi demo.";
  };

  const getApiErrorKind = (error) => {
    return getChatApiErrorKind(error);
  };

  const createAiServiceErrorReply = (error, userMessage) => {
    const errorKind = getApiErrorKind(error);

    if (errorKind === "permission-denied") {
      return [
        "Mình hiểu yêu cầu của bạn, nhưng hiện AI provider đang bị lỗi quyền truy cập API.",
        "Health check đang báo `permission-denied / 403`, nên mình chưa thể trả lời bằng cloud AI cho câu này.",
        "Việc cần làm: kiểm tra Groq API key/project, restart FastAPI, rồi chạy lại `npm run health:ai`.",
      ].join("\n");
    }

    if (errorKind === "quota-or-rate-limit") {
      return [
        "AI provider đang hết quota hoặc bị giới hạn tốc độ, nên mình chưa thể dùng AI cloud cho câu này.",
        "Bạn có thể thử lại sau hoặc đổi key/project khác. Các thao tác local như xem task, tạo nhắc việc rõ ngày giờ vẫn dùng được.",
      ].join("\n");
    }

    if (errorKind === "network") {
      return [
        createFriendlyChatErrorMessage(error),
        `AI service: ${AI_SERVICE_BASE_URL}`,
        `Node/Express: ${API_BASE_URL}`,
      ].join("\n");
    }

    return createServiceUnavailableReply(userMessage);
  };

  const getLocalConversations = () => {
    try {
      return JSON.parse(
        localStorage.getItem(LOCAL_CHAT_STORAGE_KEY) || "[]"
      );
    } catch {
      return [];
    }
  };

  const saveLocalConversation = (conversation) => {
    const nextConversation = {
      ...conversation,
      updatedAtLocal: Date.now(),
    };
    const currentConversations = getLocalConversations();
    const withoutCurrent = currentConversations.filter(
      (item) => item.id !== nextConversation.id
    );

    localStorage.setItem(
      LOCAL_CHAT_STORAGE_KEY,
      JSON.stringify([nextConversation, ...withoutCurrent].slice(0, 20))
    );
  };

  const getLocalFeedback = () => {
    try {
      return JSON.parse(
        localStorage.getItem(LOCAL_FEEDBACK_STORAGE_KEY) || "[]"
      );
    } catch {
      return [];
    }
  };

  const saveLocalFeedback = (feedbackItems) => {
    localStorage.setItem(
      LOCAL_FEEDBACK_STORAGE_KEY,
      JSON.stringify(feedbackItems.slice(0, 80))
    );
  };

  const buildFeedbackMemory = () => {
    const feedbackItems = getLocalFeedback();
    const usefulItems = feedbackItems
      .filter((item) => item.rating && item.assistantContent)
      .slice(0, 12);

    if (usefulItems.length === 0) {
      return "";
    }

    const disliked = usefulItems
      .filter((item) => item.rating === "down")
      .slice(0, 6)
      .map((item) => {
        const question = String(item.userMessage || "").slice(0, 160);
        const answer = String(item.assistantContent || "").slice(0, 260);

        return `- User không hài lòng. Câu hỏi: "${question}". Tránh kiểu trả lời: "${answer}".`;
      });

    const liked = usefulItems
      .filter((item) => item.rating === "up")
      .slice(0, 4)
      .map((item) => {
        const question = String(item.userMessage || "").slice(0, 160);
        const answer = String(item.assistantContent || "").slice(0, 220);

        return `- User hài lòng. Câu hỏi: "${question}". Phong cách tốt: "${answer}".`;
      });

    return [...disliked, ...liked].join("\n");
  };

  const getLocalDocuments = () => {
    try {
      return JSON.parse(
        localStorage.getItem(LOCAL_DOCUMENT_STORAGE_KEY) || "[]"
      );
    } catch {
      return [];
    }
  };

  const createLocalConversation = (initialMessages = defaultMessages) => {
    const summary = buildConversationSummarySnapshot(initialMessages);
    const conversation = {
      id: `local-${Date.now()}`,
      title: getConversationTitle(initialMessages),
      messages: initialMessages,
      summary,
      updatedAtLocal: Date.now(),
    };

    saveLocalConversation(conversation);
    setConversations((currentConversations) => [
      conversation,
      ...currentConversations,
    ]);
    setActiveConversationId(conversation.id);
    setMessages(initialMessages);

    return conversation.id;
  };

  const updateConversationCache = (conversationId, nextMessages) => {
    setConversations((currentConversations) => {
      const previousConversation = currentConversations.find(
        (conversation) => conversation.id === conversationId
      );
      const nextConversation = {
        ...previousConversation,
        id: conversationId,
        title: getConversationTitle(nextMessages),
        messages: nextMessages,
        summary: buildConversationSummarySnapshot(nextMessages),
        updatedAtLocal: Date.now(),
      };
      const withoutCurrent = currentConversations.filter(
        (conversation) => conversation.id !== conversationId
      );

      return [nextConversation, ...withoutCurrent];
    });
  };

  const persistConversationMessages = async (
    conversationId,
    nextMessages
  ) => {
    if (!conversationId) {
      return;
    }

    if (conversationId.startsWith("local-")) {
      saveLocalConversation({
        id: conversationId,
        title: getConversationTitle(nextMessages),
        messages: nextMessages,
        summary: buildConversationSummarySnapshot(nextMessages),
      });
      return;
    }

    try {
      await updateDoc(doc(db, "chatConversations", conversationId), {
        title: getConversationTitle(nextMessages),
        messages: nextMessages,
        summary: buildConversationSummarySnapshot(nextMessages),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Save chat conversation error:", error);
      saveLocalConversation({
        id: conversationId,
        title: getConversationTitle(nextMessages),
        messages: nextMessages,
        summary: buildConversationSummarySnapshot(nextMessages),
      });
    }
  };

  const appendMessages = (newMessages, conversationId = activeConversationId) => {
    setMessages((currentMessages) => {
      const nextMessages = [
        ...currentMessages,
        ...newMessages.map((item, index) => ({
          id: item.id || Date.now() + index,
          ...item,
        })),
      ];

      updateConversationCache(conversationId, nextMessages);
      persistConversationMessages(conversationId, nextMessages);

      return nextMessages;
    });
  };

  const createConversation = async (initialMessages = defaultMessages) => {
    if (!auth.currentUser) {
      return createLocalConversation(initialMessages);
    }

    try {
      const summary = buildConversationSummarySnapshot(initialMessages);
      const conversationRef = await addDoc(
        collection(db, "chatConversations"),
        {
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          title: getConversationTitle(initialMessages),
          messages: initialMessages,
          summary,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      const conversation = {
        id: conversationRef.id,
        title: getConversationTitle(initialMessages),
        messages: initialMessages,
        summary,
        updatedAtLocal: Date.now(),
      };

      setConversations((currentConversations) => [
        conversation,
        ...currentConversations,
      ]);
      setActiveConversationId(conversationRef.id);
      setMessages(initialMessages);

      return conversationRef.id;
    } catch (error) {
      console.error("Create chat conversation error:", error);
      return createLocalConversation(initialMessages);
    }
  };

  const handleNewConversation = async () => {
    await createConversation(defaultMessages);
  };

  const handleClearChatHistory = async () => {
    const localConversationIds = conversations
      .filter((conversation) => String(conversation.id || "").startsWith("local-"))
      .map((conversation) => conversation.id);

    if (auth.currentUser) {
      const remoteConversations = conversations.filter(
        (conversation) => !localConversationIds.includes(conversation.id)
      );

      await Promise.allSettled(
        remoteConversations.map((conversation) =>
          deleteDoc(doc(db, "chatConversations", conversation.id))
        )
      );
    }

    localStorage.removeItem(LOCAL_CHAT_STORAGE_KEY);
    localStorage.removeItem(LOCAL_DOCUMENT_STORAGE_KEY);
    setConversations([]);
    setDocuments([]);
    await createConversation(defaultMessages);
  };

  const handleSelectConversation = (conversation) => {
    setActiveConversationId(conversation.id);
    setMessages(
      Array.isArray(conversation.messages) &&
        conversation.messages.length > 0
        ? conversation.messages
        : defaultMessages
    );
  };

  const handleAssistantFeedback = async (assistantMessage, rating) => {
    if (!assistantMessage?.id || assistantMessage.role !== "assistant") {
      return;
    }

    const messageIndex = messages.findIndex(
      (item) => item.id === assistantMessage.id
    );
    const previousUserMessage = [...messages]
      .slice(0, messageIndex)
      .reverse()
      .find((item) => item.role === "user");
    const feedbackItem = {
      id: `${assistantMessage.id}-${rating}`,
      messageId: assistantMessage.id,
      conversationId: activeConversationId,
      rating,
      qState: assistantMessage.qState || "",
      qAction: assistantMessage.qAction || "",
      reward: rating === "up" ? 1 : -1,
      userMessage: previousUserMessage?.content || "",
      assistantContent: assistantMessage.content || "",
      createdAt: new Date().toISOString(),
    };
    const currentFeedback = getLocalFeedback().filter(
      (item) => item.messageId !== assistantMessage.id
    );

    saveLocalFeedback([feedbackItem, ...currentFeedback]);
    setFeedbackByMessageId((current) => ({
      ...current,
      [assistantMessage.id]: rating,
    }));

    if (assistantMessage.qState && assistantMessage.qAction) {
      const nextQTable = updateQValue({
        qTable,
        state: assistantMessage.qState,
        action: assistantMessage.qAction,
        reward: feedbackItem.reward,
        nextState: classifyQlState(previousUserMessage?.content || ""),
      });

      saveQTable(nextQTable);
      setQTable(nextQTable);
    }

    if (!auth.currentUser) {
      return;
    }

    try {
      await addDoc(collection(db, "chatFeedback"), {
        ...feedbackItem,
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn("Save chat feedback error:", error);
    }
  };

  useEffect(() => {
    async function fetchTasks() {
      if (!auth.currentUser) {
        setDocuments(getLocalDocuments());
        setLoadingTasks(false);
        return;
      }

      try {
        const taskQuery = query(
          collection(db, "tasks"),
          where("userId", "==", auth.currentUser.uid)
        );

        const snapshot = await getDocs(taskQuery);

        const taskData = snapshot.docs.map((taskDoc) => ({
          id: taskDoc.id,
          ...taskDoc.data(),
        }));

        setTasks(taskData);

        try {
          const userSnapshot = await getDoc(doc(db, "users", auth.currentUser.uid));
          setAppSettings({
            ...DEFAULT_CHAT_SETTINGS,
            ...(userSnapshot.data()?.settings || {}),
          });
        } catch (error) {
          console.warn("Get chat settings error:", error);
        }

        const documentQuery = query(
          collection(db, "documents"),
          where("userId", "==", auth.currentUser.uid)
        );

        const documentSnapshot = await getDocs(documentQuery);

        const documentData = documentSnapshot.docs.map((documentDoc) => ({
          id: documentDoc.id,
          ...documentDoc.data(),
        }));

        documentData.sort((firstDocument, secondDocument) => {
          const firstTime =
            firstDocument.createdAt?.toMillis?.() ||
            new Date(firstDocument.createdAt || 0).getTime();
          const secondTime =
            secondDocument.createdAt?.toMillis?.() ||
            new Date(secondDocument.createdAt || 0).getTime();

          return secondTime - firstTime;
        });

        const localDocuments = getLocalDocuments();
        setDocuments([
          ...localDocuments,
          ...documentData.filter(
            (document) =>
              !localDocuments.some(
                (localDocument) => localDocument.id === document.id
              )
          ),
        ]);
      } catch (error) {
        console.error("Get chat tasks error:", error);
        setDocuments(getLocalDocuments());
      } finally {
        setLoadingTasks(false);
      }
    }

    fetchTasks();
  }, []);

  useEffect(() => {
    const feedbackMap = {};

    getLocalFeedback().forEach((item) => {
      if (item.messageId && item.rating) {
        feedbackMap[item.messageId] = item.rating;
      }
    });

    setFeedbackByMessageId(feedbackMap);
  }, []);

  useEffect(() => {
    async function fetchConversations() {
      if (!auth.currentUser) {
        return;
      }

      try {
        const conversationQuery = query(
          collection(db, "chatConversations"),
          where("userId", "==", auth.currentUser.uid)
        );
        const snapshot = await getDocs(conversationQuery);
        const conversationData = snapshot.docs
          .map((conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
          }))
          .sort((firstConversation, secondConversation) => {
            const firstTime =
              firstConversation.updatedAt?.toMillis?.() ||
              firstConversation.updatedAtLocal ||
              0;
            const secondTime =
              secondConversation.updatedAt?.toMillis?.() ||
              secondConversation.updatedAtLocal ||
              0;

            return secondTime - firstTime;
          });

        if (conversationData.length === 0) {
          const localConversations = getLocalConversations();

          if (localConversations.length > 0) {
            setConversations(localConversations);
            setActiveConversationId(localConversations[0].id);
            setMessages(localConversations[0].messages || defaultMessages);
            return;
          }

          createLocalConversation(defaultMessages);
          return;
        }

        const localConversations = getLocalConversations();
        const mergedConversations = [
          ...conversationData,
          ...localConversations.filter(
            (localConversation) =>
              !conversationData.some(
                (conversation) => conversation.id === localConversation.id
              )
          ),
        ];

        setConversations(mergedConversations);
        setActiveConversationId(conversationData[0].id);
        setMessages(
          Array.isArray(conversationData[0].messages) &&
            conversationData[0].messages.length > 0
            ? conversationData[0].messages
            : defaultMessages
        );
      } catch (error) {
        console.error("Get chat conversations error:", error);
        const localConversations = getLocalConversations();

        if (localConversations.length > 0) {
          setConversations(localConversations);
          setActiveConversationId(localConversations[0].id);
          setMessages(localConversations[0].messages || defaultMessages);
          return;
        }

        createLocalConversation(defaultMessages);
      }
    }

    fetchConversations();
  }, []);

  useEffect(() => {
    const cachedStatus = getCachedAiCloudStatus();

    if (cachedStatus) {
      setAiCloudStatus(cachedStatus);
      return;
    }

    let isMounted = true;

    async function checkAiCloudStatus() {
      try {
        const response = await fetch(`${AI_SERVICE_BASE_URL}/health?probe=ai`, {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        const ai = data?.ai || data?.gemini || {};
        const nextStatus = {
          ok: response.ok && ai.ok === true,
          provider: ai.provider || data?.provider || "unknown",
          model: ai.model || "unknown",
          probe: ai.probe || "unknown",
          errorKind: ai.errorKind || "",
          message: ai.message || "",
        };

        saveCachedAiCloudStatus(nextStatus);

        if (isMounted) {
          setAiCloudStatus(nextStatus);
        }
      } catch (error) {
        const nextStatus = {
          ok: false,
          model: "unknown",
          probe: "failed",
          errorKind: "network",
          message: error.message,
        };

        saveCachedAiCloudStatus(nextStatus);

        if (isMounted) {
          setAiCloudStatus(nextStatus);
        }
      }
    }

    checkAiCloudStatus();

    return () => {
      isMounted = false;
    };
  }, [AI_SERVICE_BASE_URL]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  const getIncompleteSteps = (task) => {
    const checklist =
      task?.checklist?.length > 0
        ? task.checklist
        : (task?.suggestedSteps || []).map(
            (step, index) => ({
              id: `suggested-${index + 1}`,
              title: step,
              completed: false,
            })
          );

    return checklist.filter((item) => !item.completed);
  };

  const getPriorityScore = (priority) => {
    const scores = {
      Cao: 3,
      High: 3,
      "Trung bình": 2,
      Medium: 2,
      "Thấp": 1,
      Low: 1,
    };

    return scores[priority] || 0;
  };

  const formatDate = (date) => {
    if (!date) {
      return "chưa có deadline";
    }

    return new Date(
      `${date}T00:00:00`
    ).toLocaleDateString("vi-VN");
  };

  const normalizeMessage = (text) =>
    text
      .toLowerCase()
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/đ/g, "d")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const normalizeIntentText = (text) =>
    normalizeMessage(text).replace(/đ/g, "d");

  const toIsoDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const addDays = (date, days) => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  };

  const addMinutesToTime = (time, minutes) => {
    return addScheduleMinutesToTime(time, minutes);
  };

  const suggestTaskSchedule = (userMessage, title = "") => {
    const text = normalizeIntentText(`${userMessage} ${title}`);
    const today = new Date();
    const defaultDuration = Math.max(
      30,
      Math.min(240, Number(appSettings.defaultTaskDuration) || 90)
    );
    const isUrgent =
      text.includes("hom nay") ||
      text.includes("gap") ||
      text.includes("quan trong") ||
      text.includes("can gap");
    const isMeeting =
      text.includes("hop") ||
      text.includes("meeting") ||
      text.includes("lich hen");
    const isStudy =
      text.includes("hoc") ||
      text.includes("on tap") ||
      text.includes("bai tap") ||
      text.includes("doc tai lieu");
    const isReport =
      text.includes("bao cao") ||
      text.includes("slide") ||
      text.includes("thuyet trinh");

    let startTime = "19:00";

    if (text.includes("sang")) {
      startTime = "09:00";
    } else if (text.includes("chieu")) {
      startTime = "14:00";
    } else if (isMeeting) {
      startTime = "09:00";
    } else if (isStudy) {
      startTime = "19:30";
    } else if (isReport) {
      startTime = "20:00";
    }

    const duration = isMeeting ? Math.min(defaultDuration, 60) : defaultDuration;

    return {
      date: toIsoDate(addDays(today, isUrgent ? 0 : 1)),
      time: startTime,
      endTime: addMinutesToTime(startTime, duration),
      reminder: isMeeting ? "Trước 10 phút" : appSettings.defaultReminder,
    };
  };

  const formatTaskSchedule = (task) => {
    return formatTaskDraftSchedule(task, formatDate);
  };

  const timeToMinutes = (time) => {
    return getTaskMinutes(time);
  };

  const minutesToTime = (minutes) => {
    const normalizedMinutes = Math.max(0, Math.min(23 * 60 + 59, minutes));
    const hour = Math.floor(normalizedMinutes / 60);
    const minute = normalizedMinutes % 60;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const getTaskDate = (task) => getScheduleTaskDate(task);

  const getTaskTimeRange = (task) => {
    return getTaskRange(task);
  };

  const findScheduleConflicts = (taskDraft, referenceTasks = tasks) => {
    return detectNewTaskConflicts([taskDraft], referenceTasks)
      .map((conflict) => conflict.second)
      .slice(0, 3);
  };

  const getAlternativeStartTimes = (taskDraft, referenceTasks = tasks) => {
    const draftDate = getTaskDate(taskDraft);
    const draftRange = getTaskTimeRange(taskDraft);

    if (!draftDate || !draftRange) {
      return [];
    }

    const duration = Math.max(30, Math.min(180, draftRange.end - draftRange.start));
    const preferredStart = draftRange.start;
    const freeSlot = findFreeSlotFromDate(taskDraft, referenceTasks, {
      daysToSearch: 3,
      dateGetter: (task) => task.startDate || task.deadline || "",
    });
    const candidateMinutes = [
      freeSlot?.date === draftDate ? timeToMinutes(freeSlot.startTime) : null,
      preferredStart + duration,
      preferredStart + duration + 30,
      preferredStart - duration,
      preferredStart - duration - 30,
      timeToMinutes("09:00"),
      timeToMinutes("10:30"),
      timeToMinutes("14:00"),
      timeToMinutes("15:30"),
      timeToMinutes("19:30"),
      timeToMinutes("20:30"),
    ]
      .filter((value) => value !== null)
      .filter((value) => value >= 7 * 60 && value + duration <= 22 * 60);

    const seenTimes = new Set();

    return candidateMinutes
      .map((value) => minutesToTime(value))
      .filter((time) => {
        if (seenTimes.has(time) || time === taskDraft.startTime) {
          return false;
        }

        seenTimes.add(time);

        return (
          findScheduleConflicts(
            {
              ...taskDraft,
              startTime: time,
              endTime: addMinutesToTime(time, duration),
            },
            referenceTasks
          ).length === 0
        );
      })
      .slice(0, 4);
  };

  const formatConflictWarning = (conflicts, taskTitle) => {
    if (!conflicts.length) {
      return "";
    }

    const conflictText = conflicts
      .map(
        (task) =>
          `"${task.title}" ${formatTaskSchedule(task)}`
      )
      .join("; ");

    return ` Lưu ý: task "${taskTitle}" đang trùng lịch với ${conflictText}. Bạn có thể nhắn "đổi giờ task này sang 10:00" để tôi chỉnh lại.`;
  };

  const formatDetailedTaskPlan = (task, index = 0) => {
    const steps =
      task?.checklist?.length > 0
        ? task.checklist.map((item) => item.title || item)
        : task?.suggestedSteps?.length > 0
        ? task.suggestedSteps
        : buildChecklistForTask(task);
    const nextStep = getIncompleteSteps(task)[0]?.title || steps[0];
    const schedule = formatTaskSchedule(task);

    return [
      `${index + 1}. ${task.title || "Việc cần làm"}`,
      `   - Mục tiêu: ${task.description || `hoàn thành "${task.title}" theo đúng yêu cầu.`}`,
      `   - Lịch làm: ${schedule}.`,
      `   - Mức ưu tiên: ${task.priority || "Trung bình"}; độ khó: ${task.difficulty || "chưa rõ"}; trạng thái: ${task.status || "To do"}.`,
      `   - Bước nên làm ngay: ${nextStep || "đọc lại yêu cầu và xác định đầu ra cần hoàn thành"}.`,
      "   - Checklist gợi ý:",
      ...steps.slice(0, 5).map((step, stepIndex) => `     ${stepIndex + 1}. ${step}`),
    ].join("\n");
  };

  const createDetailedTaskGuidance = (candidateTasks, intro) => {
    const visibleTasks = candidateTasks.slice(0, 4);

    if (visibleTasks.length === 0) {
      return "";
    }

    return [
      intro,
      "",
      ...visibleTasks.map((task, index) => formatDetailedTaskPlan(task, index)),
      "",
      "Cách làm hợp lý:",
      "1. Làm task có deadline gần hoặc ưu tiên cao trước.",
      "2. Mỗi lần chỉ chọn 1 bước nhỏ trong checklist để làm trong 25-60 phút.",
      "3. Sau khi xong một bước, đánh dấu hoàn thành trong Tasks để tôi theo dõi tiếp.",
      "4. Nếu lịch chưa hợp lý, nhắn kiểu: 'đổi việc này sang ngày mai lúc 9h'.",
    ].join("\n");
  };

  const getWeekRange = (offset = 0) => {
    const today = new Date();
    const day = today.getDay() || 7;
    const monday = addDays(today, 1 - day + offset * 7);
    const sunday = addDays(monday, 6);

    return {
      start: toIsoDate(monday),
      end: toIsoDate(sunday),
    };
  };

  const isTaskInDateRange = (task, start, end) => {
    const taskDate = task.startDate || task.deadline;
    return taskDate && taskDate >= start && taskDate <= end;
  };

  const parseDateFromMessage = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    const today = new Date();

    if (text.includes("hom nay")) {
      return toIsoDate(today);
    }

    if (text.includes("ngay mai") || /\bmai\b/.test(text)) {
      return toIsoDate(addDays(today, 1));
    }

    if (text.includes("ngay kia")) {
      return toIsoDate(addDays(today, 2));
    }

    const numericDate = text.match(
      /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/
    );

    if (numericDate) {
      let year = Number(numericDate[3] || today.getFullYear());
      const month = numericDate[2].padStart(2, "0");
      const day = numericDate[1].padStart(2, "0");
      const parsedDate = new Date(`${year}-${month}-${day}T00:00:00`);

      if (!numericDate[3] && parsedDate < new Date(toIsoDate(today))) {
        year += 1;
      }

      return `${year}-${month}-${day}`;
    }

    const vietnameseDate = text.match(
      /ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?/
    );

    if (vietnameseDate) {
      let year = Number(vietnameseDate[3] || today.getFullYear());
      const month = vietnameseDate[2].padStart(2, "0");
      const day = vietnameseDate[1].padStart(2, "0");
      const parsedDate = new Date(`${year}-${month}-${day}T00:00:00`);

      if (!vietnameseDate[3] && parsedDate < new Date(toIsoDate(today))) {
        year += 1;
      }

      return `${year}-${month}-${day}`;
    }

    const weekday = text.match(/thu\s*([2-7])\s*(tuan\s*sau)?/);

    if (weekday) {
      const targetDay = Number(weekday[1]) - 1;
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;

      if (weekday[2]) {
        diff += 7;
      } else if (diff < 0) {
        diff += 7;
      }

      return toIsoDate(addDays(today, diff));
    }

    return "";
  };

  const parseTimeFromMessage = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    const originalText = userMessage.toLowerCase();
    const time = text.match(
      /\b([01]?\d|2[0-3])(?:[:h]| gio)(?:\s*([0-5]\d))?\b/
    );

    if (!time) {
      return "";
    }

    let hour = Number(time[1]);
    const minute = Number(time[2] || 0);

    if (
      (text.includes("chieu") || originalText.includes("tối")) &&
      hour >= 1 &&
      hour <= 11
    ) {
      hour += 12;
    }

    if (text.includes("trua") && hour < 12) {
      hour += 12;
    }

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const parseReminderFromMessage = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    const originalText = userMessage.toLowerCase();

    if (
      text.includes("dat thong bao") ||
      text.includes("bao thuc") ||
      text.includes("nhac toi luc") ||
      text.includes("nhac minh luc")
    ) {
      return "Đúng giờ";
    }

    if (
      text.includes("den ngay nhac") ||
      text.includes("dung ngay") ||
      text.includes("ngay do nhac")
    ) {
      return "Đúng ngày";
    }

    if (text.includes("truoc 10 phut")) {
      return "Trước 10 phút";
    }

    if (text.includes("truoc 1 gio") || text.includes("truoc mot gio")) {
      return "Trước 1 giờ";
    }

    if (text.includes("truoc 1 ngay") || text.includes("truoc mot ngay")) {
      return "Trước 1 ngày";
    }

    if (text.includes("khong nhac")) {
      return "Không nhắc";
    }

    return "";
  };

  const parseRecurrenceFromMessage = (userMessage) => {
    const text = normalizeIntentText(userMessage);

    if (
      text.includes("hang ngay") ||
      text.includes("moi ngay") ||
      text.includes("moi sang") ||
      text.includes("moi buoi sang") ||
      text.includes("vao moi sang") ||
      text.includes("vao moi buoi sang") ||
      text.includes("moi chieu") ||
      text.includes("moi buoi chieu") ||
      text.includes("vao moi chieu") ||
      text.includes("moi toi") ||
      text.includes("moi buoi toi") ||
      text.includes("vao moi toi") ||
      text.includes("hằng ngày") ||
      text.includes("mỗi ngày")
    ) {
      return "daily";
    }

    if (
      text.includes("hang tuan") ||
      text.includes("moi tuan") ||
      text.includes("hằng tuần") ||
      text.includes("mỗi tuần")
    ) {
      return "weekly";
    }

    if (
      text.includes("hang thang") ||
      text.includes("moi thang") ||
      text.includes("hằng tháng") ||
      text.includes("mỗi tháng")
    ) {
      return "monthly";
    }

    if (
      text.includes("hang nam") ||
      text.includes("moi nam") ||
      text.includes("hằng năm") ||
      text.includes("mỗi năm")
    ) {
      return "yearly";
    }

    return "";
  };

  const isReminderCreationRequest = (userMessage) => {
    const text = normalizeIntentText(userMessage);

    return (
      text.includes("dat thong bao") ||
      text.includes("tao thong bao") ||
      text.includes("tao lich nhac") ||
      text.includes("tao lich nhac nho") ||
      text.includes("dat lich nhac") ||
      text.includes("dat lich nhac nho") ||
      text.includes("dat nhac") ||
      text.includes("tao nhac") ||
      text.includes("nhac nho") ||
      text.includes("bao thuc") ||
      text.includes("nhac toi") ||
      text.includes("nhac minh") ||
      text.includes("nhac em") ||
      text.includes("toi phai") ||
      text.includes("phai nhac")
    );
  };

  const classifyLocalChatIntent = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    const hasCreateSignal =
      text.includes("tao") ||
      text.includes("them") ||
      text.includes("dat") ||
      text.includes("ghi nho") ||
      text.includes("bao thuc") ||
      text.includes("toi phai") ||
      text.includes("phai nhac");
    const hasReminderSignal =
      text.includes("nhac") ||
      text.includes("nhac nho") ||
      text.includes("reminder") ||
      text.includes("thong bao") ||
      text.includes("bao thuc");
    const hasScheduleSignal =
      parseTimeFromMessage(userMessage) ||
      parseDateFromMessage(userMessage) ||
      parseRecurrenceFromMessage(userMessage);
    const asksExistingTask =
      text.includes("viec gi") ||
      text.includes("nhiem vu gi") ||
      text.includes("task nao") ||
      text.includes("lich gi") ||
      text.includes("co gi khong") ||
      text.includes("co gi ko") ||
      text.includes("co viec nao") ||
      text.includes("co lich nao");

    if (isBirthdayTaskRequest(userMessage)) {
      return "DOCUMENT_BIRTHDAY_REMINDERS";
    }

    if (
      !asksExistingTask &&
      (isReminderCreationRequest(userMessage) ||
        shouldCreateTaskFromMessage(userMessage) ||
        (hasCreateSignal && (hasReminderSignal || hasScheduleSignal)))
    ) {
      return "CREATE_TASK_OR_REMINDER";
    }

    if (
      hasReminderSignal &&
      (text.includes("doi") ||
        text.includes("sua") ||
        text.includes("chinh") ||
        text.includes("cap nhat"))
    ) {
      return "UPDATE_REMINDER";
    }

    return "";
  };

  const findTaskFromMessage = (userMessage, candidates = tasks) => {
    const text = normalizeIntentText(userMessage);
    const activeTasks = candidates.filter(
      (task) =>
        !task.completed &&
        task.status !== "Completed"
    );

    const exactMatch = activeTasks.find((task) => {
      const title = normalizeMessage(task.title || "");
      return title && text.includes(title);
    });

    if (exactMatch) {
      return exactMatch;
    }

    let bestTask = null;
    let bestScore = 0;

    for (const task of activeTasks) {
      const words = normalizeMessage(task.title || "")
        .split(/\s+/)
        .filter((word) => word.length >= 3);

      const score = words.filter((word) =>
        text.includes(word)
      ).length;

      if (score > bestScore) {
        bestScore = score;
        bestTask = task;
      }
    }

    return bestScore > 0 ? bestTask : null;
  };

  const buildChecklistForTask = (task) => {
    const title = normalizeMessage(task?.title || "");
    const type = task?.type || "";

    if (type === "Meeting" || title.includes("hop")) {
      return [
        "Xác định nội dung cần trao đổi",
        "Chuẩn bị tài liệu liên quan",
        "Ghi lại câu hỏi hoặc vấn đề cần hỏi",
        "Tham gia cuộc họp đúng giờ",
        "Tổng hợp action items sau cuộc họp",
      ];
    }

    if (title.includes("thuyet trinh") || title.includes("tieng anh")) {
      return [
        "Xác định chủ đề và yêu cầu trình bày",
        "Lập dàn ý nội dung",
        "Chuẩn bị slide hoặc ghi chú",
        "Luyện nói và kiểm tra phát âm",
        "Hoàn thiện trước deadline",
      ];
    }

    if (title.includes("bao cao") || title.includes("bai tap")) {
      return [
        "Đọc kỹ yêu cầu",
        "Chia nhỏ các phần cần làm",
        "Thu thập thông tin hoặc dữ liệu cần thiết",
        "Hoàn thiện nội dung chính",
        "Kiểm tra và nộp trước deadline",
      ];
    }

    return [
      "Xác định mục tiêu công việc",
      "Chia nhỏ nhiệm vụ",
      "Thực hiện phần quan trọng trước",
      "Kiểm tra kết quả",
      "Cập nhật trạng thái hoàn thành",
    ];
  };

  const saveTaskUpdates = async (task, updatedFields) => {
    const canSyncToFirebase =
      task?.id &&
      !String(task.id).startsWith("local-") &&
      !String(task.source || "").includes("temporary");

    if (canSyncToFirebase) {
      try {
        await updateDoc(
          doc(db, "tasks", task.id),
          updatedFields
        );
      } catch (error) {
        console.warn("Could not sync task update to Firebase:", error);
      }
    }

    setTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask.id === task.id
          ? {
              ...currentTask,
              ...updatedFields,
            }
        : currentTask
      )
    );
  };

  const extractTaskTitleFromMessage = (userMessage) => {
    const cleanedTitle = normalizeMessage(userMessage)
      .replace(/ghi\s+nho\s+(la\s+)?/g, "")
      .replace(/dat\s+thong\s+bao\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/tao\s+thong\s+bao\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/tao\s+lich\s+nhac\s+nho\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/tao\s+lich\s+nhac\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/dat\s+lich\s+nhac\s+nho\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/dat\s+lich\s+nhac\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/dat\s+nhac\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/tao\s+nhac\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/nhac\s+nho\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/bao\s+thuc\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/tao\s+lich\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/tao\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/them\s+(cho\s+)?(toi|minh|em)?/g, "")
      .replace(/phai\s+nhac\s+(toi|minh|em|me)?/g, "")
      .replace(/nhac\s+(toi|minh|em|me)?/g, "")
      .replace(/\btoi\s+phai\b/g, "")
      .replace(/\bphai\b/g, "")
      .replace(/toi\s+co\s+/g, "")
      .replace(/co\s+/g, "")
      .replace(/\b(task|viec)\b/g, "")
      .replace(/hang\s+ngay|moi\s+ngay|moi\s+sang|moi\s+chieu|moi\s+toi/g, "")
      .replace(/hang\s+tuan|moi\s+tuan|hang\s+thang|moi\s+thang/g, "")
      .replace(/hang\s+nam|moi\s+nam/g, "")
      .replace(/den\s+ngay|dung\s+ngay|ngay\s+do/g, "")
      .replace(/ngay mai|hom nay|ngay kia|\bmai\b/g, "")
      .replace(/vao luc|luc|vao|ngay|thang|nam|sang|chieu|toi/g, "")
      .replace(/\b([01]?\d|2[0-3])(?:[:h]| gio)(?:\s*[0-5]\d)?\b/g, "")
      .replace(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanedTitle.includes("check in")) {
      return "Check in ca làm";
    }

    if (cleanedTitle.includes("cham cong")) {
      return "Chấm công";
    }

    if (cleanedTitle.includes("lich hoc")) {
      return "Lịch học";
    }

    if (cleanedTitle && cleanedTitle !== "viec" && cleanedTitle !== "lich") {
      return cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
    }

    const title = userMessage
      .replace(/ghi nhớ\s+(là\s+)?/gi, "")
      .replace(/đặt\s+thông\s+báo\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/tạo\s+thông\s+báo\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/tạo\s+lịch\s+nhắc\s+nhở\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/tạo\s+lịch\s+nhắc\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/đặt\s+lịch\s+nhắc\s+nhở\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/đặt\s+lịch\s+nhắc\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/đặt\s+nhắc\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/tạo\s+nhắc\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/nhắc\s+nhở\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/báo\s+thức\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/tạo\s+lịch\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/tạo\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/thêm\s+(cho\s+)?(tôi|mình|em)?/gi, "")
      .replace(/phải\s+nhắc\s+(tôi|mình|em|mẹ)?/gi, "")
      .replace(/nhắc\s+(tôi|mình|em|mẹ)?/gi, "")
      .replace(/\btôi\s+phải\b/gi, "")
      .replace(/\bphải\b/gi, "")
      .replace(/hằng ngày|mỗi ngày|mỗi sáng|mỗi chiều|mỗi tối/gi, "")
      .replace(/hằng tuần|mỗi tuần|hằng tháng|mỗi tháng/gi, "")
      .replace(/hằng năm|mỗi năm/gi, "")
      .replace(/đến ngày|đúng ngày|ngày đó/gi, "")
      .replace(/mai|ngày mai|hôm nay|ngày kia/gi, "")
      .replace(/vào lúc|lúc|vào|ngày|tháng|năm/gi, "")
      .replace(/\b([01]?\d|2[0-3])(?:[:h]| giờ)(?:\s*[0-5]\d)?\b/gi, "")
      .replace(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (
      !title ||
      normalizeMessage(title) === "toi co viec" ||
      normalizeMessage(title) === "co viec"
    ) {
      return "Công việc mới";
    }

    return title.charAt(0).toUpperCase() + title.slice(1);
  };

  const shouldCreateTaskFromMessage = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    const asksAboutExistingTasks =
      text.includes("viec gi") ||
      text.includes("nhiem vu gi") ||
      text.includes("task nao") ||
      text.includes("lich gi") ||
      text.includes("co gi khong") ||
      text.includes("co gi ko") ||
      text.includes("co viec nao") ||
      text.includes("co lich nao");

    if (asksAboutExistingTasks) {
      return false;
    }

    return (
      text.includes("tao task") ||
      text.includes("tao viec") ||
      text.includes("tao cho toi") ||
      text.includes("them task") ||
      text.includes("them viec") ||
      text.includes("co viec") ||
      text.includes("co lich") ||
      text.includes("tao lich") ||
      text.includes("dat lich") ||
      text.includes("dat thong bao") ||
      text.includes("tao thong bao") ||
      text.includes("tao lich nhac") ||
      text.includes("dat lich nhac") ||
      text.includes("dat nhac") ||
      text.includes("tao nhac") ||
      text.includes("nhac nho") ||
      text.includes("bao thuc") ||
      text.includes("nhac toi") ||
      text.includes("nhac minh") ||
      text.includes("nhac em") ||
      text.includes("nhac me") ||
      text.includes("toi phai") ||
      text.includes("phai nhac") ||
      text.includes("ghi nho")
    );
  };

  const handlePendingScheduleReply = async (userMessage) => {
    const pendingTask = pendingScheduleTaskRef.current;

    if (!pendingTask) {
      return "";
    }

    const text = normalizeIntentText(userMessage);
    const originalText = String(userMessage || "").toLowerCase();
    const currentTask =
      tasks.find((task) => task.id === pendingTask.id) ||
      pendingTask;
    const confirmsSchedule =
      text.includes("giu vay") ||
      text.includes("giu lich") ||
      text.includes("dong y") ||
      text.includes("ok") ||
      text.includes("duoc") ||
      text.includes("dung roi") ||
      text === "co" ||
      text === "có" ||
      text === "oke" ||
      text === "dr" ||
      text === "d roi" ||
      text === "roi" ||
      text.includes("nhac hang ngay") ||
      text.includes("nhac hang tuan") ||
      text.includes("nhac hang thang") ||
      text.includes("chot") ||
      text.includes("de vay");
    const wantsAdjustment =
      text.includes("doi") ||
      text.includes("chinh") ||
      text.includes("sua") ||
      text.includes("chuyen") ||
      text.includes("doi sang") ||
      text.includes("luc") ||
      text.includes("gio") ||
      text.includes("sang") ||
      text.includes("chieu") ||
      originalText.includes("tối") ||
      text.includes("ngay mai") ||
      text.includes("hom nay") ||
      text.includes("ngay kia") ||
      text.includes("hang ngay") ||
      text.includes("moi ngay") ||
      text.includes("moi sang") ||
      text.includes("moi buoi sang") ||
      text.includes("vao moi sang") ||
      text.includes("vao moi buoi sang") ||
      text.includes("hang tuan") ||
      text.includes("hang thang") ||
      text.includes("hang nam") ||
      /\b\d{1,2}(?:[:h]\d{0,2}|h| gio)\b/.test(text) ||
      /\d{1,2}[/-]\d{1,2}/.test(text);

    if (!confirmsSchedule && !wantsAdjustment) {
      return "";
    }

    const date = parseDateFromMessage(userMessage);
    const time = parseTimeFromMessage(userMessage);
    const reminder = parseReminderFromMessage(userMessage);
    const recurrence = parseRecurrenceFromMessage(userMessage);

    if (confirmsSchedule && !date && !time && !reminder && !recurrence) {
      pendingScheduleTaskRef.current = null;

      return `Mình giữ lịch cho "${currentTask.title}" vào ${formatTaskSchedule(
        currentTask
      )}.`;
    }

    if (!date && !time && !reminder && !recurrence) {
      return `Bạn muốn chỉnh "${currentTask.title}" sang ngày/giờ nào? Ví dụ: "đổi sang mai lúc 15h" hoặc "nhắc trước 1 ngày".`;
    }

    const updatedFields = {};

    if (date) {
      updatedFields.startDate = date;
      updatedFields.deadline = date;
    }

    if (time) {
      updatedFields.startTime = time;
      updatedFields.endTime = addMinutesToTime(
        time,
        Math.max(30, Math.min(240, Number(appSettings.defaultTaskDuration) || 90))
      );
    }

    if (reminder) {
      updatedFields.reminder = reminder;
    }

    if (recurrence) {
      updatedFields.recurrence = recurrence;
    }

    await saveTaskUpdates(currentTask, updatedFields);

    const updatedTask = {
      ...currentTask,
      ...updatedFields,
    };

    const updatedRecurrenceText =
      updatedTask.recurrence === "daily"
        ? " Lịch này sẽ lặp lại hằng ngày."
        : updatedTask.recurrence === "weekly"
          ? " Lịch này sẽ lặp lại hằng tuần."
          : updatedTask.recurrence === "monthly"
            ? " Lịch này sẽ lặp lại hằng tháng."
            : updatedTask.recurrence === "yearly"
              ? " Lịch này sẽ lặp lại hằng năm."
              : "";

    const shouldFinalizeAfterUpdate =
      recurrence ||
      confirmsSchedule ||
      (updatedTask.startDate && updatedTask.startTime && updatedTask.recurrence);

    pendingScheduleTaskRef.current = shouldFinalizeAfterUpdate
      ? null
      : updatedTask;

    return `Tôi đã chỉnh lịch cho "${updatedTask.title}" thành ${formatTaskSchedule(
      updatedTask
    )}.${updatedRecurrenceText}`;
  };

  const createLocalTaskFromMessage = async (userMessage) => {
    if (!auth.currentUser) {
      return "Bạn cần đăng nhập trước khi tạo task.";
    }

    const date = parseDateFromMessage(userMessage);
    const time = parseTimeFromMessage(userMessage);
    const recurrence = parseRecurrenceFromMessage(userMessage);
    const reminder = parseReminderFromMessage(userMessage);
    const title = extractTaskTitleFromMessage(userMessage);
    const suggestedSchedule = suggestTaskSchedule(userMessage, title);
    const finalDate =
      date || (recurrence ? toIsoDate(new Date()) : suggestedSchedule.date);
    const finalTime = time || suggestedSchedule.time;
    const finalEndTime = time
      ? addMinutesToTime(
          time,
          Math.max(30, Math.min(240, Number(appSettings.defaultTaskDuration) || 90))
        )
      : suggestedSchedule.endTime;
    const finalReminder = reminder || suggestedSchedule.reminder;
    const hasSuggestedSchedule =
      (!date && !recurrence) || !time || (!reminder && !recurrence);

    const newTask = {
      title,
      category: "Personal",
      type: "Task",
      difficulty: "Dễ",
      necessity: "Trung bình",
      priority: "Trung bình",
      startDate: finalDate,
      deadline: finalDate,
      startTime: finalTime,
      endTime: finalEndTime,
      estimate: "Chọn thời gian",
      reminder: finalReminder,
      recurrence,
      assignee: "Tôi",
      status: "To do",
      completed: false,
      description: userMessage,
      suggestedSteps: buildChecklistForTask({
        title,
        type: "Task",
      }),
      source: "Local Chat",
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let taskDocumentId = `local-${Date.now()}`;
    let savedToFirebase = true;

    try {
      const taskDocument = await addDoc(
        collection(db, "tasks"),
        newTask
      );
      taskDocumentId = taskDocument.id;
    } catch (error) {
      console.warn("Could not save chat task to Firebase:", error);
      savedToFirebase = false;
    }

    const savedTask = {
      ...newTask,
      id: taskDocumentId,
      source: savedToFirebase ? newTask.source : "Local Chat (temporary)",
    };

    setTasks((currentTasks) => [
      ...currentTasks,
      savedTask,
    ]);

    pendingScheduleTaskRef.current = hasSuggestedSchedule
      ? savedTask
      : null;

    const dateText = ` ngày ${formatDate(finalDate)}`;
    const timeText = ` lúc ${finalTime}`;
    const recurrenceText =
      recurrence === "daily"
        ? " và sẽ nhắc lại hằng ngày"
        : recurrence === "weekly"
          ? " và sẽ nhắc lại hằng tuần"
          : recurrence === "monthly"
            ? " và sẽ nhắc lại hằng tháng"
            : recurrence === "yearly"
              ? " và sẽ nhắc lại hằng năm"
              : "";
    const suggestionText = hasSuggestedSchedule
      ? ` Đây là lịch tôi gợi ý vì bạn chưa nói đủ ngày/giờ/reminder. Bạn muốn giữ lịch này hay chỉnh lại?`
      : "";
    const persistenceText = savedToFirebase
      ? ""
      : " Hiện Firebase chưa cho lưu, nên tôi đã thêm tạm vào phiên hiện tại.";

    return `Tôi đã tạo task "${title}"${dateText}${timeText}${recurrenceText} và thêm vào danh sách của bạn.${suggestionText}${persistenceText}`;
  };

  const getLatestDocument = () => {
    return getLatestStoredDocument(documents);
  };

  const splitDocumentParagraphs = (text) => {
    return String(text || "")
      .replace(/\r/g, "")
      .split(/\n+|(?<=[.!?])\s+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length >= 30);
  };

  const splitDocumentBlocks = (text) => {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const blocks = [];
    let currentBlock = "";

    lines.forEach((line) => {
      const normalizedLine = normalizeMessage(line);
      const isHeading =
        /^(\d+\.|bai\s+\d+|chuong\s+\d+|phan\s+\d+|muc\s+\d+)/i.test(
          normalizedLine
        ) ||
        line.length <= 80;

      if (
        currentBlock &&
        (isHeading || currentBlock.length + line.length > 520)
      ) {
        blocks.push(currentBlock.trim());
        currentBlock = line;
        return;
      }

      currentBlock = currentBlock ? `${currentBlock} ${line}` : line;
    });

    if (currentBlock) {
      blocks.push(currentBlock.trim());
    }

    return blocks.filter((block) => block.length >= 8);
  };

  const isTableOfContentsBlock = (block) => {
    const normalizedBlock = normalizeMessage(block);

    return (
      normalizedBlock.includes("muc luc") ||
      /^(\d+(\.\d+)*\s+)?(phan|chuong|bai|muc)\s+\d+/i.test(
        normalizedBlock
      ) ||
      /^\d+(\.\d+)*\s+[a-z\s]+?\s+\d{1,3}$/i.test(normalizedBlock) ||
      /^[A-ZÀ-Ỹ0-9\s().:-]{8,90}$/.test(block) ||
      normalizedBlock.includes("de tai") ||
      normalizedBlock.includes("thanh vien") ||
      normalizedBlock.includes("giang vien") ||
      normalizedBlock.includes("truong dai hoc")
    );
  };

  const isContentLikeBlock = (block) => {
    const normalizedBlock = normalizeMessage(block);
    const words = normalizedBlock.split(/\s+/).filter(Boolean);
    const hasSentenceSignal =
      block.includes(".") ||
      block.includes(":") ||
      block.includes(";") ||
      /là|gồm|bao gồm|nhằm|giúp|cho phép|quản lý|hệ thống|người dùng|yêu cầu/i.test(
        block
      );

    return (
      words.length >= 12 &&
      hasSentenceSignal &&
      !isTableOfContentsBlock(block)
    );
  };

  const stripDocumentFrontMatter = (blocks) => {
    const firstContentIndex = blocks.findIndex((block, index) => {
      if (index > 25) {
        return true;
      }

      return isContentLikeBlock(block);
    });

    if (firstContentIndex <= 0) {
      return blocks;
    }

    return blocks.slice(firstContentIndex);
  };

  const getDocumentKeywords = (userMessage) => {
    return getDocumentKeywordsBase(userMessage);
  };

  const getQuestionPhrases = (userMessage) => {
    return getQuestionPhrasesBase(userMessage);
  };

  const classifyDocumentQuestionIntent = (userMessage) => {
    return classifyDocumentQuestionIntentBase(userMessage);
  };

  const normalizeDocumentRetrievalQuery = (userMessage, document, recentContext = {}) => {
    const intent = classifyDocumentQuestionIntent(userMessage);
    const fileName = getDocumentFileName(document, "tài liệu");
    const question = String(userMessage || "").trim();
    const recentTopic =
      recentContext.recentDocumentTopic ||
      recentContext.recentQuestion ||
      "";

    if (intent === "FOLLOW_UP_CONTEXT" && recentTopic) {
      return `${recentTopic}. ${question}`;
    }

    if (intent === "DEADLINE_LOOKUP") {
      return `deadline hạn mốc thời gian ngày hiệu lực của ${fileName}: ${question}`;
    }

    if (intent === "TASK_LOOKUP") {
      return `việc cần làm nhiệm vụ yêu cầu người phụ trách hoàn thành trong ${fileName}: ${question}`;
    }

    if (intent === "WORKFLOW_EXPLANATION") {
      return `quy trình các bước xử lý kiểm tra cập nhật trong ${fileName}: ${question}`;
    }

    if (intent === "CAUSE_ANALYSIS") {
      return `nguyên nhân lý do vấn đề rủi ro bất thường trong ${fileName}: ${question}`;
    }

    if (intent === "COMPARISON") {
      return `so sánh chênh lệch khác nhau cùng chỉ số trong ${fileName}: ${question}`;
    }

    if (intent === "RECOMMENDATION") {
      return `khuyến nghị ưu tiên hành động đề xuất xử lý trong ${fileName}: ${question}`;
    }

    return question;
  };
  const isOverviewDocumentQuestion = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    const asksForSpecificDetail =
      text.includes("rui ro") ||
      text.includes("muc tieu") ||
      text.includes("deadline") ||
      text.includes("han") ||
      text.includes("phu trach") ||
      text.includes("ket qua") ||
      text.includes("dang chu y") ||
      text.includes("bai ") ||
      text.includes("dung de") ||
      text.includes("lam gi");
    const asksForAction =
      text.includes("nen") ||
      text.includes("hoc") ||
      text.includes("lam") ||
      text.includes("workflow") ||
      text.includes("checklist") ||
      text.includes("can");

    if (asksForAction || asksForSpecificDetail) {
      return false;
    }

    return (
      text.includes("file nay") ||
      text.includes("day la file") ||
      text.includes("day la tai lieu") ||
      text.includes("tai lieu nay") ||
      text.includes("du lieu nay") ||
      text.includes("noi dung gi") ||
      text.includes("noi ve gi") ||
      text.includes("la gi") ||
      text.includes("tom tat")
    );
  };

  const getDocumentSearchBlocks = (document, documentText) => {
    const chunkBlocks = Array.isArray(document?.documentChunks)
      ? document.documentChunks
          .map((chunk, index) => ({
            text: chunk.text || chunk.content || "",
            source: `chunk ${index + 1}`,
            heading: chunk.title || chunk.heading || "",
            keywords: Array.isArray(chunk.keywords) ? chunk.keywords : [],
          }))
          .filter((chunk) => String(chunk.text).trim().length >= 30)
      : [];

    const paragraphBlocks = splitDocumentParagraphs(documentText).map(
      (paragraph, index) => ({
        text: paragraph,
        source: `đoạn ${index + 1}`,
        heading: "",
        keywords: [],
      })
    );

    return [...chunkBlocks, ...paragraphBlocks]
      .map((block) => ({
        ...block,
        text: String(block.text || "").replace(/\s+/g, " ").trim(),
      }))
      .filter((block) => block.text && !isTableOfContentsBlock(block.text));
  };

  const scoreSearchBlock = (block, keywords, phrases, questionText, intent = "FACT_LOOKUP") => {
    const normalizedBlock = normalizeMessage(
      `${block.heading || ""} ${block.text || ""} ${(block.keywords || []).join(" ")}`
    );
    const normalizedQuestion = normalizeMessage(questionText);
    const matchedKeywords = keywords.filter((keyword) =>
      normalizedBlock.includes(keyword)
    );
    const matchedPhrases = phrases.filter((phrase) =>
      normalizedBlock.includes(phrase)
    );
    const hasNumberSignal =
      /\d/.test(normalizedBlock) &&
      /\d|so lieu|du lieu|bao nhieu|muc do|ty le|doanh thu|diem|deadline|han|ngay|loai|trang thai|don hang/i.test(
        normalizedQuestion
      );
    const orderProcessScore =
      /don hang|loai don|trang thai/.test(normalizedQuestion) &&
      /don hang|loai don|trang thai|tiep nhan|xac nhan|kiem kho|dieu phoi|doi tra/.test(
        normalizedBlock
      )
        ? 28
        : 0;
    const hasActionSignal =
      /\b(can|phai|nen|deadline|han|yeu cau|nhiem vu|task|viec)\b/.test(
        normalizedBlock
      ) &&
      /\b(can|phai|nen|deadline|han|viec|task|workflow|lam gi)\b/.test(
        normalizedQuestion
      );
    const isHeadingMatch =
      block.heading && keywords.some((keyword) => normalizeMessage(block.heading).includes(keyword));
    const purposeScore =
      /dung de|lam gi|muc tieu/.test(normalizedQuestion) &&
      /dung de|giup|muc tieu|cung cap|nham|de /.test(normalizedBlock)
        ? 10
        : 0;
    const insightScore =
      /dang chu y|bat thuong|cao nhat|thap nhat|diem/.test(normalizedQuestion) &&
      /sap het|thap nhat|cao nhat|bat thuong|giam|tang|loi|kpi|doanh thu/.test(
        normalizedBlock
      )
        ? 14
        : 0;
    const matchesRequestedEntity =
      (!normalizedQuestion.includes("chi nhanh") || normalizedBlock.includes("chi nhanh")) &&
      (!normalizedQuestion.includes("thanh pho") || normalizedBlock.includes("thanh pho")) &&
      (!normalizedQuestion.includes("san pham") || normalizedBlock.includes("san pham")) &&
      (!normalizedQuestion.includes("nhan vien") || normalizedBlock.includes("nhan vien"));
    const dataComparisonScore =
      /cao nhat|thap nhat|nhieu nhat|it nhat|lon nhat|nho nhat/.test(normalizedQuestion) &&
      matchesRequestedEntity &&
      /\d/.test(normalizedBlock) &&
      /dat|voi|co|la|thap nhat|cao nhat|nhieu nhat|it nhat|kpi|doanh thu|khach/.test(
        normalizedBlock
      )
        ? 22
        : 0;
    const notableMetricScore =
      /dang chu y|diem/.test(normalizedQuestion) &&
      /\d/.test(normalizedBlock) &&
      /sap het|thap nhat|cao nhat|bat thuong|can gap|loi|kpi|giam|tang/.test(
        normalizedBlock
      )
        ? 20
        : 0;
    const riskScore =
      /rui ro|nguy co|loi|van de/.test(normalizedQuestion) &&
      /rui ro|nguy co|cham|thieu|loi|van de/.test(normalizedBlock)
        ? 12
        : 0;
    const actionScore =
      /nen lam|can lam|lam gi|tiep|xu ly|hanh dong|action/.test(normalizedQuestion) &&
      /viec can lam|nen|can|tao task|hop|uu tien|xu ly|theo doi|kiem tra/.test(
        normalizedBlock
      )
        ? 26
        : 0;
    const actionLabelScore =
      /nen lam|can lam|lam gi|tiep|xu ly|hanh dong|action/.test(normalizedQuestion) &&
      /viec can lam|action item|can xu ly|de xuat/.test(normalizedBlock)
        ? 24
        : 0;
    const decisionScore =
      /quyet dinh|co lam|khong/.test(normalizedQuestion) &&
      /quyet dinh|chua lam|khong|chi ho tro|thong nhat/.test(normalizedBlock)
        ? 8
        : 0;
    const intentBoosts = {
      DEADLINE_LOOKUP:
        /deadline|han|truoc ngay|ngay|thoi han|hoan thanh|hieu luc/.test(normalizedBlock)
          ? 30
          : 0,
      TASK_LOOKUP:
        /can|phai|yeu cau|phu trach|hoan thanh|thuc hien|chuan bi|viec can lam/.test(normalizedBlock)
          ? 28
          : 0,
      WORKFLOW_EXPLANATION:
        /quy trinh|buoc|tiep nhan|xu ly|kiem tra|cap nhat|dieu phoi|xac nhan/.test(normalizedBlock)
          ? 28
          : 0,
      CAUSE_ANALYSIS:
        /vi|do|nguyen nhan|rui ro|loi|cham|thieu|bat thuong|dan den/.test(normalizedBlock)
          ? 24
          : 0,
      COMPARISON:
        /\d/.test(normalizedBlock) && /so voi|cao hon|thap hon|tang|giam|chenh lech/.test(normalizedBlock)
          ? 22
          : 0,
      RECOMMENDATION:
        /nen|can|uu tien|de xuat|khuyen nghi|giai phap|hanh dong/.test(normalizedBlock)
          ? 24
          : 0,
      MULTI_FACT_SYNTHESIS:
        /\d|gom|bao gom|cac|nhom|loai|trang thai|muc|tong hop|noi dung|so lieu|du lieu|moc|deadline|viec can|rui ro|quy trinh/.test(
          normalizedBlock
        )
          ? 20
          : 0,
      DOCUMENT_OVERVIEW:
        /tai lieu nay la|file .* gom|bang |bao cao ve|quy dinh|hop dong|ke hoach|email|muc tieu/.test(normalizedBlock)
          ? 20
          : 0,
      FACT_LOOKUP: matchedPhrases.length > 0 || matchedKeywords.length > 0 ? 8 : 0,
      FOLLOW_UP_CONTEXT: matchedPhrases.length > 0 || matchedKeywords.length > 0 ? 10 : 0,
    };

    return (
      matchedKeywords.length * 3 +
      matchedPhrases.length * 5 +
      (hasNumberSignal ? 2 : 0) +
      (hasActionSignal ? 2 : 0) +
      (isHeadingMatch ? 3 : 0) +
      purposeScore +
      insightScore +
      dataComparisonScore +
      notableMetricScore +
      orderProcessScore +
      riskScore +
      actionScore +
      actionLabelScore +
      decisionScore +
      (intentBoosts[intent] || 0)
    );
  };

  const getEvidenceLimitForIntent = (intent, fallbackLimit = 4) => {
    const limits = {
      FACT_LOOKUP: 3,
      DEADLINE_LOOKUP: 4,
      TASK_LOOKUP: 5,
      WORKFLOW_EXPLANATION: 6,
      MULTI_FACT_SYNTHESIS: 6,
      CAUSE_ANALYSIS: 5,
      COMPARISON: 5,
      RECOMMENDATION: 5,
      DOCUMENT_OVERVIEW: 5,
      FOLLOW_UP_CONTEXT: 4,
    };
    return limits[intent] || fallbackLimit;
  };

  const dedupeEvidenceBlocks = (blocks) => {
    const seen = new Set();
    return blocks.filter((block) => {
      const key = normalizeMessage(block.text || "").slice(0, 180);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const selectEvidenceSet = (
    documentOrText,
    userMessage,
    limit = 4,
    recentContext = {}
  ) => {
    const document =
      typeof documentOrText === "object" && documentOrText !== null
        ? documentOrText
        : null;
    const documentText = document ? getDocumentText(document) : documentOrText;
    const intent = classifyDocumentQuestionIntent(userMessage);
    const normalizedQuery = normalizeDocumentRetrievalQuery(userMessage, document, recentContext);
    const keywords = getDocumentKeywords(normalizedQuery);
    const phrases = getQuestionPhrases(normalizedQuery);
    const searchBlocks = getDocumentSearchBlocks(document, documentText);
    const evidenceLimit = getEvidenceLimitForIntent(intent, limit);

    if (searchBlocks.length === 0) {
      return [];
    }

    if (
      (keywords.length === 0 && phrases.length === 0) ||
      intent === "DOCUMENT_OVERVIEW" ||
      isOverviewDocumentQuestion(userMessage)
    ) {
      return dedupeEvidenceBlocks(searchBlocks
        .map((block, index) => {
          const normalizedBlock = normalizeMessage(block.text);
          const overviewScore =
            /tai lieu nay la|file .* gom|bang |bao cao ve|quy dinh|hop dong|ke hoach|email/.test(
              normalizedBlock
            )
              ? 10
              : 0;

          return {
            text: block.text,
            heading: block.heading || "",
            source: block.source || "",
            position: index,
            intent,
            normalizedQuery,
            score: overviewScore + Math.max(1, limit - Math.min(index, limit)),
          };
        })
        .sort((firstItem, secondItem) => secondItem.score - firstItem.score)
        .slice(0, evidenceLimit));
    }

    const rankedBlocks = searchBlocks
      .map((block) => {
        return {
          text: block.text,
          heading: block.heading || "",
          source: block.source || "",
          index: searchBlocks.indexOf(block),
          intent,
          normalizedQuery,
          score: scoreSearchBlock(block, keywords, phrases, normalizedQuery, intent),
        };
      })
      .filter((item) => item.score > 0)
      .sort((firstItem, secondItem) => secondItem.score - firstItem.score)
      .slice(0, evidenceLimit);

    if (intent === "MULTI_FACT_SYNTHESIS" && rankedBlocks.length === 0) {
      return dedupeEvidenceBlocks(
        searchBlocks
          .map((block, index) => ({
            text: block.text,
            heading: block.heading || "",
            source: block.source || "",
            position: index,
            intent,
            normalizedQuery,
            score: /\d|gom|bao gom|noi dung|tong hop|quy trinh|rui ro|deadline/i.test(
              normalizeMessage(block.text)
            )
              ? 8
              : 1,
          }))
          .sort((firstItem, secondItem) => secondItem.score - firstItem.score || firstItem.position - secondItem.position)
          .slice(0, evidenceLimit)
      );
    }

    const selectedBlocks = new Map();
    rankedBlocks.forEach((block) => {
      [block.index - 1, block.index, block.index + 1].forEach((index) => {
        if (index >= 0 && index < searchBlocks.length && !selectedBlocks.has(index)) {
          selectedBlocks.set(index, {
            text: searchBlocks[index].text,
            heading: searchBlocks[index].heading || "",
            source: searchBlocks[index].source || "",
            position: index,
            intent,
            normalizedQuery,
            score: index === block.index ? block.score : Math.max(1, block.score - 2),
          });
        }
      });
    });

    return dedupeEvidenceBlocks([...selectedBlocks.values()])
      .sort((firstItem, secondItem) => secondItem.score - firstItem.score)
      .slice(0, evidenceLimit);
  };

  const getRelevantParagraphs = (documentOrText, userMessage, limit = 4) => {
    return selectEvidenceSet(documentOrText, userMessage, limit).map(
      (item) => item.text
    );
  };

  const splitInlineListItems = (text) => {
    return String(text || "")
      .replace(/->|→|=>/g, ",")
      .split(/[,;•\n]+/)
      .map((item) =>
        item
          .replace(/^\s*[-–—\d.)]+/, "")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter((item) => item.length >= 3 && item.length <= 70);
  };

  const extractOrderProcessItems = (blocks) => {
    const text = blocks.join(" ");
    const candidates = [];
    const processMatch = text.match(
      /(tiếp nhận|tiep nhan)[^.!?\n]{0,260}(đổi trả|doi tra|giao hàng|giao hang|tồn kho|ton kho)?/i
    );

    if (processMatch) {
      candidates.push(...splitInlineListItems(processMatch[0]));
    }

    const commonItems = [
      ["Tiếp nhận đơn", /tiếp nhận|tiep nhan/i],
      ["Xác nhận thông tin", /xác nhận|xac nhan/i],
      ["Kiểm tra tồn kho", /kiểm kho|kiem kho|tồn kho|ton kho/i],
      ["Điều phối/giao hàng", /điều phối|dieu phoi|giao hàng|giao hang/i],
      ["Xử lý đổi trả", /đổi trả|doi tra/i],
    ];

    commonItems.forEach(([label, pattern]) => {
      if (pattern.test(text)) {
        candidates.push(label);
      }
    });

    return [...new Set(candidates.map((item) => formatShortPoint(item, 80)))]
      .filter(Boolean)
      .slice(0, 8);
  };

  const formatEvidenceLines = (paragraphs, limit = 3) =>
    formatEvidenceLinesBase(paragraphs, limit, formatShortPoint);

  const splitEvidenceSentences = (paragraphs) => {
    return splitEvidenceSentencesBase(paragraphs);
  };

  const createMultiFactAnswer = (document, userMessage, relevantParagraphs) => {
    const fileName = document.fileName || "tài liệu này";
    const questionText = normalizeIntentText(userMessage);
    const evidenceSentences = splitEvidenceSentences(relevantParagraphs);
    const evidenceText = normalizeIntentText(relevantParagraphs.join(" "));

    if (
      questionText.includes("phan nao") ||
      questionText.includes("gom nhung phan") ||
      questionText.includes("bao gom nhung phan")
    ) {
      const contentSentence = evidenceSentences.find((sentence) => {
        const normalizedSentence = normalizeIntentText(sentence);
        return (
          normalizedSentence.includes("noi dung") ||
          normalizedSentence.includes("gom") ||
          normalizedSentence.includes("bao gom") ||
          normalizedSentence.includes("khai niem") ||
          /phan\s+\d/.test(normalizedSentence)
        );
      });

      if (contentSentence) {
        return [
          `Trong "${fileName}", phần nội dung chính là:`,
          formatShortPoint(contentSentence, 520),
        ].join("\n");
      }
    }

    if (
      questionText.includes("yeu to") ||
      questionText.includes("nhac nhung") ||
      questionText.includes("thong tin nao") ||
      questionText.includes("nhung gi")
    ) {
      const factors = [
        /moc chinh|deadline|han/.test(evidenceText) ? "mốc chính/deadline" : "",
        evidenceText.includes("moc theo doi") ? "mốc theo dõi" : "",
        /viec can lam|nhiem vu|can lam/.test(evidenceText) ? "việc cần làm" : "",
        evidenceText.includes("rui ro") ? "rủi ro" : "",
        /quy trinh|cac buoc/.test(evidenceText) ? "quy trình" : "",
        /so lieu|tong hop|\d+%/.test(evidenceText) ? "số liệu" : "",
      ].filter(Boolean);

      if (factors.length > 0) {
        return [
          `Trong "${fileName}", tài liệu nhắc các nhóm thông tin chính: ${factors.join(", ")}.`,
          "",
          "Bằng chứng liên quan:",
          ...formatEvidenceLines(relevantParagraphs, 4),
        ].join("\n");
      }
    }

    if (
      questionText.includes("so lieu") ||
      questionText.includes("bao nhieu") ||
      questionText.includes("thong ke")
    ) {
      const numberSentences = evidenceSentences.filter((sentence) => /\d/.test(sentence));

      if (numberSentences.length > 0) {
        return [
          `Các số liệu tôi thấy trong "${fileName}":`,
          ...numberSentences.slice(0, 5).map((sentence, index) => `${index + 1}. ${formatShortPoint(sentence, 260)}`),
        ].join("\n");
      }
    }

    return [
      `Tôi gom được các thông tin liên quan trong "${fileName}" như sau:`,
      ...formatEvidenceLines(relevantParagraphs, 5),
    ].join("\n");
  };

  const createDataInsightAnswer = (document, relevantParagraphs) => {
    const dataInsightLines = formatDataInsightsForChat(document.dataInsights);
    const dataAgentLines = formatDataAgentForChat(document);
    const fileName = document.fileName || "tài liệu này";

    if (dataInsightLines.length > 0 || dataAgentLines.length > 0) {
      return [
        `Dựa trên dữ liệu trong "${fileName}", đây là phần phân tích quan trọng:`,
        "",
        ...dataInsightLines,
        ...(dataAgentLines.length > 0 ? ["", ...dataAgentLines] : []),
        "",
        "Bằng chứng/đoạn liên quan:",
        ...formatEvidenceLines(relevantParagraphs, 3),
      ].join("\n");
    }

    return [
      `Tôi thấy bạn đang hỏi theo hướng phân tích dữ liệu trong "${fileName}".`,
      "Hiện file này chưa có bảng số liệu đủ rõ để tôi tính toán sâu như tổng, trung bình, xu hướng hay dự báo.",
      "",
      "Phần liên quan nhất trong file:",
      ...formatEvidenceLines(relevantParagraphs, 4),
      "",
      "Nếu đây là Excel/CSV, bạn upload bản bảng dữ liệu gốc để tôi phân tích được: cột số, nhóm cao/thấp, bất thường, biểu đồ và dự báo.",
    ].join("\n");
  };

  const createActionAnswer = (document, relevantParagraphs) => {
    const fileName = document.fileName || "tài liệu này";
    const documentTasks = Array.isArray(document.tasks) ? document.tasks : [];
    const taskLines = documentTasks
      .slice(0, 5)
      .map(
        (task, index) =>
          `${index + 1}. ${task.title || "Việc cần làm"} - ${formatTaskSchedule(task)} - ${task.priority || "Trung bình"}`
      );

    if (taskLines.length > 0) {
      return [
        `Dựa trên "${fileName}", tôi thấy các việc có thể xử lý như sau:`,
        "",
        ...taskLines,
        "",
        "Checklist nên làm:",
        "1. Kiểm tra lại từng task xem có đúng ý bạn không.",
        "2. Giữ tên task ngắn, đưa bối cảnh dài vào mô tả/checklist.",
        "3. Nếu task chưa có deadline rõ, để ở trạng thái chưa phân lịch hoặc chọn khung giờ rảnh.",
        "4. Bấm tạo task từ gợi ý nếu bạn muốn đưa vào Task List/Calendar.",
      ].join("\n");
    }

    return [
      `File "${fileName}" giống tài liệu tham khảo hơn là tài liệu giao việc trực tiếp.`,
      "",
      "Việc nên làm tiếp:",
      "1. Đọc/tóm tắt nội dung chính.",
      "2. Đánh dấu phần cần áp dụng vào công việc hoặc bài học.",
      "3. Nếu muốn biến thành task, hãy chọn một mục cụ thể trong file, ví dụ: “tạo checklist cho phần quy trình đơn hàng”.",
      "",
      "Bằng chứng tôi đang bám vào:",
      ...formatEvidenceLines(relevantParagraphs, 3),
    ].join("\n");
  };

  const createOverviewAnswer = (document, documentText, relevantParagraphs, userMessage = "") => {
    const fileName = document.fileName || "tài liệu này";
    const label = getDocumentLabel(document.documentType || document.type || "LOCAL_ANALYSIS");
    const parts = getStoredSummaryParts(document, documentText);
    const overview = formatShortPoint(parts.overview || relevantParagraphs[0], 480);
    const questionText = normalizeIntentText(userMessage);
    const asksIdentityOnly =
      (questionText.includes("file nay la gi") ||
        questionText.includes("tai lieu nay la gi") ||
        questionText === "noi ve gi") &&
      !questionText.includes("tom tat") &&
      !questionText.includes("chi tiet");

    if (asksIdentityOnly) {
      const identitySentence =
        splitEvidenceSentences(relevantParagraphs).find((sentence) =>
          /tài liệu này là|tai lieu nay la|file này là|file nay la/i.test(sentence)
        ) || overview;

      return `Đây là ${label} "${fileName}". ${formatShortPoint(identitySentence, 260)}`;
    }

    const mainIdeas = parts.mainIdeas
      .map((idea) => formatShortPoint(idea, 240))
      .filter(Boolean)
      .slice(0, 5);

    return [
      `Đây là ${label} "${fileName}".`,
      "",
      `Nội dung chính: ${overview}`,
      "",
      "Các ý chính tôi nhận ra:",
      ...(mainIdeas.length > 0
        ? mainIdeas.map((idea, index) => `${index + 1}. ${idea}`)
        : formatEvidenceLines(relevantParagraphs, 4)),
      "",
      "Bạn có thể hỏi tiếp kiểu: “phần nào quan trọng nhất?”, “tôi cần làm gì?”, hoặc “tạo task từ file này”.",
    ].join("\n");
  };

  const createFactLookupAnswer = (document, userMessage, relevantParagraphs) => {
    const fileName = document.fileName || "tài liệu này";
    const questionText = normalizeIntentText(userMessage);
    const evidenceSentences = splitEvidenceSentences(relevantParagraphs);
    const normalizedSentences = evidenceSentences.map((sentence) => ({
      raw: sentence,
      text: normalizeIntentText(sentence),
    }));

    const findSentence = (predicate) => normalizedSentences.find(predicate)?.raw || "";

    if (questionText.includes("moc chinh")) {
      const sentence = findSentence((item) => item.text.includes("moc chinh"));
      const match = sentence.match(/mốc chính\s+là\s+[^.;,\n]+/i);
      return match
        ? `${match[0].replace(/\s+/g, " ").trim()}.`
        : sentence
          ? formatShortPoint(sentence, 220)
          : `Tôi chưa thấy mốc chính được ghi rõ trong "${fileName}".`;
    }

    if (
      questionText.includes("bao nhieu") ||
      questionText.includes("co bao nhieu") ||
      questionText.includes("tong bao nhieu")
    ) {
      const numericSentence = findSentence((item) => {
        const hasNumber = /\d/.test(item.raw);
        const sharesKeyword = questionText
          .split(/\s+/)
          .filter((token) => token.length >= 3)
          .some((token) => item.text.includes(token));
        return hasNumber && sharesKeyword;
      });
      const numberPhrase =
        numericSentence.match(/(?:có\s+)?\d+(?:[.,]\d+)?\s+[^.;,\n]{0,80}/i)?.[0] || numericSentence;

      return numberPhrase
        ? formatShortPoint(numberPhrase, 180)
        : `Tôi chưa thấy con số chính thức cho câu hỏi này trong "${fileName}".`;
    }

    if (
      questionText.includes("dung de lam gi") ||
      questionText.includes("de lam gi") ||
      questionText.includes("cong dung") ||
      questionText.includes("y nghia")
    ) {
      const purposeSentence =
        findSentence((item) =>
          /dùng để|dung de|giúp|giup|nhằm|nham|mục đích|muc dich/.test(item.text)
        ) || findSentence((item) => item.text.includes("la mot cong cu") || item.text.includes("la cong cu"));

      return purposeSentence
        ? formatShortPoint(purposeSentence, 360)
        : `Tôi chưa thấy phần nêu rõ công dụng/ý nghĩa trong "${fileName}".`;
    }

    const directSentence =
      normalizedSentences
        .map((item) => {
          const score = questionText
            .split(/\s+/)
            .filter((token) => token.length >= 3)
            .reduce((total, token) => total + (item.text.includes(token) ? 1 : 0), 0);
          return { ...item, score };
        })
        .sort((a, b) => b.score - a.score)[0]?.raw || relevantParagraphs[0];

    return formatShortPoint(directSentence, 360);
  };

  const createFocusedDocumentAnswer = (
    document,
    userMessage,
    relevantParagraphs,
    documentText = ""
  ) => {
    const fileName = document.fileName || "tài liệu này";
    const text = normalizeIntentText(userMessage);
    const intent = classifyDocumentQuestionIntent(userMessage);

    if (intent === "DOCUMENT_OVERVIEW") {
      return createOverviewAnswer(document, documentText, relevantParagraphs, userMessage);
    }

    if (intent === "MULTI_FACT_SYNTHESIS") {
      return createMultiFactAnswer(document, userMessage, relevantParagraphs);
    }

    if (intent === "FACT_LOOKUP") {
      return createFactLookupAnswer(document, userMessage, relevantParagraphs);
    }

    if (intent === "COMPARISON") {
      return createDataInsightAnswer(document, relevantParagraphs);
    }

    if (intent === "TASK_LOOKUP" || intent === "RECOMMENDATION") {
      return createActionAnswer(document, relevantParagraphs);
    }

    if (intent === "DEADLINE_LOOKUP") {
      const deadlines = extractDocumentDeadlines(documentText);

      return deadlines.length > 0
        ? [
            `Tôi tìm thấy các mốc thời gian/deadline trong "${fileName}":`,
            ...deadlines.map((paragraph, index) => `${index + 1}. ${formatShortPoint(paragraph, 300)}`),
          ].join("\n")
        : `Tôi chưa thấy deadline hoặc mốc thời gian rõ ràng trong "${fileName}".`;
    }

    if (intent === "WORKFLOW_EXPLANATION") {
      const workflowItems = extractOrderProcessItems(relevantParagraphs);
      return [
        `Dựa trên "${fileName}", quy trình/phần xử lý có thể hiểu theo thứ tự sau:`,
        "",
        ...(workflowItems.length > 0
          ? workflowItems.map((item, index) => `${index + 1}. ${item}`)
          : relevantParagraphs
              .slice(0, 5)
              .map((paragraph, index) => `${index + 1}. ${formatShortPoint(paragraph, 280)}`)),
        "",
        "Tôi chỉ dùng các đoạn có trong tài liệu, nên nếu file chưa ghi đủ bước thì phần thiếu cần bạn bổ sung hoặc upload bản đầy đủ hơn.",
      ].join("\n");
    }

    if (intent === "CAUSE_ANALYSIS") {
      return [
        `Tôi tìm thấy các đoạn liên quan đến nguyên nhân/rủi ro trong "${fileName}":`,
        "",
        ...relevantParagraphs
          .slice(0, 5)
          .map((paragraph, index) => `${index + 1}. ${formatShortPoint(paragraph, 300)}`),
        "",
        "Điều có thể kết luận là các nguyên nhân/rủi ro chỉ nên lấy từ những đoạn trên; tôi không tự suy diễn thêm nếu tài liệu không nêu.",
      ].join("\n");
    }

    if (
      text.includes("don hang") ||
      text.includes("loai don") ||
      text.includes("trang thai") ||
      text.includes("quy trinh")
    ) {
      const processItems = extractOrderProcessItems(relevantParagraphs);

      return [
        `Dựa trên file "${fileName}", phần liên quan đến đơn hàng đang nói về quy trình/trạng thái xử lý chứ chưa chắc là "loại đơn hàng" theo nghĩa danh mục cố định.`,
        "",
        processItems.length > 0
          ? `Tôi nhận ra ${processItems.length} mục chính:`
          : "Tôi chưa thấy danh sách loại đơn hàng được ghi rõ thành bảng/danh mục.",
        ...processItems.map((item, index) => `${index + 1}. ${item}`),
        "",
        "Bằng chứng trong file:",
        ...relevantParagraphs
          .slice(0, 3)
          .map((paragraph, index) => `${index + 1}. ${formatShortPoint(paragraph, 260)}`),
        "",
        processItems.length > 0
          ? "Nếu bạn muốn, tôi có thể chuyển các mục này thành checklist kiểm tra quy trình đơn hàng."
          : "Nếu file có bảng/ảnh chứa danh mục đơn hàng, bạn upload bản rõ hơn để tôi đọc chính xác số lượng.",
      ].join("\n");
    }

    if (
      text.includes("bao nhieu") ||
      text.includes("co tong") ||
      text.includes("may loai")
    ) {
      return [
        `Tôi chưa thấy file "${fileName}" ghi một con số tổng chính thức cho câu hỏi này.`,
        "",
        "Các đoạn liên quan nhất tôi tìm được là:",
        ...relevantParagraphs
          .slice(0, 4)
          .map((paragraph, index) => `${index + 1}. ${formatShortPoint(paragraph, 300)}`),
        "",
        "Tôi sẽ không tự bịa số lượng nếu tài liệu không nêu rõ. Bạn có thể hỏi theo tên bảng/mục cụ thể để tôi dò sâu hơn.",
      ].join("\n");
    }

    return [
      `Dựa trên file "${fileName}", câu trả lời ngắn gọn là:`,
      formatShortPoint(relevantParagraphs[0], 420),
      "",
      "Chi tiết liên quan trong tài liệu:",
      ...relevantParagraphs
        .slice(0, 4)
        .map((paragraph, index) => `${index + 1}. ${formatShortPoint(paragraph, 300)}`),
    ].join("\n");
  };

  const extractImportantDetails = (blocks) => {
    const importantPatterns = [
      /\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/,
      /\d{1,2}\s+tháng\s+\d{1,2}/i,
      /\b\d+(?:[.,]\d+)?\s*(%|triệu|tỷ|ngày|giờ|phút|task|câu|bài)\b/i,
      /\b(deadline|hạn|yêu cầu|kết luận|mục tiêu|nhiệm vụ|cần|phải|đúng|sai)\b/i,
    ];

    return blocks
      .filter((block) =>
        importantPatterns.some((pattern) => pattern.test(block))
      )
      .slice(0, 6)
      .map((block) => block.slice(0, 320));
  };

  const summarizeDocument = (documentText, options = {}) => {
    const blocks = splitDocumentBlocks(documentText);
    const paragraphs = splitDocumentParagraphs(documentText);
    const rawContentBlocks = blocks.length > 0 ? blocks : paragraphs;
    const strippedBlocks = stripDocumentFrontMatter(rawContentBlocks);
    const contentBlocks = strippedBlocks.filter(
      (block, index) =>
        isContentLikeBlock(block) ||
        (index > 0 && block.length >= 80 && !isTableOfContentsBlock(block))
    );
    const fallbackBlocks = strippedBlocks.filter(
      (block) => !isTableOfContentsBlock(block)
    );
    const summaryBlocks =
      contentBlocks.length > 0 ? contentBlocks : fallbackBlocks;
    const maxMainIdeas = options.maxMainIdeas || 8;

    if (summaryBlocks.length === 0) {
      return "Tài liệu này chưa có đủ nội dung văn bản để tóm tắt.";
    }

    const title =
      summaryBlocks.find((block) => block.length <= 160) ||
      summaryBlocks[0];
    const mainIdeas = summaryBlocks
      .filter((block, index) => index === 0 || block !== title)
      .slice(0, maxMainIdeas)
      .map((block) => block.replace(/\s+/g, " ").slice(0, 420));
    const importantDetails = extractImportantDetails(summaryBlocks);

    return [
      "Tổng quan:",
      `- ${title.replace(/\s+/g, " ").slice(0, 380)}`,
      "",
      "Nội dung chính:",
      ...mainIdeas.map((idea, index) => `${index + 1}. ${idea}`),
      "",
      importantDetails.length > 0
        ? "Chi tiết/mốc đáng chú ý:"
        : "Chi tiết/mốc đáng chú ý:",
      importantDetails.length > 0
        ? importantDetails
            .map((detail, index) => `${index + 1}. ${detail}`)
            .join("\n")
        : "- Tôi chưa thấy mốc thời gian, số liệu hoặc yêu cầu hành động rõ ràng trong phần văn bản đã trích xuất.",
      "",
      "Bạn nên làm tiếp:",
      "1. Xác định phần nào là thông tin cần hiểu, phần nào là việc phải làm.",
      "2. Nếu đây là tài liệu học tập, hãy đánh dấu câu/bài chưa chắc để hỏi lại.",
      "3. Nếu đây là tài liệu công việc, hãy tách action item, người phụ trách và deadline.",
      "4. Nói 'chia thành task' nếu bạn muốn tôi chuyển nội dung này thành lịch và checklist.",
    ].join("\n");
  };

  const formatStoredDocumentSummary = (document) => {
    const summary = document?.documentSummary;

    if (!summary || typeof summary !== "object") {
      return "";
    }

    const mainIdeas = Array.isArray(summary.mainIdeas)
      ? summary.mainIdeas
      : [];
    const keyDetails = Array.isArray(summary.keyDetails)
      ? summary.keyDetails
      : [];
    const nextActions = Array.isArray(summary.nextActions)
      ? summary.nextActions
      : [];

    return [
      "Tổng quan:",
      `- ${summary.overview || document.documentPurpose || "Tài liệu cần được đọc hiểu và phân tích theo nội dung chính."}`,
      "",
      "Nội dung chính:",
      ...(mainIdeas.length > 0
        ? mainIdeas.slice(0, 8).map((idea, index) => `${index + 1}. ${idea}`)
        : ["1. Chưa có đủ ý chính đã lưu, tôi sẽ dựa vào văn bản gốc để tóm tắt tiếp."]),
      "",
      "Chi tiết đáng chú ý:",
      ...(keyDetails.length > 0
        ? keyDetails.slice(0, 6).map((detail, index) => `${index + 1}. ${detail}`)
        : ["1. Chưa thấy mốc/số liệu/yêu cầu nổi bật trong dữ liệu đã lưu."]),
      "",
      "Bạn nên làm tiếp:",
      ...(nextActions.length > 0
        ? nextActions.slice(0, 5).map((action, index) => `${index + 1}. ${action}`)
        : [
            "1. Hỏi sâu phần bạn muốn hiểu.",
            "2. Yêu cầu tôi chia nội dung thành task/checklist nếu cần làm việc tiếp.",
          ]),
    ].join("\n");
  };

  const getStoredSummaryParts = (document, documentText) => {
    const summary = document?.documentSummary;
    const fallbackBlocks = splitDocumentParagraphs(documentText)
      .filter((paragraph) => !isTableOfContentsBlock(paragraph))
      .slice(0, 8);

    if (summary && typeof summary === "object") {
      return {
        overview:
          summary.overview ||
          document.documentPurpose ||
          fallbackBlocks[0] ||
          "Tài liệu này cần được đọc hiểu và phân tích theo nội dung chính.",
        mainIdeas:
          Array.isArray(summary.mainIdeas) && summary.mainIdeas.length > 0
            ? summary.mainIdeas
            : fallbackBlocks.slice(0, 5),
        keyDetails:
          Array.isArray(summary.keyDetails) && summary.keyDetails.length > 0
            ? summary.keyDetails
            : extractImportantDetails(fallbackBlocks),
        nextActions:
          Array.isArray(summary.nextActions) && summary.nextActions.length > 0
            ? summary.nextActions
            : [],
      };
    }

    return {
      overview:
        fallbackBlocks[0] ||
        document?.documentPurpose ||
        "Tài liệu này cần được đọc hiểu và phân tích theo nội dung chính.",
      mainIdeas: fallbackBlocks.slice(1, 7),
      keyDetails: extractImportantDetails(fallbackBlocks),
      nextActions: [],
    };
  };

  const formatShortPoint = (value, maxLength = 260) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);

  const formatNumberInsight = (value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return Number(number.toFixed(2)).toLocaleString("vi-VN");
  };

  const addDaysToDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const getNextAnnualDate = (day, month) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const candidate = new Date(currentYear, Number(month) - 1, Number(day));
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    if (candidate < todayOnly) {
      candidate.setFullYear(currentYear + 1);
    }

    return toIsoDate(candidate);
  };

  const extractBirthdayRows = (documentText) => {
    const lines = String(documentText || "")
      .split(/\n|(?=Mã nhân viên\s*:)|(?=Ma nhan vien\s*:)/i)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return lines
      .map((line, index) => {
        const nameMatch = line.match(
          /(?:Họ\s*và\s*tên|Ho\s*va\s*ten|Tên|Ten)\s*:\s*([^|,\n]+)/i
        );
        const birthdayMatch = line.match(
          /(?:Ngày\s*sinh|Ngay\s*sinh)\s*:\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i
        );

        if (!nameMatch || !birthdayMatch) {
          return null;
        }

        const employeeId =
          line.match(/(?:Mã\s*nhân\s*viên|Ma\s*nhan\s*vien)\s*:\s*([^|,\n]+)/i)?.[1]?.trim() ||
          "";
        const department =
          line.match(/(?:Phòng\s*ban|Phong\s*ban)\s*:\s*([^|,\n]+)/i)?.[1]?.trim() ||
          "";
        const role =
          line.match(/(?:Chức\s*vụ|Chuc\s*vu)\s*:\s*([^|,\n]+)/i)?.[1]?.trim() ||
          "";
        const day = birthdayMatch[1].padStart(2, "0");
        const month = birthdayMatch[2].padStart(2, "0");
        const birthYear = birthdayMatch[3] || "";
        const nextBirthday = getNextAnnualDate(day, month);
        const name = nameMatch[1].trim();

        return {
          id: employeeId || `birthday-${index + 1}`,
          name,
          employeeId,
          department,
          role,
          birthdayText: `${day}/${month}${birthYear ? `/${birthYear}` : ""}`,
          nextBirthday,
          sourceText: line,
        };
      })
      .filter(Boolean);
  };

  const isBirthdayTaskRequest = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    return (
      (text.includes("sinh nhat") || text.includes("ngay sinh")) &&
      (text.includes("tao") ||
        text.includes("task") ||
        text.includes("lich") ||
        text.includes("nhac") ||
        text.includes("reminder"))
    );
  };

  const createBirthdayReminderTasks = (documentText) => {
    return extractBirthdayRows(documentText)
      .map((person, index) => ({
        title: `Nhắc sinh nhật ${person.name}`,
        description: [
          `Sinh nhật: ${person.birthdayText}.`,
          person.employeeId ? `Mã nhân viên: ${person.employeeId}.` : "",
          person.department ? `Phòng ban: ${person.department}.` : "",
          person.role ? `Chức vụ: ${person.role}.` : "",
          "",
          `Nguồn dữ liệu: ${person.sourceText}`,
        ]
          .filter(Boolean)
          .join("\n"),
        category: "Work",
        type: "Reminder",
        domain: "Human Resources",
        difficulty: "Dễ",
        necessity: "Trung bình",
        priority: "Trung bình",
        startDate: person.nextBirthday,
        deadline: person.nextBirthday,
        startTime: "09:00",
        endTime: "09:15",
        estimate: "15 phút",
        reminder: "Trước 1 ngày",
        assignee: "Tôi",
        status: "To do",
        completed: false,
        suggestedSteps: [
          "Kiểm tra lại thông tin ngày sinh trong file gốc.",
          "Chuẩn bị lời chúc hoặc thông báo nội bộ nếu cần.",
          "Cập nhật trạng thái sau khi đã nhắc/chúc mừng.",
        ],
      }))
      .slice(0, 20);
  };

  const getReadableFileTopic = (fileName) =>
    String(fileName || "tài liệu")
      .replace(/\.[^.]+$/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48) || "tài liệu";

  const buildShortTaskTitle = (task, fileName, index = 0) => {
    const rawTitle = String(task?.title || "").replace(/\s+/g, " ").trim();
    const topic = getReadableFileTopic(fileName);
    const isTooLong =
      rawTitle.length > 68 ||
      rawTitle.split(/\s+/).length > 11 ||
      /[.!?]{1}\s+\p{Lu}/u.test(rawTitle);

    if (rawTitle && !isTooLong) {
      return rawTitle;
    }

    const typeText = normalizeIntentText(
      `${task?.type || ""} ${task?.category || ""} ${task?.description || ""}`
    );

    if (/data|du lieu|bao cao|doanh thu|chi phi|nhan su|excel|csv/.test(typeText)) {
      return `Phân tích dữ liệu ${topic}`;
    }

    if (/deadline|lich|reminder|nhac/.test(typeText)) {
      return `Tạo lịch nhắc cho ${topic}`;
    }

    if (/checklist|viec can lam|action|workflow/.test(typeText)) {
      return `Lập checklist cho ${topic}`;
    }

    if (/hoc|bai tap|ly thuyet|on tap|tieu luan|docx/.test(typeText)) {
      return index === 0
        ? `Tóm tắt ${topic}`
        : `Ôn nội dung ${topic}`;
    }

    return `Xử lý ${topic}`;
  };

  const normalizeSuggestedTaskDraft = (task, fileName, index = 0) => {
    const originalTitle = String(task?.title || "").replace(/\s+/g, " ").trim();
    const title = buildShortTaskTitle(task, fileName, index);
    const baseDescription =
      task?.description ||
      `Hoàn thành phần việc được trích xuất từ ${fileName}.`;
    const description =
      originalTitle && originalTitle !== title
        ? `${baseDescription}\n\nNội dung gốc AI trích xuất: ${originalTitle}`
        : baseDescription;

    return {
      ...task,
      title,
      description,
    };
  };

  const createDocumentSuggestedTasks = (document) => {
    const documentText = getDocumentText(document);
    const birthdayReminderTasks = createBirthdayReminderTasks(documentText);
    if (birthdayReminderTasks.length > 0) {
      return birthdayReminderTasks;
    }

    const explicitSuggestedTasks = Array.isArray(document?.suggestedTasks)
      ? document.suggestedTasks
      : [];
    if (explicitSuggestedTasks.length > 0) {
      const fileName = getDocumentFileName(document, "tài liệu");
      return explicitSuggestedTasks
        .map((task, index) => normalizeSuggestedTaskDraft(task, fileName, index))
        .filter((task) => task?.title)
        .slice(0, 6);
    }

    if (document?.isActionable === false) {
      return [];
    }

    const fileName = getDocumentFileName(document, "tài liệu");
    const documentTasks = Array.isArray(document?.tasks) ? document.tasks : [];
    const dataInsights =
      document?.dataInsights && typeof document.dataInsights === "object"
        ? document.dataInsights
        : null;

    if (documentTasks.length > 0) {
      const taskDrafts = documentTasks.slice(0, 4).map((task, index) => {
        const normalizedTask = normalizeSuggestedTaskDraft(
          {
            title: task.title || `Xử lý ${fileName}`,
            description:
              task.description ||
              `Hoàn thành phần việc được trích xuất từ ${fileName}.`,
            category: task.category || "Work",
            type: task.type || "Task",
            priority: task.priority || (index === 0 ? "Cao" : "Trung bình"),
            startDate: task.startDate || task.deadline || addDaysToDate(index),
            deadline: task.deadline || task.startDate || addDaysToDate(index),
            startTime: task.startTime || (index === 0 ? "09:00" : "14:00"),
            endTime: task.endTime || (index === 0 ? "10:00" : "15:00"),
            estimate: task.estimate || "45 phút",
            reminder: task.reminder || "Trước 1 ngày",
            suggestedSteps:
              task.suggestedSteps?.length > 0
                ? task.suggestedSteps
                : buildChecklistForTask(task),
          },
          fileName,
          index
        );

        return {
          ...normalizedTask,
          suggestedSteps:
            normalizedTask.suggestedSteps?.length > 0
              ? normalizedTask.suggestedSteps
              : buildChecklistForTask(normalizedTask),
        };
      });

      const officeActionDrafts = createOfficeAdminTaskDrafts(documentText, fileName);
      const existingTitles = new Set(taskDrafts.map((task) => normalizeIntentText(task.title)));

      return [
        ...taskDrafts,
        ...officeActionDrafts.filter(
          (task) => !existingTitles.has(normalizeIntentText(task.title))
        ),
      ].slice(0, 6);
    }

    const officeActionDrafts = createOfficeAdminTaskDrafts(documentText, fileName);

    if (officeActionDrafts.length > 0) {
      return officeActionDrafts;
    }

    if (!dataInsights) {
      return [];
    }

    const groupInsight = Array.isArray(dataInsights.groupInsights)
      ? dataInsights.groupInsights.find(
          (insight) =>
            Array.isArray(insight.topGroups) && insight.topGroups.length > 0
        )
      : null;
    const prediction = Array.isArray(dataInsights.predictions)
      ? dataInsights.predictions[0]
      : null;
    const outlier = Array.isArray(dataInsights.outliers)
      ? dataInsights.outliers[0]
      : null;

    return [
      outlier
        ? {
            title: `Kiểm tra dữ liệu bất thường trong ${fileName}`,
            description: `Rà soát cột "${outlier.column}" vì có ${outlier.count} giá trị bất thường.`,
            category: "Work",
            type: "Task",
            priority: "Cao",
            startDate: addDaysToDate(0),
            deadline: addDaysToDate(0),
            startTime: "09:00",
            endTime: "10:00",
            estimate: "60 phút",
            reminder: "Trước 1 ngày",
            suggestedSteps: [
              "Mở lại file dữ liệu gốc.",
              `Lọc và kiểm tra cột ${outlier.column}.`,
              "Đánh dấu các dòng sai, thiếu hoặc bất thường.",
              "Ghi kết luận trước khi dùng dữ liệu để ra quyết định.",
            ],
          }
        : null,
      groupInsight
        ? {
            title: `So sánh nhóm dữ liệu trong ${fileName}`,
            description: `Phân tích nhóm cao/thấp theo "${groupInsight.metric}" để tìm điểm đáng chú ý.`,
            category: "Work",
            type: "Task",
            priority: "Trung bình",
            startDate: addDaysToDate(1),
            deadline: addDaysToDate(1),
            startTime: "14:00",
            endTime: "15:00",
            estimate: "45 phút",
            reminder: "Trước 1 ngày",
            suggestedSteps: [
              `Xem nhóm cao nhất theo ${groupInsight.metric}.`,
              "So sánh với nhóm thấp nhất.",
              "Tìm nguyên nhân chênh lệch.",
              "Đề xuất hành động cải thiện hoặc theo dõi.",
            ],
          }
        : null,
      prediction
        ? {
            title: `Theo dõi dự báo ${prediction.metric}`,
            description:
              prediction.recommendedAction ||
              `Dự báo kỳ tiếp theo khoảng ${formatNumberInsight(prediction.nextPeriodForecast)}. Cần theo dõi lại khi có dữ liệu mới.`,
            category: "Work",
            type: "Task",
            priority:
              prediction.riskLevel === "HIGH"
                ? "Cao"
                : prediction.confidence === "LOW"
                ? "Thấp"
                : "Trung bình",
            startDate: addDaysToDate(2),
            deadline: addDaysToDate(2),
            startTime: "09:00",
            endTime: "09:30",
            estimate: "30 phút",
            reminder: "Trước 1 ngày",
            suggestedSteps: [
              `Kiểm tra lại chỉ số ${prediction.metric}.`,
              "So sánh dự báo với số thực tế mới nhất.",
              "Cập nhật nhận xét xu hướng.",
              "Quyết định có cần điều chỉnh kế hoạch không.",
            ],
          }
        : null,
    ].filter(Boolean);
  };

  const formatDataInsightsForChat = (dataInsights) => {
    if (!dataInsights || typeof dataInsights !== "object") {
      return [];
    }

    const lines = [];
    const summary = Array.isArray(dataInsights.summary)
      ? dataInsights.summary
      : [];
    const columnRoles = Array.isArray(dataInsights.columnRoles)
      ? dataInsights.columnRoles
      : [];
    const keyFindings = Array.isArray(dataInsights.keyFindings)
      ? dataInsights.keyFindings
      : [];
    const numericColumns = Array.isArray(dataInsights.numericColumns)
      ? dataInsights.numericColumns
      : [];
    const groupInsights = Array.isArray(dataInsights.groupInsights)
      ? dataInsights.groupInsights
      : [];
    const chartSuggestions = Array.isArray(dataInsights.chartSuggestions)
      ? dataInsights.chartSuggestions
      : [];
    const qualityChecks = Array.isArray(dataInsights.qualityChecks)
      ? dataInsights.qualityChecks
      : [];
    const outliers = Array.isArray(dataInsights.outliers)
      ? dataInsights.outliers
      : [];
    const correlations = Array.isArray(dataInsights.correlations)
      ? dataInsights.correlations
      : [];
    const timeSeries = Array.isArray(dataInsights.timeSeries)
      ? dataInsights.timeSeries
      : [];
    const predictions = Array.isArray(dataInsights.predictions)
      ? dataInsights.predictions
      : [];
    const recommendedActions = Array.isArray(dataInsights.recommendedActions)
      ? dataInsights.recommendedActions
      : [];
    const analysisRouter =
      dataInsights.analysisRouter && typeof dataInsights.analysisRouter === "object"
        ? dataInsights.analysisRouter
        : null;
    const excludedIdentifierColumns = Array.isArray(dataInsights.excludedIdentifierColumns)
      ? dataInsights.excludedIdentifierColumns
      : Array.isArray(analysisRouter?.excludedIdentifierColumns)
      ? analysisRouter.excludedIdentifierColumns
      : [];

    if (analysisRouter?.reason) {
      lines.push("Luồng xử lý TamCam chọn:");
      lines.push(`- ${analysisRouter.reason}`);
    }

    if (summary.length > 0) {
      if (lines.length > 0) {
        lines.push("");
      }
      lines.push("Phân tích số liệu:");
      summary.slice(0, 4).forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
    }

    if (excludedIdentifierColumns.length > 0) {
      lines.push("");
      lines.push("Cột định danh đã loại khỏi phân tích số liệu:");
      lines.push(
        excludedIdentifierColumns
          .slice(0, 8)
          .map((column) => column.name)
          .filter(Boolean)
          .join(", ")
      );
    }

    if (columnRoles.length > 0) {
      const metrics = columnRoles.filter((column) => column.role === "metric").map((column) => column.name);
      const dimensions = columnRoles.filter((column) => column.role === "dimension").map((column) => column.name);
      const dates = columnRoles.filter((column) => column.role === "date").map((column) => column.name);

      lines.push("");
      lines.push("Tôi hiểu cấu trúc dữ liệu như sau:");
      if (dimensions.length > 0) {
        lines.push(`1. Nhóm/phân loại: ${dimensions.slice(0, 5).join(", ")}`);
      }
      if (metrics.length > 0) {
        lines.push(`2. Chỉ số đo lường: ${metrics.slice(0, 5).join(", ")}`);
      }
      if (dates.length > 0) {
        lines.push(`3. Mốc thời gian: ${dates.slice(0, 3).join(", ")}`);
      }
    }

    if (keyFindings.length > 0) {
      lines.push("");
      lines.push("Insight nổi bật:");
      keyFindings.slice(0, 5).forEach((finding, index) => {
        lines.push(`${index + 1}. ${finding}`);
      });
    }

    if (numericColumns.length > 0) {
      lines.push("");
      lines.push("Các cột số đáng chú ý:");
      numericColumns.slice(0, 5).forEach((column, index) => {
        lines.push(
          `${index + 1}. ${column.name}: tổng ${formatNumberInsight(column.sum)}, trung bình ${formatNumberInsight(column.average)}, thấp nhất ${formatNumberInsight(column.min)}, cao nhất ${formatNumberInsight(column.max)}`
        );
      });
    }

    if (qualityChecks.length > 0) {
      const totalMissing = qualityChecks.reduce(
        (total, item) => total + Number(item.missingCellCount || 0),
        0
      );
      const totalDuplicates = qualityChecks.reduce(
        (total, item) => total + Number(item.duplicateRows || 0),
        0
      );

      lines.push("");
      lines.push("EDA - chất lượng dữ liệu:");
      lines.push(`1. Ô thiếu dữ liệu: ${totalMissing}`);
      lines.push(`2. Dòng trùng lặp: ${totalDuplicates}`);
    }

    if (outliers.length > 0) {
      lines.push("");
      lines.push("Giá trị bất thường cần kiểm tra:");
      outliers.slice(0, 3).forEach((item, index) => {
        lines.push(`${index + 1}. ${item.column}: ${item.count} giá trị bất thường`);
      });
    }

    if (correlations.length > 0) {
      lines.push("");
      lines.push("Tương quan đáng chú ý:");
      correlations.slice(0, 3).forEach((item, index) => {
        lines.push(
          `${index + 1}. ${item.firstColumn} và ${item.secondColumn}: ${Number(item.correlation || 0).toFixed(2)}`
        );
      });
    }

    if (timeSeries.length > 0) {
      lines.push("");
      lines.push("Xu hướng theo thời gian:");
      timeSeries.slice(0, 2).forEach((item, index) => {
        const trendText =
          item.trend === "up"
            ? "tăng"
            : item.trend === "down"
            ? "giảm"
            : "ổn định";
        lines.push(
          `${index + 1}. ${item.metric}: xu hướng ${trendText}, thay đổi ${formatNumberInsight(item.change)}`
        );
      });
    }

    if (predictions.length > 0) {
      lines.push("");
      lines.push("Dự báo tầng 4:");
      predictions.slice(0, 3).forEach((item, index) => {
        const rangeText =
          item.lowerBound !== undefined && item.upperBound !== undefined
            ? `, khoảng ${formatNumberInsight(item.lowerBound)} - ${formatNumberInsight(item.upperBound)}`
            : "";
        const riskText = item.riskLevel ? `, rủi ro ${item.riskLevel}` : "";
        lines.push(
          `${index + 1}. ${item.metric}: kỳ tiếp theo khoảng ${formatNumberInsight(item.nextPeriodForecast)}${rangeText} (${item.confidence === "HIGH" ? "tin cậy cao" : item.confidence === "MEDIUM" ? "tin cậy trung bình" : "tin cậy thấp"}${riskText})`
        );

        if (item.recommendedAction) {
          lines.push(`   → Nên làm: ${item.recommendedAction}`);
        }
      });
    }

    if (groupInsights.length > 0) {
      const firstGroup = groupInsights[0];
      const topGroups = Array.isArray(firstGroup.topGroups)
        ? firstGroup.topGroups
        : [];

      if (topGroups.length > 0) {
        lines.push("");
        lines.push(`Nhóm cao nhất theo ${firstGroup.metric || "chỉ số"}:`);
        topGroups.slice(0, 3).forEach((group, index) => {
          lines.push(
            `${index + 1}. ${group.group}: ${formatNumberInsight(group.total)}`
          );
        });
      }
    }

    if (chartSuggestions.length > 0) {
      lines.push("");
      lines.push("Biểu đồ phù hợp:");
      chartSuggestions.slice(0, 3).forEach((chart, index) => {
        lines.push(`${index + 1}. ${chart}`);
      });
    }

    if (recommendedActions.length > 0) {
      lines.push("");
      lines.push("Hướng xử lý đề xuất:");
      recommendedActions.slice(0, 5).forEach((action, index) => {
        lines.push(`${index + 1}. ${action}`);
      });
    }

    return lines;
  };

  const formatDataAgentForChat = (source) => {
    if (!source || typeof source !== "object") {
      return [];
    }

    const lines = [];
    const summary = typeof source.summary === "string" ? source.summary.trim() : "";
    const dataAnalysis =
      source.dataAnalysis && typeof source.dataAnalysis === "object"
        ? source.dataAnalysis
        : null;
    const insights = Array.isArray(source.insights) ? source.insights : [];
    const recommendedActions = Array.isArray(source.recommendedActions)
      ? source.recommendedActions
      : [];
    const anomalies = Array.isArray(source.anomalies) ? source.anomalies : [];
    const predictions = Array.isArray(source.predictions) ? source.predictions : [];
    const chartSuggestions = Array.isArray(source.chartSuggestions)
      ? source.chartSuggestions
      : [];

    if (
      !summary &&
      !dataAnalysis &&
      insights.length === 0 &&
      recommendedActions.length === 0 &&
      anomalies.length === 0 &&
      predictions.length === 0 &&
      chartSuggestions.length === 0
    ) {
      return [];
    }

    lines.push("Data Analysis Agent:");
    if (summary) {
      lines.push(`- ${summary}`);
    }

    if (dataAnalysis) {
      const verifiedText = dataAnalysis.verified
        ? "đã xác minh bằng kết quả tính toán"
        : "đang dùng kết quả dự phòng";
      const operations = Array.isArray(dataAnalysis.operationsExecuted)
        ? dataAnalysis.operationsExecuted.filter(Boolean).join(" → ")
        : "";
      lines.push(`- Trạng thái: ${verifiedText}.`);
      if (operations) {
        lines.push(`- Phép phân tích: ${operations}.`);
      }
    }

    if (insights.length > 0) {
      lines.push("");
      lines.push("Insight chính:");
      insights.slice(0, 5).forEach((item, index) => {
        lines.push(`${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`);
      });
    }

    if (anomalies.length > 0) {
      lines.push("");
      lines.push("Rủi ro/bất thường:");
      anomalies.slice(0, 3).forEach((item, index) => {
        if (typeof item === "string") {
          lines.push(`${index + 1}. ${item}`);
          return;
        }
        lines.push(
          `${index + 1}. ${item.column || item.type || "Dữ liệu"}: ${item.count || ""} điểm cần kiểm tra`.trim()
        );
      });
    }

    if (predictions.length > 0) {
      lines.push("");
      lines.push("Dự báo/xu hướng:");
      predictions.slice(0, 3).forEach((item, index) => {
        lines.push(`${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`);
      });
    }

    if (chartSuggestions.length > 0) {
      lines.push("");
      lines.push("Biểu đồ nên dùng:");
      chartSuggestions.slice(0, 3).forEach((item, index) => {
        lines.push(`${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`);
      });
    }

    if (recommendedActions.length > 0) {
      lines.push("");
      lines.push("Hành động đề xuất:");
      recommendedActions.slice(0, 5).forEach((item, index) => {
        lines.push(`${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`);
      });
    }

    return lines;
  };

  const createDocumentUnderstandingReply = (document, documentText) => {
    const documentType = document.documentType || document.type || "LOCAL_ANALYSIS";
    const label = getDocumentLabel(documentType);
    const fileName = getDocumentFileName(document, "file bạn vừa upload");
    const parts = getStoredSummaryParts(document, documentText);
    const documentTasks = Array.isArray(document.tasks) ? document.tasks : [];
    const mainIdeas = parts.mainIdeas
      .map((idea) => formatShortPoint(idea))
      .filter(Boolean)
      .slice(0, 6);
    const keyDetails = parts.keyDetails
      .map((detail) => formatShortPoint(detail))
      .filter(Boolean)
      .slice(0, 5);
    const dataInsightLines = formatDataInsightsForChat(document.dataInsights);
    const dataAgentLines = formatDataAgentForChat(document);
    const officeAdminSignals = extractOfficeAdminSignals(documentText);
    const officeAdminLines = formatOfficeAdminSection(officeAdminSignals);

    const taskLines =
      documentTasks.length > 0
        ? [
            "",
            "Những việc có thể đưa vào Task/Calendar:",
            ...documentTasks.slice(0, 5).map(
              (task, index) =>
                `${index + 1}. ${task.title || "Việc cần làm"} - ${formatTaskSchedule(task)} - ${task.priority || "Trung bình"}`
            ),
          ]
        : [
            "",
            "Tôi chưa thấy deadline/task rõ ràng trong file, nên trước mắt nên dùng file này để đọc hiểu, phân tích, tóm tắt hoặc biến thành kế hoạch làm việc nếu bạn muốn.",
          ];

    return [
      `Dựa vào nội dung hệ thống ghi nhận, đây là ${label} "${fileName}".`,
      "",
      `Tài liệu/dữ liệu này nói về: ${formatShortPoint(parts.overview, 420)}`,
      "",
      "Nó gồm các phần chính như:",
      ...(mainIdeas.length > 0
        ? mainIdeas.map((idea, index) => `${index + 1}. ${idea}`)
        : ["1. Tôi chưa trích được đủ ý chính rõ ràng từ file này."]),
      "",
      "Dữ liệu/chi tiết đáng chú ý:",
      ...(keyDetails.length > 0
        ? keyDetails.map((detail, index) => `${index + 1}. ${detail}`)
        : ["1. Chưa thấy mốc thời gian, số liệu hoặc yêu cầu hành động rõ ràng."]),
      ...(dataInsightLines.length > 0 ? ["", ...dataInsightLines] : []),
      ...(dataAgentLines.length > 0 ? ["", ...dataAgentLines] : []),
      ...(officeAdminLines.length > 0 ? officeAdminLines : []),
      ...taskLines,
      "",
      "Bây giờ bạn muốn tôi giúp gì với file này? Tôi có thể:",
      "- Giải thích sâu một phần cụ thể trong tài liệu.",
      "- Tóm tắt lại thành ý chính, slide hoặc báo cáo ngắn.",
      "- Chuyển các mục trong file thành task/checklist để bạn theo dõi.",
      "- Đề xuất workflow xử lý file: đọc gì trước, làm gì sau, khi nào nên làm.",
    ].join("\n");
  };

  const createDocumentReplyPayload = (document, content) => ({
    content,
    suggestedTasks: createDocumentSuggestedTasks(document),
  });

  const extractDocumentDeadlines = (documentText) => {
    return splitDocumentParagraphs(documentText)
      .filter((paragraph) => {
        const normalizedParagraph = normalizeMessage(paragraph);

        return (
          normalizedParagraph.includes("deadline") ||
          normalizedParagraph.includes("han") ||
          normalizedParagraph.includes("ngay") ||
          /\d{1,2}[/-]\d{1,2}/.test(normalizedParagraph)
        );
      })
      .slice(0, 5);
  };

  const summarizeRowsByPerson = (documentText) => {
    const rows = String(documentText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s+/.test(line));

    if (rows.length === 0) {
      return "";
    }

    return [
      "Tôi đã tổng hợp dữ liệu theo từng dòng/người trong file:",
      ...rows.slice(0, 12).map((row) => row.replace(/^\d+\.\s+/, "- ")),
      rows.length > 12
        ? `File còn ${rows.length - 12} dòng khác. Bạn có thể hỏi cụ thể tên nhân viên hoặc cột cần tổng hợp.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const extractOfficeAdminSignals = (documentText) => {
    const paragraphs = splitDocumentParagraphs(documentText);
    const adminTerms = [
      "to chuc hanh chinh",
      "hanh chinh",
      "hcns",
      "nhan su",
      "cham cong",
      "hop dong lao dong",
      "tuyen dung",
      "nghi phep",
      "tang ca",
      "bao ho lao dong",
      "cong van",
      "bien ban hop",
      "muoi dam vua",
      "kho muoi",
      "xuong muoi",
    ];
    const normalizedDocument = normalizeIntentText(documentText);
    const isOfficeAdmin = adminTerms.some((term) => normalizedDocument.includes(term));
    const pickLines = (patterns, limit = 5) =>
      paragraphs
        .filter((paragraph) => {
          const normalizedParagraph = normalizeIntentText(paragraph);
          return patterns.some((pattern) => pattern.test(normalizedParagraph));
        })
        .map((paragraph) => formatShortPoint(paragraph, 280))
        .filter(Boolean)
        .slice(0, limit);

    const actionItems = pickLines(
      [
        /viec can lam/,
        /action item/,
        /de xuat/,
        /can xu ly/,
        /yeu cau .*truoc/,
        /phai .*truoc/,
        /lap danh sach/,
        /gui .*bao cao/,
        /tao lich/,
      ],
      6
    );
    const risks = pickLines(
      [/rui ro/, /bat thuong/, /giam tu/, /tang tu/, /thieu nguoi/, /thieu nhan su/, /sap het han/, /vao muon/],
      5
    );
    const deadlines = pickLines(
      [/deadline/, /\bhan\b/, /truoc \d{1,2}/, /\d{1,2}:\d{2}/, /\d{1,2}[/-]\d{1,2}/],
      6
    );
    const dataPoints = pickLines(
      [/\d+%/, /\d+ nguoi/, /\d+ lao dong/, /\d+ hop dong/, /\d+ vi tri/, /\d+ gio/, /\d+ vnd/, /tong /],
      6
    );

    return {
      isOfficeAdmin,
      actionItems,
      risks,
      deadlines,
      dataPoints,
    };
  };

  const formatOfficeAdminSection = (signals) => {
    if (!signals?.isOfficeAdmin) {
      return [];
    }

    const lines = [
      "",
      "Góc nhìn trưởng phòng Tổ chức Hành chính:",
    ];

    if (signals.dataPoints.length > 0) {
      lines.push("Dữ liệu đáng chú ý:");
      signals.dataPoints.slice(0, 4).forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
    }

    if (signals.risks.length > 0) {
      lines.push("");
      lines.push("Rủi ro/cảnh báo cần theo dõi:");
      signals.risks.slice(0, 4).forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
    }

    if (signals.deadlines.length > 0) {
      lines.push("");
      lines.push("Mốc thời gian/deadline:");
      signals.deadlines.slice(0, 4).forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
    }

    if (signals.actionItems.length > 0) {
      lines.push("");
      lines.push("Việc nên xử lý ngay:");
      signals.actionItems.slice(0, 5).forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
    }

    lines.push("");
    lines.push("Gợi ý vận hành: ưu tiên việc có hạn gần, việc ảnh hưởng nhân sự/sản xuất, rồi mới đến việc tổng hợp báo cáo.");

    return lines;
  };

  const parseFirstDateFromText = (text) => {
    const match = String(text || "").match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);

    if (!match) {
      return "";
    }

    const day = String(match[1]).padStart(2, "0");
    const month = String(match[2]).padStart(2, "0");
    const rawYear = match[3] || String(new Date().getFullYear());
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

    return `${year}-${month}-${day}`;
  };

  const parseFirstTimeFromText = (text) => {
    const match = String(text || "").match(/(\d{1,2}):(\d{2})/);

    if (!match) {
      return "";
    }

    return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  };

  const buildOfficeAdminChecklist = (text) => {
    const normalizedText = normalizeIntentText(text);

    if (normalizedText.includes("hop dong")) {
      return [
        "Lọc danh sách hợp đồng liên quan.",
        "Kiểm tra ngày hết hạn và hồ sơ kèm theo.",
        "Lấy ý kiến tổ trưởng/phòng ban liên quan.",
        "Chuẩn bị thông báo hoặc phụ lục hợp đồng.",
      ];
    }

    if (normalizedText.includes("tuyen") || normalizedText.includes("phong van")) {
      return [
        "Chốt vị trí và số lượng cần tuyển.",
        "Đăng tin hoặc lọc hồ sơ ứng viên.",
        "Xếp lịch phỏng vấn với bộ phận liên quan.",
        "Tổng hợp kết quả để báo cáo lãnh đạo.",
      ];
    }

    if (normalizedText.includes("cham cong") || normalizedText.includes("tang ca") || normalizedText.includes("thieu nguoi")) {
      return [
        "Kiểm tra bảng chấm công/tăng ca gốc.",
        "Xác định tổ/ca/người liên quan.",
        "Trao đổi với tổ trưởng để tìm nguyên nhân.",
        "Đề xuất điều ca, bổ sung người hoặc lịch họp xử lý.",
      ];
    }

    if (normalizedText.includes("bao gia") || normalizedText.includes("mua sam") || normalizedText.includes("bao ho")) {
      return [
        "Kiểm tra danh mục và số lượng cần mua.",
        "Lấy hoặc so sánh báo giá nhà cung cấp.",
        "Rà soát khoản có giá bất thường.",
        "Chuẩn bị tờ trình phê duyệt.",
      ];
    }

    if (normalizedText.includes("bao") || normalizedText.includes("truc")) {
      return [
        "Lập danh sách người trực hoặc phân ca.",
        "Kiểm tra vật tư, kho và khu vực rủi ro.",
        "Gửi danh sách hoặc báo cáo cho Ban giám đốc.",
        "Theo dõi xác nhận từ các tổ/phòng ban.",
      ];
    }

    return [
      "Đọc lại dòng yêu cầu/action item trong tài liệu.",
      "Xác định người hoặc bộ phận liên quan.",
      "Chốt deadline và mốc nhắc việc.",
      "Cập nhật kết quả sau khi xử lý.",
    ];
  };

  const createOfficeAdminTaskDrafts = (documentText, fileName = "tài liệu") => {
    const signals = extractOfficeAdminSignals(documentText);

    if (!signals.isOfficeAdmin) {
      return [];
    }

    const sourceLines =
      signals.actionItems.length > 0
        ? signals.actionItems
        : [...signals.deadlines, ...signals.risks].slice(0, 4);

    return sourceLines
      .map((line, index) => {
        const cleanedLine = formatShortPoint(line, 180);
        const title = cleanedLine
          .replace(/^(viec can lam|action item|de xuat|yeu cau|can xu ly)\s*[:.-]\s*/i, "")
          .replace(/\.$/, "")
          .trim();
        const deadline = parseFirstDateFromText(cleanedLine) || addDaysToDate(index);
        const startTime = parseFirstTimeFromText(cleanedLine) || (index === 0 ? "09:00" : "14:00");
        const priority =
          /truoc|rui ro|bat thuong|thieu|giam|tang ca|bao cao ban giam doc/i.test(cleanedLine)
            ? "Cao"
            : "Trung bình";

        return {
          title: title || `Xử lý việc hành chính từ ${fileName}`,
          description: `Tự động gợi ý từ tài liệu "${fileName}": ${cleanedLine}`,
          category: "Hành chính nhân sự",
          type: "Task",
          domain: "Office",
          difficulty: "Trung bình",
          necessity: priority,
          priority,
          startDate: deadline,
          deadline,
          startTime,
          endTime: "",
          estimate: "45 phút",
          reminder: "Trước 1 ngày",
          assignee: "Tôi",
          status: "To do",
          suggestedSteps: buildOfficeAdminChecklist(cleanedLine),
        };
      })
      .filter((task) => task.title)
      .slice(0, 5);
  };

  const getDocumentLabel = (documentType) => {
    const labels = {
      STUDY_EXERCISE_DOCUMENT: "tài liệu học tập dạng bài tập/lời giải",
      STUDY_THEORY_DOCUMENT: "tài liệu học tập/lý thuyết",
      PRESENTATION_DOCUMENT: "tài liệu phục vụ thuyết trình",
      SPREADSHEET_DATA: "bảng dữ liệu",
      MEETING_MINUTES_DOCUMENT: "biên bản/nội dung họp",
      WORK_EMAIL_DOCUMENT: "email công việc",
      PROJECT_PLAN_DOCUMENT: "kế hoạch dự án",
      BUSINESS_REPORT_DOCUMENT: "báo cáo công việc/kinh doanh",
      KPI_UPDATE_NOTICE: "thông báo cập nhật KPI",
      TRANSPORT_CONTRACT_DOCUMENT: "hợp đồng vận chuyển",
      REFERENCE_PROCESS_DOCUMENT: "tài liệu tham khảo quy trình/nghiệp vụ",
      POLICY_OR_CONTRACT_DOCUMENT: "hợp đồng/chính sách/quy định",
      HR_DOCUMENT: "tài liệu nhân sự",
      FINANCE_DOCUMENT: "tài liệu tài chính",
      KNOWLEDGE_WITH_TASK: "tài liệu kiến thức có nhiệm vụ",
      MULTI_KNOWLEDGE_WITH_TASKS: "tài liệu tổng hợp kiến thức có nhiều nhiệm vụ",
      KNOWLEDGE_ONLY: "tài liệu kiến thức tham khảo",
      WORK_DOCUMENT: "tài liệu công việc",
      LOCAL_ANALYSIS: "tài liệu văn bản",
    };

    return labels[documentType] || "tài liệu văn bản";
  };

  const asksForDocumentAnalysis = (userMessage) => {
    const text = normalizeIntentText(userMessage);

    return (
      text.includes("phan tich tai lieu") ||
      text.includes("phan tich file") ||
      text.includes("phan tich van ban") ||
      text.includes("phan tich no") ||
      text.includes("phan tich di") ||
      text.includes("phan tich giup") ||
      text.includes("hay phan tich") ||
      text.includes("day la tom tat") ||
      text.includes("nay la tom tat") ||
      text.includes("khong phai phan tich") ||
      text.includes("chua hieu")
    );
  };

  const createDocumentAnalysisReply = (document, documentText) => {
    const documentType = document.documentType || document.type || "LOCAL_ANALYSIS";
    const label = getDocumentLabel(documentType);
    const documentTasks = Array.isArray(document.tasks) ? document.tasks : [];
    const taskLines = documentTasks.slice(0, 5).map(
      (task, index) =>
        `${index + 1}. ${task.title || "Việc cần làm"} - ${formatTaskSchedule(
          task
        )} - ${task.priority || "chưa rõ ưu tiên"}`
    );
    const officeAdminSignals = extractOfficeAdminSignals(documentText);
    const officeAdminLines = formatOfficeAdminSection(officeAdminSignals);
    const workflowsByType = {
      STUDY_EXERCISE_DOCUMENT: [
        "1. Xác định các dạng bài/câu hỏi trong tài liệu.",
        "2. Đánh dấu phần đã hiểu, phần chưa chắc và phần cần hỏi lại.",
        "3. Làm lại các bài chưa chắc trước khi xem đáp án.",
        "4. Tóm tắt công thức, dạng bài và lỗi sai thường gặp.",
        "5. Tạo lịch ôn nếu bạn muốn theo dõi trong Task/Calendar.",
      ],
      STUDY_THEORY_DOCUMENT: [
        "1. Xác định chủ đề/chương và các khái niệm chính.",
        "2. Tóm tắt hiện tượng, công thức, ví dụ minh họa và phần dễ nhầm.",
        "3. Tự đặt câu hỏi kiểm tra sau mỗi mục lý thuyết.",
        "4. Tạo lịch đọc hiểu/ôn tập nếu bạn muốn đưa vào Task/Calendar.",
      ],
      BUSINESS_REPORT_DOCUMENT: [
        "1. Tách mục tiêu báo cáo, số liệu chính và kết luận.",
        "2. Tìm điểm bất thường, rủi ro hoặc cơ hội.",
        "3. Chuyển insight thành hành động cần làm.",
        "4. Xác định người liên quan, hạn xử lý và việc cần theo dõi.",
      ],
      WORK_EMAIL_DOCUMENT: [
        "1. Xác định người gửi, yêu cầu chính và mức độ gấp.",
        "2. Tách việc cần phản hồi, việc cần chuẩn bị và file/dữ liệu liên quan.",
        "3. Tìm hạn phản hồi hoặc hạn xử lý nếu có.",
        "4. Tạo task/reminder nếu email có việc phải làm.",
      ],
      MEETING_MINUTES_DOCUMENT: [
        "1. Tách kết luận cuộc họp và action items.",
        "2. Xác định người phụ trách, deadline và việc cần xác nhận.",
        "3. Tạo task/reminder cho từng action item.",
        "4. Theo dõi tiến độ sau họp.",
      ],
      PROJECT_PLAN_DOCUMENT: [
        "1. Tách mục tiêu, milestone và deliverable.",
        "2. Xác định thứ tự thực hiện và phụ thuộc giữa các việc.",
        "3. Gán deadline/reminder cho mốc quan trọng.",
        "4. Theo dõi rủi ro và phần cần xác nhận.",
      ],
      KNOWLEDGE_WITH_TASK: [
        "1. Đọc phần kiến thức để hiểu bối cảnh.",
        "2. Xác định nhiệm vụ liên quan mà tài liệu yêu cầu.",
        "3. Giữ đúng deadline và giờ bắt đầu nếu tài liệu đã ghi.",
        "4. Chia nhiệm vụ thành checklist nhỏ rồi đưa vào Task/Calendar nếu bạn đồng ý.",
      ],
      MULTI_KNOWLEDGE_WITH_TASKS: [
        "1. Tách từng phần kiến thức và từng nhiệm vụ tương ứng.",
        "2. Tạo mỗi nhiệm vụ thành một task riêng, giữ đúng deadline và giờ bắt đầu.",
        "3. Ưu tiên việc có deadline gần trước.",
        "4. Chia mỗi task thành checklist 3-5 bước để dễ theo dõi.",
      ],
      KNOWLEDGE_ONLY: [
        "1. Đọc để nắm khái niệm và ý chính.",
        "2. Ghi lại phần chưa hiểu để hỏi tiếp.",
        "3. Chỉ tạo task/lịch học nếu bạn muốn ôn lại tài liệu này.",
      ],
    };
    const workflow =
      officeAdminSignals.isOfficeAdmin
        ? [
            "1. Xác định đây là việc nhân sự, chấm công, công văn, hợp đồng hay vận hành hành chính.",
            "2. Rút ngay mốc thời gian, người/bộ phận liên quan và rủi ro ảnh hưởng sản xuất.",
            "3. Tách việc cần làm thành task: ai làm, hạn khi nào, cần hồ sơ/báo cáo gì.",
            "4. Việc có hạn gần hoặc ảnh hưởng kho/xưởng/nhân sự trực ca phải đưa vào Calendar trước.",
            "5. Theo dõi lại sau xử lý: đã báo Ban giám đốc chưa, đã có phản hồi từ tổ trưởng/phòng ban chưa.",
          ]
        :
      workflowsByType[documentType] || [
        "1. Xác định tài liệu này dùng để làm gì.",
        "2. Rút ra ý chính, dữ kiện quan trọng và phần cần chú ý.",
        "3. Tách các việc cần làm nếu tài liệu có yêu cầu hành động.",
        "4. Tạo task/lịch nhắc cho việc có hạn hoặc cần theo dõi.",
      ];

    return [
      createDocumentUnderstandingReply(document, documentText),
      "",
      "Phân tích sâu hơn:",
      `1. Loại tài liệu: ${label}.`,
      `2. Mục đích xử lý: ${document.documentPurpose || "đọc hiểu nội dung, rút điểm quan trọng và xác định việc cần làm tiếp."}`,
      "",
      "3. Việc bạn cần quan tâm:",
      documentTasks.length > 0
        ? taskLines.join("\n")
        : "Tôi chưa thấy task/deadline rõ ràng trong tài liệu. Tài liệu này nên được xử lý theo hướng đọc hiểu, tóm tắt ý chính rồi hỏi sâu phần bạn cần.",
      ...(officeAdminLines.length > 0 ? ["", ...officeAdminLines] : []),
      "",
      "4. Workflow đề xuất:",
      ...workflow,
      "",
      documentTasks.length > 0
        ? "Ngày/giờ ở trên là lịch gợi ý nếu tài liệu chưa ghi rõ deadline. Bạn muốn giữ lịch này, chỉnh thời gian, hay chỉ phân tích nội dung trước?"
        : "Bạn có thể hỏi tiếp: 'giải thích phần này', 'rút ý chính thành slide', 'tạo task từ tài liệu này', hoặc 'lập lịch xử lý tài liệu này'.",
    ].join("\n");
  };

  const createDocumentWorkflowReply = (analysisData) => {
    const analyzedTasks = Array.isArray(analysisData.tasks)
      ? analysisData.tasks
      : [];
    const isActionable = analysisData.isActionable !== false;
    const documentType = analysisData.documentType || "";
    const isExerciseDocument = documentType === "STUDY_EXERCISE_DOCUMENT";
    const isStudyTheoryDocument = documentType === "STUDY_THEORY_DOCUMENT";
    const isPresentationDocument = documentType === "PRESENTATION_DOCUMENT";
    const officeDocumentLabels = {
      SPREADSHEET_DATA: "bảng dữ liệu",
      MEETING_MINUTES_DOCUMENT: "biên bản/nội dung họp",
      WORK_EMAIL_DOCUMENT: "email công việc",
      PROJECT_PLAN_DOCUMENT: "kế hoạch dự án",
      BUSINESS_REPORT_DOCUMENT: "báo cáo công việc/kinh doanh",
      KPI_UPDATE_NOTICE: "thông báo cập nhật KPI",
      TRANSPORT_CONTRACT_DOCUMENT: "hợp đồng vận chuyển",
      REFERENCE_PROCESS_DOCUMENT: "tài liệu tham khảo quy trình/nghiệp vụ",
      POLICY_OR_CONTRACT_DOCUMENT: "hợp đồng/chính sách/quy định",
      HR_DOCUMENT: "tài liệu nhân sự",
      FINANCE_DOCUMENT: "tài liệu tài chính",
      KNOWLEDGE_WITH_TASK: "tài liệu kiến thức có nhiệm vụ",
      MULTI_KNOWLEDGE_WITH_TASKS: "tài liệu tổng hợp kiến thức có nhiều nhiệm vụ",
      KNOWLEDGE_ONLY: "tài liệu kiến thức tham khảo",
      WORK_DOCUMENT: "tài liệu công việc",
    };
    const officeDocumentLabel = officeDocumentLabels[documentType];
    const preview =
      analysisData.textPreview ||
      analysisData.documentText?.slice(0, 500) ||
      "";
    const fullDocumentText =
      analysisData.documentText ||
      analysisData.text ||
      analysisData.extractedText ||
      preview;
    const dataInsightLines = formatDataInsightsForChat(analysisData.dataInsights);
    const dataAgentLines = formatDataAgentForChat(analysisData);
    const officeAdminSignals = extractOfficeAdminSignals(fullDocumentText);
    const officeAdminLines = formatOfficeAdminSection(officeAdminSignals);
    const taskLines = analyzedTasks.slice(0, 5).map(
      (task, index) =>
        `${index + 1}. ${task.title || "Nhiệm vụ"} - ${formatTaskSchedule(
          task
        )} - ${task.priority || "chưa rõ ưu tiên"}`
    );
    const workflowLines = isExerciseDocument
      ? [
          "1. Xem nhanh tài liệu và đánh dấu bài đã hiểu/chưa hiểu.",
          "2. Làm lại các bài chưa chắc, không nhìn đáp án trước.",
          "3. Tóm tắt công thức, dạng bài và lỗi sai thường gặp.",
          "4. Tạo lịch ôn theo từng buổi nếu bạn muốn đưa vào Task.",
          "5. Sau khi học xong, hỏi tôi phần nào chưa hiểu để tôi giải thích tiếp.",
        ]
      : isStudyTheoryDocument
      ? [
          "1. Đọc lướt toàn chương để nắm chủ đề và các mục lớn.",
          "2. Tóm tắt từng khái niệm/hiện tượng bằng 3-5 ý ngắn.",
          "3. Ghi riêng công thức, điều kiện áp dụng và ví dụ minh họa.",
          "4. Tự đặt câu hỏi kiểm tra: khái niệm là gì, vì sao xảy ra, dùng ở đâu.",
          "5. Tạo lịch ôn hoặc hỏi tôi giải thích sâu từng phần bạn chưa hiểu.",
        ]
      : officeAdminSignals.isOfficeAdmin
      ? [
          "1. Xác định nhóm việc: nhân sự, chấm công, hợp đồng, công văn, mua sắm hay đào tạo.",
          "2. Rút ra số liệu/rủi ro chính: thiếu người, tăng ca, nghỉ phép, hợp đồng sắp hết hạn, chi phí bất thường.",
          "3. Tách việc cần làm thành action item có deadline, người phụ trách và hồ sơ cần chuẩn bị.",
          "4. Việc ảnh hưởng vận hành xưởng/kho hoặc có hạn trong 48 giờ phải đưa vào Calendar trước.",
          "5. Sau khi xử lý, theo dõi trạng thái: đã gửi báo cáo, đã nhận phản hồi, đã hoàn tất hồ sơ hay chưa.",
        ]
      : officeDocumentLabel
      ? [
          "1. Xác định tài liệu này nói về việc gì và ai là người liên quan.",
          "2. Rút ra action items, deadline, người phụ trách hoặc điểm cần xác nhận.",
          "3. Chọn việc cần làm trước, đặc biệt là việc có hạn gần hoặc ảnh hưởng cao.",
          "4. Nếu bạn đồng ý, tôi có thể đưa các việc này vào Task List/Calendar.",
          "5. Sau đó bạn có thể hỏi tôi tóm tắt, giải thích, tổng hợp theo người/phòng ban hoặc đề xuất hướng xử lý.",
        ]
      : analyzedTasks.length > 0
        ? [
            "1. Kiểm tra lại các nhiệm vụ AI trích xuất.",
            "2. Chọn task có deadline gần hoặc ưu tiên cao để làm trước.",
            "3. Chia mỗi task thành checklist nhỏ.",
            "4. Thêm reminder cho các mốc quan trọng.",
            "5. Theo dõi lại trong Dashboard/Calendar.",
          ]
        : [
            "1. Đọc phần tóm tắt để xác định mục tiêu tài liệu.",
            "2. Gạch ra các người việc mốc thời gian hoặc số liệu quan trọng.",
            "3. Hỏi TamCam AI câu cụ thể như 'tổng hợp theo từng người' hoặc 'đề xuất việc cần làm'.",
            "4. Tạo task/reminder cho các hành động quan trọng.",
          ];

    return [
      `Tôi đã đọc file "${analysisData.file?.name || "tài liệu"}".`,
      `Nguồn phân tích: ${analysisData.analysisSource || "document-analyzer"}.`,
      isExerciseDocument
        ? "Tôi nhận diện đây là tài liệu học tập dạng bài tập/lời giải, không phải tài liệu thuyết trình."
        : isStudyTheoryDocument
        ? "Tôi nhận diện đây là tài liệu học tập/lý thuyết."
        : isPresentationDocument
        ? "Tôi nhận diện đây là tài liệu phục vụ thuyết trình."
        : officeDocumentLabel
        ? `Tôi nhận diện đây là ${officeDocumentLabel}.`
        : `Loại tài liệu: ${documentType || "chưa xác định rõ"}.`,
      "",
      "Tóm tắt chi tiết:",
      formatStoredDocumentSummary(analysisData) ||
        (fullDocumentText
          ? summarizeDocument(fullDocumentText, {
              maxMainIdeas: 6,
            })
          : analysisData.documentPurpose || "Chưa có nội dung văn bản rõ ràng."),
      ...(dataInsightLines.length > 0 ? ["", ...dataInsightLines] : []),
      ...(dataAgentLines.length > 0 ? ["", ...dataAgentLines] : []),
      ...(officeAdminLines.length > 0 ? ["", ...officeAdminLines] : []),
      "",
      analyzedTasks.length > 0
        ? isExerciseDocument
          ? `Tôi đề xuất ${analyzedTasks.length} việc học/ôn tập phù hợp:\n${taskLines.join("\n")}`
          : `Tôi tìm thấy ${analyzedTasks.length} nhiệm vụ gợi ý:\n${taskLines.join("\n")}`
        : isActionable
        ? "Tôi chưa thấy nhiệm vụ rõ ràng, nhưng bạn vẫn có thể hỏi tôi để phân tích sâu hơn."
        : "Tài liệu này thiên về tham khảo/đọc hiểu, nên tôi không tự tạo task để tránh spam lịch. Bạn vẫn có thể hỏi tôi tóm tắt, giải thích hoặc tạo task áp dụng nếu thật sự cần.",
      "",
      ...(isActionable
        ? ["Workflow đề xuất:", ...workflowLines, ""]
        : [
            "Bạn có thể hỏi tiếp:",
            "1. Tài liệu này nói gì?",
            "2. Có bao nhiêu loại/mục/trạng thái trong tài liệu?",
            "3. Phần nào cần lưu ý khi áp dụng vào công việc?",
            "",
          ]),
      !isActionable
        ? "Nếu bạn muốn biến tài liệu tham khảo này thành việc cần làm, hãy nhắn rõ mục tiêu, ví dụ: \"tạo task áp dụng quy trình này mỗi tuần\"."
        : isExerciseDocument
        ? "Ngày/giờ ở trên là lịch học gợi ý. Bạn muốn giữ lịch này để đưa vào Task List/Calendar, chỉnh lại thời gian, hay chỉ tóm tắt/giải thích nội dung trước?"
        : isStudyTheoryDocument
        ? "Ngày/giờ ở trên là lịch đọc hiểu/ôn tập gợi ý. Bạn muốn giữ lịch này, chỉnh lại thời gian, hay hỏi tôi giải thích kỹ từng phần lý thuyết trước?"
        : officeDocumentLabel
        ? "Ngày/giờ ở trên là lịch xử lý gợi ý nếu tài liệu chưa ghi rõ deadline. Bạn muốn giữ lịch này để đưa vào Task List/Calendar, chỉnh lại thời gian, hay muốn tôi tóm tắt và giải thích tài liệu trước?"
        : "Bạn có thể yêu cầu tôi lưu các nhiệm vụ này vào Task List, chỉnh lại ngày giờ/reminder, hoặc chia từng task thành checklist.",
    ].join("\n");
  };

  const shouldAnswerWorkflowQuestion = (userMessage) => {
    const text = normalizeIntentText(userMessage);
    const wantsToCreateChecklist =
      text.includes("tao checklist") ||
      text.includes("them checklist");
    const asksAboutChecklist =
      text.includes("checklist") &&
      !wantsToCreateChecklist &&
      (text.includes("nhu the nao") ||
        text.includes("la gi") ||
        text.includes("mau") ||
        text.includes("chia") ||
        text.includes("moi task") ||
        text.includes("tung task") ||
        text.includes("buoc nho"));

    return (
      asksAboutChecklist ||
      text.includes("chia nhiem vu") ||
      text.includes("chia task") ||
      text.includes("chia moi task") ||
      text.includes("chia tung task") ||
      text.includes("chia viec") ||
      text.includes("chia nho") ||
      text.includes("phan chia") ||
      text.includes("workflow") ||
      text.includes("quy trinh") ||
      text.includes("huong giai quyet") ||
      text.includes("giai quyet") ||
      text.includes("lam nhu the nao") ||
      text.includes("lam sao") ||
      text.includes("nen lam gi") ||
      text.includes("nen chuan bi gi") ||
      text.includes("can chuan bi gi") ||
      text.includes("chuan bi gi") ||
      text.includes("cac buoc") ||
      text.includes("buoc nao") ||
      text.includes("ke hoach")
    );
  };

  const createContextualWorkflowReply = (userMessage) => {
    if (!shouldAnswerWorkflowQuestion(userMessage)) {
      return "";
    }

    const latestDocument = getLatestDocument();
    const documentTasks = Array.isArray(latestDocument?.tasks)
      ? latestDocument.tasks
      : [];
    const activeTasks = tasks.filter(
      (task) => !task.completed && task.status !== "Completed"
    );
    const sourceTasks = (documentTasks.length > 0 ? documentTasks : activeTasks)
      .filter((task) => task?.title)
      .sort((firstTask, secondTask) => {
        const priorityDiff =
          getPriorityScore(secondTask.priority) -
          getPriorityScore(firstTask.priority);

        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return String(firstTask.deadline || firstTask.startDate || "9999-12-31").localeCompare(
          String(secondTask.deadline || secondTask.startDate || "9999-12-31")
        );
      });

    if (sourceTasks.length > 0) {
      const normalizedQuestion = normalizeIntentText(userMessage);
      const isChecklistQuestion = normalizedQuestion.includes("checklist");
      const asksPreparation =
        normalizedQuestion.includes("chuan bi gi") ||
        normalizedQuestion.includes("can chuan bi") ||
        normalizedQuestion.includes("nen chuan bi");
      const taskBlocks = sourceTasks.slice(0, 4).map((task, index) => {
        const dueDate = task.deadline || task.startDate || "";
        const dueText = dueDate ? formatDate(dueDate) : "chưa có ngày cụ thể";
        const timeText = task.startTime || "chọn giờ rảnh phù hợp";
        const steps =
          task.suggestedSteps?.length > 0
            ? task.suggestedSteps
            : buildChecklistForTask(task);

        return [
          `${index + 1}. ${task.title}`,
          `   - Mục tiêu: hoàn thành phần "${task.title}" theo yêu cầu trong tài liệu/công việc.`,
          `   - Thời gian gợi ý: ${dueText}, lúc ${timeText}.`,
          `   - Ưu tiên: ${task.priority || "Trung bình"}.`,
          ...steps.slice(0, 4).map((step, stepIndex) => `   - Bước ${stepIndex + 1}: ${step}`),
        ].join("\n");
      });

      if (asksPreparation) {
        return [
          latestDocument
            ? `Dựa trên tài liệu "${getDocumentFileName(latestDocument, "mới nhất")}", bạn nên chuẩn bị các phần này:`
            : "Dựa trên các task hiện có, bạn nên chuẩn bị các phần này:",
          "",
          ...sourceTasks.slice(0, 4).map((task, index) => {
            const dueDate = task.deadline || task.startDate || "";
            const dueText = dueDate ? formatDate(dueDate) : "chưa có ngày cụ thể";
            const timeText = task.startTime || "chọn một khung giờ rảnh";
            const steps =
              task.suggestedSteps?.length > 0
                ? task.suggestedSteps
                : buildChecklistForTask(task);

            return [
              `${index + 1}. ${task.title}`,
              `   - Cần chuẩn bị: ${steps.slice(0, 3).join("; ")}.`,
              `   - Lịch gợi ý: ${dueText}, lúc ${timeText}.`,
              `   - Mức ưu tiên: ${task.priority || "Trung bình"}.`,
            ].join("\n");
          }),
          "",
          "Nếu bạn muốn, tôi có thể đưa các phần này thành task/checklist và giữ lịch gợi ý, hoặc bạn nhắn giờ mới để tôi chỉnh.",
        ].join("\n");
      }

      return [
        isChecklistQuestion
          ? "Checklist nghĩa là chia một task lớn thành các bước nhỏ có thể tick hoàn thành từng bước."
          : "Mình hiểu ý bạn: bạn muốn chia nhiệm vụ thành các phần nhỏ để biết cần làm gì, làm khi nào và theo thứ tự nào.",
        "",
        latestDocument
          ? `Dựa trên tài liệu "${getDocumentFileName(latestDocument, "mới nhất")}", checklist nên chia như sau:`
          : "Dựa trên các task hiện có, checklist nên chia như sau:",
        ...taskBlocks,
        "",
        isChecklistQuestion ? "Cách dùng checklist:" : "Workflow nên làm:",
        "1. Xác định đầu ra cuối cùng: bài nộp, báo cáo, ghi chú, danh sách hay lịch nhắc.",
        "2. Làm việc có deadline gần hoặc ưu tiên cao trước.",
        "3. Mỗi việc chia thành checklist 3-5 bước nhỏ, mỗi bước chỉ nên làm trong 25-60 phút.",
        "4. Gắn ngày, giờ bắt đầu và reminder cho từng việc quan trọng.",
        "5. Sau khi xong một bước, quay lại Tasks để đánh dấu hoàn thành và xem còn gì tiếp theo.",
      ].join("\n");
    }

    const documentText = getDocumentText(latestDocument);

    if (documentText) {
      const officeAdminSignals = extractOfficeAdminSignals(documentText);
      const officeAdminLines = formatOfficeAdminSection(officeAdminSignals);

      if (officeAdminSignals.isOfficeAdmin) {
        return [
          `Dựa trên tài liệu "${getDocumentFileName(latestDocument, "mới nhất")}", mình sẽ xử lý theo vai trưởng phòng Tổ chức Hành chính:`,
          ...officeAdminLines,
          "",
          "Workflow nên làm:",
          "1. Chốt việc khẩn: deadline gần, rủi ro nhân sự, tăng ca, thiếu người, hợp đồng sắp hết hạn.",
          "2. Tạo task riêng cho từng đầu việc: nội dung, người/bộ phận liên quan, hạn xử lý.",
          "3. Đưa các mốc có giờ/ngày cụ thể vào Calendar.",
          "4. Chuẩn bị hồ sơ/báo cáo cần gửi Ban giám đốc hoặc tổ trưởng.",
          "5. Sau khi hoàn tất, cập nhật trạng thái và hỏi tôi tổng hợp lại tiến độ nếu cần.",
        ].join("\n");
      }

      return [
        `Mình hiểu bạn muốn biến tài liệu "${getDocumentFileName(latestDocument, "mới nhất")}" thành kế hoạch làm việc.`,
        "",
        "Tóm tắt điểm cần xử lý:",
        formatStoredDocumentSummary(latestDocument) ||
          summarizeDocument(documentText),
        "",
        "Cách chia nhiệm vụ hợp lý:",
        "1. Đọc nhanh tài liệu và gạch ý chính.",
        "2. Gom các ý giống nhau thành 3-5 nhóm việc.",
        "3. Với mỗi nhóm, tạo một task có mục tiêu rõ ràng.",
        "4. Nếu tài liệu có ngày/giờ, dùng ngày đó làm deadline; nếu không có, chọn lịch rảnh gần nhất.",
        "5. Tạo checklist nhỏ cho từng task: đọc, tóm tắt, làm bài/soạn nội dung, kiểm tra lại.",
      ].join("\n");
    }

    return [
      "Mình hiểu bạn muốn chia nhỏ công việc, nhưng hiện chưa có tài liệu hoặc task đủ rõ để bám vào.",
      "Bạn có thể upload file, hoặc nhắn theo mẫu: \"chia giúp tôi việc làm báo cáo ngày 30/7\". Mình sẽ tách thành task, deadline, giờ làm và checklist cho bạn.",
    ].join("\n");
  };

  const createPermissionHelpReply = (userMessage) => {
    const text = normalizeIntentText(userMessage);

    if (
      !text.includes("missing or insufficient permissions") &&
      !text.includes("insufficient permissions") &&
      !text.includes("loi quyen") &&
      !text.includes("khong du quyen")
    ) {
      return "";
    }

    return [
      "Đó là lỗi quyền của Firebase/Firestore.",
      "Nghĩa là app đang cố đọc hoặc lưu dữ liệu vào một collection mà Firestore Rules chưa cho phép tài khoản hiện tại thao tác.",
      "",
      "Trong trường hợp vừa rồi, file vẫn có thể phân tích được, nhưng bước lưu tài liệu vào lịch sử Firebase bị từ chối. Tôi đã chỉnh để Chat vẫn trả kết quả phân tích và lưu tạm trên máy nếu Firestore chưa cho quyền.",
    ].join("\n");
  };

  const shouldAnswerDocumentQuestion = (userMessage) => {
    const text = normalizeIntentText(userMessage);

    return (
      text.includes("tai lieu") ||
      text.includes("file") ||
      text.includes("van ban") ||
      text.includes("pdf") ||
      text.includes("docx") ||
      text.includes("excel") ||
      text.includes("xlsx") ||
      text.includes("csv") ||
      text.includes("document") ||
      text.includes("upload") ||
      text.includes("du lieu") ||
      text.includes("data") ||
      text.includes("don hang") ||
      text.includes("loai don") ||
      text.includes("bao nhieu loai") ||
      text.includes("co tong bao nhieu") ||
      text.includes("quy trinh") ||
      text.includes("nghiep vu") ||
      text.includes("tong hop") ||
      text.includes("nhan vien") ||
      text.includes("sinh nhat") ||
      text.includes("ngay sinh") ||
      text.includes("tung nguoi") ||
      text.includes("phan tich") ||
      text.includes("tom tat") ||
      text.includes("noi dung") ||
      text.includes("thong tin") ||
      text.includes("no nhu the nao") ||
      text.includes("nhu the nao") ||
      text.includes("y chinh") ||
      text.includes("tim doan") ||
      text.includes("deadline trong") ||
      text.includes("workflow") ||
      text.includes("chia nhiem vu") ||
      text.includes("chia viec") ||
      text.includes("huong giai quyet")
    );
  };

  const answerDocumentQuestion = (userMessage) => {
    if (!shouldAnswerDocumentQuestion(userMessage) && !isBirthdayTaskRequest(userMessage)) {
      return "";
    }

    const document = getLatestDocument();

    if (!document) {
      return "Tôi chưa thấy tài liệu nào đã lưu. Bạn hãy upload và phân tích tài liệu trước, rồi hỏi tôi về nội dung tài liệu đó.";
    }

    const documentText = getDocumentText(document);

    if (!documentText) {
      return `Tôi có thấy tài liệu "${getDocumentFileName(document, "không tên")}", nhưng chưa có nội dung văn bản để đọc.`;
    }

    const text = normalizeMessage(userMessage);
    if (isBirthdayTaskRequest(userMessage)) {
      const birthdayTasks = createBirthdayReminderTasks(documentText);

      if (birthdayTasks.length === 0) {
        return createDocumentReplyPayload(
          document,
          `Tôi chưa tìm thấy dòng nào có đủ "Họ và tên" và "Ngày sinh" trong "${getDocumentFileName(document, "tài liệu này")}". Nếu đây là file Excel, bạn hãy kiểm tra cột tên và ngày sinh có được đọc vào preview chưa.`
        );
      }

      const previewLines = birthdayTasks
        .slice(0, 8)
        .map(
          (task, index) =>
            `${index + 1}. ${task.title} - ${formatDate(task.startDate)} lúc ${
              task.startTime
            }`
        );

      return {
        content: [
          `Tôi tìm thấy ${birthdayTasks.length} ngày sinh trong "${getDocumentFileName(document, "tài liệu này")}".`,
          "Tôi đã chuẩn bị các task nhắc sinh nhật như sau:",
          ...previewLines,
          birthdayTasks.length > 8
            ? `... và ${birthdayTasks.length - 8} task khác.`
            : "",
          "",
          "Bạn bấm “Tạo tất cả task” để đưa các reminder này vào Task List/Calendar.",
        ]
          .filter(Boolean)
          .join("\n"),
        suggestedTasks: birthdayTasks,
      };
    }

    const asksDeadline =
      text.includes("deadline") ||
      /\bhan\b/.test(text) ||
      text.includes("han nop") ||
      text.includes("han xu ly") ||
      text.includes("moc thoi gian");
    const asksWorkflow =
      text.includes("workflow") ||
      text.includes("chia nhiem vu") ||
      text.includes("chia task") ||
      text.includes("chia viec") ||
      text.includes("checklist") ||
      text.includes("toi can lam gi") ||
      text.includes("can lam gi") ||
      text.includes("nen lam gi") ||
      text.includes("huong giai quyet") ||
      text.includes("lam nhu the nao") ||
      text.includes("ke hoach");
    const asksCountOrTypes =
      text.includes("bao nhieu") ||
      text.includes("co tong") ||
      text.includes("may loai") ||
      text.includes("cac loai") ||
      text.includes("loai don") ||
      text.includes("trang thai");

    if (asksForDocumentAnalysis(userMessage)) {
      return createDocumentReplyPayload(
        document,
        createDocumentAnalysisReply(document, documentText)
      );
    }

    if (asksCountOrTypes) {
      const relevantParagraphs = getRelevantParagraphs(
        document,
        userMessage,
        5
      );

      if (relevantParagraphs.length > 0) {
        return createDocumentReplyPayload(
          document,
          createFocusedDocumentAnswer(document, userMessage, relevantParagraphs, documentText)
        );
      }
    }

    if (asksWorkflow) {
      return createDocumentReplyPayload(
        document,
        createContextualWorkflowReply(userMessage) ||
          createDocumentAnalysisReply(document, documentText)
      );
    }

    if (
      text.includes("tong hop") ||
      text.includes("nhan vien") ||
      text.includes("tung nguoi") ||
      text.includes("excel")
    ) {
      const rowSummary = summarizeRowsByPerson(documentText);

      if (rowSummary) {
        return createDocumentReplyPayload(document, rowSummary);
      }
    }

    if (
      text.includes("tom tat") ||
      text.includes("noi dung") ||
      text.includes("thong tin") ||
      text.includes("du lieu") ||
      text.includes("data") ||
      text.includes("no nhu the nao") ||
      text.includes("nhu the nao") ||
      text.includes("noi gi") ||
      text.includes("noi ve gi") ||
      text.includes("y chinh")
    ) {
      const relevantParagraphs = getRelevantParagraphs(document, userMessage, 5);

      return createDocumentReplyPayload(
        document,
        createFocusedDocumentAnswer(
          document,
          userMessage,
          relevantParagraphs.length > 0
            ? relevantParagraphs
            : splitDocumentParagraphs(documentText).slice(0, 5),
          documentText
        )
      );
    }

    if (asksDeadline) {
      const relevantParagraphs = getRelevantParagraphs(document, userMessage, 5);
      return createDocumentReplyPayload(
        document,
        createFocusedDocumentAnswer(
          document,
          userMessage,
          relevantParagraphs.length > 0 ? relevantParagraphs : extractDocumentDeadlines(documentText),
          documentText
        )
      );
    }

    const relevantParagraphs = getRelevantParagraphs(
      document,
      userMessage
    );

    if (relevantParagraphs.length === 0) {
      return createDocumentReplyPayload(
        document,
        `Tôi chưa tìm thấy đoạn nào thật sự khớp trong "${getDocumentFileName(document, "tài liệu này")}". Bạn có thể hỏi bằng từ khóa cụ thể hơn.`
      );
    }

    return createDocumentReplyPayload(
      document,
      createFocusedDocumentAnswer(document, userMessage, relevantParagraphs, documentText)
    );
  };

  const handleLocalChatAction = async (userMessage) => {
    const text = normalizeMessage(userMessage);
    const localIntent = classifyLocalChatIntent(userMessage);
    const task = findTaskFromMessage(userMessage);

    const permissionHelpReply = createPermissionHelpReply(userMessage);

    if (permissionHelpReply) {
      return permissionHelpReply;
    }

    const pendingScheduleReply = await handlePendingScheduleReply(userMessage);

    if (pendingScheduleReply) {
      return pendingScheduleReply;
    }

    if (localIntent === "CREATE_TASK_OR_REMINDER") {
      return createLocalTaskFromMessage(userMessage);
    }

    const documentReply = answerDocumentQuestion(userMessage);

    if (documentReply) {
      return documentReply;
    }

    if (shouldCreateTaskFromMessage(userMessage)) {
      return createLocalTaskFromMessage(userMessage);
    }

    const shouldAnswerTaskQuestionLocally =
      text.includes("tuan nay") ||
      text.includes("tuan sau") ||
      text.includes("hom nay") ||
      text.includes("can lam gi") ||
      text.includes("nhiem vu gi") ||
      text.includes("viec gi") ||
      text.includes("deadline") ||
      text.includes("uu tien") ||
      text.includes("quan trong") ||
      text.includes("tien do") ||
      text.includes("bao nhieu task") ||
      text.includes("bao nhieu cong viec");

    if (shouldAnswerTaskQuestionLocally) {
      return createAssistantReply(userMessage);
    }

    if (
      text.includes("tao checklist") ||
      text.includes("goi y checklist") ||
      text.includes("cac buoc")
    ) {
      if (!task) {
        return "Tôi chưa tìm thấy task cần tạo checklist. Bạn hãy nhắc lại kèm tên task nhé.";
      }

      const checklist = buildChecklistForTask(task).map((title, index) => ({
        id: `local-step-${index + 1}`,
        title,
        completed: false,
      }));

      await saveTaskUpdates(task, {
        checklist,
      });

      return `Tôi đã tạo checklist cho "${task.title}" và lưu vào task của bạn.`;
    }

    if (
      localIntent === "UPDATE_REMINDER" ||
      text.includes("nhac") ||
      text.includes("reminder")
    ) {
      const reminder = parseReminderFromMessage(userMessage);

      if (!task) {
        return "Tôi chưa tìm thấy task cần đổi nhắc nhở. Bạn hãy nhắc lại kèm tên task nhé.";
      }

      if (!reminder) {
        return "Bạn muốn tôi nhắc trước bao lâu? Ví dụ: trước 10 phút, trước 1 giờ hoặc trước 1 ngày.";
      }

      await saveTaskUpdates(task, {
        reminder,
      });

      return `Tôi đã đổi nhắc nhở của "${task.title}" thành ${reminder}.`;
    }

    if (
      text.includes("doi") ||
      text.includes("doi lich") ||
      text.includes("doi deadline") ||
      text.includes("chuyen") ||
      text.includes("cap nhat") ||
      text.includes("sua")
    ) {
      const date = parseDateFromMessage(userMessage);
      const time = parseTimeFromMessage(userMessage);

      if (!task) {
        return "Tôi chưa tìm thấy task cần cập nhật. Bạn hãy nhắc lại kèm tên task nhé.";
      }

      if (!date && !time) {
        return "Tôi đã tìm thấy task, nhưng chưa thấy ngày hoặc giờ mới để cập nhật.";
      }

      const updatedFields = {};

      if (date) {
        updatedFields.startDate = date;
        updatedFields.deadline = date;
      }

      if (time) {
        updatedFields.startTime = time;
      }

      await saveTaskUpdates(task, updatedFields);

      const dateText = date ? ` ngày ${formatDate(date)}` : "";
      const timeText = time ? ` lúc ${time}` : "";

      return `Tôi đã cập nhật "${task.title}"${dateText}${timeText}.`;
    }

    return "";
  };

  const createServiceUnavailableReply = (userMessage) => {
    const text = normalizeIntentText(userMessage);

    if (
      text.includes("upload") ||
      text.includes("tai len") ||
      text.includes("up file")
    ) {
      return [
        "Phần chat AI đang chưa kết nối ổn định, nhưng bạn vẫn có thể upload ở mục Upload Document.",
        "Sau khi phân tích xong, quay lại đây và hỏi trực tiếp về file đó.",
      ].join("\n");
    }

    if (
      text.includes("tao") ||
      text.includes("nhac") ||
      text.includes("lich") ||
      text.includes("task")
    ) {
      return "Mình chưa xử lý được yêu cầu này qua AI service. Bạn có thể nói theo mẫu cụ thể hơn, ví dụ: \"tạo task nộp báo cáo ngày 30/7 lúc 9h\" hoặc \"nhắc tôi mỗi sáng 7h30 check in\".";
    }

    return [
      "AI service hiện chưa phản hồi nên mình không dùng câu trả lời mẫu local cho câu hỏi mở này.",
      "Bạn thử gửi lại sau khi FastAPI/Gemini chạy ổn, hoặc hỏi về task, lịch, deadline, file đã upload để mình xử lý bằng dữ liệu trong app.",
    ].join("\n");
  };

  const createAssistantReply = (userMessage) => {
    const text = normalizeIntentText(userMessage);

    const activeTasks = tasks.filter(
      (task) =>
        !task.completed &&
        task.status !== "Completed"
    );

    const today = new Date().toISOString().split("T")[0];

    if (text.includes("tuan nay") || text.includes("tuan sau")) {
      const isNextWeek = text.includes("tuan sau");
      const { start, end } = getWeekRange(isNextWeek ? 1 : 0);
      const weekTasks = activeTasks
        .filter((task) => isTaskInDateRange(task, start, end))
        .sort((a, b) =>
          String(a.startDate || a.deadline).localeCompare(
            String(b.startDate || b.deadline)
          )
        );

      const label = isNextWeek ? "tuần sau" : "tuần này";

      if (weekTasks.length === 0) {
        return `Mình chưa thấy task nào trong ${label} (${formatDate(start)} - ${formatDate(end)}). Bạn vẫn còn ${activeTasks.length} task chưa hoàn thành.`;
      }

      const lines = weekTasks.map(
        (task, index) =>
          `${index + 1}. ${task.title} - ${formatDate(
            task.startDate || task.deadline
          )} - ${task.startTime || "chưa có giờ"} - ${
            task.priority || "chưa có ưu tiên"
          }`
      );

      return `${label[0].toUpperCase()}${label.slice(1)} bạn có ${weekTasks.length} việc:\n${lines.join(
        "\n"
      )}`;
    }

    if (
      text.includes("hom nay") ||
      text.includes("can lam gi") ||
      text.includes("viec nao can lam")
    ) {
      const todayTasks = activeTasks.filter(
        (task) => task.startDate === today || task.deadline === today
      );

      if (todayTasks.length === 0) {
        const suggestedTasks = [...activeTasks]
          .sort((firstTask, secondTask) => {
            const priorityDiff =
              getPriorityScore(secondTask.priority) -
              getPriorityScore(firstTask.priority);

            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            return String(firstTask.deadline || firstTask.startDate || "9999-12-31").localeCompare(
              String(secondTask.deadline || secondTask.startDate || "9999-12-31")
            );
          })
          .slice(0, 3);

        return createDetailedTaskGuidance(
          suggestedTasks,
          `Hôm nay chưa có task nào đúng ngày ${formatDate(today)}, nhưng bạn còn ${activeTasks.length} việc chưa hoàn thành. Đây là các việc nên xử lý trước:`
        ) || `Hôm nay chưa có task nào đúng ngày ${formatDate(today)}.`;
      }

      return createDetailedTaskGuidance(
        todayTasks,
        `Hôm nay bạn có ${todayTasks.length} việc cần chú ý. Mình chia rõ bạn nên làm gì như sau:`
      );
    }

    if (
      text.includes("uu tien") ||
      text.includes("quan trong") ||
      text.includes("lam gi truoc")
    ) {
      if (activeTasks.length === 0) {
        return "Bạn hiện không có công việc chưa hoàn thành.";
      }

      const sortedTasks = [...activeTasks].sort((a, b) => {
        const priorityDiff = getPriorityScore(b.priority) - getPriorityScore(a.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return String(a.deadline || "9999-12-31").localeCompare(
          String(b.deadline || "9999-12-31")
        );
      });

      const task = sortedTasks[0];
      return createDetailedTaskGuidance(
        [task],
        `Bạn nên ưu tiên "${task.title}" trước vì task này có mức ưu tiên/deadline đáng chú ý.`
      );
    }

    if (text.includes("deadline") || text.includes("han")) {
      const deadlineTasks = activeTasks
        .filter((task) => task.deadline)
        .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

      if (deadlineTasks.length === 0) {
        return "Bạn chưa có task nào có deadline.";
      }

      return [
        "Các deadline sắp tới:",
        ...deadlineTasks
          .slice(0, 5)
          .map((task, index) => `${index + 1}. ${task.title} - ${formatDate(task.deadline)}`),
      ].join("\n");
    }

    if (
      text.includes("bao nhiêu task") ||
      text.includes("bao nhiêu công việc")
    ) {
      return `Bạn hiện có ${activeTasks.length} công việc chưa hoàn thành.`;
    }

    if (
      text.includes("quan trọng nhất") ||
      text.includes("ưu tiên nhất") ||
      text.includes("làm gì trước")
    ) {
      if (activeTasks.length === 0) {
        return "Bạn hiện không có công việc chưa hoàn thành.";
      }

      const sortedTasks = [...activeTasks].sort(
        (a, b) =>
          getPriorityScore(b.priority) -
          getPriorityScore(a.priority)
      );

      const task = sortedTasks[0];

      return `Bạn nên ưu tiên "${task.title}" trước. Mức ưu tiên hiện tại là ${
        task.priority || "chưa xác định"
      }, độ khó ${
        task.difficulty || "chưa xác định"
      } và deadline ${formatDate(task.deadline)}.`;
    }

    if (
      text.includes("deadline") ||
      text.includes("hạn")
    ) {
      const deadlineTasks = activeTasks
        .filter((task) => task.deadline)
        .sort(
          (a, b) =>
            new Date(a.deadline) -
            new Date(b.deadline)
        );

      if (deadlineTasks.length === 0) {
        return "Bạn chưa có công việc nào có deadline.";
      }

      const lines = deadlineTasks
        .slice(0, 5)
        .map(
          (task, index) =>
            `${index + 1}. ${task.title} — ${formatDate(
              task.deadline
            )}`
        );

      return `Các deadline sắp tới của bạn:\n${lines.join(
        "\n"
      )}`;
    }

    if (
      text.includes("tiến độ") ||
      text.includes("đã làm đến đâu") ||
      text.includes("còn bước nào")
    ) {
      const taskWithChecklist = activeTasks.find(
        (task) =>
          task.checklist?.length > 0 ||
          task.suggestedSteps?.length > 0
      );

      if (!taskWithChecklist) {
        return "Tôi chưa tìm thấy task có các bước thực hiện để kiểm tra tiến độ.";
      }

      const totalItems =
        taskWithChecklist.checklist?.length > 0
          ? taskWithChecklist.checklist
          : taskWithChecklist.suggestedSteps.map(
              (step, index) => ({
                id: index,
                title: step,
                completed: false,
              })
            );

      const incompleteSteps =
        getIncompleteSteps(taskWithChecklist);

      const completedCount =
        totalItems.length - incompleteSteps.length;

      const nextStep = incompleteSteps[0];

      return `Task "${taskWithChecklist.title}" đã hoàn thành ${completedCount}/${totalItems.length} bước.${
        nextStep
          ? ` Bước tiếp theo bạn nên làm là "${nextStep.title}".`
          : " Bạn đã hoàn thành toàn bộ các bước."
      }`;
    }

    if (
      text.includes("hôm nay") ||
      text.includes("tôi cần làm gì")
    ) {
      const today = new Date()
        .toISOString()
        .split("T")[0];

      const todayTasks = activeTasks.filter(
        (task) =>
          task.startDate === today ||
          task.deadline === today
      );

      if (todayTasks.length === 0) {
        const suggestedTasks = [...activeTasks]
          .sort((firstTask, secondTask) => {
            const priorityDiff =
              getPriorityScore(secondTask.priority) -
              getPriorityScore(firstTask.priority);

            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            return String(firstTask.deadline || firstTask.startDate || "9999-12-31").localeCompare(
              String(secondTask.deadline || secondTask.startDate || "9999-12-31")
            );
          })
          .slice(0, 3);

        return createDetailedTaskGuidance(
          suggestedTasks,
          `Hôm nay tôi chưa tìm thấy task có ngày bắt đầu hoặc deadline là ${formatDate(today)}. Nhưng bạn vẫn còn ${activeTasks.length} công việc chưa hoàn thành, nên mình gợi ý xử lý trước các việc này:`
        );
      }

      return createDetailedTaskGuidance(
        todayTasks,
        `Hôm nay bạn có ${todayTasks.length} công việc. Đây là kế hoạch chi tiết:`
      );
    }

    const matchedTask = activeTasks.find(
      (task) =>
        task.title &&
        text.includes(
          task.title.toLowerCase()
        )
    );

    if (matchedTask) {
      return createDetailedTaskGuidance(
        [matchedTask],
        `Mình tìm thấy task "${matchedTask.title}". Đây là cách xử lý chi tiết:`
      );
    }

    return `Tôi đã đọc ${tasks.length} task của bạn. Hiện tại bạn có thể hỏi tôi: "Tôi cần làm gì hôm nay?", "Tuần này tôi có việc gì?", "Task nào quan trọng nhất?", "Deadline sắp tới là gì?" hoặc "Tôi đã làm đến đâu?".`;
  };

  const handleChatFileUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || uploadingChatFile) {
      return;
    }

    let conversationId = activeConversationId;

    if (!conversationId) {
      conversationId = await createConversation(defaultMessages);
    }

    appendMessages(
      [
        {
          role: "user",
          content: `Tôi upload file "${file.name}", hãy phân tích và đề xuất workflow cho tôi.`,
        },
      ],
      conversationId
    );

    try {
      setUploadingChatFile(true);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/api/analyze-document`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success !== true) {
        const uploadError = new Error(
          data.message ||
            data.documentPurpose ||
            data.error ||
            "Không thể phân tích file."
        );
        uploadError.errorKind = data.errorKind || data.aiErrorKind || "";
        uploadError.status = response.status;
        uploadError.details = data.details || data.documentPurpose || "";
        throw uploadError;
      }

      const documentText =
        data.documentText || data.text || data.textPreview || "";
      const uploadedDocument = {
        id: `local-doc-${Date.now()}`,
        fileName: data.file?.name || file.name,
        fileSize: data.file?.size || file.size,
        fileType: data.file?.type || file.type,
        documentType: data.documentType || "",
        documentPurpose: data.documentPurpose || "",
        isActionable: data.isActionable !== false,
        documentSummaryText: data.documentSummaryText || "",
        analysisSource: data.analysisSource || "Chat Upload",
        text: documentText,
        textLength: data.textLength || documentText.length,
        textPreview: data.textPreview || documentText.slice(0, 1000),
        documentSummary: data.documentSummary || null,
        documentSections: Array.isArray(data.documentSections)
          ? data.documentSections
          : [],
        documentChunks: Array.isArray(data.documentChunks)
          ? data.documentChunks
          : [],
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        dataInsights: data.dataInsights || null,
        dataAnalysis: data.dataAnalysis || null,
        summary: typeof data.summary === "string" ? data.summary : "",
        insights: Array.isArray(data.insights) ? data.insights : [],
        anomalies: Array.isArray(data.anomalies) ? data.anomalies : [],
        predictions: Array.isArray(data.predictions) ? data.predictions : [],
        chartSuggestions: Array.isArray(data.chartSuggestions)
          ? data.chartSuggestions
          : [],
        recommendedActions: Array.isArray(data.recommendedActions)
          ? data.recommendedActions
          : [],
        suggestedTasks: Array.isArray(data.suggestedTasks)
          ? data.suggestedTasks
          : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        createdAt: new Date().toISOString(),
      };

      if (auth.currentUser) {
        try {
          const documentRef = await addDoc(collection(db, "documents"), {
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          fileName: uploadedDocument.fileName,
          fileSize: uploadedDocument.fileSize,
          fileType: uploadedDocument.fileType,
          documentType: uploadedDocument.documentType,
          documentPurpose: uploadedDocument.documentPurpose,
          isActionable: uploadedDocument.isActionable,
          documentSummaryText: uploadedDocument.documentSummaryText,
          analysisSource: uploadedDocument.analysisSource,
          text: documentText,
          textLength: uploadedDocument.textLength,
          textPreview: uploadedDocument.textPreview,
          documentSummary: uploadedDocument.documentSummary,
          documentSections: uploadedDocument.documentSections,
          documentChunks: uploadedDocument.documentChunks,
          keywords: uploadedDocument.keywords,
          dataInsights: uploadedDocument.dataInsights,
          dataAnalysis: uploadedDocument.dataAnalysis,
          summary: uploadedDocument.summary,
          insights: uploadedDocument.insights,
          anomalies: uploadedDocument.anomalies,
          predictions: uploadedDocument.predictions,
          chartSuggestions: uploadedDocument.chartSuggestions,
          recommendedActions: uploadedDocument.recommendedActions,
          suggestedTasks: uploadedDocument.suggestedTasks,
          tasks: uploadedDocument.tasks,
          createdAt: serverTimestamp(),
          });

          uploadedDocument.id = documentRef.id;
        } catch (error) {
          console.error("Save uploaded chat document error:", error);
        }
      }

      setDocuments((currentDocuments) => [
        uploadedDocument,
        ...currentDocuments,
      ]);

      try {
        const localDocuments = JSON.parse(
          localStorage.getItem(LOCAL_DOCUMENT_STORAGE_KEY) || "[]"
        );

        localStorage.setItem(
          LOCAL_DOCUMENT_STORAGE_KEY,
          JSON.stringify(
            [
              {
                ...uploadedDocument,
                text:
                  uploadedDocument.text?.slice(0, 20000) ||
                  uploadedDocument.textPreview ||
                  "",
                documentSummary: uploadedDocument.documentSummary,
                isActionable: uploadedDocument.isActionable,
                documentSummaryText: uploadedDocument.documentSummaryText,
                documentSections: uploadedDocument.documentSections,
                documentChunks: uploadedDocument.documentChunks,
                keywords: uploadedDocument.keywords,
                dataInsights: uploadedDocument.dataInsights,
                dataAnalysis: uploadedDocument.dataAnalysis,
                summary: uploadedDocument.summary,
                insights: uploadedDocument.insights,
                anomalies: uploadedDocument.anomalies,
                predictions: uploadedDocument.predictions,
                chartSuggestions: uploadedDocument.chartSuggestions,
                recommendedActions: uploadedDocument.recommendedActions,
                suggestedTasks: uploadedDocument.suggestedTasks,
              },
              ...localDocuments,
            ].slice(0, 10)
          )
        );
      } catch (error) {
        console.error("Save local chat document error:", error);
      }

      appendMessages(
        [
          {
            role: "assistant",
            content: createDocumentWorkflowReply(data),
            suggestedTasks: createDocumentSuggestedTasks(uploadedDocument),
          },
        ],
        conversationId
      );
    } catch (error) {
      console.error("Chat file upload error:", error);
      appendMessages(
        [
          {
            role: "assistant",
            content: getChatUploadErrorMessage(error),
          },
        ],
        conversationId
      );
    } finally {
      setUploadingChatFile(false);
    }
  };

  const getRecentChatHistory = (pendingUserMessage) => {
    return [
      ...messages,
      {
        role: "user",
        content: pendingUserMessage,
      },
    ]
      .filter((item) => item?.role && item?.content)
      .slice(-8)
      .map((item) => ({
        role: item.role,
        content: String(item.content).slice(0, 1200),
      }));
  };

  const buildRelevantContextForMessage = (pendingUserMessage) => {
    return documents
      .slice(0, 3)
      .flatMap((document) => {
        const evidenceSet = selectEvidenceSet(document, pendingUserMessage, 3);

        return evidenceSet.map((evidence, index) => ({
          fileName: getDocumentFileName(document, "Tài liệu"),
          documentType: document.documentType || document.type || "",
          text: evidence.text,
          heading: evidence.heading || "",
          source: evidence.source || "",
          intent: evidence.intent || classifyDocumentQuestionIntent(pendingUserMessage),
          normalizedQuery: evidence.normalizedQuery || pendingUserMessage,
          score: evidence.score || 3 - index,
        }));
      })
      .filter((item) => item.text)
      .slice(0, 6);
  };

  const handleImmediateLocalAction = async (userMessage) => {
    const localIntent = classifyLocalChatIntent(userMessage);
    const permissionHelpReply = createPermissionHelpReply(userMessage);

    if (permissionHelpReply) {
      return permissionHelpReply;
    }

    const pendingScheduleReply = await handlePendingScheduleReply(userMessage);

    if (pendingScheduleReply) {
      return pendingScheduleReply;
    }

    const documentBirthdayReply = localIntent === "DOCUMENT_BIRTHDAY_REMINDERS"
      ? answerDocumentQuestion(userMessage)
      : "";

    if (documentBirthdayReply) {
      return documentBirthdayReply;
    }

    if (localIntent === "CREATE_TASK_OR_REMINDER") {
      return createLocalTaskFromMessage(userMessage);
    }

    return "";
  };

  const getConfidenceLabel = (confidenceLevel) => {
    const value = String(confidenceLevel || "").toUpperCase();

    if (value === "HIGH") {
      return "Cao";
    }

    if (value === "LOW") {
      return "Thấp";
    }

    if (value === "MEDIUM") {
      return "Trung bình";
    }

    return "";
  };

  const appendConfidenceText = (reply, confidenceLevel) => {
    if (!appSettings.showConfidence) {
      return reply;
    }

    const label = getConfidenceLabel(confidenceLevel);

    if (!label || String(reply || "").includes("Độ tin cậy")) {
      return reply;
    }

    return `${reply}\n\nĐộ tin cậy: ${label}`;
  };

  const isValidIsoDate = (value) => {
    const text = String(value || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return false;
    }

    const parsed = new Date(`${text}T00:00:00`);

    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === text
    );
  };

  const cleanSuggestedTaskTitle = (value) =>
    String(value || "").replace(/\s+/g, " ").trim();

  const getScannableTaskTitle = (rawTitle, rawDescription = "") => {
    const title = cleanSuggestedTaskTitle(rawTitle);
    const mergedText = cleanSuggestedTaskTitle(`${title} ${rawDescription}`);
    const normalized = normalizeIntentText(mergedText);
    const employeeNameMatch = mergedText.match(/họ\s*và\s*tên\s*:\s*([^|]+)/i);

    if (employeeNameMatch && /ngày\s*sinh/i.test(mergedText)) {
      return `Nhắc sinh nhật ${employeeNameMatch[1].trim()}`.slice(0, 72);
    }

    if (normalized.includes("kpi")) {
      return normalized.includes("cap nhat")
        ? "Cập nhật dữ liệu KPI"
        : "Rà soát dữ liệu KPI";
    }

    if (normalized.includes("don hang") || normalized.includes("order")) {
      return "Rà soát đơn hàng";
    }

    if (normalized.includes("hop dong") || normalized.includes("contract")) {
      return "Rà soát hợp đồng";
    }

    if (normalized.includes("mysql") || normalized.includes("database")) {
      return "Thiết kế database";
    }

    if (normalized.includes("python") || normalized.includes("code")) {
      return "Hoàn thiện code Python";
    }

    if (normalized.includes("bao cao")) {
      return "Hoàn thiện báo cáo";
    }

    const words = title.split(/\s+/).filter(Boolean);

    if (title.length <= 72 && words.length <= 10) {
      return title;
    }

    const actionVerbs = [
      "Cập nhật",
      "Rà soát",
      "Kiểm tra",
      "Chuẩn bị",
      "Hoàn thiện",
      "Thiết kế",
      "Tạo",
      "Gửi",
      "Theo dõi",
      "Tổng hợp",
      "Phân tích",
      "Làm",
      "Học",
      "Ôn",
    ];
    const startsWithAction = actionVerbs.some((verb) =>
      title.toLowerCase().startsWith(verb.toLowerCase())
    );
    const compactWords = words.slice(0, startsWithAction ? 9 : 7).join(" ");

    return startsWithAction
      ? compactWords
      : `Xử lý ${compactWords}`.slice(0, 72);
  };

  const compactSuggestedTaskDraft = (taskDraft) => {
    const originalTitle = cleanSuggestedTaskTitle(
      taskDraft.title || taskDraft.task_name || taskDraft.name
    );
    const originalDescription = String(taskDraft.description || "").trim();
    const compactTitle = getScannableTaskTitle(
      originalTitle,
      originalDescription
    );
    const shouldMoveTitleToDescription =
      originalTitle &&
      compactTitle !== originalTitle &&
      !originalDescription.includes(originalTitle);

    return {
      ...taskDraft,
      title: compactTitle,
      description: shouldMoveTitleToDescription
        ? [originalDescription, `Ngữ cảnh gốc: ${originalTitle}`]
            .filter(Boolean)
            .join("\n")
        : originalDescription,
    };
  };

  const isBadSuggestedTaskTitle = (title) => {
    const normalized = normalizeIntentText(title);
    const words = normalized.split(" ").filter(Boolean);

    if (title.length < 4) {
      return true;
    }

    if (words.length < 2 || words.length > 14) {
      return true;
    }

    if (["cuoc hop", "thoi"].includes(normalized)) {
      return true;
    }

    return [
      "hoan thanh la",
      "khong co nhiem vu",
      "khong co nguoi phu trach",
      "khong co thoi",
      "no assignment",
      "no task",
      "kpi la",
      "du lieu la",
    ].some((phrase) => normalized.includes(phrase));
  };

  const isBadSuggestedStep = (step) => {
    const normalized = normalizeIntentText(step);
    const words = normalized.split(" ").filter(Boolean);

    if (step.length < 4 || words.length < 2) {
      return true;
    }

    return [
      "khong co nhiem vu",
      "khong co nguoi phu trach",
      "khong co thoi",
      "no assignment",
      "no task",
      "khong xac dinh",
    ].some((phrase) => normalized.includes(phrase));
  };

  const cleanSuggestedStep = (value, taskTitle = "") => {
    const step = cleanSuggestedTaskTitle(value);
    const context = cleanSuggestedTaskTitle(`${taskTitle} ${step}`);
    const normalized = normalizeIntentText(context);
    const employeeNameMatch = context.match(/họ\s*và\s*tên\s*:\s*([^|]+)/i);

    if (isBadSuggestedStep(step)) {
      return "";
    }

    if (employeeNameMatch && /ngày\s*sinh/i.test(context)) {
      return `Xác nhận ngày sinh của ${employeeNameMatch[1].trim()}`.slice(0, 110);
    }

    if (normalized.includes("kpi")) {
      return normalized.includes("gui") || normalized.includes("nop")
        ? "Gửi file KPI sau khi đối chiếu"
        : "Đối chiếu số liệu KPI với báo cáo liên quan";
    }

    if (normalized.includes("don hang") || normalized.includes("order")) {
      return "Kiểm tra trạng thái và dữ liệu đơn hàng";
    }

    if (normalized.includes("hop dong") || normalized.includes("contract")) {
      return "Rà soát điều khoản và mốc thời gian liên quan";
    }

    if (normalized.includes("mysql") || normalized.includes("database")) {
      return "Thiết kế bảng, khóa và quan hệ dữ liệu";
    }

    if (normalized.includes("python") || normalized.includes("code")) {
      return "Hoàn thiện chức năng code chính";
    }

    const words = step.split(/\s+/).filter(Boolean);

    if (step.length <= 110 && words.length <= 18) {
      return step;
    }

    const actionStarts = [
      "Cập nhật",
      "Rà soát",
      "Kiểm tra",
      "Chuẩn bị",
      "Hoàn thiện",
      "Thiết kế",
      "Tạo",
      "Gửi",
      "Theo dõi",
      "Tổng hợp",
      "Phân tích",
      "Làm",
      "Học",
      "Ôn",
      "Đọc",
    ].some((verb) => step.toLowerCase().startsWith(verb.toLowerCase()));

    if (actionStarts) {
      return words.slice(0, 14).join(" ");
    }

    return "Rà soát nội dung liên quan trong tài liệu";
  };

  const sanitizeSuggestedTaskDraft = (taskDraft, index = 0) => {
    if (!taskDraft || typeof taskDraft !== "object") {
      return null;
    }

    const compactTaskDraft = appSettings.compactTaskTitle
      ? compactSuggestedTaskDraft(taskDraft)
      : {
          ...taskDraft,
          title: cleanSuggestedTaskTitle(
            taskDraft.title || taskDraft.task_name || taskDraft.name
          ),
          description: String(taskDraft.description || "").trim(),
        };
    const title = cleanSuggestedTaskTitle(compactTaskDraft.title);

    if (isBadSuggestedTaskTitle(title)) {
      return null;
    }

    const seenSteps = new Set();
    const suggestedSteps = Array.isArray(
      taskDraft.suggestedSteps || taskDraft.checklist
    )
      ? (taskDraft.suggestedSteps || taskDraft.checklist)
          .map((step) => cleanSuggestedStep(step, title))
          .filter(Boolean)
          .filter((step) => {
            const key = normalizeIntentText(step);

            if (seenSteps.has(key)) {
              return false;
            }

            seenSteps.add(key);
            return true;
          })
          .slice(0, 6)
      : [];

    const startDate = isValidIsoDate(taskDraft.startDate)
      ? taskDraft.startDate
      : "";
    const deadline = isValidIsoDate(taskDraft.deadline)
      ? taskDraft.deadline
      : "";

    return {
      id: taskDraft.id || `draft-${Date.now()}-${index}`,
      title,
      description: String(compactTaskDraft.description || "").trim(),
      category: taskDraft.category || taskDraft.taskType || "General",
      type: taskDraft.type || "Task",
      domain: taskDraft.domain || "General",
      difficulty: taskDraft.difficulty || "Trung bình",
      necessity: taskDraft.necessity || "Trung bình",
      priority: taskDraft.priority || "Trung bình",
      startDate,
      deadline,
      startTime: String(taskDraft.startTime || "").trim(),
      endTime: String(taskDraft.endTime || "").trim(),
      estimate: taskDraft.estimate || "Chọn thời gian",
      reminder:
        startDate || deadline || taskDraft.startTime
          ? taskDraft.reminder || appSettings.defaultReminder
          : "Không nhắc",
      assignee: taskDraft.assignee || "Tôi",
      status: taskDraft.status || "To do",
      completed: false,
      suggestedSteps,
    };
  };

  const normalizeAssistantResult = (result) => {
    if (!result) {
      return {
        content: "",
        suggestedTasks: [],
      };
    }

    if (typeof result === "object") {
      return {
        content: String(result.content || result.reply || result.answer || ""),
        suggestedTasks: Array.isArray(result.suggestedTasks)
          ? result.suggestedTasks
              .map((taskDraft, index) =>
                sanitizeSuggestedTaskDraft(taskDraft, index)
              )
              .filter(Boolean)
          : [],
      };
    }

    return {
      content: String(result),
      suggestedTasks: [],
    };
  };

  const isWeakAssistantReply = (reply) => {
    const normalizedReply = normalizeIntentText(reply);

    return (
      !normalizedReply ||
      normalizedReply.length < 80 ||
      normalizedReply.includes("hien toi co the giup ban") ||
      normalizedReply.includes("toi da nhan cau hoi cua ban") ||
      normalizedReply.includes("ban hay noi cu the") ||
      normalizedReply.includes("chua tim thay cong viec nao phu hop") ||
      normalizedReply.includes("toi chua tim thay doan nao")
    );
  };

  const saveSuggestedTask = async (taskDraft) => {
    const sanitizedTask = sanitizeSuggestedTaskDraft(taskDraft);

    if (!sanitizedTask) {
      alert("Task gợi ý này chưa đủ rõ để tạo. Bạn hãy yêu cầu TamCam chia lại task cụ thể hơn nhé.");
      return;
    }

    const existingTasks = tasks;
    const newTask = {
      title: sanitizedTask.title || "Task từ TamCam AI",
      description: sanitizedTask.description || "",
      category: sanitizedTask.category || "General",
      type: sanitizedTask.type || "Task",
      domain: sanitizedTask.domain || "General",
      difficulty: sanitizedTask.difficulty || "Trung bình",
      necessity: sanitizedTask.necessity || "Trung bình",
      priority: sanitizedTask.priority || "Trung bình",
      startDate: sanitizedTask.startDate || sanitizedTask.deadline || "",
      deadline: sanitizedTask.deadline || sanitizedTask.startDate || "",
      startTime: sanitizedTask.startTime || "",
      endTime: sanitizedTask.endTime || "",
      estimate: sanitizedTask.estimate || "Chọn thời gian",
      reminder: sanitizedTask.reminder || "Không nhắc",
      assignee: sanitizedTask.assignee || "Tôi",
      status: sanitizedTask.status || "To do",
      completed: false,
      checklist: Array.isArray(sanitizedTask.suggestedSteps)
        ? sanitizedTask.suggestedSteps.map((step, index) => ({
            id: `ai-step-${Date.now()}-${index}`,
            title: step,
            completed: false,
          }))
        : [],
      source: "TamCam AI draft",
      createdAt: new Date().toISOString(),
    };
    const conflicts = findScheduleConflicts(newTask, existingTasks);

    let taskDocumentId = `local-${Date.now()}`;
    let savedToFirebase = false;

    if (auth.currentUser) {
      try {
        const taskDocument = await addDoc(collection(db, "tasks"), {
          ...newTask,
          userId: auth.currentUser.uid,
        });
        taskDocumentId = taskDocument.id;
        savedToFirebase = true;
      } catch (error) {
        console.warn("Could not save suggested task to Firebase:", error);
      }
    }

    const savedTask = {
      ...newTask,
      id: taskDocumentId,
      source: savedToFirebase ? "TamCam AI" : "TamCam AI (temporary)",
      userId: auth.currentUser?.uid || "local-user",
    };

    setTasks((currentTasks) => [...currentTasks, savedTask]);

    return {
      savedTask,
      conflicts,
    };
  };

  const prepareTaskDraftForReview = (taskDraft, index = 0) => {
    const sanitizedTask = sanitizeSuggestedTaskDraft(taskDraft, index);

    if (!sanitizedTask) {
      return null;
    }

    return {
      ...sanitizedTask,
      suggestedSteps:
        sanitizedTask.suggestedSteps.length > 0
          ? sanitizedTask.suggestedSteps
          : [""],
    };
  };

  const openTaskDraftReview = (taskDraft, index = 0) => {
    const preparedTask = prepareTaskDraftForReview(taskDraft, index);

    if (!preparedTask) {
      alert("Task gợi ý này chưa đủ rõ để tạo. Bạn hãy yêu cầu TamCam chia lại task cụ thể hơn nhé.");
      return;
    }

    setReviewTaskQueue([]);
    setReviewTaskQueueIndex(0);
    setReviewTaskHistory([]);
    setReviewingTaskDraft(preparedTask);
  };

  const openTaskDraftReviewQueue = (taskDrafts = []) => {
    const preparedTasks = taskDrafts
      .map((taskDraft, index) => prepareTaskDraftForReview(taskDraft, index))
      .filter(Boolean);

    if (preparedTasks.length === 0) {
      alert("Các task gợi ý hiện chưa đủ rõ để tạo. Bạn hãy yêu cầu TamCam chia lại task cụ thể hơn nhé.");
      return;
    }

    setReviewTaskQueue(preparedTasks);
    setReviewTaskQueueIndex(0);
    setReviewTaskHistory([]);
    setReviewingTaskDraft(preparedTasks[0]);
  };

  const closeTaskDraftReview = () => {
    setReviewingTaskDraft(null);
    setReviewTaskQueue([]);
    setReviewTaskQueueIndex(0);
    setReviewTaskInstruction("");
    setReviewTaskHistory([]);
  };

  const advanceTaskDraftQueue = () => {
    if (reviewTaskQueue.length === 0) {
      closeTaskDraftReview();
      return;
    }

    const nextIndex = reviewTaskQueueIndex + 1;

    if (nextIndex >= reviewTaskQueue.length) {
      closeTaskDraftReview();
      return;
    }

    setReviewTaskQueueIndex(nextIndex);
    setReviewTaskHistory([]);
    setReviewingTaskDraft(reviewTaskQueue[nextIndex]);
  };

  const handleSkipReviewedTask = () => {
    advanceTaskDraftQueue();
  };

  const rememberReviewingTaskDraft = () => {
    if (!reviewingTaskDraft) {
      return;
    }

    setReviewTaskHistory((currentHistory) => [
      reviewingTaskDraft,
      ...currentHistory,
    ].slice(0, 10));
  };

  const undoReviewingTaskChange = () => {
    setReviewTaskHistory((currentHistory) => {
      const [previousDraft, ...remainingHistory] = currentHistory;

      if (!previousDraft) {
        return currentHistory;
      }

      setReviewingTaskDraft(previousDraft);

      setReviewTaskQueue((currentQueue) => {
        if (currentQueue.length === 0) {
          return currentQueue;
        }

        return currentQueue.map((taskDraft, index) =>
          index === reviewTaskQueueIndex ? previousDraft : taskDraft
        );
      });

      return remainingHistory;
    });
  };

  const updateReviewingTaskField = (field, value, shouldRemember = false) => {
    if (shouldRemember && reviewingTaskDraft && reviewingTaskDraft[field] !== value) {
      rememberReviewingTaskDraft();
    }

    setReviewingTaskDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            [field]: value,
          }
        : currentDraft
    );

    setReviewTaskQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        return currentQueue;
      }

      return currentQueue.map((taskDraft, index) =>
        index === reviewTaskQueueIndex
          ? {
              ...taskDraft,
              [field]: value,
            }
          : taskDraft
      );
    });
  };

  const applyReviewingTaskUpdates = (updates) => {
    rememberReviewingTaskDraft();

    setReviewingTaskDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            ...updates,
          }
        : currentDraft
    );

    setReviewTaskQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        return currentQueue;
      }

      return currentQueue.map((taskDraft, index) =>
        index === reviewTaskQueueIndex
          ? {
              ...taskDraft,
              ...updates,
            }
          : taskDraft
      );
    });
  };

  const updateReviewingTaskStep = (index, value) => {
    if (reviewingTaskDraft?.suggestedSteps?.[index] !== value) {
      rememberReviewingTaskDraft();
    }

    setReviewingTaskDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const nextSteps = [...(currentDraft.suggestedSteps || [])];
      nextSteps[index] = value;

      return {
        ...currentDraft,
        suggestedSteps: nextSteps,
      };
    });

    setReviewTaskQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        return currentQueue;
      }

      return currentQueue.map((taskDraft, taskIndex) => {
        if (taskIndex !== reviewTaskQueueIndex) {
          return taskDraft;
        }

        const nextSteps = [...(taskDraft.suggestedSteps || [])];
        nextSteps[index] = value;

        return {
          ...taskDraft,
          suggestedSteps: nextSteps,
        };
      });
    });
  };

  const addReviewingTaskStep = () => {
    rememberReviewingTaskDraft();

    setReviewingTaskDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            suggestedSteps: [...(currentDraft.suggestedSteps || []), ""].slice(0, 8),
          }
        : currentDraft
    );

    setReviewTaskQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        return currentQueue;
      }

      return currentQueue.map((taskDraft, index) =>
        index === reviewTaskQueueIndex
          ? {
              ...taskDraft,
              suggestedSteps: [...(taskDraft.suggestedSteps || []), ""].slice(0, 8),
            }
          : taskDraft
      );
    });
  };

  const removeReviewingTaskStep = (index) => {
    rememberReviewingTaskDraft();

    setReviewingTaskDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const nextSteps = (currentDraft.suggestedSteps || []).filter(
        (_, stepIndex) => stepIndex !== index
      );

      return {
        ...currentDraft,
        suggestedSteps: nextSteps.length > 0 ? nextSteps : [""],
      };
    });

    setReviewTaskQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        return currentQueue;
      }

      return currentQueue.map((taskDraft, taskIndex) => {
        if (taskIndex !== reviewTaskQueueIndex) {
          return taskDraft;
        }

        const nextSteps = (taskDraft.suggestedSteps || []).filter(
          (_, stepIndex) => stepIndex !== index
        );

        return {
          ...taskDraft,
          suggestedSteps: nextSteps.length > 0 ? nextSteps : [""],
        };
      });
    });
  };

  const handleCreateSuggestedTask = async (taskDraft) => {
    const result = await saveSuggestedTask({
      ...taskDraft,
      suggestedSteps: (taskDraft.suggestedSteps || [])
        .map((step) => String(step || "").trim())
        .filter(Boolean),
    });

    if (!result) {
      return;
    }

    const { savedTask, conflicts } = result;
    setCreatedTaskPreview({
      task: savedTask,
      conflicts,
    });

    appendMessages([
      {
        id: Date.now(),
        role: "assistant",
        content:
          `Mình đã tạo task "${savedTask.title}" trong Task List${savedTask.id.startsWith("local-") ? " tạm thời vì Firebase chưa lưu được" : ""}.` +
          formatConflictWarning(conflicts, savedTask.title),
      },
    ]);
  };

  const handleConfirmReviewedTask = async () => {
    if (!reviewingTaskDraft) {
      return;
    }

    const taskDraft = reviewingTaskDraft;
    await handleCreateSuggestedTask(taskDraft);
    advanceTaskDraftQueue();
  };

  const applyReviewTaskInstruction = async (presetInstruction = "") => {
    const instruction = String(presetInstruction || reviewTaskInstruction).trim();

    if (!instruction || !reviewingTaskDraft) {
      return;
    }

    setRewritingTaskDraft(true);

    try {
      const response = await fetch(`${AI_SERVICE_BASE_URL}/rewrite-task-draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instruction,
          taskDraft: reviewingTaskDraft,
          documents,
          tasks,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rewrittenTask = sanitizeSuggestedTaskDraft(data.taskDraft);

        if (data.success && rewrittenTask) {
          applyReviewingTaskUpdates({
            ...rewrittenTask,
            suggestedSteps:
              rewrittenTask.suggestedSteps.length > 0
                ? rewrittenTask.suggestedSteps
                : reviewingTaskDraft.suggestedSteps,
          });
          setReviewTaskInstruction("");
          return;
        }
      }
    } catch (error) {
      console.warn("AI task draft rewrite failed, using local editor:", error);
    } finally {
      setRewritingTaskDraft(false);
    }

    const normalizedInstruction = normalizeIntentText(instruction);
    const lowerInstruction = instruction.toLowerCase();
    const updates = {};
    const parsedDate = parseDateFromMessage(instruction);
    let parsedTime = parseTimeFromMessage(instruction);
    const parsedReminder = parseReminderFromMessage(instruction);

    if (!parsedTime) {
      if (normalizedInstruction.includes("sang")) {
        parsedTime = "09:00";
      } else if (normalizedInstruction.includes("chieu")) {
        parsedTime = "14:00";
      } else if (
        lowerInstruction.includes("tối") ||
        normalizedInstruction.includes("buoi toi")
      ) {
        parsedTime = "19:30";
      }
    }

    if (parsedDate) {
      updates.startDate = parsedDate;
      updates.deadline = parsedDate;
    }

    if (parsedTime) {
      const currentRange = getTaskTimeRange(reviewingTaskDraft);
      const duration = currentRange
        ? Math.max(30, Math.min(180, currentRange.end - currentRange.start))
        : 60;

      updates.startTime = parsedTime;
      updates.endTime = addMinutesToTime(parsedTime, duration);
    }

    if (parsedReminder) {
      updates.reminder = parsedReminder;
    } else if (normalizedInstruction.includes("truoc 30 phut")) {
      updates.reminder = "Trước 30 phút";
    }

    if (normalizedInstruction.includes("uu tien cao")) {
      updates.priority = "Cao";
    } else if (normalizedInstruction.includes("uu tien thap")) {
      updates.priority = "Thấp";
    } else if (normalizedInstruction.includes("uu tien trung binh")) {
      updates.priority = "Trung bình";
    }

    if (
      normalizedInstruction.includes("checklist") ||
      normalizedInstruction.includes("chia nho") ||
      normalizedInstruction.includes("chi tiet hon") ||
      normalizedInstruction.includes("cu the hon")
    ) {
      updates.suggestedSteps = buildChecklistForTask(reviewingTaskDraft);
    }

    const titleMatch = instruction.match(/(?:đổi|doi|sửa|sua)\s+tên\s+(?:task\s+)?(?:thành|thanh)\s+(.+)/i);

    if (titleMatch?.[1]) {
      updates.title = titleMatch[1].trim().slice(0, 90);
    }

    const descriptionMatch = instruction.match(/(?:mô tả|mo ta)\s+(?:thành|thanh)\s+(.+)/i);

    if (descriptionMatch?.[1]) {
      updates.description = descriptionMatch[1].trim();
    }

    if (Object.keys(updates).length === 0) {
      updates.description = [
        reviewingTaskDraft.description,
        `Ghi chú chỉnh sửa: ${instruction}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    applyReviewingTaskUpdates(updates);
    setReviewTaskInstruction("");
  };

  const handleCreateAllSuggestedTasks = async (taskDrafts = []) => {
    const validTaskDrafts = taskDrafts.filter((taskDraft) => taskDraft?.title);

    if (validTaskDrafts.length === 0) {
      return;
    }

    const savedTasks = [];
    const conflictItems = [];
    let simulatedTasks = [...tasks];

    for (const taskDraft of validTaskDrafts) {
      const conflicts = findScheduleConflicts(taskDraft, simulatedTasks);
      const { savedTask } = await saveSuggestedTask(taskDraft);
      savedTasks.push(savedTask);
      simulatedTasks = [...simulatedTasks, savedTask];

      if (conflicts.length > 0) {
        conflictItems.push({
          task: savedTask,
          conflicts,
        });
      }
    }

    const temporaryCount = savedTasks.filter((task) =>
      String(task.id || "").startsWith("local-")
    ).length;
    const urgentCount = savedTasks.filter((task) =>
      ["cao", "high"].includes(normalizeIntentText(task.priority || ""))
    ).length;

    appendMessages([
      {
        id: Date.now(),
        role: "assistant",
        content: [
          `Mình đã tạo ${savedTasks.length} task trong Task List/Calendar.`,
          urgentCount > 0 ? `Trong đó có ${urgentCount} task ưu tiên cao.` : "",
          temporaryCount > 0
            ? `${temporaryCount} task đang được lưu tạm vì Firebase chưa cho ghi.`
            : "Tất cả task đã được lưu.",
          conflictItems.length > 0
            ? `Có ${conflictItems.length} task bị trùng lịch: ${conflictItems
                .slice(0, 3)
                .map((item) => `"${item.task.title}"`)
                .join(", ")}. Bạn có thể nhắn đổi giờ cho các task này.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    ]);
  };

  const handleSend = async () => {
  const cleanMessage = message.trim();

  if (!cleanMessage) {
    return;
  }

  let conversationId = activeConversationId;

  if (!conversationId) {
    conversationId = await createConversation(defaultMessages);
  }

  if (!conversationId) {
    conversationId = createLocalConversation(defaultMessages);
  }

  const userMessage = {
    id: Date.now(),
    role: "user",
    content: cleanMessage,
    createdAt: new Date().toISOString(),
  };

  appendMessages([userMessage], conversationId);

  setMessage("");

  try {
    const qState = classifyQlState(cleanMessage);
    const qAction = chooseQAction(qTable, qState);
    const qLearningPolicy = describeQPolicy(qTable, qState, qAction);
    const localActionReply = await handleImmediateLocalAction(cleanMessage);

    if (localActionReply) {
      const localPayload = normalizeAssistantResult(localActionReply);
      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: fixMojibake(localPayload.content),
        suggestedTasks: localPayload.suggestedTasks,
        intent: "LOCAL_ACTION",
        metadata: {
          provider: "local",
          model: "frontend-local-action",
        },
        createdAt: new Date().toISOString(),
        qState,
        qAction,
      };

      appendMessages([assistantMessage], conversationId);

      return;
    }

    const rawChatResponse = await sendChatMessage({
      aiServiceBaseUrl: AI_SERVICE_BASE_URL,
      message: cleanMessage,
      conversationId,
      userId: auth.currentUser?.uid || "",
      tasks,
      documents,
      history: getRecentChatHistory(cleanMessage),
      relevantContext: buildRelevantContextForMessage(cleanMessage),
      feedbackMemory: buildFeedbackMemory(),
      qLearningPolicy,
      conversationSummary: getActiveConversationSummary(conversationId),
      userProfile: {
        displayName: auth.currentUser?.displayName || "",
        email: auth.currentUser?.email || "",
      },
    });
    const data = normalizeChatResponse(rawChatResponse);

let assistantReply = appendConfidenceText(
  fixMojibake(data.reply || data.answer || ""),
  data.confidenceLevel
);
let suggestedTasks = Array.isArray(data.suggestedTasks)
  ? data.suggestedTasks
  : [];

if (
  data.intent === "UPDATE_TASK" &&
  data.taskId &&
  data.updatedFields
) {
  await updateDoc(
    doc(db, "tasks", data.taskId),
    data.updatedFields
  );

  setTasks((currentTasks) =>
    currentTasks.map((task) =>
      task.id === data.taskId
        ? {
            ...task,
            ...data.updatedFields,
          }
        : task
    )
  );

  assistantReply = `${assistantReply} Tôi đã cập nhật thông tin task trong danh sách của bạn.`;
}

if (
  data.intent === "COMPLETE_TASK" &&
  data.taskId &&
  data.updatedFields
) {
  await updateDoc(
    doc(db, "tasks", data.taskId),
    data.updatedFields
  );

  setTasks((currentTasks) =>
    currentTasks.map((task) =>
      task.id === data.taskId
        ? {
            ...task,
            ...data.updatedFields,
          }
        : task
    )
  );

  assistantReply = `${assistantReply} Tôi đã cập nhật trạng thái task trong danh sách của bạn.`;
}

if (
  data.intent === "REOPEN_TASK" &&
  data.taskId &&
  data.updatedFields
) {
  await updateDoc(
    doc(db, "tasks", data.taskId),
    data.updatedFields
  );

  setTasks((currentTasks) =>
    currentTasks.map((task) =>
      task.id === data.taskId
        ? {
            ...task,
            ...data.updatedFields,
          }
        : task
    )
  );

  assistantReply = `${assistantReply} Tôi đã cập nhật trạng thái task trong danh sách Tasks của bạn.`;
}

if (
  data.intent === "GENERATE_CHECKLIST" &&
  data.taskId &&
  data.updatedFields
) {
  await updateDoc(
    doc(db, "tasks", data.taskId),
    data.updatedFields
  );

  setTasks((currentTasks) =>
    currentTasks.map((task) =>
      task.id === data.taskId
        ? {
            ...task,
            ...data.updatedFields,
          }
        : task
    )
  );

  assistantReply = `${assistantReply} Tôi đã lưu các bước cần làm vào task của bạn.`;
}

if (
  data.intent === "DELETE_TASK" &&
  data.taskId
) {
  await deleteDoc(
    doc(db, "tasks", data.taskId)
  );

  setTasks((currentTasks) =>
    currentTasks.filter(
      (task) => task.id !== data.taskId
    )
  );

  assistantReply = `${assistantReply} Tôi đã xóa công việc này khỏi danh sách Tasks của bạn.`;
}

if (data.task) {
  if (!auth.currentUser) {
    throw new Error(
      "Không tìm thấy người dùng đăng nhập."
    );
  }

  const { id, ...taskData } = data.task;

  const newTask = {
    ...taskData,

    userId: auth.currentUser.uid,

    completed: false,

    status: taskData.status || "To do",

    createdAt: new Date().toISOString(),
  };

  let taskDocumentId = `local-${Date.now()}`;
  let savedToFirebase = true;

  try {
    const taskDocument = await addDoc(
      collection(db, "tasks"),
      newTask
    );
    taskDocumentId = taskDocument.id;
  } catch (error) {
    console.warn("Could not save AI task to Firebase:", error);
    savedToFirebase = false;
  }

  const savedTask = {
    ...newTask,
    id: taskDocumentId,
    source: savedToFirebase ? newTask.source : "AI Chat (temporary)",
  };

  setTasks((currentTasks) => [
    ...currentTasks,
    savedTask,
  ]);

  if (
    assistantReply.includes("lịch tôi gợi ý") ||
    assistantReply.includes("chỉnh ngày")
  ) {
    pendingScheduleTaskRef.current = savedTask;
  }

  assistantReply = savedToFirebase
    ? `${assistantReply} Tôi đã thêm công việc này vào danh sách Tasks của bạn.`
    : `${assistantReply} Hiện Firebase chưa cho lưu, nên tôi đã thêm tạm vào phiên hiện tại.`;
}

if (
  classifyLocalChatIntent(cleanMessage) === "CREATE_TASK_OR_REMINDER" &&
  isWeakAssistantReply(assistantReply) &&
  suggestedTasks.length === 0 &&
  !data.task
) {
  const localTaskPayload = normalizeAssistantResult(
    await createLocalTaskFromMessage(cleanMessage)
  );

  if (localTaskPayload.content) {
    assistantReply = localTaskPayload.content;
    suggestedTasks = localTaskPayload.suggestedTasks;
  }
}

if (shouldAnswerDocumentQuestion(cleanMessage) && isWeakAssistantReply(assistantReply)) {
  const documentFallback = normalizeAssistantResult(
    answerDocumentQuestion(cleanMessage)
  );

  if (documentFallback.content) {
    assistantReply = documentFallback.content;
    suggestedTasks =
      documentFallback.suggestedTasks.length > 0
        ? documentFallback.suggestedTasks
        : suggestedTasks;
  }
}

    const assistantMessage = {
      id: Date.now() + 1,
      role: "assistant",
      content: fixMojibake(assistantReply),
      suggestedTasks,
      intent: data.intent,
      model: data.metadata?.model || data.model || "",
      sources: data.sources || [],
      suggestedActions: data.suggestedActions || [],
      structuredActions: data.structuredActions || [],
      calendarPlan: data.calendarPlan || null,
      orchestrationTrace: data.orchestrationTrace || null,
      conversationState: data.conversationState || null,
      primaryIntent: data.primaryIntent || "",
      secondaryIntents: data.secondaryIntents || [],
      conflicts: data.conflicts || [],
      warnings: data.warnings || [],
      memoryCandidates: data.memoryCandidates || [],
      metadata: data.metadata || {},
      createdAt: new Date().toISOString(),
      qState,
      qAction,
    };

    appendMessages([assistantMessage], conversationId);
  } catch (error) {
    console.error(
      "Chat AI error:",
      error
    );

    const fallbackReply =
      (await handleLocalChatAction(cleanMessage)) ||
      createAiServiceErrorReply(error, cleanMessage);
    const fallbackPayload = normalizeAssistantResult(fallbackReply);

    const errorMessage = {
      id: Date.now() + 1,
      role: "assistant",
      content:
          "Tôi không thể xử lý yêu cầu. Vui lòng kiểm tra TamCam AI Service hoặc kết nối Firestore.",
      intent: "ERROR_FALLBACK",
      metadata: {
        provider: "local",
        errorKind: getApiErrorKind(error),
      },
      createdAt: new Date().toISOString(),
      qState: classifyQlState(cleanMessage),
      qAction: "direct_answer",
    };

    errorMessage.content = fixMojibake(fallbackPayload.content);
    errorMessage.suggestedTasks = fallbackPayload.suggestedTasks;

    appendMessages([errorMessage], conversationId);
  }
};

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSend();
    }
  };

  const reviewScheduleConflicts = reviewingTaskDraft
    ? findScheduleConflicts({
        ...reviewingTaskDraft,
        startDate: reviewingTaskDraft.startDate || reviewingTaskDraft.deadline || "",
        deadline: reviewingTaskDraft.deadline || reviewingTaskDraft.startDate || "",
      })
    : [];
  const reviewAlternativeTimes =
    reviewingTaskDraft && reviewScheduleConflicts.length > 0
      ? getAlternativeStartTimes({
          ...reviewingTaskDraft,
          startDate: reviewingTaskDraft.startDate || reviewingTaskDraft.deadline || "",
          deadline: reviewingTaskDraft.deadline || reviewingTaskDraft.startDate || "",
        })
      : [];
  const quickReviewPrompts = [
    {
      label: "Chi tiết checklist",
      instruction: "chia checklist chi tiết hơn, rõ từng bước cần làm",
    },
    {
      label: "Tối ưu lịch",
      instruction: "tối ưu lịch làm task này, chọn giờ hợp lý và tránh trùng lịch",
    },
    {
      label: "Mô tả rõ hơn",
      instruction: "viết mô tả rõ hơn, giữ tên task ngắn và đưa bối cảnh vào mô tả",
    },
    {
      label: "Ưu tiên cao",
      instruction: "đổi task này thành ưu tiên cao và giải thích trong mô tả vì sao cần làm sớm",
    },
  ];

  const renderCalendarPlanPreview = (item) => {
    const calendarPlan = item.calendarPlan;
    const structuredAction = Array.isArray(item.structuredActions)
      ? item.structuredActions.find((action) => action?.type === "CREATE_CALENDAR_EVENTS")
      : null;
    const events = Array.isArray(calendarPlan?.events)
      ? calendarPlan.events
      : Array.isArray(structuredAction?.payload?.events)
        ? structuredAction.payload.events
        : [];

    if (events.length === 0) {
      return null;
    }

    const conflicts = Array.isArray(calendarPlan?.conflicts)
      ? calendarPlan.conflicts
      : Array.isArray(structuredAction?.conflicts)
        ? structuredAction.conflicts
        : [];
    const warnings = Array.isArray(calendarPlan?.warnings)
      ? calendarPlan.warnings
      : Array.isArray(structuredAction?.warnings)
        ? structuredAction.warnings
        : [];
    const toolStatuses = Array.isArray(item.structuredActions)
      ? item.structuredActions
          .filter((action) =>
            [
              "GET_CALENDAR_EVENTS",
              "FIND_FREE_TIME",
              "CREATE_STUDY_PLAN",
              "CREATE_CALENDAR_EVENTS",
            ].includes(action?.type)
          )
          .map((action) => ({
            type: action.type,
            status: action.status || "pending",
          }))
      : [];
    const statusLabel = {
      GET_CALENDAR_EVENTS: "Kiểm tra lịch",
      FIND_FREE_TIME: "Tìm giờ rảnh",
      CREATE_STUDY_PLAN: "Tạo kế hoạch",
      CREATE_CALENDAR_EVENTS: "Tạo sự kiện",
    };

    return (
      <div className="mt-3 rounded-2xl border border-pink-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <CalendarDays size={16} className="text-pink-500" />
              <span>Kế hoạch Calendar nháp</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {events.length} lịch • {calendarPlan?.timezone || "Asia/Ho_Chi_Minh"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">
            <Repeat size={13} />
            Chờ xác nhận
          </span>
        </div>

        {toolStatuses.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {toolStatuses.map((status) => (
              <span
                key={status.type}
                className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600"
              >
                {statusLabel[status.type] || status.type}:{" "}
                {status.status === "completed"
                  ? "xong"
                  : status.status === "needs_confirmation"
                    ? "chờ xác nhận"
                    : status.status}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {events.slice(0, 4).map((event, index) => {
            const startText = String(event.start || "").replace("T", " ").slice(0, 16);
            const repeatText = event.recurrence?.frequency
              ? ` • ${event.recurrence.frequency.toLowerCase()}`
              : "";

            return (
              <div
                key={`${event.title || "calendar-event"}-${index}`}
                className="rounded-xl bg-pink-50 px-3 py-2 text-sm text-gray-700"
              >
                <p className="line-clamp-1 font-semibold text-gray-900">
                  {fixMojibake(event.title || "Lịch nháp")}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {startText}{repeatText}
                </p>
              </div>
            );
          })}
          {events.length > 4 && (
            <p className="text-xs font-medium text-gray-500">
              Và {events.length - 4} lịch khác trong kế hoạch.
            </p>
          )}
        </div>

        {(conflicts.length > 0 || warnings.length > 0) && (
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {conflicts.length > 0 && <p>Có {conflicts.length} xung đột cần kiểm tra.</p>}
            {warnings.slice(0, 2).map((warning, index) => (
              <p key={`${warning.message || "warning"}-${index}`}>
                {warning.message || warning}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderFormattedMessage = (content, role) => {
    const text = fixMojibake(content || "");

    if (role === "user") {
      return text;
    }

    return text
      .split(/\n/)
      .map((rawLine, index) => {
        const line = rawLine.trim();

        if (!line) {
          return <div key={`gap-${index}`} className="h-2" />;
        }

        const heading = line.match(/^#{1,3}\s+(.+)/);
        if (heading || /^[^:]{3,64}:$/.test(line)) {
          return (
            <p key={index} className="mt-2 first:mt-0 font-bold text-gray-900">
              {heading ? heading[1] : line}
            </p>
          );
        }

        const checklist = line.match(/^\[\s?([xX]?)\]\s+(.+)/);
        if (checklist) {
          return (
            <div key={index} className="mt-1.5 flex items-start gap-2">
              <span
                className={`mt-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  checklist[1]
                    ? "border-pink-500 bg-pink-500 text-white"
                    : "border-pink-200 bg-white"
                }`}
              >
                {checklist[1] ? "✓" : ""}
              </span>
              <span>{checklist[2]}</span>
            </div>
          );
        }

        const bullet = line.match(/^[-*•]\s+(.+)/);
        if (bullet) {
          return (
            <div key={index} className="mt-1.5 flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-pink-400" />
              <span>{bullet[1]}</span>
            </div>
          );
        }

        const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
        if (numbered) {
          return (
            <div key={index} className="mt-1.5 flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-pink-50 px-2 text-xs font-bold text-pink-600">
                {numbered[1]}
              </span>
              <span>{numbered[2]}</span>
            </div>
          );
        }

        return (
          <p key={index} className="mt-2 first:mt-0">
            {line}
          </p>
        );
      });
  };

  return (
    <>
    <div className="h-full min-h-[520px] bg-white border border-pink-100 rounded-3xl overflow-hidden flex flex-col">
      <div className="px-7 py-5 border-b border-pink-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-pink-500 text-white flex items-center justify-center flex-shrink-0">
            <Bot size={24} />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-bold">
              TamCam AI
            </h1>

            <p className="text-sm text-gray-500 truncate">
              {loadingTasks
                ? "Đang đọc dữ liệu công việc..."
                : `Đã kết nối ${tasks.length} task`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleClearChatHistory}
            className="h-11 w-11 rounded-xl border border-pink-100 text-gray-500 hover:bg-pink-50 hover:text-pink-600 flex items-center justify-center transition"
            title="Xóa lịch sử chat và tài liệu đã lưu tạm"
          >
            <Trash2 size={17} />
          </button>

          <button
            type="button"
            onClick={handleNewConversation}
            className="h-11 px-4 rounded-xl border border-pink-200 text-pink-600 hover:bg-pink-50 font-semibold flex items-center gap-2 transition"
          >
            <Plus size={18} />
            Chat mới
          </button>
        </div>
      </div>

      {conversations.length > 0 && (
        <div className="px-5 py-3 border-b border-pink-100 bg-white flex gap-2 overflow-x-auto">
          {conversations.slice(0, 8).map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => handleSelectConversation(conversation)}
              className={`h-9 max-w-[220px] px-3 rounded-xl text-sm truncate border transition ${
                conversation.id === activeConversationId
                  ? "bg-pink-500 border-pink-500 text-white"
                  : "bg-white border-pink-100 text-gray-600 hover:bg-pink-50"
              }`}
              title={conversation.title || "Chat mới"}
            >
              {conversation.title || "Chat mới"}
            </button>
          ))}
        </div>
      )}

      {aiCloudStatus && !aiCloudStatus.ok && (
        <div className="mx-5 mt-4 flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">AI cloud chưa sẵn sàng</p>
            <p className="mt-1">{getAiCloudStatusMessage(aiCloudStatus)}</p>
            {aiCloudStatus.message && (
              <p className="mt-1 break-words text-xs text-amber-600">
                Chi tiết: {aiCloudStatus.message}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-7 space-y-5 bg-[#FFF9FB]">
        {messages.map((item) => (
          <div
            key={item.id}
            className={`flex gap-3 ${
              item.role === "user"
                ? "justify-end"
                : "justify-start"
            }`}
          >
            {item.role === "assistant" && (
              <div className="w-9 h-9 rounded-xl bg-pink-500 text-white flex items-center justify-center flex-shrink-0">
                <Bot size={18} />
              </div>
            )}

            <div className="min-w-0 max-w-[min(76%,760px)]">
              <div
                className={`
                  px-5
                  py-4
                  rounded-2xl
                  whitespace-pre-line
                  break-words
                  leading-7
                  ${
                    item.role === "user"
                      ? "bg-pink-500 text-white rounded-br-md"
                      : "bg-white border border-pink-100 text-gray-700 rounded-bl-md"
                  }
                `}
              >
                {renderFormattedMessage(item.content, item.role)}
              </div>

              {item.role === "assistant" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  {getAssistantTraceLabel(item) && (
                    <span
                      className="max-w-full truncate rounded-full border border-pink-100 bg-white px-2 py-1"
                      title={getAssistantTraceLabel(item)}
                    >
                      {getAssistantTraceLabel(item)}
                    </span>
                  )}
                  {Array.isArray(item.sources) && item.sources.length > 0 && (
                    <span className="rounded-full border border-pink-100 bg-white px-2 py-1">
                      {item.sources.length} nguồn
                    </span>
                  )}
                  <span>Phản hồi</span>
                  <button
                    type="button"
                    onClick={() => handleAssistantFeedback(item, "up")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                      feedbackByMessageId[item.id] === "up"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-pink-100 bg-white text-gray-400 hover:text-emerald-600"
                    }`}
                    title="Câu trả lời hữu ích"
                  >
                    <ThumbsUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAssistantFeedback(item, "down")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                      feedbackByMessageId[item.id] === "down"
                        ? "border-rose-200 bg-rose-50 text-rose-600"
                        : "border-pink-100 bg-white text-gray-400 hover:text-rose-600"
                    }`}
                    title="Câu trả lời chưa đúng ý"
                  >
                    <ThumbsDown size={14} />
                  </button>
                </div>
              )}

              {item.role === "assistant" && renderCalendarPlanPreview(item)}

              {item.role === "assistant" &&
                Array.isArray(item.suggestedTasks) &&
                item.suggestedTasks.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {item.suggestedTasks.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-pink-100 bg-pink-50 px-4 py-3">
                        <span className="text-sm font-medium text-gray-700">
                          {item.suggestedTasks.length} task gợi ý từ TamCam AI
                        </span>
                        <button
                          type="button"
                          onClick={() => openTaskDraftReviewQueue(item.suggestedTasks)}
                          className="inline-flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-600 transition"
                        >
                          <Plus size={15} />
                          Duyệt tất cả
                        </button>
                      </div>
                    )}
                    {item.suggestedTasks.map((taskDraft, index) => {
                      const draftHealth = getTaskDraftHealth(taskDraft);
                      const previewSteps = draftHealth.checklist.slice(0, 3);

                      return (
                        <div
                          key={`${taskDraft.title || "task"}-${index}`}
                          className="rounded-2xl border border-pink-100 bg-white px-4 py-3 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p
                                className="task-title font-semibold text-gray-900"
                                title={taskDraft.title || "Task gợi ý"}
                              >
                                {taskDraft.title || "Task gợi ý"}
                              </p>
                              <p className="text-sm text-gray-500 mt-1">
                                {(taskDraft.deadline || taskDraft.startDate || "Chưa có ngày")}{" "}
                                {taskDraft.startTime ? `• ${taskDraft.startTime}` : ""}
                                {" "}
                                • {taskDraft.priority || "Trung bình"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                draftHealth.warnings.length === 0
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {draftHealth.warnings.length === 0 ? "Sẵn sàng" : "Cần duyệt"}
                            </span>
                          </div>

                          {taskDraft.description && (
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">
                              {taskDraft.description}
                            </p>
                          )}

                          {previewSteps.length > 0 && (
                            <ul className="mt-2 space-y-1 rounded-xl bg-pink-50 px-3 py-2 text-sm text-gray-600">
                              {previewSteps.map((step, stepIndex) => (
                                <li key={`${step}-${stepIndex}`} className="line-clamp-1">
                                  - {step}
                                </li>
                              ))}
                            </ul>
                          )}

                          {draftHealth.warnings.length > 0 && (
                            <p className="mt-2 text-xs font-medium text-amber-700">
                              {draftHealth.warnings.slice(0, 2).join(" • ")}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => openTaskDraftReview(taskDraft, index)}
                            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-600 transition"
                          >
                            <Plus size={15} />
                            Xem/sửa rồi tạo
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>

            {item.role === "user" && (
              <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
                <User size={18} />
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-5 border-t border-pink-100 bg-white">
        <div className="flex items-end gap-3 border border-pink-200 rounded-2xl p-3 focus-within:border-pink-400">
          <input
            ref={chatFileInputRef}
            type="file"
            className="hidden"
            onChange={handleChatFileUpload}
          />

          <button
            type="button"
            onClick={() => chatFileInputRef.current?.click()}
            disabled={uploadingChatFile}
            className="w-11 h-11 rounded-xl border border-pink-200 text-pink-500 hover:bg-pink-50 flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Upload tài liệu để TamCam AI phân tích"
          >
            <Upload size={19} />
          </button>

          <textarea
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder="Hỏi TamCam AI về công việc của bạn..."
            rows={1}
            className="flex-1 resize-none outline-none px-2 py-2 max-h-32"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={
              !message.trim()
            }
            className="w-11 h-11 rounded-xl bg-pink-500 hover:bg-pink-600 text-white flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={19} />
          </button>
        </div>

        {uploadingChatFile && (
          <p className="text-sm text-pink-500 mt-2">
            TamCam AI đang đọc và phân tích file...
          </p>
        )}
      </div>
    </div>
    {createdTaskPreview && (
      <div className="fixed bottom-6 right-6 z-40 w-[min(420px,calc(100vw-32px))] rounded-3xl border border-pink-100 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-pink-600">
              Task vừa được tạo
            </p>
            <h3 className="mt-1 line-clamp-2 font-bold text-gray-900">
              {createdTaskPreview.task.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setCreatedTaskPreview(null)}
            className="h-9 w-9 rounded-xl border border-pink-100 text-gray-500 hover:bg-pink-50"
            title="Đóng preview"
          >
            x
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-500">
          {formatTaskSchedule(createdTaskPreview.task)} • {createdTaskPreview.task.priority || "Trung bình"}
        </p>

        {createdTaskPreview.task.description && (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-700">
            {createdTaskPreview.task.description}
          </p>
        )}

        {Array.isArray(createdTaskPreview.task.checklist) &&
          createdTaskPreview.task.checklist.length > 0 && (
            <div className="mt-3 rounded-2xl bg-pink-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-700">
                Checklist
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {createdTaskPreview.task.checklist.slice(0, 3).map((step) => (
                  <li key={step.id || step.title}>
                    - {step.title || step}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {createdTaskPreview.conflicts?.length > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Có trùng lịch với {createdTaskPreview.conflicts.length} task khác.
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              window.location.href = `/tasks?highlightTaskId=${createdTaskPreview.task.id}`;
            }}
            className="rounded-2xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-600"
          >
            Xem trong Tasks
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = `/calendar?highlightTaskId=${createdTaskPreview.task.id}`;
            }}
            className="rounded-2xl border border-pink-100 px-4 py-2 text-sm font-semibold text-pink-600 hover:bg-pink-50"
          >
            Xem lịch
          </button>
        </div>
      </div>
    )}
    {reviewingTaskDraft && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-pink-100 bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-pink-100 bg-white px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Duyệt task trước khi tạo
              </h2>
              <p className="text-sm text-gray-500">
                {reviewTaskQueue.length > 0
                  ? `Task ${reviewTaskQueueIndex + 1}/${reviewTaskQueue.length}. Bạn có thể sửa, tạo hoặc bỏ qua rồi chuyển sang task kế tiếp.`
                  : "Bạn có thể sửa lại nội dung AI đề xuất trước khi lưu vào Task List/Calendar."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {reviewTaskHistory.length > 0 && (
                <button
                  type="button"
                  onClick={undoReviewingTaskChange}
                  className="h-10 rounded-xl border border-pink-100 px-3 text-sm font-semibold text-pink-600 hover:bg-pink-50"
                >
                  Hoàn tác
                </button>
              )}
              <button
                type="button"
                onClick={closeTaskDraftReview}
                className="h-10 w-10 rounded-xl border border-pink-100 text-gray-500 hover:bg-pink-50"
                title="Đóng"
              >
                x
              </button>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">
                Tên task
              </span>
              <input
                value={reviewingTaskDraft.title}
                onChange={(event) =>
                  updateReviewingTaskField("title", event.target.value)
                }
                className="mt-2 w-full rounded-2xl border border-pink-100 px-4 py-3 outline-none focus:border-pink-400"
                maxLength={90}
              />
            </label>

            {getTaskDraftHealth(reviewingTaskDraft).warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Cần kiểm tra trước khi tạo</p>
                <ul className="mt-2 space-y-1">
                  {getTaskDraftHealth(reviewingTaskDraft).warnings.map((warning) => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">
                Mô tả công việc
              </span>
              <textarea
                value={reviewingTaskDraft.description}
                onChange={(event) =>
                  updateReviewingTaskField("description", event.target.value)
                }
                rows={4}
                className="mt-2 w-full resize-none rounded-2xl border border-pink-100 px-4 py-3 outline-none focus:border-pink-400"
              />
            </label>

            <div className="rounded-2xl border border-pink-100 bg-pink-50 px-4 py-3">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Nhờ TamCam chỉnh nhanh
                </span>
                <div className="mt-2 flex flex-col gap-2 md:flex-row">
                  <input
                    value={reviewTaskInstruction}
                    onChange={(event) =>
                      setReviewTaskInstruction(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyReviewTaskInstruction();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-4 py-3 outline-none focus:border-pink-400"
                    placeholder='Ví dụ: "đổi sang sáng mai", "ưu tiên cao", "chia checklist chi tiết hơn"'
                  />
                  <button
                    type="button"
                    onClick={() => applyReviewTaskInstruction()}
                    disabled={rewritingTaskDraft}
                    className="rounded-2xl bg-pink-500 px-5 py-3 font-semibold text-white hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {rewritingTaskDraft ? "Đang chỉnh..." : "Áp dụng"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickReviewPrompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => applyReviewTaskInstruction(prompt.instruction)}
                      disabled={rewritingTaskDraft}
                      className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm font-semibold text-pink-600 hover:bg-pink-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Ngày
                </span>
                <input
                  type="date"
                  value={reviewingTaskDraft.deadline || reviewingTaskDraft.startDate || ""}
                  onChange={(event) => {
                    updateReviewingTaskField("deadline", event.target.value);
                    updateReviewingTaskField("startDate", event.target.value);
                  }}
                  className="mt-2 w-full rounded-2xl border border-pink-100 px-4 py-3 outline-none focus:border-pink-400"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Giờ bắt đầu
                </span>
                <input
                  type="time"
                  value={reviewingTaskDraft.startTime || ""}
                  onChange={(event) =>
                    updateReviewingTaskField("startTime", event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-pink-100 px-4 py-3 outline-none focus:border-pink-400"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Ưu tiên
                </span>
                <select
                  value={reviewingTaskDraft.priority || "Trung bình"}
                  onChange={(event) =>
                    updateReviewingTaskField("priority", event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-pink-100 px-4 py-3 outline-none focus:border-pink-400"
                >
                  <option>Thấp</option>
                  <option>Trung bình</option>
                  <option>Cao</option>
                </select>
              </label>
            </div>

            {reviewScheduleConflicts.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">
                  Lịch này đang bị trùng
                </p>
                <div className="mt-2 space-y-1">
                  {reviewScheduleConflicts.map((task) => (
                    <p key={task.id || task.title}>
                      {task.title || "Task khác"} - {formatTaskSchedule(task)}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-amber-800">
                  Bạn có thể đổi ngày hoặc giờ trước khi tạo task này.
                </p>
                {reviewAlternativeTimes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reviewAlternativeTimes.map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => {
                          const currentRange = getTaskTimeRange(reviewingTaskDraft);
                          const duration = currentRange
                            ? Math.max(30, Math.min(180, currentRange.end - currentRange.start))
                            : 60;

                          updateReviewingTaskField("startTime", time, true);
                          updateReviewingTaskField("endTime", addMinutesToTime(time, duration));
                        }}
                        className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                      >
                        Dùng {time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-700">
                  Checklist
                </span>
                <button
                  type="button"
                  onClick={addReviewingTaskStep}
                  className="rounded-xl border border-pink-100 px-3 py-2 text-sm font-semibold text-pink-600 hover:bg-pink-50"
                >
                  Thêm bước
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {(reviewingTaskDraft.suggestedSteps || [""]).map((step, index) => (
                  <div key={`review-step-${index}`} className="flex gap-2">
                    <input
                      value={step}
                      onChange={(event) =>
                        updateReviewingTaskStep(index, event.target.value)
                      }
                      className="min-w-0 flex-1 rounded-2xl border border-pink-100 px-4 py-3 outline-none focus:border-pink-400"
                      placeholder={`Bước ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeReviewingTaskStep(index)}
                      className="h-12 w-12 rounded-2xl border border-pink-100 text-gray-500 hover:bg-pink-50"
                      title="Xóa bước"
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-pink-100 px-6 py-4">
            <button
              type="button"
              onClick={closeTaskDraftReview}
              className="rounded-2xl border border-pink-100 px-5 py-3 font-semibold text-gray-600 hover:bg-pink-50"
            >
              Hủy
            </button>
            {reviewTaskQueue.length > 0 && (
              <button
                type="button"
                onClick={handleSkipReviewedTask}
                className="rounded-2xl border border-pink-100 px-5 py-3 font-semibold text-pink-600 hover:bg-pink-50"
              >
                Bỏ qua task này
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirmReviewedTask}
              disabled={!getTaskDraftHealth(reviewingTaskDraft).canCreate}
              className="rounded-2xl bg-pink-500 px-5 py-3 font-semibold text-white hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reviewTaskQueue.length > 0 &&
              reviewTaskQueueIndex < reviewTaskQueue.length - 1
                ? "Tạo và tiếp tục"
                : "Tạo task"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default Chat;
