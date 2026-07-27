import os
import re
import json
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from email import message
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.data_analysis_agent import run_data_analysis_agent
from services.task_scoring import (
    rank_tasks,
    explain_task_score,
)

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_CHAT_MODEL = os.getenv(
    "GEMINI_CHAT_MODEL",
    os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
)
GEMINI_REASONING_MODEL = os.getenv("GEMINI_REASONING_MODEL", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", GEMINI_CHAT_MODEL)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
GROQ_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv(
        "GROQ_FALLBACK_MODELS",
        "",
    ).split(",")
    if model.strip()
]
AI_PROVIDER = os.getenv(
    "AI_PROVIDER",
    "groq" if GROQ_API_KEY else "gemini",
).lower().strip()
CLIENT_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CLIENT_ORIGINS",
        "http://localhost:5173,http://localhost:5175",
    ).split(",")
    if origin.strip()
]


class AITextResponse:
    def __init__(self, text: str):
        self.text = text


class GroqChatModel:
    def __init__(self, api_key: str, model: str, fallback_models=None):
        self.api_key = api_key
        self.model = model
        self.fallback_models = [
            fallback_model
            for fallback_model in (fallback_models or [])
            if fallback_model and fallback_model != model
        ]
        self.last_used_model = model
        self.endpoint = "https://api.groq.com/openai/v1/chat/completions"

    def generate_content_with_model(self, prompt: str, model: str):
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "temperature": 0.2,
            "max_completion_tokens": 2048,
            "top_p": 1,
            "reasoning_effort": "medium",
            "stream": False,
        }
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "TamCamAI-Web/1.0 (+https://tamcam---ai.web.app)",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Groq HTTP {error.code}: {error_body}") from error

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("Groq returned no choices")

        content = choices[0].get("message", {}).get("content") or ""
        self.last_used_model = model
        return AITextResponse(str(content).strip())

    def generate_content(self, prompt: str):
        errors = []

        for model in [self.model, *self.fallback_models]:
            try:
                return self.generate_content_with_model(prompt, model)
            except Exception as error:
                errors.append(f"{model}: {error}")

        raise RuntimeError("All Groq models failed: " + " | ".join(errors))


def create_ai_model():
    if AI_PROVIDER == "groq":
        if not GROQ_API_KEY:
            print("GROQ_API_KEY is not configured. AI calls will use local fallback.")
            return None

        return GroqChatModel(GROQ_API_KEY, GROQ_MODEL, GROQ_FALLBACK_MODELS)

    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        return genai.GenerativeModel(GEMINI_CHAT_MODEL)

    print("GEMINI_API_KEY is not configured. Gemini calls will use local fallback.")
    return None


gemini_model = create_ai_model()
groq_fallback_model = (
    GroqChatModel(GROQ_API_KEY, GROQ_MODEL, GROQ_FALLBACK_MODELS)
    if GROQ_API_KEY and AI_PROVIDER != "groq"
    else None
)


def get_active_model_name():
    if AI_PROVIDER == "groq" and gemini_model is not None:
        return getattr(gemini_model, "last_used_model", GROQ_MODEL)

    return GROQ_MODEL if AI_PROVIDER == "groq" else GEMINI_CHAT_MODEL


def is_active_key_configured():
    return bool(GROQ_API_KEY) if AI_PROVIDER == "groq" else bool(GEMINI_API_KEY)


def is_complex_chat_request(message: str, relevant_context=None):
    text = normalize_grounding_text(message)
    context_count = len(relevant_context or [])
    complex_terms = [
        "phan tich",
        "du bao",
        "predict",
        "forecast",
        "workflow",
        "lap ke hoach",
        "chien luoc",
        "so sanh",
        "rui ro",
        "bat thuong",
        "insight",
        "bao cao",
        "chia nho",
        "de xuat",
        "toi can lam gi",
    ]

    return context_count > 0 or any(term in text for term in complex_terms)


def get_chat_generation_model(message: str, relevant_context=None):
    if AI_PROVIDER == "gemini" and GEMINI_API_KEY:
        model_name = (
            GEMINI_REASONING_MODEL
            if GEMINI_REASONING_MODEL and is_complex_chat_request(message, relevant_context)
            else GEMINI_CHAT_MODEL
        )
        genai.configure(api_key=GEMINI_API_KEY)
        return genai.GenerativeModel(model_name), "gemini", model_name

    if AI_PROVIDER == "groq" and gemini_model is not None:
        return gemini_model, "groq", get_active_model_name()

    if groq_fallback_model is not None:
        return groq_fallback_model, "groq", GROQ_MODEL

    return gemini_model, AI_PROVIDER, get_active_model_name()


app = FastAPI(
    title="TamCam AI Service",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CLIENT_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    conversationId: str = ""
    userId: str = ""
    tasks: list[dict[str, Any]] = []
    documents: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []
    relevantContext: list[dict[str, Any]] = []
    feedbackMemory: str = ""
    qLearningPolicy: str = ""
    conversationSummary: dict[str, Any] | str | None = None
    userProfile: dict[str, Any] = {}


class DocumentAnalysisRequest(BaseModel):
    text: str
    file_name: str = ""
    data_insights: dict[str, Any] | None = None


class TaskRewriteRequest(BaseModel):
    instruction: str
    taskDraft: dict[str, Any]
    documents: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []


class ExtractedTask(BaseModel):
    title: str
    description: str = ""
    category: str = "General"
    type: str = "Task"
    domain: str = "General"
    difficulty: str = "Dễ"
    necessity: str = "Trung bình"
    priority: str = "Trung bình"
    startDate: str = ""
    deadline: str = ""
    startTime: str = ""
    endTime: str = ""
    estimate: str = "Chọn thời gian"
    reminder: str = "Không nhắc"
    assignee: str = "Tôi"
    status: str = "To do"
    completed: bool = False
    suggestedSteps: list[str] = []


class DocumentAnalysisResponse(BaseModel):
    success: bool
    documentType: str
    documentPurpose: str
    isActionable: bool = False
    documentSummary: str = ""
    tasks: list[ExtractedTask]
    dataAnalysis: dict[str, Any] | None = None
    summary: str = ""
    insights: list[Any] = []
    anomalies: list[Any] = []
    predictions: list[Any] = []
    chartSuggestions: list[Any] = []
    recommendedActions: list[Any] = []
    suggestedTasks: list[ExtractedTask] = []


def detect_intent(message: str):
    message = message.lower().strip()

    priority_keywords = [
        "nên làm gì",
        "làm gì trước",
        "việc nào trước",
        "ưu tiên việc nào",
        "nên làm task nào",
        "bắt đầu từ đâu",
        "việc gì quan trọng",
    ]

    count_keywords = [
        "bao nhiêu công việc",
        "bao nhiêu task",
        "có mấy công việc",
        "có mấy task",
    ]

    deadline_keywords = [
        "deadline gần nhất",
        "gần deadline nhất",
        "sắp tới hạn",
        "sắp đến hạn",
        "deadline sắp tới",
        "hạn gần nhất",
        "việc nào gần deadline",
    ]

    greeting_keywords = [
        "hi",
        "hello",
        "xin chào",
        "chào",
        "hey",
    ]

    task_action_keywords = [
        "có cuộc họp",
        "có họp",
        "thêm công việc",
        "thêm task",
        "tạo công việc",
        "tạo task",
        "nhắc tôi",
        "nhắc tui",
        "cần làm",
        "phải làm",
        "có bài",
        "có deadline",
    ]

    time_keywords = [
        "hôm nay",
        "ngày mai",
        "mai",
        "ngày kia",
        "tuần sau",
        "tuần tới",
    ]

    date_query_keywords = [
        "hôm nay",
        "ngày mai",
        "mai",
        "ngày kia",
        "tuần này",
        "tuần sau",
        "tuần tới",
        "lịch hôm nay",
        "lịch tuần này",
        "lịch tuần sau",
        "ngày",
        "tháng",
    ]

    update_task_keywords = [
          "đổi",
          "dời",
          "chuyển",
          "sửa",
          "cập nhật",
          "thay đổi",
     ]
    delete_task_keywords = [
          "xóa task",
          "xóa công việc",
          "xóa cuộc họp",
          "xóa bỏ",
          "bỏ task",
          "bỏ công việc",
          "hủy task",
          "hủy công việc",
          "hủy cuộc họp",
     ]
    reopen_task_keywords = [
        "chưa hoàn thành",
        "đánh dấu chưa hoàn thành",
        "đánh dấu là chưa hoàn thành",
        "chuyển về chưa hoàn thành",
        "mở lại task",
        "mở lại công việc",
        "làm lại task",
        "chưa xong",
    ]
    complete_task_keywords = [
        "đánh dấu",
        "hoàn thành",
        "đã hoàn thành",
        "hoàn thành rồi",
        "làm xong",
        "xong task",
        "xong công việc",
        "đã xong",
    ]
    progress_keywords = [
        "tiến độ",
        "được bao nhiêu phần trăm",
        "hoàn thành bao nhiêu",
        "làm tới đâu",
        "xong bao nhiêu",
    ]
    overview_keywords = [
        "công việc của tôi thế nào",
        "công việc của tui thế nào",
        "tình hình công việc",
        "tổng quan công việc",
        "tổng quan task",
        "đánh giá công việc",
        "công việc hiện tại",
        "task hiện tại",
    ]
    checklist_keywords = [
        "tạo checklist",
        "tạo các bước",
        "gợi ý các bước",
        "các bước cần làm",
        "lập kế hoạch",
        "chia nhỏ công việc",
    ]

    if any(
        keyword in message
        for keyword in priority_keywords
    ):
        return "TASK_PRIORITY"

    if any(
        keyword in message
        for keyword in count_keywords
    ):
        return "TASK_COUNT"

    task_question_keywords = [
        "tôi cần làm gì",
        "mình cần làm gì",
        "cần làm gì",
        "nên làm gì",
        "việc gì",
        "task nào",
        "làm gì trước",
    ]

    is_task_question = any(
        keyword in message
        for keyword in task_question_keywords
    )

    if is_task_question:
        if any(keyword in message for keyword in time_keywords):
            return "DATE_QUERY"
        return "TASK_PRIORITY"

    if any(
        keyword in message
        for keyword in deadline_keywords
    ):
        return "NEAREST_DEADLINE"

    has_task_action = any(
        keyword in message
        for keyword in task_action_keywords
    )

    has_time_context = any(
        keyword in message
        for keyword in time_keywords
    )

    if has_task_action and (
        has_time_context
        or any(keyword in message for keyword in ["tạo", "thêm", "nhắc tôi", "nhắc tui", "có họp", "có cuộc họp"])
    ):
        return "CREATE_TASK"

    if any(
        keyword in message
        for keyword in update_task_keywords
    ):
        return "UPDATE_TASK"

    if any(
        keyword in message
        for keyword in delete_task_keywords
    ):
        return "DELETE_TASK"

    if any(
        keyword in message
        for keyword in reopen_task_keywords
    ):
        return "REOPEN_TASK"

    if any(
        keyword in message
        for keyword in complete_task_keywords
    ):
        return "COMPLETE_TASK"

    if any(
        keyword in message
        for keyword in overview_keywords
    ):
        return "TASK_OVERVIEW"

    if any(
        keyword in message
        for keyword in progress_keywords
    ):
        return "TASK_PROGRESS"

    if any(
        keyword in message
        for keyword in checklist_keywords
    ):
        return "GENERATE_CHECKLIST"

    if any(
        keyword in message
        for keyword in date_query_keywords
    ):
          return "DATE_QUERY"

    if message in greeting_keywords:
        return "GREETING"

    return "UNKNOWN"


def find_nearest_deadline(tasks):
    today = date.today()

    valid_tasks = []

    for task in tasks:
        deadline = task.get("deadline")

        if not deadline:
            continue

        try:
            deadline_date = datetime.strptime(
                deadline,
                "%Y-%m-%d",
            ).date()

            days_left = (
                deadline_date - today
            ).days

            if days_left >= 0:
                task_copy = task.copy()

                task_copy["daysLeft"] = days_left
                task_copy["deadlineDate"] = deadline_date

                valid_tasks.append(task_copy)

        except ValueError:
            continue

    if not valid_tasks:
        return None

    valid_tasks.sort(
        key=lambda task: task["deadlineDate"]
    )

    return valid_tasks[0]


def extract_vietnamese_date(message: str):
    match = re.search(
        r"ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})",
        message,
    )

    if not match:
        return None

    day = int(match.group(1))
    month = int(match.group(2))
    year = date.today().year

    try:
        return date(year, month, day)

    except ValueError:
        return None


def extract_task_date(message: str):
    today = date.today()
    message = message.lower().strip()

    if "hôm nay" in message:
        return today

    if (
        "ngày mai" in message
        or re.search(r"\bmai\b", message)
    ):
        return today + timedelta(days=1)

    if "ngày kia" in message:
        return today + timedelta(days=2)

    return extract_vietnamese_date(message)

def extract_task_time(message: str):
    message = message.lower().strip()

    relative_minute_match = re.search(
        r"(\d+)\s*phút\s*nữa",
        message,
    )
    if relative_minute_match:
        minutes_to_add = int(
            relative_minute_match.group(1)
        )
        future_time = (
            datetime.now()
            + timedelta(minutes=minutes_to_add)
        )
        return future_time.strftime("%H:%M")

    match = re.search(
        r"(?:lúc|vào lúc|thành|sang)?\s*"
        r"(\d{1,2})"
        r"(?:[:h]([0-5]\d))?"
        r"h?",
        message,
    )

    if not match:
        return ""

    hour = int(match.group(1))
    minute = int(match.group(2) or 0)

    if "chiều" in message or "tối" in message:
        if 1 <= hour <= 11:
            hour += 12

    if "trưa" in message and hour < 12:
        hour += 12

    if "sáng" in message and hour == 12:
        hour = 0

    if hour > 23:
        return ""

    return f"{hour:02d}:{minute:02d}"


def suggest_task_schedule(message: str):
    normalized = message.lower().strip()
    today = date.today()
    is_urgent = any(
        keyword in normalized
        for keyword in [
            "hôm nay",
            "gấp",
            "quan trọng",
            "cần gấp",
        ]
    )
    is_meeting = any(
        keyword in normalized
        for keyword in [
            "họp",
            "meeting",
            "lịch hẹn",
            "cuộc hẹn",
        ]
    )
    is_study = any(
        keyword in normalized
        for keyword in [
            "học",
            "ôn",
            "bài tập",
            "đọc tài liệu",
        ]
    )
    is_report = any(
        keyword in normalized
        for keyword in [
            "báo cáo",
            "slide",
            "thuyết trình",
        ]
    )

    suggested_date = (
        today
        if is_urgent
        else today + timedelta(days=1)
    )

    if "sáng" in normalized:
        suggested_time = "09:00"
    elif "chiều" in normalized:
        suggested_time = "14:00"
    elif is_meeting:
        suggested_time = "09:00"
    elif is_study:
        suggested_time = "19:30"
    elif is_report:
        suggested_time = "20:00"
    else:
        suggested_time = "19:00"

    reminder = (
        "Trước 10 phút"
        if is_meeting
        else "Trước 30 phút"
    )

    return suggested_date, suggested_time, reminder


def build_recurring_reminder_from_message(original_message: str):
    normalized = normalize_question_text(original_message)
    if not any(term in normalized for term in ["moi ngay", "hang ngay", "lap lai"]):
        return None

    task_time = extract_task_time(original_message)
    if not task_time:
        return None

    if any(term in normalized for term in ["cham cong", "check in", "check-in"]):
        title = "Cham cong"
        description = "Nhac cham cong hang ngay theo yeu cau trong chat."
        category = "Work"
        steps = [
            f"Nhan thong bao luc {task_time}.",
            "Mo he thong cham cong.",
            "Xac nhan da cham cong.",
        ]
    else:
        cleaned_title = re.sub(
            r"\b(tao|dat|nhac|lich|thong bao|moi ngay|hang ngay|vao luc|luc|toi phai)\b",
            " ",
            normalized,
        )
        cleaned_title = re.sub(
            r"\d{1,2}([:h]\d{0,2})?\s*(sang|chieu|toi)?",
            " ",
            cleaned_title,
        )
        title = clean_task_title(cleaned_title).capitalize() or "Nhac viec hang ngay"
        title = split_title_context(title, 6)[0] or "Nhac viec hang ngay"
        description = f"Nhac viec hang ngay theo yeu cau: {original_message}"
        category = "General"
        steps = [
            f"Nhan thong bao luc {task_time}.",
            "Thuc hien viec da nhac.",
            "Danh dau hoan thanh sau khi xong.",
        ]

    start_date = date.today().isoformat()
    task = {
        "id": f"chat-recurring-{int(datetime.now().timestamp())}",
        "title": title,
        "description": description,
        "category": category,
        "type": "Reminder",
        "domain": category,
        "difficulty": "De",
        "necessity": "Cao",
        "priority": "Trung binh",
        "startDate": start_date,
        "deadline": start_date,
        "startTime": task_time,
        "endTime": "",
        "estimate": "Chon thoi gian",
        "reminder": "Dung gio",
        "assignee": "Toi",
        "status": "To do",
        "completed": False,
        "repeat": "daily",
        "recurrence": {
            "frequency": "DAILY",
            "interval": 1,
        },
        "suggestedSteps": steps,
    }

    answer = (
        f"Minh da hieu: ban muon nhac hang ngay luc {task_time} cho viec \"{title}\".\n\n"
        "Minh da chuan bi task nhap ben duoi. Ban xem lai roi bam tao neu dung nhe."
    )

    return {
        "success": True,
        "intent": "CREATE_TASK_DRAFT",
        "answer": answer,
        "reply": answer,
        "confidenceLevel": "HIGH",
        "requiresClarification": False,
        "clarificationQuestion": "",
        "requiresConfirmation": True,
        "sources": [],
        "suggestedActions": [
            {
                "type": "CREATE_TASK_DRAFT",
                "label": "Tao lich nhac hang ngay",
            }
        ],
        "suggestedTasks": [task],
        "memoryCandidates": [
            {
                "type": "preference",
                "text": f"Nguoi dung muon duoc nhac hang ngay luc {task_time} cho viec {title}.",
            }
        ],
        "metadata": {
            "provider": "local-guard",
            "model": "recurring-reminder-parser",
            "repeat": "daily",
        },
    }


def build_history_context(history):
    if not history:
        return "Chưa có lịch sử chat trong request này."

    lines = []

    for item in history[-8:]:
        role = "Người dùng" if item.get("role") == "user" else "TamCam AI"
        content = str(item.get("content") or "").replace("\n", " ").strip()

        if content:
            lines.append(f"{role}: {content[:1000]}")

    return "\n".join(lines) or "Chưa có lịch sử chat rõ ràng."


def build_relevant_context(relevant_context):
    if not relevant_context:
        return "Chưa có đoạn tài liệu liên quan được truy hồi."

    lines = []

    for index, item in enumerate(relevant_context[:6], start=1):
        if not isinstance(item, dict):
            continue

        file_name = str(item.get("fileName") or "Tài liệu").strip()
        text = str(item.get("text") or item.get("content") or "").replace("\n", " ").strip()
        score = item.get("score")

        if not text:
            continue

        score_text = f" | score: {score}" if score is not None else ""
        lines.append(f"{index}. {file_name}{score_text}: {text[:1400]}")

    return "\n".join(lines) or "Chưa có đoạn tài liệu liên quan được truy hồi."


def normalize_grounding_text(text):
    return (
        str(text or "")
        .lower()
        .replace("đ", "d")
        .replace("Đ", "d")
    )


def extract_critical_facts(text):
    raw_text = str(text or "")
    patterns = [
        r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b",
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\b\d{1,2}:\d{2}\b",
        r"\b\d+(?:[.,]\d+)?\s*%",
        r"\b\d+(?:[.,]\d+)?\s*(?:vnd|đ|dong|triệu|trieu|tỷ|ty)\b",
        r"\b\d+(?:[.,]\d+)?\s*(?:ngày|ngay|giờ|gio|phút|phut|task|đơn|don|hồ sơ|ho so)\b",
    ]
    facts = []
    for pattern in patterns:
        facts.extend(re.findall(pattern, raw_text, flags=re.IGNORECASE))
    return list(dict.fromkeys(fact.strip() for fact in facts if fact.strip()))


def answer_has_unsupported_critical_facts(answer, relevant_context):
    evidence_text = " ".join(
        str(item.get("text") or item.get("content") or "")
        for item in relevant_context
        if isinstance(item, dict)
    )
    normalized_evidence = normalize_grounding_text(evidence_text)
    unsupported = []
    for fact in extract_critical_facts(answer):
        if normalize_grounding_text(fact) not in normalized_evidence:
            unsupported.append(fact)
    return unsupported


def build_document_qa_prompt_rules():
    return """
DOCUMENT QA / RAG V2 RULES:
- Nếu người dùng hỏi về tài liệu, chỉ trả lời dựa trên ĐOẠN TÀI LIỆU LIÊN QUAN ĐƯỢC TRUY HỒI.
- Trả lời trực tiếp câu hỏi trước, không liệt kê evidence máy móc.
- Tổng hợp nhiều evidence nếu câu hỏi cần nhiều ý.
- Không thêm fact ngoài evidence.
- Giữ nguyên ngày, giờ, số tiền, phần trăm, số lượng, tên trường dữ liệu nếu evidence có.
- Nếu evidence không đủ, nói rõ phần nào chưa xác định được.
- Không tự tạo task nếu người dùng chỉ hỏi thông tin.
- Không tự thêm workflow nếu người dùng không hỏi workflow.

STYLE THEO DOCUMENT INTENT:
- FACT_LOOKUP: trả lời ngắn, trực tiếp.
- MULTI_FACT_SYNTHESIS: tổng hợp 2-5 ý chính.
- TASK_LOOKUP: nêu việc cần làm, người/bộ phận phụ trách nếu có, deadline nếu có.
- DEADLINE_LOOKUP: nêu deadline chính xác; nếu nhiều deadline thì phân biệt từng mốc.
- WORKFLOW_EXPLANATION: giải thích theo thứ tự bước.
- CAUSE_ANALYSIS: tách quan sát, nguyên nhân tài liệu nêu, điều chưa thể kết luận.
- COMPARISON: chỉ so sánh cùng metric.
- RECOMMENDATION: tách bằng chứng, ưu tiên, hành động đề xuất.
"""


def infer_document_qa_intent(message):
    normalized = normalize_grounding_text(message)
    if any(term in normalized for term in ["deadline", "han", "hieu luc", "moc thoi gian"]):
        return "DEADLINE_LOOKUP"
    if any(term in normalized for term in ["can lam gi", "viec can lam", "nhiem vu", "task"]):
        return "TASK_LOOKUP"
    if any(term in normalized for term in ["quy trinh", "workflow", "cac buoc", "lam nhu the nao"]):
        return "WORKFLOW_EXPLANATION"
    if any(term in normalized for term in ["vi sao", "tai sao", "nguyen nhan", "do dau"]):
        return "CAUSE_ANALYSIS"
    if any(term in normalized for term in ["so sanh", "khac nhau", "chenh lech"]):
        return "COMPARISON"
    if any(term in normalized for term in ["nen", "uu tien", "de xuat", "khuyen nghi"]):
        return "RECOMMENDATION"
    if any(term in normalized for term in ["file nay", "tai lieu nay", "noi dung", "tom tat", "noi ve gi"]):
        return "DOCUMENT_OVERVIEW"
    return "FACT_LOOKUP"


def build_local_document_qa_fallback(message, relevant_context):
    evidence_items = [
        str(item.get("text") or item.get("content") or "").replace("\n", " ").strip()
        for item in relevant_context[:6]
        if isinstance(item, dict) and str(item.get("text") or item.get("content") or "").strip()
    ]
    if not evidence_items:
        return "Mình chưa tìm thấy đủ thông tin trong tài liệu để kết luận chính xác."

    intent = infer_document_qa_intent(message)
    if intent == "FACT_LOOKUP":
        return evidence_items[0][:700]

    if intent == "DEADLINE_LOOKUP":
        deadline_lines = [
            item
            for item in evidence_items
            if re.search(r"deadline|hạn|han|ngày|ngay|hiệu lực|hieu luc|\d{1,2}[/-]\d{1,2}", item, re.IGNORECASE)
        ]
        selected = deadline_lines or evidence_items[:3]
        return "\n".join(
            ["Các mốc thời gian/deadline tìm thấy trong tài liệu:"]
            + [f"{index}. {text[:360]}" for index, text in enumerate(selected[:4], start=1)]
        )

    if intent == "TASK_LOOKUP":
        action_lines = [
            item
            for item in evidence_items
            if re.search(r"cần|can|phải|phai|yêu cầu|yeu cau|phụ trách|phu trach|hoàn thành|hoan thanh|thực hiện|thuc hien", item, re.IGNORECASE)
        ]
        selected = action_lines or evidence_items[:4]
        return "\n".join(
            ["Những việc/tín hiệu hành động trong tài liệu:"]
            + [f"{index}. {text[:360]}" for index, text in enumerate(selected[:5], start=1)]
        )

    if intent == "WORKFLOW_EXPLANATION":
        return "\n".join(
            ["Quy trình/phần xử lý theo evidence hiện có:"]
            + [f"{index}. {text[:360]}" for index, text in enumerate(evidence_items[:6], start=1)]
        )

    if intent == "CAUSE_ANALYSIS":
        return "\n".join(
            ["Các đoạn liên quan đến nguyên nhân/rủi ro:"]
            + [f"{index}. {text[:360]}" for index, text in enumerate(evidence_items[:5], start=1)]
            + ["Mình không suy diễn thêm nguyên nhân ngoài các đoạn này."]
        )

    return "\n".join(
        ["Dựa trên các đoạn liên quan trong tài liệu:"]
        + [f"{index}. {text[:360]}" for index, text in enumerate(evidence_items[:5], start=1)]
    )


def build_chat_context(
    tasks,
    documents,
    history=None,
    relevant_context=None,
    feedback_memory="",
    q_learning_policy="",
    conversation_summary=None,
    user_profile=None,
):
    incomplete_tasks = [
        task
        for task in tasks
        if not task.get("completed", False)
        and task.get("status") != "Completed"
    ]

    task_lines = []
    for index, task in enumerate(incomplete_tasks[:8], start=1):
        task_lines.append(
            (
                f"{index}. {task.get('title', 'Nhiệm vụ')} | "
                f"deadline: {task.get('deadline') or 'chưa có'} | "
                f"giờ: {task.get('startTime') or 'chưa có'} | "
                f"ưu tiên: {task.get('priority') or 'chưa rõ'}"
            )
        )

    document_lines = []
    for index, document in enumerate(documents[:4], start=1):
        stored_summary = document.get("documentSummary") or {}
        data_insights = document.get("dataInsights") or {}
        main_ideas = stored_summary.get("mainIdeas") or []
        key_details = stored_summary.get("keyDetails") or []
        chunks = document.get("documentChunks") or []
        data_summary = " ".join(
            str(item) for item in data_insights.get("summary", [])[:4]
        )
        numeric_summary = " ".join(
            f"{column.get('name')}: tổng {column.get('sum')}, trung bình {column.get('average')}"
            for column in data_insights.get("numericColumns", [])[:4]
            if isinstance(column, dict)
        )
        eda_summary = " ".join(
            [
                f"outlier: {len(data_insights.get('outliers') or [])}",
                f"tương quan: {len(data_insights.get('correlations') or [])}",
                f"chuỗi thời gian: {len(data_insights.get('timeSeries') or [])}",
                f"dự báo: {len(data_insights.get('predictions') or [])}",
            ]
        )
        summary_text = " ".join(
            [
                str(stored_summary.get("overview") or ""),
                " ".join(str(item) for item in main_ideas[:4]),
                " ".join(str(item) for item in key_details[:3]),
                data_summary,
                numeric_summary,
                eda_summary,
            ]
        ).strip()
        chunk_text = " ".join(
            str(chunk.get("text") or "")
            for chunk in chunks[:4]
            if isinstance(chunk, dict)
        )
        preview = (
            summary_text
            or chunk_text
            or document.get("textPreview")
            or document.get("text")
            or document.get("documentText")
            or ""
        )
        preview = str(preview).replace("\n", " ")[:1200]
        document_lines.append(
            (
                f"{index}. {document.get('fileName', 'Tài liệu')} | "
                f"loại: {document.get('documentType', 'chưa rõ')} | "
                f"nội dung đã phân tích: {preview}"
            )
        )

    safe_conversation_summary = conversation_summary or {}
    if not isinstance(safe_conversation_summary, str):
        safe_conversation_summary = json.dumps(
            safe_conversation_summary,
            ensure_ascii=False,
        )
    safe_user_profile = user_profile or {}
    if not isinstance(safe_user_profile, str):
        safe_user_profile = json.dumps(
            safe_user_profile,
            ensure_ascii=False,
        )

    return {
        "task_summary": "\n".join(task_lines) or "Chưa có task đang làm.",
        "document_summary": "\n".join(document_lines) or "Chưa có tài liệu đã lưu.",
        "history_summary": build_history_context(history or []),
        "relevant_context": build_relevant_context(relevant_context or []),
        "conversation_summary": str(safe_conversation_summary or "").strip()[:2200]
        or "Chưa có tóm tắt hội thoại.",
        "user_profile": str(safe_user_profile or "").strip()[:1200]
        or "Chưa có hồ sơ người dùng.",
        "feedback_memory": str(feedback_memory or "").strip()[:2200]
        or "Chưa có phản hồi huấn luyện từ người dùng.",
        "q_learning_policy": str(q_learning_policy or "").strip()[:1200]
        or "Chưa có Q-learning policy cho lượt chat này.",
        "total_tasks": len(tasks),
        "incomplete_tasks": len(incomplete_tasks),
    }


def priority_score(priority):
    scores = {
        "Cao": 3,
        "High": 3,
        "Trung bình": 2,
        "Medium": 2,
        "Thấp": 1,
        "Low": 1,
    }
    return scores.get(priority, 0)


def normalize_question_text(message: str):
    replacements = {
        "á": "a",
        "à": "a",
        "ả": "a",
        "ã": "a",
        "ạ": "a",
        "ă": "a",
        "ắ": "a",
        "ằ": "a",
        "ẳ": "a",
        "ẵ": "a",
        "ặ": "a",
        "â": "a",
        "ấ": "a",
        "ầ": "a",
        "ẩ": "a",
        "ẫ": "a",
        "ậ": "a",
        "é": "e",
        "è": "e",
        "ẻ": "e",
        "ẽ": "e",
        "ẹ": "e",
        "ê": "e",
        "ế": "e",
        "ề": "e",
        "ể": "e",
        "ễ": "e",
        "ệ": "e",
        "í": "i",
        "ì": "i",
        "ỉ": "i",
        "ĩ": "i",
        "ị": "i",
        "ó": "o",
        "ò": "o",
        "ỏ": "o",
        "õ": "o",
        "ọ": "o",
        "ô": "o",
        "ố": "o",
        "ồ": "o",
        "ổ": "o",
        "ỗ": "o",
        "ộ": "o",
        "ơ": "o",
        "ớ": "o",
        "ờ": "o",
        "ở": "o",
        "ỡ": "o",
        "ợ": "o",
        "ú": "u",
        "ù": "u",
        "ủ": "u",
        "ũ": "u",
        "ụ": "u",
        "ư": "u",
        "ứ": "u",
        "ừ": "u",
        "ử": "u",
        "ữ": "u",
        "ự": "u",
        "ý": "y",
        "ỳ": "y",
        "ỷ": "y",
        "ỹ": "y",
        "ỵ": "y",
        "đ": "d",
    }
    text = message.lower().strip()

    for source, target in replacements.items():
        text = text.replace(source, target)

    return " ".join(text.split())


def extract_concept_from_question(message: str):
    normalized = normalize_question_text(message)
    patterns = [
        r"(.+?)\s+la\s+gi",
        r"giai\s+thich\s+(.+)",
        r"noi\s+ro\s+ve\s+(.+)",
        r"(.+?)\s+nghia\s+la\s+gi",
        r"(.+?)\s+duoc\s+hieu\s+la\s+gi",
    ]

    for pattern in patterns:
        match = re.search(pattern, normalized)
        if match:
            concept = match.group(1).strip(" ?.,:;")
            if concept and concept not in {"noi dung", "tai lieu", "file", "gi"}:
                return concept

    return ""


def build_light_frequency_reply():
    return "\n".join(
        [
            "Tần số ánh sáng là số lần dao động của sóng ánh sáng trong 1 giây.",
            "",
            "Nói dễ hiểu:",
            "1. Ánh sáng là sóng điện từ.",
            "2. Mỗi màu ánh sáng có bước sóng và tần số khác nhau.",
            "3. Tần số càng cao thì năng lượng photon càng lớn.",
            "",
            "Công thức quan trọng:",
            "f = c / λ",
            "",
            "Trong đó:",
            "- f là tần số, đơn vị Hz.",
            "- c là tốc độ ánh sáng trong chân không, khoảng 3 x 10^8 m/s.",
            "- λ là bước sóng, đơn vị mét.",
            "",
            "Ví dụ:",
            "- Ánh sáng đỏ có bước sóng dài hơn nên tần số thấp hơn.",
            "- Ánh sáng tím có bước sóng ngắn hơn nên tần số cao hơn.",
            "- Tia cực tím có tần số cao hơn ánh sáng nhìn thấy nên năng lượng lớn hơn.",
            "",
            "Ứng dụng:",
            "1. Giải thích màu sắc ánh sáng.",
            "2. Tính năng lượng photon theo công thức E = h.f.",
            "3. Dùng trong quang học, laser, viễn thông, phổ học và vật lý lượng tử.",
            "",
            "Nếu bạn đang học bài này, bạn nên nhớ 3 ý: tần số là số dao động mỗi giây, tần số liên hệ với bước sóng qua f = c/λ, và tần số càng cao thì năng lượng càng lớn.",
        ]
    )


def build_general_knowledge_reply(message: str):
    normalized = normalize_question_text(message)
    concept = extract_concept_from_question(message)

    if (
        "tan so anh sang" in normalized
        or "tan so cua anh sang" in normalized
        or ("anh sang" in normalized and "tan so" in normalized)
    ):
        return build_light_frequency_reply()

    if not concept:
        return ""

    display_concept = concept[:1].upper() + concept[1:]

    return "\n".join(
        [
            f"Mình hiểu bạn đang hỏi về \"{display_concept}\".",
            "",
            "Để hiểu một khái niệm, bạn nên nhìn theo 4 phần:",
            f"1. Định nghĩa: {display_concept} là gì, dùng để mô tả hiện tượng/vấn đề nào.",
            "2. Bản chất: nó hoạt động theo cơ chế nào, có yếu tố nào ảnh hưởng.",
            "3. Ví dụ: lấy một tình huống cụ thể để thấy nó xuất hiện ở đâu.",
            "4. Ứng dụng: nó giúp giải thích, tính toán hoặc ra quyết định gì.",
            "",
            "Mình chưa có đủ ngữ cảnh hoặc Gemini chưa khả dụng để giải thích sâu chính xác như một mô hình lớn. Bạn hãy hỏi rõ hơn một chút, ví dụ:",
            f"- \"{display_concept} trong vật lý là gì?\"",
            f"- \"Cho ví dụ về {display_concept}\"",
            f"- \"Tóm tắt {display_concept} để học kiểm tra\"",
        ]
    )


def format_data_insights_reply(document):
    data_insights = document.get("dataInsights") or {}
    if not isinstance(data_insights, dict):
        return ""

    summary = data_insights.get("summary") if isinstance(data_insights.get("summary"), list) else []
    column_roles = data_insights.get("columnRoles") if isinstance(data_insights.get("columnRoles"), list) else []
    key_findings = data_insights.get("keyFindings") if isinstance(data_insights.get("keyFindings"), list) else []
    numeric_columns = data_insights.get("numericColumns") if isinstance(data_insights.get("numericColumns"), list) else []
    outliers = data_insights.get("outliers") if isinstance(data_insights.get("outliers"), list) else []
    predictions = data_insights.get("predictions") if isinstance(data_insights.get("predictions"), list) else []
    chart_suggestions = data_insights.get("chartSuggestions") if isinstance(data_insights.get("chartSuggestions"), list) else []
    recommended_actions = data_insights.get("recommendedActions") if isinstance(data_insights.get("recommendedActions"), list) else []

    if not any([summary, column_roles, key_findings, numeric_columns, outliers, predictions, chart_suggestions, recommended_actions]):
        return ""

    metrics = [str(item.get("name")) for item in column_roles if isinstance(item, dict) and item.get("role") == "metric" and item.get("name")]
    dimensions = [str(item.get("name")) for item in column_roles if isinstance(item, dict) and item.get("role") == "dimension" and item.get("name")]
    dates = [str(item.get("name")) for item in column_roles if isinstance(item, dict) and item.get("role") == "date" and item.get("name")]

    lines = [
        f"Mình đã đọc phần dữ liệu trong \"{document.get('fileName', 'file vừa upload')}\".",
        "",
    ]

    if summary:
        lines.append("Tóm tắt dữ liệu:")
        lines.extend(f"{index}. {item}" for index, item in enumerate(summary[:4], start=1))
        lines.append("")

    if dimensions or metrics or dates:
        lines.append("Cấu trúc mình hiểu:")
        if dimensions:
            lines.append(f"- Nhóm/phân loại: {', '.join(dimensions[:5])}")
        if metrics:
            lines.append(f"- Chỉ số đo lường: {', '.join(metrics[:5])}")
        if dates:
            lines.append(f"- Mốc thời gian: {', '.join(dates[:3])}")
        lines.append("")

    if key_findings:
        lines.append("Insight nổi bật:")
        lines.extend(f"{index}. {item}" for index, item in enumerate(key_findings[:5], start=1))
        lines.append("")

    if numeric_columns:
        lines.append("Cột số đáng chú ý:")
        for index, column in enumerate(numeric_columns[:4], start=1):
            if not isinstance(column, dict):
                continue
            lines.append(
                f"{index}. {column.get('name', 'Chỉ số')}: tổng {column.get('sum', 'chưa rõ')}, trung bình {column.get('average', 'chưa rõ')}"
            )
        lines.append("")

    if outliers:
        lines.append("Bất thường cần kiểm tra:")
        lines.extend(
            f"{index}. {item.get('column', 'Cột dữ liệu')}: {item.get('count', 0)} giá trị bất thường"
            for index, item in enumerate(outliers[:3], start=1)
            if isinstance(item, dict)
        )
        lines.append("")

    if predictions:
        lines.append("Dự báo tầng 4:")
        for index, item in enumerate(predictions[:3], start=1):
            if not isinstance(item, dict):
                continue
            lines.append(
                f"{index}. {item.get('metric', 'Chỉ số')}: kỳ tiếp theo khoảng {item.get('nextPeriodForecast', 'chưa rõ')} ({item.get('confidence', 'LOW')})"
            )
        lines.append("")

    if chart_suggestions:
        lines.append("Biểu đồ nên dùng:")
        lines.extend(f"{index}. {item}" for index, item in enumerate(chart_suggestions[:4], start=1))
        lines.append("")

    if recommended_actions:
        lines.append("Hướng xử lý đề xuất:")
        lines.extend(f"{index}. {item}" for index, item in enumerate(recommended_actions[:5], start=1))

    return "\n".join(line for line in lines if line is not None).strip()


def build_local_guidance_reply(message: str, tasks, documents):
    normalized_message = message.lower().strip()
    incomplete_tasks = [
        task
        for task in tasks
        if not task.get("completed", False)
        and task.get("status") != "Completed"
    ]
    latest_document = documents[0] if documents else None
    latest_file_name = latest_document.get("fileName", "file vừa upload") if latest_document else "file vừa upload"

    feedback_keywords = [
        "ten task",
        "tên task",
        "ngan thoi",
        "ngắn thôi",
        "mo ta",
        "mô tả",
        "description",
        "checklist",
        "dai qua",
        "dài quá",
        "khong dung",
        "không đúng",
        "over-processing",
        "xu ly qua da",
        "xử lý quá đà",
    ]

    if any(keyword in normalized_message for keyword in feedback_keywords):
        return "\n".join(
            [
                "Mình ghi nhận góp ý này. Bạn nói đúng: task phải dễ nhìn và đúng hành động, không được bê nguyên đoạn văn trong tài liệu làm tên task.",
                "",
                "Từ giờ mình sẽ tách như sau:",
                "1. Tên task: ngắn, bắt đầu bằng động từ hoặc mục tiêu rõ ràng.",
                "2. Mô tả: đưa bối cảnh, yêu cầu chi tiết, đoạn trích liên quan.",
                "3. Checklist: chia thành các bước làm được ngay.",
                "4. Chỉ tạo task khi nội dung thật sự là việc cần làm, không lấy lời cảm ơn, mục lục, mở đầu hoặc kết luận làm task.",
                "",
                f"Với \"{latest_file_name}\", bạn muốn mình xử lý tiếp theo hướng nào?",
                "1. Chia lại nội dung file thành task nháp chuẩn chỉnh.",
                "2. Phân tích sâu yêu cầu kỹ thuật/nghiệp vụ trong file.",
                "3. Kiểm tra task/lịch hiện tại và đề xuất cách sắp xếp lại.",
            ]
        )
    workflow_keywords = [
        "chia",
        "workflow",
        "quy trình",
        "làm sao",
        "làm như thế nào",
        "hướng giải quyết",
        "kế hoạch",
        "các bước",
        "checklist",
        "mỗi task",
        "từng task",
        "bước nhỏ",
    ]

    if any(keyword in normalized_message for keyword in workflow_keywords):
        if incomplete_tasks:
            ranked_tasks = sorted(
                incomplete_tasks,
                key=lambda task: (
                    -priority_score(task.get("priority")),
                    task.get("deadline") or task.get("startDate") or "9999-12-31",
                ),
            )
            task_lines = []
            for index, task in enumerate(ranked_tasks[:5], start=1):
                task_lines.append(
                    (
                        f"{index}. {task.get('title', 'Nhiệm vụ')} - "
                        f"deadline: {task.get('deadline') or task.get('startDate') or 'chưa có'} - "
                        f"giờ: {task.get('startTime') or 'chưa có'} - "
                        f"ưu tiên: {task.get('priority') or 'chưa rõ'}"
                    )
                )

            return "\n".join(
                [
                    "Mình hiểu bạn muốn chia nhỏ công việc thành kế hoạch dễ làm.",
                    "",
                    "Các việc nên xử lý trước:",
                    *task_lines,
                    "",
                    "Workflow đề xuất:",
                    "1. Chọn việc có deadline gần hoặc ưu tiên cao.",
                    "2. Chia mỗi việc thành checklist 3-5 bước nhỏ: đọc/chuẩn bị, làm chính, kiểm tra lại.",
                    "3. Gán một khung giờ cụ thể cho từng bước, mỗi bước 25-60 phút.",
                    "4. Đặt reminder trước deadline hoặc trước giờ bắt đầu.",
                    "5. Sau mỗi bước, cập nhật trạng thái trong Tasks để mình theo dõi tiếp cho bạn.",
                ]
            )

        if latest_document:
            preview = (
                latest_document.get("textPreview")
                or latest_document.get("text")
                or latest_document.get("documentText")
                or ""
            )
            return "\n".join(
                [
                    f"Mình hiểu bạn muốn biến tài liệu \"{latest_document.get('fileName', 'mới nhất')}\" thành workflow.",
                    "",
                    "Cách làm hợp lý:",
                    "1. Đọc nhanh tài liệu và gạch ý chính.",
                    "2. Tách nội dung thành các nhóm việc cần làm.",
                    "3. Với mỗi nhóm, tạo một task có deadline và giờ bắt đầu.",
                    "4. Tạo checklist nhỏ cho từng task.",
                    "5. Đặt reminder để đến ngày mở app lên là thấy việc cần làm.",
                    "",
                    f"Nội dung mình đang bám theo: {str(preview)[:500] or 'tài liệu chưa có preview rõ ràng.'}",
                ]
            )

    data_question_keywords = [
        "dữ liệu",
        "du lieu",
        "bảng",
        "bang",
        "excel",
        "csv",
        "số liệu",
        "so lieu",
        "biểu đồ",
        "bieu do",
        "dự báo",
        "du bao",
        "bất thường",
        "bat thuong",
        "phân tích",
        "phan tich",
    ]

    if latest_document and any(keyword in normalized_message for keyword in data_question_keywords):
        data_reply = format_data_insights_reply(latest_document)
        if data_reply:
            return data_reply

    if latest_document and (
        "tóm tắt" in normalized_message
        or "tài liệu" in normalized_message
        or "file" in normalized_message
        or "nội dung" in normalized_message
    ):
        stored_summary = latest_document.get("documentSummary") or {}
        main_ideas = stored_summary.get("mainIdeas") or []
        key_details = stored_summary.get("keyDetails") or []
        next_actions = stored_summary.get("nextActions") or []

        if stored_summary:
            return "\n".join(
                [
                    f"Mình đang hiểu bạn hỏi về tài liệu \"{latest_document.get('fileName', 'mới nhất')}\".",
                    "",
                    "Tổng quan:",
                    f"- {stored_summary.get('overview') or 'Chưa có tổng quan rõ.'}",
                    "",
                    "Nội dung chính:",
                    *[
                        f"{index}. {idea}"
                        for index, idea in enumerate(main_ideas[:6], start=1)
                    ],
                    "",
                    "Chi tiết đáng chú ý:",
                    *[
                        f"{index}. {detail}"
                        for index, detail in enumerate(key_details[:5], start=1)
                    ],
                    "",
                    "Bạn nên làm tiếp:",
                    *[
                        f"{index}. {action}"
                        for index, action in enumerate(next_actions[:5], start=1)
                    ],
                ]
            )

        preview = (
            latest_document.get("textPreview")
            or latest_document.get("text")
            or latest_document.get("documentText")
            or ""
        )
        return "\n".join(
            [
                f"Mình đang hiểu bạn hỏi về tài liệu \"{latest_document.get('fileName', 'mới nhất')}\".",
                str(preview)[:900]
                or "Tài liệu này chưa có đủ nội dung văn bản để mình tóm tắt rõ.",
            ]
        )

    knowledge_reply = build_general_knowledge_reply(message)

    if knowledge_reply:
        return knowledge_reply

    if latest_document:
        return "\n".join(
            [
                f"Mình đang bám theo tài liệu \"{latest_file_name}\".",
                "Bạn có thể yêu cầu mình xử lý tiếp theo một trong các hướng sau:",
                "",
                "1. Chia nội dung file thành task nháp: tên task ngắn, mô tả đầy đủ, checklist rõ.",
                "2. Hỏi chi tiết về file: giải thích yêu cầu, dữ liệu, thuật ngữ hoặc phần khó hiểu.",
                "3. Đề xuất workflow: nên làm gì trước, làm trong khung giờ nào, phần nào cần kiểm thử/rà soát.",
                "",
                "Bạn chỉ cần nhắn kiểu: \"chia lại file này thành task chuẩn\" hoặc \"phân tích yêu cầu kỹ thuật trong file này\".",
            ]
        )

    return "\n".join(
        [
            "Mình hiểu bạn đang hỏi bằng ngôn ngữ tự nhiên, nhưng hiện chưa có đủ ngữ cảnh file/task để trả lời sâu.",
            "",
            "Bạn có thể:",
            "1. Upload tài liệu để mình đọc và phân tích.",
            "2. Hỏi về task/lịch/deadline hiện có.",
            "3. Nhắn một việc cụ thể để mình tạo task nháp, gợi ý thời gian và checklist.",
        ]
    )


def normalize_confidence_level(value):
    normalized = str(value or "").strip().upper()

    if normalized in {"HIGH", "CAO"}:
        return "HIGH"

    if normalized in {"LOW", "THAP", "THẤP"}:
        return "LOW"

    return "MEDIUM"


def clean_gemini_json_text(text):
    cleaned = str(text or "").strip()
    cleaned = cleaned.replace("```json", "").replace("```", "").strip()

    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned

    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start >= 0 and end > start:
        return cleaned[start : end + 1]

    return cleaned


def clean_iso_date(value):
    cleaned = str(value or "").strip()

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
        return ""

    try:
        parsed = datetime.strptime(cleaned, "%Y-%m-%d").date()
    except ValueError:
        return ""

    return cleaned if parsed.strftime("%Y-%m-%d") == cleaned else ""


def clean_time_value(value):
    cleaned = str(value or "").strip()

    if not cleaned:
        return ""

    if not re.fullmatch(r"\d{2}:\d{2}", cleaned):
        return ""

    try:
        parsed = datetime.strptime(cleaned, "%H:%M").time()
    except ValueError:
        return ""

    return parsed.strftime("%H:%M")


def clean_task_title(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def split_title_context(title, max_words=8):
    words = [word for word in clean_task_title(title).split(" ") if word]

    if len(words) <= max_words:
        return clean_task_title(title), ""

    short_title = " ".join(words[:max_words]).strip(" ,.;:-")
    extra_context = " ".join(words[max_words:]).strip(" ,.;:-")

    return short_title, extra_context


def has_action_signal(title):
    normalized = normalize_question_text(title)

    action_verbs = {
        "cap nhat",
        "kiem tra",
        "ra soat",
        "gui",
        "nop",
        "hoan thien",
        "chuan bi",
        "thiet ke",
        "xay dung",
        "code",
        "kiem thu",
        "sua",
        "fix",
        "bao cao",
        "tong hop",
        "phan tich",
        "lap",
        "tao",
        "lam",
        "soan",
        "chot",
        "tra loi",
        "viet",
        "nhap",
        "luu",
        "doc",
        "on",
        "hoc",
        "luyen",
        "doi chieu",
        "xac nhan",
        "bo sung",
        "theo doi",
        "nhac",
        "lien he",
    }

    return any(
        normalized == verb or normalized.startswith(f"{verb} ")
        for verb in action_verbs
    )


def is_bad_task_title(title):
    normalized = normalize_question_text(title)
    word_count = len([word for word in normalized.split(" ") if word])

    if len(title) < 4 or len(title) > 90:
        return True

    if word_count < 2 or word_count > 12:
        return True

    exact_bad_titles = {
        "cuoc hop",
        "thoi",
    }

    if normalized in exact_bad_titles:
        return True

    bad_phrases = [
        "hoan thanh la",
        "khong co nhiem vu",
        "khong co nguoi phu trach",
        "khong co thoi",
        "no assignment",
        "no task",
        "kpi la",
        "du lieu la",
        "la he thong",
        "bao gom",
        "duoc su dung",
        "co vai tro",
        "can chinh xac",
        "khong phai",
        "day la",
    ]

    if any(phrase in normalized for phrase in bad_phrases):
        return True

    if not has_action_signal(title):
        return True

    return False


def normalize_document_task(task, index):
    if not isinstance(task, dict):
        return None

    raw_title = clean_task_title(task.get("title") or task.get("task_name"))
    title, title_extra_context = split_title_context(raw_title)

    if is_bad_task_title(title):
        return None

    suggested_steps = task.get("suggestedSteps") or task.get("checklist") or []

    if not isinstance(suggested_steps, list):
        suggested_steps = []

    description = str(task.get("description") or "").strip()

    if title_extra_context:
        description = (
            f"{title_extra_context}. {description}".strip()
            if description
            else title_extra_context
        )

    return {
        "title": title,
        "description": description,
        "category": str(task.get("category") or task.get("taskType") or "General"),
        "type": str(task.get("type") or "Task"),
        "domain": str(task.get("domain") or "General"),
        "difficulty": str(task.get("difficulty") or "Trung bình"),
        "necessity": str(task.get("necessity") or "Trung bình"),
        "priority": str(task.get("priority") or "Trung bình"),
        "startDate": clean_iso_date(task.get("startDate") or task.get("start_date")),
        "deadline": clean_iso_date(task.get("deadline") or task.get("due_date")),
        "startTime": clean_time_value(task.get("startTime") or task.get("start_time")),
        "endTime": clean_time_value(task.get("endTime") or task.get("end_time")),
        "estimate": str(task.get("estimate") or "Chọn thời gian"),
        "reminder": str(task.get("reminder") or "Không nhắc"),
        "assignee": str(task.get("assignee") or "Tôi"),
        "status": str(task.get("status") or "To do"),
        "completed": False,
        "suggestedSteps": [
            str(step).strip()
            for step in suggested_steps[:6]
            if str(step or "").strip()
        ],
    }


def normalize_document_analysis_result(result):
    if not isinstance(result, dict):
        result = {}

    raw_tasks = result.get("tasks")
    raw_suggested_tasks = result.get("suggestedTasks") or result.get("suggested_tasks") or []

    if not isinstance(raw_tasks, list):
        raw_tasks = []

    if not isinstance(raw_suggested_tasks, list):
        raw_suggested_tasks = []

    normalized_tasks = []
    normalized_suggested_tasks = []
    seen_titles = set()

    for index, task in enumerate(raw_tasks[:12], start=1):
        normalized_task = normalize_document_task(task, index)

        if not normalized_task:
            continue

        dedupe_key = normalize_question_text(normalized_task["title"])

        if dedupe_key in seen_titles:
            continue

        seen_titles.add(dedupe_key)
        normalized_tasks.append(normalized_task)

    for index, task in enumerate(raw_suggested_tasks[:8], start=1):
        normalized_task = normalize_document_task(task, index)

        if not normalized_task:
            continue

        dedupe_key = normalize_question_text(normalized_task["title"])

        if dedupe_key in seen_titles:
            continue

        seen_titles.add(dedupe_key)
        normalized_suggested_tasks.append(normalized_task)

    document_type = str(result.get("documentType") or result.get("document_type") or "GENERAL_DOCUMENT")
    is_reference_only = document_type in {
        "REFERENCE_PROCESS_DOCUMENT",
        "GENERAL_DOCUMENT",
        "KNOWLEDGE_ONLY",
    }
    is_actionable = bool(result.get("isActionable") or result.get("is_actionable"))

    if is_reference_only and not normalized_tasks:
        is_actionable = False
    elif normalized_tasks:
        is_actionable = True

    return {
        **result,
        "success": bool(result.get("success", True)),
        "documentType": document_type,
        "documentPurpose": str(result.get("documentPurpose") or result.get("document_purpose") or ""),
        "isActionable": is_actionable,
        "documentSummary": str(result.get("documentSummary") or result.get("document_summary") or ""),
        "tasks": normalized_tasks if is_actionable else [],
        "suggestedTasks": normalized_suggested_tasks,
        "summary": str(result.get("summary") or ""),
        "insights": result.get("insights") if isinstance(result.get("insights"), list) else [],
        "anomalies": result.get("anomalies") if isinstance(result.get("anomalies"), list) else [],
        "predictions": result.get("predictions") if isinstance(result.get("predictions"), list) else [],
        "chartSuggestions": result.get("chartSuggestions") if isinstance(result.get("chartSuggestions"), list) else [],
        "recommendedActions": result.get("recommendedActions") if isinstance(result.get("recommendedActions"), list) else [],
        "dataAnalysis": result.get("dataAnalysis") if isinstance(result.get("dataAnalysis"), dict) else None,
    }


def parse_structured_chat_response(raw_text):
    try:
        data = json.loads(clean_gemini_json_text(raw_text))
    except Exception:
        return {
            "intent": "KNOWLEDGE_QA",
            "answer": str(raw_text or "").strip(),
            "confidenceLevel": "MEDIUM",
            "requiresClarification": False,
            "clarificationQuestion": "",
            "requiresConfirmation": False,
            "suggestedTasks": [],
            "sources": [],
            "suggestedActions": [],
            "memoryCandidates": [],
            "metadata": {},
        }

    if not isinstance(data, dict):
        data = {}

    answer = str(data.get("answer") or data.get("reply") or "").strip()

    if not answer:
        answer = "Mình chưa đủ dữ liệu để trả lời chắc chắn. Bạn hỏi rõ thêm một chút nhé."

    suggested_tasks = data.get("suggestedTasks")

    if not isinstance(suggested_tasks, list):
        suggested_tasks = []

    normalized_tasks = []
    for index, task in enumerate(suggested_tasks[:5], start=1):
        if not isinstance(task, dict):
            continue

        normalized_task = normalize_document_task(task, index)

        if not normalized_task:
            continue

        normalized_tasks.append({
            **normalized_task,
            "id": f"draft-{index}",
        })

    return {
        "intent": str(data.get("intent") or "KNOWLEDGE_QA").strip() or "KNOWLEDGE_QA",
        "answer": answer,
        "confidenceLevel": normalize_confidence_level(data.get("confidenceLevel")),
        "requiresClarification": bool(data.get("requiresClarification")),
        "clarificationQuestion": str(data.get("clarificationQuestion") or "").strip(),
        "requiresConfirmation": bool(data.get("requiresConfirmation") or normalized_tasks),
        "suggestedTasks": normalized_tasks,
        "sources": data.get("sources") if isinstance(data.get("sources"), list) else [],
        "suggestedActions": data.get("suggestedActions")
        if isinstance(data.get("suggestedActions"), list)
        else [],
        "memoryCandidates": data.get("memoryCandidates")
        if isinstance(data.get("memoryCandidates"), list)
        else [],
        "metadata": data.get("metadata") if isinstance(data.get("metadata"), dict) else {},
    }


def ask_gemini_work_assistant(
    message: str,
    tasks,
    documents,
    history=None,
    relevant_context=None,
    feedback_memory="",
    q_learning_policy="",
    conversation_summary=None,
    user_profile=None,
    conversation_id="",
    user_id="",
):
    context = build_chat_context(
        tasks,
        documents,
        history,
        relevant_context,
        feedback_memory,
        q_learning_policy,
        conversation_summary,
        user_profile,
    )
    now = datetime.now()
    current_time = now.strftime("%A, %d/%m/%Y %H:%M")
    prompt = f"""
Bạn là TamCam AI, một trợ lý học tập, công việc, lịch nhắc, task và phân tích tài liệu/dữ liệu.

CURRENT_TIME: {current_time}

SMART CHAT MODE:
- Hành xử như một AI assistant hiện đại: hiểu ý định trước, trả lời trực tiếp, tự nhiên, có chiều sâu khi người dùng cần.
- Không nói như bot kịch bản. Không mở đầu bằng câu chào lặp lại nếu người dùng đang hỏi việc cụ thể.
- Nếu câu hỏi ngắn nhưng có context trước đó, hiểu đó là câu hỏi nối tiếp.
- Nếu người dùng hỏi kiến thức chung, giải thích rõ ràng như đang dạy một người thật: định nghĩa, bản chất, ví dụ, ứng dụng.
- Nếu người dùng hỏi về file/dữ liệu, bám sát evidence/context; không đoán bừa.
- Nếu người dùng muốn hành động trong app, phân biệt:
  1. Trả lời/chỉ giải thích.
  2. Đề xuất task nháp.
  3. Cần xác nhận trước khi tạo/sửa/xóa.
- Khi thiếu thông tin quan trọng, hỏi lại 1 câu ngắn, hoặc đưa lịch/giả định hợp lý rồi hỏi người dùng có muốn giữ hay chỉnh.
- Viết gọn nhưng đủ ý. Ưu tiên đoạn ngắn, bullet/checklist khi câu trả lời dài.
- Được dùng Markdown nhẹ trong trường "answer": tiêu đề ngắn, bullet "-", số thứ tự, checklist "[ ]".

QUY TRÌNH NỘI BỘ TRƯỚC KHI TRẢ LỜI:
1. Xác định CURRENT_CONTEXT:
   - Có tài liệu hiện tại không?
   - Có task/lịch hiện tại không?
   - Tin nhắn hiện tại có đang hỏi nối tiếp tin trước không?
2. Chọn đúng một INTENT chính:
   KNOWLEDGE_QA, DOCUMENT_SUMMARY, DOCUMENT_ANALYSIS, DATA_ANALYSIS,
   NEXT_ACTION, CHECKLIST, CREATE_TASK_DRAFT, UPDATE_TASK, DELETE_TASK,
   COMPLETE_TASK, SYSTEM_ERROR, CLARIFY.
3. Chọn ACTION_PERMISSION:
   NONE, SUGGEST_ONLY, REQUIRE_CONFIRMATION, EXECUTE_ALLOWED.
4. Chỉ trả lời theo intent đã chọn.

NGUYÊN TẮC:
- Luôn dùng LỊCH SỬ CHAT GẦN ĐÂY để hiểu các từ như "nó", "file này", "dữ liệu này", "phần đó", "chia tiếp".
- Không tự động chèn "Workflow đề xuất" nếu người dùng chỉ hỏi tóm tắt, nội dung hoặc một câu hỏi kiến thức.
- Không lặp câu mẫu "Tôi đã nhận câu hỏi của bạn".
- Tách rõ tóm tắt và tạo task:
  - Hỏi "nội dung là gì", "file này nói gì", "tóm tắt": chỉ trả lời/tóm tắt.
  - Hỏi "tôi cần làm gì", "chia nhiệm vụ", "checklist", "tạo task": mới đề xuất workflow/task.
- Không tự biến mục lục, tiêu đề chương, danh sách câu hỏi hoặc nội dung tham khảo thành task.
- Chỉ gợi ý task thuyết trình nếu có tín hiệu rõ: thuyết trình, slide, presentation, báo cáo miệng, trình bày.
- Nếu là bài tập/lời giải: gợi ý task làm bài, kiểm tra đáp án, ghi lại câu chưa hiểu.
- Nếu là từ vựng: gợi ý task học từ, đặt câu, ôn lại.
- Nếu là báo cáo/dữ liệu công việc: gợi ý task phân tích, tổng hợp, kiểm tra số liệu, chuẩn bị báo cáo.
- Nếu là Excel/CSV/bảng số liệu: phân tích tổng, nhóm cao/thấp, xu hướng, bất thường, so sánh, biểu đồ phù hợp.
- Nếu context có dataInsights/keyFindings/columnRoles/predictions/chartSuggestions, hãy ưu tiên dùng chúng vì đó là số liệu đã được tính bằng code.
- Khi người dùng hỏi "dữ liệu này là gì", "có gì đáng chú ý", "phân tích dữ liệu": trả lời theo cấu trúc:
  1. Đây là dữ liệu gì.
  2. Cấu trúc cột: nhóm/phân loại, chỉ số đo lường, mốc thời gian.
  3. Insight nổi bật.
  4. Bất thường/rủi ro nếu có.
  5. Biểu đồ/dự báo/hướng xử lý nếu phù hợp.
- Khi dữ liệu không có hành động rõ ràng, KHÔNG tạo task. Chỉ hỏi: "Bạn muốn tôi tạo task theo insight nào?"
- Không bịa số liệu, deadline, người phụ trách hoặc nội dung không có trong context.
- Nếu người dùng hỏi về file nhưng không có file trong context, hãy yêu cầu upload lại file.
- Nếu thiếu ngày/giờ cho task, hãy gợi ý lịch hợp lý dựa trên CURRENT_TIME rồi hỏi người dùng có muốn giữ hay chỉnh không.
- Gemini KHÔNG trực tiếp tạo task. Chỉ đề xuất task nháp. Frontend/backend mới thực thi sau khi người dùng xác nhận.
- Nếu người dùng nói rõ lặp lại như "mỗi ngày", "hằng tuần", "hằng năm" và có giờ, coi đó là đủ để tạo lịch nhắc nhở nháp; không trả lời rằng không tìm thấy task cũ.
- Nếu người dùng muốn tạo lịch sinh nhật từ file nhân sự, hãy yêu cầu hệ thống dùng từng dòng nhân viên/ngày sinh làm từng reminder riêng, không gom thành 1 task tổng.
- Tên task phải ngắn, còn bối cảnh dài để trong description/checklist.
- Độ tin cậy không dùng % ngẫu nhiên. Chỉ chọn HIGH, MEDIUM hoặc LOW.
  HIGH: dữ liệu đầy đủ, nội dung rõ.
  MEDIUM: có preview hoặc thiếu một phần.
  LOW: phải suy luận nhiều hoặc thiếu ngữ cảnh.
- Dùng USER_FEEDBACK_MEMORY như tín hiệu reinforcement:
  - Nếu user từng chấm không hài lòng, tránh lặp lại kiểu trả lời đó.
  - Nếu user từng chấm hài lòng, ưu tiên phong cách trả lời tương tự.
  - Feedback chỉ là tín hiệu chất lượng, không được coi là fact mới về tài liệu/task.
- Dùng Q_LEARNING_POLICY như policy chọn chiến lược trả lời cho lượt này:
  - Q_STATE cho biết loại tình huống người dùng đang hỏi.
  - Q_ACTION là action có Q-value tốt nhất sau feedback trước đó.
  - Ưu tiên làm theo Q_POLICY_HINT nếu không mâu thuẫn với dữ liệu thật và quy tắc an toàn.

{build_document_qa_prompt_rules()}

BẮT BUỘC TRẢ VỀ JSON HỢP LỆ, KHÔNG THÊM VĂN BẢN NGOÀI JSON:
{{
  "intent": "DOCUMENT_ANALYSIS",
  "answer": "Câu trả lời tiếng Việt tự nhiên cho người dùng.",
  "confidenceLevel": "HIGH",
  "requiresClarification": false,
  "clarificationQuestion": "",
  "requiresConfirmation": false,
  "sources": [],
  "suggestedActions": [],
  "suggestedTasks": [],
  "memoryCandidates": [],
  "metadata": {{}}
}}

Schema suggestedTasks khi cần đề xuất task nháp:
[
  {{
    "title": "Tên task",
    "description": "Mô tả ngắn",
    "category": "Study | Work | General",
    "type": "Task",
    "priority": "Cao | Trung bình | Thấp",
    "difficulty": "Dễ | Trung bình | Khó",
    "startDate": "YYYY-MM-DD hoặc rỗng",
    "deadline": "YYYY-MM-DD hoặc rỗng",
    "startTime": "HH:mm hoặc rỗng",
    "reminder": "Trước 30 phút | Không nhắc",
    "suggestedSteps": ["Bước 1", "Bước 2"]
  }}
]

FEW-SHOT:
User: checklist như thế nào?
Context: không có tài liệu/task rõ.
JSON:
{{"intent":"CLARIFY","answer":"Bạn muốn mình tạo checklist cho tài liệu vừa upload hay cho một công việc cụ thể nào? Bạn nhắn rõ tên file hoặc việc cần làm, mình sẽ chia thành từng bước cho dễ theo dõi.","confidenceLevel":"MEDIUM","requiresConfirmation":false,"suggestedTasks":[]}}

User: checklist như thế nào?
Context: vừa upload file từ vựng du lịch.
JSON:
{{"intent":"CHECKLIST","answer":"Dựa trên file từ vựng du lịch, checklist học tập nên là:\\n\\n[ ] Đọc qua toàn bộ danh sách từ vựng.\\n[ ] Nhóm từ theo chủ đề nhỏ như phương tiện, khách sạn, địa điểm, hoạt động.\\n[ ] Đặt câu với 5-10 từ mới.\\n[ ] Kiểm tra các cụm dễ nhầm.\\n[ ] Ôn lại sau 1 ngày và sau 3 ngày.\\n\\nNếu muốn, mình có thể biến checklist này thành task nháp cho bạn xác nhận.","confidenceLevel":"HIGH","requiresConfirmation":true,"suggestedTasks":[{{"title":"Ôn từ vựng du lịch","description":"Học và ôn lại danh sách từ vựng trong file vừa upload.","category":"Study","type":"Task","priority":"Trung bình","difficulty":"Trung bình","startDate":"","deadline":"","startTime":"19:30","reminder":"Không nhắc","suggestedSteps":["Đọc toàn bộ từ vựng","Nhóm từ theo chủ đề","Đặt câu với từ mới","Ôn lại sau 1 ngày"]}}]}}

User: file này là gì?
Context: upload file quản lý quán cà phê UML.
JSON:
{{"intent":"DOCUMENT_ANALYSIS","answer":"Dựa vào nội dung mình đọc được, đây là tài liệu phân tích thiết kế hệ thống UML cho đề tài quản lý quán cà phê.\\n\\nNó nói về cách mô tả hệ thống quản lý quán cà phê, gồm yêu cầu, tác nhân, chức năng và các biểu đồ UML cần thiết.\\n\\nCác phần đáng chú ý:\\n1. Phần phát biểu bài toán và phạm vi hệ thống.\\n2. Phần xác định yêu cầu quản lý như thu ngân, pha chế, quản trị.\\n3. Phần xây dựng các biểu đồ như Use Case, hoạt động hoặc lớp.\\n\\nBạn có thể nhờ mình tóm tắt từng phần, giải thích biểu đồ Use Case hoặc tạo checklist hoàn thiện tài liệu.","confidenceLevel":"HIGH","requiresConfirmation":false,"suggestedTasks":[]}}

User: dữ liệu này có gì đáng chú ý?
Context: có dataInsights gồm columnRoles, keyFindings, predictions.
JSON:
{{"intent":"DATA_ANALYSIS","answer":"Mình hiểu đây là bảng dữ liệu có các cột phân loại, chỉ số đo lường và một số mốc thời gian.\\n\\nĐiểm đáng chú ý nhất là các insight đã tính từ dữ liệu: nhóm cao nhất/thấp nhất, các giá trị bất thường và xu hướng theo thời gian nếu có.\\n\\nBạn nên xem thêm biểu đồ cột để so sánh theo nhóm và biểu đồ đường nếu bảng có mốc thời gian. Nếu muốn, mình có thể chuyển một insight cụ thể thành task nháp để bạn xác nhận.","confidenceLevel":"HIGH","requiresConfirmation":false,"suggestedTasks":[]}}

User: tán sắc ánh sáng là gì?
Context: không có tài liệu liên quan.
JSON:
{{"intent":"KNOWLEDGE_QA","answer":"Tán sắc ánh sáng là hiện tượng ánh sáng trắng bị tách thành nhiều màu khi đi qua một môi trường như lăng kính.\\n\\nBản chất là mỗi màu có bước sóng khác nhau nên bị khúc xạ lệch một góc khác nhau. Ánh sáng đỏ lệch ít hơn, ánh sáng tím lệch nhiều hơn.\\n\\nVí dụ dễ thấy nhất là cầu vồng: ánh sáng Mặt Trời đi qua các giọt nước trong không khí và bị tách thành nhiều màu.\\n\\nÝ chính cần nhớ:\\n- Ánh sáng trắng gồm nhiều ánh sáng màu.\\n- Mỗi màu bị khúc xạ khác nhau.\\n- Lăng kính hoặc giọt nước có thể làm ánh sáng trắng tách màu.","confidenceLevel":"HIGH","requiresConfirmation":false,"suggestedTasks":[]}}

User: tạo lịch nhắc nhở mỗi ngày tôi phải chấm công vào lúc 8h sáng
Context: có hoặc không có task cũ đều không quan trọng.
JSON:
{{"intent":"CREATE_TASK_DRAFT","answer":"Mình đã hiểu: bạn muốn tạo một lịch nhắc lặp lại hằng ngày để chấm công lúc 08:00.\\n\\nMình chuẩn bị task nháp bên dưới, bạn xem lại rồi bấm tạo nếu đúng nhé.","confidenceLevel":"HIGH","requiresConfirmation":true,"suggestedTasks":[{{"title":"Chấm công","description":"Nhắc chấm công mỗi ngày vào buổi sáng.","category":"Work","type":"Reminder","priority":"Trung bình","difficulty":"Dễ","startDate":"","deadline":"","startTime":"08:00","reminder":"Đúng giờ","suggestedSteps":["Nhận thông báo lúc 08:00","Mở hệ thống chấm công","Xác nhận đã chấm công"]}}]}}

User: tạo lịch nhắc sinh nhật cho các nhân viên
Context: file Excel nhân sự có nhiều dòng Họ tên và Ngày sinh.
JSON:
{{"intent":"CREATE_TASK_DRAFT","answer":"Mình sẽ tách từng nhân viên trong file thành từng reminder sinh nhật riêng, không gom thành một task tổng.\\n\\nMỗi reminder nên gồm tên nhân viên, ngày sinh, phòng ban/chức vụ nếu có, và lặp lại hằng năm. Bạn xem danh sách task nháp rồi xác nhận trước khi lưu vào Calendar nhé.","confidenceLevel":"HIGH","requiresConfirmation":true,"suggestedTasks":[]}}

User: tạo task từ dữ liệu này
Context: dữ liệu chỉ có insight, chưa có hành động bắt buộc.
JSON:
{{"intent":"CREATE_TASK_DRAFT","answer":"Mình có thể tạo task nháp từ insight dữ liệu, nhưng sẽ không tự lưu ngay. Gợi ý hợp lý là kiểm tra các giá trị bất thường và chuẩn bị báo cáo tóm tắt. Bạn xem task nháp bên dưới rồi bấm tạo nếu đúng ý nhé.","confidenceLevel":"MEDIUM","requiresConfirmation":true,"suggestedTasks":[{{"title":"Kiểm tra insight dữ liệu bất thường","description":"Rà soát các điểm bất thường và nhóm nổi bật trong file dữ liệu vừa upload trước khi báo cáo.","category":"Work","type":"Task","priority":"Trung bình","difficulty":"Trung bình","startDate":"","deadline":"","startTime":"09:00","reminder":"Không nhắc","suggestedSteps":["Xem lại các cột số chính","Kiểm tra giá trị bất thường","Ghi lại nhóm cao nhất/thấp nhất","Chuẩn bị tóm tắt báo cáo"]}}]}}

Tổng task: {context["total_tasks"]}
Task chưa hoàn thành: {context["incomplete_tasks"]}

LỊCH SỬ CHAT GẦN ĐÂY:
{context["history_summary"]}

USER_FEEDBACK_MEMORY:
{context["feedback_memory"]}

Q_LEARNING_POLICY:
{context["q_learning_policy"]}

CONVERSATION_SUMMARY:
{context["conversation_summary"]}

USER_PROFILE:
{context["user_profile"]}

TASK HIỆN CÓ:
{context["task_summary"]}

TÀI LIỆU ĐÃ UPLOAD:
{context["document_summary"]}

ĐOẠN TÀI LIỆU LIÊN QUAN ĐƯỢC TRUY HỒI:
{context["relevant_context"]}

    NGƯỜI DÙNG HỎI:
{message}
"""

    try:
        generation_model, used_provider, used_model = get_chat_generation_model(
            message,
            relevant_context,
        )
        if generation_model is None:
            raise RuntimeError("AI model is not configured")

        try:
            response = generation_model.generate_content(prompt)
        except Exception:
            if used_provider != "groq" and groq_fallback_model is not None:
                generation_model = groq_fallback_model
                used_provider = "groq"
                used_model = GROQ_MODEL
                response = generation_model.generate_content(prompt)
            else:
                raise

        if used_provider == "groq" and hasattr(generation_model, "last_used_model"):
            used_model = generation_model.last_used_model

        reply = (response.text or "").strip()

        if not reply:
            raise ValueError("Gemini returned an empty reply")

        structured_reply = parse_structured_chat_response(reply)
        unsupported_facts = answer_has_unsupported_critical_facts(
            structured_reply["answer"],
            relevant_context or [],
        )

        if unsupported_facts and relevant_context:
            retry_prompt = f"""
Bạn vừa trả lời có số/ngày/giờ không nằm trong evidence: {", ".join(unsupported_facts)}.

Hãy trả lại JSON hợp lệ theo schema cũ, nhưng sửa answer theo quy tắc:
- Chỉ dùng số, ngày, giờ, phần trăm, số tiền có trong evidence.
- Nếu evidence không đủ, nói rõ "tài liệu chưa nêu".
- Không thêm fact ngoài evidence.

EVIDENCE:
{context["relevant_context"]}

QUESTION:
{message}
"""
            retry_response = generation_model.generate_content(retry_prompt)
            retry_reply = (retry_response.text or "").strip()
            retry_structured_reply = parse_structured_chat_response(retry_reply)
            retry_unsupported_facts = answer_has_unsupported_critical_facts(
                retry_structured_reply["answer"],
                relevant_context or [],
            )
            if not retry_unsupported_facts:
                structured_reply = retry_structured_reply
            else:
                structured_reply["answer"] = build_local_document_qa_fallback(
                    message,
                    relevant_context or [],
                )
                structured_reply["confidenceLevel"] = "LOW"

        return {
            "success": True,
            "conversationId": conversation_id,
            "intent": structured_reply["intent"],
            "answer": structured_reply["answer"],
            "reply": structured_reply["answer"],
            "confidenceLevel": structured_reply["confidenceLevel"],
            "requiresClarification": structured_reply["requiresClarification"],
            "clarificationQuestion": structured_reply["clarificationQuestion"],
            "requiresConfirmation": structured_reply["requiresConfirmation"],
            "sources": structured_reply["sources"],
            "suggestedActions": structured_reply["suggestedActions"],
            "suggestedTasks": structured_reply["suggestedTasks"],
            "memoryCandidates": structured_reply["memoryCandidates"],
            "metadata": {
                **structured_reply["metadata"],
                "provider": used_provider,
                "model": used_model,
                "userId": user_id,
                "usedDocumentContext": bool(relevant_context),
                "usedConversationSummary": bool(conversation_summary),
            },
        }
    except Exception as error:
        print("Gemini chat guidance error:", error)
        return {
            "success": True,
            "conversationId": conversation_id,
            "intent": "LOCAL_FALLBACK",
            "answer": (
                build_local_document_qa_fallback(message, relevant_context or [])
                if relevant_context
                else build_local_guidance_reply(message, tasks, documents)
            ),
            "reply": (
                build_local_document_qa_fallback(message, relevant_context or [])
                if relevant_context
                else build_local_guidance_reply(message, tasks, documents)
            ),
            "confidenceLevel": "LOW",
            "requiresClarification": False,
            "clarificationQuestion": "",
            "requiresConfirmation": False,
            "sources": [],
            "suggestedActions": [],
            "suggestedTasks": [],
            "memoryCandidates": [],
            "metadata": {
                "provider": "local",
                "model": "local-fallback",
                "error": str(error)[:300],
                "userId": user_id,
            },
        }



def find_task_to_update(tasks, message: str):
    message = message.lower().strip()

    for task in tasks:
        title = task.get("title", "").lower()

        if title and title in message:
            return task

    if "cuộc họp" in message or "họp" in message:
        for task in tasks:
            if task.get("type") == "Meeting":
                return task

    return None

def find_task_to_delete(tasks, message: str):
    message = message.lower().strip()

    for task in tasks:
        title = task.get("title", "").lower().strip()

        if title and title in message:
            return task

    if "cuộc họp" in message or "họp" in message:
        for task in tasks:
            if task.get("type") == "Meeting":
                return task

    return None

def find_task_to_complete(tasks, message: str):
    message = message.lower().strip()

    for task in tasks:
        title = task.get("title", "").lower().strip()

        if title and title in message:
            return task

    return None


def find_task_for_progress(tasks, message: str):
    message = message.lower().strip()

    for task in tasks:
        title = task.get("title", "").lower().strip()

        if title and title in message:
            return task

    return None


def find_task_to_reopen(tasks, message: str):
    message = message.lower().strip()

    for task in tasks:
        title = task.get("title", "").lower().strip()

        if title and title in message:
            return task

    return None


def create_checklist_for_task(task):
    title = task.get("title", "").lower()
    task_type = task.get("type", "")

    if "english" in title or "tiếng anh" in title:
        return [
            {"id": "step-1", "title": "Xác định chủ đề bài thuyết trình", "completed": False},
            {"id": "step-2", "title": "Tìm và tổng hợp nội dung chính", "completed": False},
            {"id": "step-3", "title": "Viết dàn ý tiếng Anh", "completed": False},
            {"id": "step-4", "title": "Thiết kế slide trình bày", "completed": False},
            {"id": "step-5", "title": "Luyện nói và kiểm tra phát âm", "completed": False},
        ]

    if task_type == "Meeting":
        return [
            {"id": "step-1", "title": "Xác định nội dung cuộc họp", "completed": False},
            {"id": "step-2", "title": "Chuẩn bị tài liệu liên quan", "completed": False},
            {"id": "step-3", "title": "Ghi chú các ý cần trao đổi", "completed": False},
            {"id": "step-4", "title": "Tham gia cuộc họp đúng giờ", "completed": False},
        ]

    return [
        {"id": "step-1", "title": "Đọc lại yêu cầu công việc", "completed": False},
        {"id": "step-2", "title": "Chia nhỏ nhiệm vụ", "completed": False},
        {"id": "step-3", "title": "Thực hiện từng phần", "completed": False},
        {"id": "step-4", "title": "Kiểm tra kết quả", "completed": False},
        {"id": "step-5", "title": "Hoàn thành và cập nhật trạng thái", "completed": False},
    ]


def find_tasks_by_date_query(tasks, message: str):
    today = date.today()
    message = message.lower().strip()

    if "hôm nay" in message:
        start_date = today
        end_date = today

    elif "ngày mai" in message:
        start_date = today + timedelta(days=1)
        end_date = start_date

    elif "ngày kia" in message:
        start_date = today + timedelta(days=2)
        end_date = start_date

    elif "tuần này" in message:
        start_date = today - timedelta(
            days=today.weekday()
        )

        end_date = start_date + timedelta(days=6)

    elif (
        "tuần sau" in message
        or "tuần tới" in message
    ):
        start_date = (
            today
            - timedelta(days=today.weekday())
            + timedelta(days=7)
        )

        end_date = start_date + timedelta(days=6)

    else:
        specific_date = extract_vietnamese_date(
            message
        )

        if not specific_date:
            return []

        start_date = specific_date
        end_date = specific_date

    matched_tasks = []

    for task in tasks:
        task_dates = [
            task.get("startDate"),
            task.get("deadline"),
        ]

        for task_date_text in task_dates:
            if not task_date_text:
                continue

            try:
                task_date = datetime.strptime(
                    task_date_text,
                    "%Y-%m-%d",
                ).date()

            except ValueError:
                continue

            if start_date <= task_date <= end_date:
                matched_tasks.append(task)
                break

    matched_tasks.sort(
        key=lambda task: (
            task.get("startDate")
            or task.get("deadline")
            or ""
        )
    )

    return matched_tasks


@app.get("/")
def home():
    return {
        "service": "TamCam AI Service",
        "status": "running",
        "provider": AI_PROVIDER,
        "model": get_active_model_name(),
        "geminiChatModel": GEMINI_CHAT_MODEL,
        "geminiReasoningModel": GEMINI_REASONING_MODEL,
        "groqModel": GROQ_MODEL,
        "keyConfigured": is_active_key_configured(),
        "geminiKeyConfigured": bool(GEMINI_API_KEY),
        "groqKeyConfigured": bool(GROQ_API_KEY),
    }


@app.get("/health")
def health(
    probe: str = "",
):
    ai_status = {
        "ok": bool(is_active_key_configured() and gemini_model),
        "provider": AI_PROVIDER,
        "model": get_active_model_name(),
        "chatModel": GEMINI_CHAT_MODEL if AI_PROVIDER != "groq" else GROQ_MODEL,
        "reasoningModel": GEMINI_REASONING_MODEL,
        "groqFallbackConfigured": bool(groq_fallback_model),
        "keyConfigured": is_active_key_configured(),
        "probe": "skipped",
        "message": "AI provider probe was not requested.",
    }

    if not is_active_key_configured() or not gemini_model:
        ai_status.update(
            {
                "ok": False,
                "probe": "not-run",
                "message": (
                    "GROQ_API_KEY is missing."
                    if AI_PROVIDER == "groq"
                    else "GEMINI_API_KEY is missing."
                ),
            }
        )
    elif probe in ("gemini", "groq", "ai"):
        try:
            response = gemini_model.generate_content(
                "Reply with exactly: OK"
            )
            response_text = (response.text or "").strip()
            ai_status.update(
                {
                    "ok": "OK" in response_text.upper(),
                    "probe": "completed",
                    "message": response_text[:120] or "AI provider returned an empty response.",
                }
            )
        except Exception as error:
            error_text = str(error)
            error_kind = "error"
            if "429" in error_text or "quota" in error_text.lower():
                error_kind = "quota-or-rate-limit"
            elif "403" in error_text or "permission" in error_text.lower():
                error_kind = "permission-denied"

            ai_status.update(
                {
                    "ok": False,
                    "probe": "failed",
                    "errorKind": error_kind,
                    "message": error_text[:500],
                }
            )

    return {
        "service": "TamCam AI Service",
        "status": "running",
        "checkedAt": datetime.now().isoformat(),
        "corsOrigins": CLIENT_ORIGINS,
        "provider": AI_PROVIDER,
        "model": get_active_model_name(),
        "geminiChatModel": GEMINI_CHAT_MODEL,
        "geminiReasoningModel": GEMINI_REASONING_MODEL,
        "groqModel": GROQ_MODEL,
        "ai": ai_status,
        "gemini": ai_status,
        "groq": ai_status,
    }


@app.post(
    "/analyze-document",
    response_model=DocumentAnalysisResponse,
)
def analyze_document(
    request: DocumentAnalysisRequest,
):
    text = request.text.strip()
    if not text:
        return {
            "success": True,
            "documentType": "EMPTY",
            "documentPurpose": "Tài liệu không có nội dung",
            "isActionable": False,
            "documentSummary": "",
            "tasks": [],
        }

    data_context = ""
    if request.data_insights:
        data_context = f"""

DATA_INSIGHTS_JSON do hệ thống tính toán thật từ Excel/CSV:
{json.dumps(request.data_insights, ensure_ascii=False)[:8000]}

Nếu có DATA_INSIGHTS_JSON:
- Phân loại documentType là SPREADSHEET_DATA trừ khi tài liệu rõ ràng là loại đặc biệt khác.
- Ưu tiên dựa vào số liệu đã tính để nêu insight, bất thường, dự báo, biểu đồ.
- Không bịa số ngoài DATA_INSIGHTS_JSON.
"""

    prompt = f"""
Bạn là AI phân tích tài liệu và dữ liệu của TamCam AI.

Mục tiêu sản phẩm:
Người dùng upload tài liệu để hiểu rõ tài liệu đó là gì, nội dung quan trọng là gì, họ cần làm gì tiếp, có deadline/mốc thời gian không, có nên tạo task/lịch nhắc không, và workflow xử lý ra sao.

Bạn phải phân tích theo ngữ cảnh người dùng có thể là sinh viên, nhân viên văn phòng, quản lý dự án, kế toán, nhân sự, kinh doanh, marketing, logistics, IT hoặc người dùng cá nhân.

CRITICAL CLASSIFICATION RULE:
- First classify whether the document is actionable.
- If the document is only informational/reference/process/theory/guideline and has no explicit human assignment, deadline, owner, request, deliverable, or required follow-up, set "isActionable": false and return "tasks": [].
- For informational/reference documents, DO NOT invent tasks like "read document", "analyze document", "understand process", or "summarize paragraph". The user can ask for tasks later.

Quy tắc phân loại:
1. STUDY_EXERCISE_DOCUMENT: bài tập, lời giải, chương học, công thức, câu đúng/sai, đề cương học.
2. PRESENTATION_DOCUMENT: tài liệu thật sự yêu cầu thuyết trình, slide, kịch bản nói, trình bày.
3. MEETING_MINUTES_DOCUMENT: biên bản họp, kết luận họp, action item, người phụ trách, follow-up.
4. WORK_EMAIL_DOCUMENT: email/công văn/yêu cầu công việc cần phản hồi hoặc xử lý.
5. PROJECT_PLAN_DOCUMENT: kế hoạch dự án, milestone, timeline, deliverable, phân công.
6. BUSINESS_REPORT_DOCUMENT: báo cáo công việc/kinh doanh/thị trường/số liệu/insight.
7. SPREADSHEET_DATA: bảng dữ liệu, danh sách, dữ liệu cần tổng hợp theo dòng/cột.
8. HR_DOCUMENT: nhân sự, ứng viên, nhân viên, chấm công, lương, phòng ban.
9. FINANCE_DOCUMENT: hóa đơn, chi phí, công nợ, ngân sách, thanh toán, doanh thu.
10. POLICY_OR_CONTRACT_DOCUMENT: hợp đồng, chính sách, quy định, điều khoản, pháp lý.
11. REFERENCE_PROCESS_DOCUMENT: tài liệu tham khảo/quy trình/nghiệp vụ chỉ để đọc hiểu, không có nhiệm vụ được giao.
12. GENERAL_DOCUMENT: tài liệu tham khảo chưa có hành động rõ.

Quy tắc tạo task:
- Chỉ tạo task từ hành động thật sự cần làm: phản hồi, nộp, chuẩn bị, kiểm tra, tổng hợp, liên hệ, thanh toán, họp, báo cáo, ôn tập, làm lại bài, theo dõi.
- TUYỆT ĐỐI KHÔNG dùng câu trần thuật, câu định nghĩa, câu lý thuyết, câu mô tả quy trình hoặc câu báo lỗi/hệ thống làm tên task.
- Nếu không tìm thấy hành động thực tế từ người dùng/tài liệu, trả "isActionable": false và "tasks": [].
- Tên task phải ngắn, dễ scan, tối đa 8 từ, bắt đầu bằng động từ hành động. Đưa bối cảnh dài vào description và checklist.
- Không tạo task thuyết trình nếu tài liệu không yêu cầu thuyết trình.
- Không bịa deadline/ngày/giờ/người phụ trách nếu tài liệu không có. Nếu thiếu, để rỗng và dùng suggestedSteps để hướng dẫn.
- Nếu tài liệu chỉ cần đọc hiểu, hãy tạo ít task hơn hoặc tasks rỗng, nhưng documentPurpose phải nói rõ nên tóm tắt/đọc hiểu/hỏi sâu phần nào.
- suggestedSteps phải cụ thể, làm được, không chung chung.
- Ưu tiên giúp người dùng hiểu "bây giờ tôi cần làm gì".
- Không xuất quy trình suy nghĩ nội bộ như "xác định tài liệu nói về gì" thành workflow cho người dùng.
- Chỉ trả JSON hợp lệ. Không markdown. Không ```json. Không giải thích ngoài JSON.

Tên file: {request.file_name}

NỘI DUNG TÀI LIỆU:
{text[:12000]}
{data_context}

JSON bắt buộc theo cấu trúc:
{{
  "success": true,
  "documentType": "STUDY_EXERCISE_DOCUMENT hoặc PRESENTATION_DOCUMENT hoặc MEETING_MINUTES_DOCUMENT hoặc WORK_EMAIL_DOCUMENT hoặc PROJECT_PLAN_DOCUMENT hoặc BUSINESS_REPORT_DOCUMENT hoặc SPREADSHEET_DATA hoặc HR_DOCUMENT hoặc FINANCE_DOCUMENT hoặc POLICY_OR_CONTRACT_DOCUMENT hoặc REFERENCE_PROCESS_DOCUMENT hoặc GENERAL_DOCUMENT",
  "documentPurpose": "Mục đích tài liệu bằng tiếng Việt",
  "isActionable": false,
  "documentSummary": "Tóm tắt cốt lõi tài liệu trong 2-3 câu tiếng Việt",
  "tasks": [
    {{
      "title": "Động từ + đối tượng, tối đa 8 từ",
      "description": "Mô tả nhiệm vụ, bối cảnh chi tiết từ tài liệu",
      "category": "Study hoặc Work hoặc Meeting hoặc Personal",
      "type": "Task hoặc Learning hoặc Assignment hoặc Meeting hoặc Deadline",
      "domain": "Lĩnh vực",
      "difficulty": "Dễ hoặc Trung bình hoặc Khó",
      "necessity": "Thấp hoặc Trung bình hoặc Cao",
      "priority": "Thấp hoặc Trung bình hoặc Cao",
      "startDate": "",
      "deadline": "",
      "startTime": "",
      "endTime": "",
      "estimate": "Chọn thời gian",
      "reminder": "Không nhắc",
      "assignee": "Tôi",
      "status": "To do",
      "completed": false,
      "suggestedSteps": ["Bước 1", "Bước 2", "Bước 3"]
    }}
  ]
}}
"""

    try:
        if gemini_model is None:
            raise RuntimeError("Gemini model is not configured")

        response = gemini_model.generate_content(prompt)
        response_text = response.text.strip()
        response_text = response_text.replace(
            "```json",
            "",
        )
        response_text = response_text.replace(
            "```",
            "",
        )
        response_text = response_text.strip()
        result = normalize_document_analysis_result(json.loads(response_text))

        data_agent_result = run_data_analysis_agent(
            data_insights=request.data_insights,
            file_name=request.file_name,
            document_text=text,
            gemini_model=gemini_model,
        )

        if data_agent_result:
            data_suggested_tasks = data_agent_result.get("suggestedTasks")
            if not isinstance(data_suggested_tasks, list):
                data_suggested_tasks = []

            result = normalize_document_analysis_result(
                {
                    **result,
                    "documentType": "SPREADSHEET_DATA",
                    "documentPurpose": (
                        result.get("documentPurpose")
                        or "Bảng dữ liệu cần phân tích, tổng hợp insight và đề xuất hành động."
                    ),
                    "dataAnalysis": data_agent_result.get("dataAnalysis"),
                    "summary": data_agent_result.get("summary") or result.get("summary") or "",
                    "insights": data_agent_result.get("insights") or result.get("insights") or [],
                    "anomalies": data_agent_result.get("anomalies") or result.get("anomalies") or [],
                    "predictions": data_agent_result.get("predictions") or result.get("predictions") or [],
                    "chartSuggestions": data_agent_result.get("chartSuggestions") or result.get("chartSuggestions") or [],
                    "recommendedActions": data_agent_result.get("recommendedActions") or result.get("recommendedActions") or [],
                    "suggestedTasks": [
                        *(result.get("suggestedTasks") or []),
                        *data_suggested_tasks,
                    ],
                }
            )

        return result
    except json.JSONDecodeError as error:
        print(
            "Gemini JSON decode error:",
            error,
        )
        print(
            "Gemini raw response:",
            response_text,
        )
        data_agent_result = run_data_analysis_agent(
            data_insights=request.data_insights,
            file_name=request.file_name,
            document_text=text,
            gemini_model=None,
        )
        if data_agent_result:
            return normalize_document_analysis_result(
                {
                    "success": True,
                    "documentType": "SPREADSHEET_DATA",
                    "documentPurpose": "Bảng dữ liệu được phân tích bằng Data Analysis Agent dự phòng.",
                    "isActionable": False,
                    "documentSummary": data_agent_result.get("summary") or "",
                    "tasks": [],
                    "dataAnalysis": data_agent_result.get("dataAnalysis"),
                    "summary": data_agent_result.get("summary") or "",
                    "insights": data_agent_result.get("insights") or [],
                    "anomalies": data_agent_result.get("anomalies") or [],
                    "predictions": data_agent_result.get("predictions") or [],
                    "chartSuggestions": data_agent_result.get("chartSuggestions") or [],
                    "recommendedActions": data_agent_result.get("recommendedActions") or [],
                    "suggestedTasks": data_agent_result.get("suggestedTasks") or [],
                }
            )
        return {
            "success": False,
            "documentType": "ERROR",
            "documentPurpose": (
                "AI trả về dữ liệu không đúng định dạng"
            ),
            "isActionable": False,
            "documentSummary": "",
            "tasks": [],
        }
    except Exception as error:
        print(
            "Gemini document analysis error:",
            error,
        )
        data_agent_result = run_data_analysis_agent(
            data_insights=request.data_insights,
            file_name=request.file_name,
            document_text=text,
            gemini_model=None,
        )
        if data_agent_result:
            return normalize_document_analysis_result(
                {
                    "success": True,
                    "documentType": "SPREADSHEET_DATA",
                    "documentPurpose": "Bảng dữ liệu được phân tích bằng Data Analysis Agent dự phòng.",
                    "isActionable": False,
                    "documentSummary": data_agent_result.get("summary") or "",
                    "tasks": [],
                    "dataAnalysis": data_agent_result.get("dataAnalysis"),
                    "summary": data_agent_result.get("summary") or "",
                    "insights": data_agent_result.get("insights") or [],
                    "anomalies": data_agent_result.get("anomalies") or [],
                    "predictions": data_agent_result.get("predictions") or [],
                    "chartSuggestions": data_agent_result.get("chartSuggestions") or [],
                    "recommendedActions": data_agent_result.get("recommendedActions") or [],
                    "suggestedTasks": data_agent_result.get("suggestedTasks") or [],
                }
            )
        return {
            "success": False,
            "documentType": "ERROR",
            "documentPurpose": (
                "Không thể phân tích tài liệu bằng AI"
            ),
            "isActionable": False,
            "documentSummary": "",
            "tasks": [],
        }


def build_task_rewrite_context(documents, tasks):
    latest_document = documents[-1] if documents else None
    document_context = "Không có tài liệu hiện tại."

    if latest_document:
        document_context = json.dumps(
            {
                "file": latest_document.get("file")
                or latest_document.get("fileName")
                or latest_document.get("name")
                or "",
                "documentType": latest_document.get("documentType") or "",
                "summary": latest_document.get("documentSummary")
                or latest_document.get("summary")
                or latest_document.get("textPreview")
                or "",
                "dataInsights": latest_document.get("dataInsights") or None,
            },
            ensure_ascii=False,
            indent=2,
        )

    nearby_tasks = [
        {
            "title": task.get("title") or "",
            "startDate": task.get("startDate") or "",
            "deadline": task.get("deadline") or "",
            "startTime": task.get("startTime") or "",
            "endTime": task.get("endTime") or "",
            "priority": task.get("priority") or "",
        }
        for task in tasks[:12]
    ]

    return document_context, nearby_tasks


@app.post("/rewrite-task-draft")
def rewrite_task_draft(request: TaskRewriteRequest):
    original_task = normalize_document_task(request.taskDraft, 0)

    if not original_task:
        return {
            "success": False,
            "message": "Task nháp chưa đủ rõ để chỉnh.",
            "taskDraft": None,
        }

    document_context, nearby_tasks = build_task_rewrite_context(
        request.documents,
        request.tasks,
    )

    current_time = datetime.now().strftime("%A, %d/%m/%Y %H:%M")
    prompt = f"""
Bạn là TamCam AI Task Draft Rewriter.

Nhiệm vụ: chỉnh sửa task nháp theo yêu cầu người dùng, KHÔNG tạo task mới ngoài ý định.

CURRENT_TIME: {current_time}

QUY TẮC BẮT BUỘC:
- Chỉ trả về JSON hợp lệ, không thêm chữ ngoài JSON.
- Không lưu task. Chỉ sửa bản nháp.
- Giữ title ngắn, có động từ hành động, tối đa 8 từ.
- Đưa bối cảnh dài vào description, không nhét vào title.
- Checklist phải là các bước hành động cụ thể, 3-6 bước.
- Nếu người dùng yêu cầu đổi lịch nhưng thiếu giờ, hãy gợi ý giờ hợp lý.
- Ngày phải là YYYY-MM-DD hoặc rỗng. Giờ phải là HH:mm hoặc rỗng.
- Không bịa nội dung ngoài task/document context.

TASK NHÁP HIỆN TẠI:
{json.dumps(original_task, ensure_ascii=False, indent=2)}

YÊU CẦU CHỈNH SỬA:
{request.instruction}

TÀI LIỆU LIÊN QUAN:
{document_context}

TASK/LỊCH HIỆN CÓ ĐỂ THAM KHẢO:
{json.dumps(nearby_tasks, ensure_ascii=False, indent=2)}

TRẢ VỀ JSON:
{{
  "success": true,
  "message": "Đã chỉnh bản nháp theo yêu cầu.",
  "taskDraft": {{
    "title": "Tên task ngắn",
    "description": "Mô tả rõ ràng",
    "category": "Study | Work | General",
    "type": "Task",
    "domain": "General",
    "difficulty": "Dễ | Trung bình | Khó",
    "necessity": "Thấp | Trung bình | Cao",
    "priority": "Thấp | Trung bình | Cao",
    "startDate": "YYYY-MM-DD hoặc rỗng",
    "deadline": "YYYY-MM-DD hoặc rỗng",
    "startTime": "HH:mm hoặc rỗng",
    "endTime": "HH:mm hoặc rỗng",
    "estimate": "Chọn thời gian",
    "reminder": "Không nhắc | Trước 10 phút | Trước 30 phút | Trước 1 giờ | Trước 1 ngày",
    "assignee": "Tôi",
    "status": "To do",
    "completed": false,
    "suggestedSteps": ["Bước 1", "Bước 2", "Bước 3"]
  }}
}}
"""

    try:
        if gemini_model is None:
            raise RuntimeError("Gemini model is not configured")

        response = gemini_model.generate_content(prompt)
        raw_text = (response.text or "").strip()
        data = json.loads(clean_gemini_json_text(raw_text))
        rewritten_task = normalize_document_task(
            data.get("taskDraft") or data.get("task") or {},
            0,
        )

        if not rewritten_task:
            raise ValueError("Gemini returned an invalid task draft")

        return {
            "success": True,
            "message": str(data.get("message") or "Đã chỉnh bản nháp theo yêu cầu."),
            "taskDraft": rewritten_task,
        }
    except Exception as error:
        print("Gemini task rewrite error:", error)
        return {
            "success": False,
            "message": "AI chưa chỉnh được bản nháp, frontend sẽ dùng bộ chỉnh local.",
            "taskDraft": original_task,
        }


@app.post("/chat")
def chat(request: ChatRequest):
    message = request.message.lower().strip()
    tasks = request.tasks
    documents = request.documents

    intent = detect_intent(message)
    recurring_reminder_reply = build_recurring_reminder_from_message(
        request.message
    )
    if recurring_reminder_reply:
        recurring_reminder_reply["conversationId"] = request.conversationId
        recurring_reminder_reply["metadata"] = {
            **recurring_reminder_reply.get("metadata", {}),
            "userId": request.userId,
        }
        return recurring_reminder_reply

    incomplete_tasks = [
        task
        for task in tasks
        if not task.get("completed", False)
    ]

    if intent == "GREETING":
        return {
            "success": True,
            "reply": (
                "Xin chào! Tôi là TamCam AI. "
                "Tôi có thể giúp bạn kiểm tra công việc, "
                "deadline và đề xuất nhiệm vụ nên ưu tiên."
            ),
        }

    if intent == "TASK_OVERVIEW":
        total_tasks = len(tasks)

        completed_tasks = [
            task
            for task in tasks
            if task.get("completed", False)
        ]

        incomplete_tasks_overview = [
            task
            for task in tasks
            if not task.get("completed", False)
        ]

        high_priority_tasks = [
            task
            for task in incomplete_tasks_overview
            if task.get("priority") == "Cao"
        ]

        nearest_task = find_nearest_deadline(
            incomplete_tasks_overview
        )

        if not tasks:
            return {
                "success": True,
                "reply": (
                    "Bạn hiện chưa có công việc nào. "
                    "Bạn có thể yêu cầu tôi tạo task mới."
                ),
            }

        overview_lines = [
            f"Bạn hiện có {total_tasks} công việc.",
            (
                f"{len(incomplete_tasks_overview)} công việc "
                f"chưa hoàn thành."
            ),
            (
                f"{len(completed_tasks)} công việc "
                f"đã hoàn thành."
            ),
            (
                f"Có {len(high_priority_tasks)} task "
                f"ưu tiên cao."
            ),
        ]

        if nearest_task:
            overview_lines.append(
               (
                    f"Task gần deadline nhất là "
                    f"'{nearest_task.get('title', 'Nhiệm vụ')}', "
                    f"hạn {nearest_task.get('deadline')}."
               )
            )

        if incomplete_tasks_overview:
            ranked_tasks = rank_tasks(
                incomplete_tasks_overview
            )

            top_task = ranked_tasks[0]

            overview_lines.append(
                (
                    f"Tôi đề xuất bạn ưu tiên "
                    f"'{top_task.get('title', 'Nhiệm vụ')}' "
                    f"trước."
                )
            )

        return {
            "success": True,
            "intent": "TASK_OVERVIEW",
            "reply": "\n".join(overview_lines),
        }

    if intent == "CREATE_TASK":
        task_date = extract_task_date(message)
        task_time = extract_task_time(message)
        suggested_date, suggested_time, suggested_reminder = (
            suggest_task_schedule(message)
        )
        date_was_suggested = task_date is None
        time_was_suggested = not task_time

        task_date = task_date or suggested_date
        task_time = task_time or suggested_time

        if "họp" in message:
            title = "Cuộc họp"
            task_type = "Meeting"
            category = "Meeting"
        else:
            title = "Công việc mới"
            task_type = "Task"
            category = "General"

        new_task = {
            "id": f"chat-{int(datetime.now().timestamp())}",
            "title": title,
            "description": request.message,
            "category": category,
            "type": task_type,
            "startDate": task_date.isoformat(),
            "deadline": task_date.isoformat(),
            "startTime": task_time,
            "endTime": "",
            "priority": "Trung bình",
            "difficulty": "Dễ",
            "necessity": "Trung bình",
            "reminder": suggested_reminder,
            "status": "To do",
            "completed": False,
            "assignee": "Tôi",
        }

        date_text = task_date.strftime("%d/%m/%Y")

        time_text = (
            f" lúc {task_time}"
            if task_time
            else ""
        )

        suggestion_text = (
            " Đây là lịch tôi gợi ý vì bạn chưa nói đủ ngày/giờ. "
            "Bạn muốn giữ lịch này hay chỉnh ngày, giờ hoặc reminder?"
            if date_was_suggested or time_was_suggested
            else ""
        )

        return {
            "success": True,
            "intent": "CREATE_TASK_DRAFT",
            "reply": (
                f"Mình đã chuẩn bị task nháp '{title}' vào ngày {date_text}"
                f"{time_text}.{suggestion_text} "
                "Bạn bấm nút tạo task bên dưới để lưu vào Task List/Calendar nhé."
            ),
            "confidenceLevel": "MEDIUM" if date_was_suggested or time_was_suggested else "HIGH",
            "requiresConfirmation": True,
            "suggestedTasks": [new_task],
        }

    if intent == "TASK_PRIORITY":
        if not incomplete_tasks:
            return {
                "success": True,
                "reply": (
                    "Bạn hiện không có nhiệm vụ nào "
                    "chưa hoàn thành."
                ),
            }

        ranked_tasks = rank_tasks(
            incomplete_tasks
        )

        top_task = ranked_tasks[0]

        reason = explain_task_score(top_task)

        return {
        "success": True,
        "reply": (
            f"Tôi đề xuất bạn ưu tiên làm "
            f"'{top_task.get('title', 'Nhiệm vụ')}' trước. "
            f"Lý do: {reason}. "
            f"Điểm ưu tiên của nhiệm vụ này là "
            f"{top_task['aiScore']}/3."
        ),
    }

    if intent == "UPDATE_TASK":
        task_to_update = find_task_to_update(
            incomplete_tasks,
            message,
        )

        if not task_to_update:
            return {
                "success": True,
                "reply": (
                    "Tôi chưa tìm thấy task cần sửa."
                ),
            }

        updated_fields = {}

        new_time = extract_task_time(message)

        if new_time:
            updated_fields["startTime"] = new_time

        if not updated_fields:
            return {
                "success": True,
                "reply": (
                    "Tôi đã tìm thấy task cần sửa, "
                    "nhưng chưa xác định được thông tin mới."
                ),
            }

        return {
            "success": True,
            "intent": "UPDATE_TASK",
            "taskId": task_to_update.get("id"),
            "updatedFields": updated_fields,
            "reply": (
                f"Tôi sẽ cập nhật task "
                f"'{task_to_update.get('title', 'Nhiệm vụ')}'."
            ),
        }

    if intent == "DELETE_TASK":
        task_to_delete = find_task_to_delete(
            incomplete_tasks,
            message,
        )

        if not task_to_delete:
            return {
                "success": True,
                "reply": (
                    "Tôi chưa tìm thấy task cần xóa."
                ),
            }

        return {
            "success": True,
            "intent": "DELETE_TASK",
            "taskId": task_to_delete.get("id"),
            "reply": (
                f"Tôi sẽ xóa task "
                f"'{task_to_delete.get('title', 'Nhiệm vụ')}'."
            ),
        }

    if intent == "COMPLETE_TASK":
        task_to_complete = find_task_to_complete(
            incomplete_tasks,
            message,
        )

        if not task_to_complete:
            return {
                "success": True,
                "reply": (
                    "Tôi chưa tìm thấy task cần "
                    "đánh dấu hoàn thành."
                ),
            }

        return {
            "success": True,
            "intent": "COMPLETE_TASK",
            "taskId": task_to_complete.get("id"),
            "updatedFields": {
                "completed": True,
                "status": "Completed",
            },
            "reply": (
                f"Tôi sẽ đánh dấu task "
                f"'{task_to_complete.get('title', 'Nhiệm vụ')}' "
                f"là hoàn thành."
            ),
        }

    if intent == "REOPEN_TASK":
        task_to_reopen = find_task_to_complete(
            tasks,
            message,
        )

        if not task_to_reopen:
            return {
                "success": True,
                "reply": (
                    "Tôi chưa tìm thấy task cần mở lại."
                ),
            }

        return {
            "success": True,
            "intent": "REOPEN_TASK",
            "taskId": task_to_reopen.get("id"),
            "updatedFields": {
                "completed": False,
                "status": "To do",
            },
            "reply": (
                f"Tôi sẽ chuyển task "
                f"'{task_to_reopen.get('title', 'Nhiệm vụ')}' "
                f"về trạng thái chưa hoàn thành."
            ),
        }

    if intent == "GENERATE_CHECKLIST":
        task_to_update = find_task_to_complete(
            tasks,
            message,
        )

        if not task_to_update:
            return {
                "success": True,
                "reply": "Tôi chưa tìm thấy task cần tạo checklist.",
            }

        checklist = create_checklist_for_task(task_to_update)

        return {
            "success": True,
            "intent": "GENERATE_CHECKLIST",
            "taskId": task_to_update.get("id"),
            "updatedFields": {
                "checklist": checklist,
            },
            "reply": (
                f"Tôi đã tạo checklist cho task "
                f"'{task_to_update.get('title', 'Nhiệm vụ')}'."
            ),
        }

    if intent == "TASK_PROGRESS":
        progress_task = find_task_for_progress(
            tasks,
            message,
        )

        if not progress_task:
            return {
                "success": True,
                "reply": (
                    "Tôi chưa tìm thấy task "
                    "bạn muốn kiểm tra tiến độ."
                ),
            }

        checklist = progress_task.get(
            "checklist",
            [],
        )

        if not checklist:
            return {
                "success": True,
                "reply": (
                    f"Task "
                    f"'{progress_task.get('title', 'Nhiệm vụ')}' "
                    f"chưa có checklist để đánh giá tiến độ."
                ),
            }

        total_steps = len(checklist)

        completed_steps = len([
            item
            for item in checklist
            if item.get("completed", False)
        ])

        progress_percent = round(
            completed_steps / total_steps * 100
        )

        return {
            "success": True,
            "intent": "TASK_PROGRESS",
            "reply": (
                f"Bạn đã hoàn thành "
                f"{completed_steps}/{total_steps} bước của "
                f"'{progress_task.get('title', 'Nhiệm vụ')}'. "
                f"Tiến độ hiện tại là "
                f"{progress_percent}%."
            ),
        }

    if intent == "TASK_COUNT":
        return {
            "success": True,
            "reply": (
                f"Bạn hiện có {len(tasks)} công việc. "
                f"Trong đó có {len(incomplete_tasks)} "
                f"công việc chưa hoàn thành."
            ),
        }

    if intent == "NEAREST_DEADLINE":
        nearest_task = find_nearest_deadline(
            incomplete_tasks
        )

        if not nearest_task:
            return {
                "success": True,
                "reply": (
                    "Tôi chưa tìm thấy nhiệm vụ nào "
                    "có deadline sắp tới."
                ),
            }

        days_left = nearest_task["daysLeft"]

        if days_left == 0:
            time_message = "hết hạn trong hôm nay"

        elif days_left == 1:
            time_message = "còn 1 ngày"

        else:
            time_message = (
                f"còn {days_left} ngày"
            )

        return {
            "success": True,
            "reply": (
                f"Deadline gần nhất của bạn là "
                f"'{nearest_task.get('title', 'Nhiệm vụ')}'. "
                f"Hạn hoàn thành: "
                f"{nearest_task.get('deadline')}. "
                f"Bạn {time_message} để hoàn thành nhiệm vụ này."
            ),
        }

    if intent == "DATE_QUERY":
        matched_tasks = find_tasks_by_date_query(
            incomplete_tasks,
            message,
        )

        if not matched_tasks:
            return {
                "success": True,
                "reply": (
                    "Tôi chưa tìm thấy công việc nào "
                    "phù hợp với mốc thời gian bạn hỏi."
                ),
            }

        lines = []

        for index, task in enumerate(
            matched_tasks[:5],
            start=1,
        ):
            task_date = (
                task.get("startDate")
                or task.get("deadline")
                or "chưa có ngày"
            )

            lines.append(
                f"{index}. "
                f"{task.get('title', 'Nhiệm vụ')} "
                f"- {task_date} "
                f"- ưu tiên "
                f"{task.get('priority', 'chưa rõ')}"
            )

        return {
            "success": True,
            "reply": (
                "Tôi tìm thấy các công việc sau:\n"
                + "\n".join(lines)
            ),
        }

    return ask_gemini_work_assistant(
        request.message,
        tasks,
        documents,
        request.history,
        request.relevantContext,
        request.feedbackMemory,
        request.qLearningPolicy,
        request.conversationSummary,
        request.userProfile,
        request.conversationId,
        request.userId,
    )

