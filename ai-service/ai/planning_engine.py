from datetime import timedelta

from .action_validator import validate_calendar_plan
from .time_parser import add_minutes, iso_at, next_week_start
from .text import normalize_text


def build_ielts_plan(context: dict) -> dict:
    normalized = context.get("normalizedMessage") or normalize_text(context.get("message"))
    week_start = next_week_start()
    constraints = _extract_constraints(normalized, week_start)
    hard_busy_blocks = constraints["hardBusyBlocks"]

    sessions = [
        {
            "title": "IELTS Vocabulary Daily",
            "weekday": 0,
            "startTime": "21:30",
            "durationMinutes": 30,
            "repeat": "daily",
            "priority": "Trung bình",
            "description": "Hoc tu moi, on tu cu, phat am, dat vi du va flashcard theo spaced repetition.",
            "checklist": [
                "Hoc 10-15 tu moi theo chu de IELTS.",
                "On lai flashcard cu bang spaced repetition.",
                "Ghi 3 cau vi du va kiem tra phat am.",
            ],
        },
        {
            "title": "IELTS Reading - PREP",
            "weekday": 1,
            "startTime": "20:00",
            "durationMinutes": 75,
            "repeat": "weekly",
            "priority": "Cao",
            "description": "Lam mot passage tren PREP, cham dap an, phan tich keyword va ghi loi sai.",
            "checklist": [
                "Lam 1 passage Reading co bam gio.",
                "Kiem tra dap an va tim keyword trong bai.",
                "Ghi tu moi va ly do sai.",
            ],
        },
        {
            "title": "IELTS Writing - Huy Forum",
            "weekday": 3,
            "startTime": "20:00",
            "durationMinutes": 75,
            "repeat": "weekly",
            "priority": "Cao",
            "description": "Phan tich de Huy Forum, lap dan y, viet bai, sua grammar bang Grammarly va viet lai doan yeu.",
            "checklist": [
                "Chon 1 de Writing tren Huy Forum.",
                "Lap dan y truoc khi viet.",
                "Sua grammar bang Grammarly va viet lai 1 doan yeu.",
            ],
        },
        {
            "title": "IELTS Listening - PREP + Parrot",
            "weekday": 4,
            "startTime": "20:00",
            "durationMinutes": 60,
            "repeat": "weekly",
            "priority": "Cao",
            "description": "Lam bai nghe tren PREP, xem transcript, dictation doan kho va shadowing bang Parrot.",
            "checklist": [
                "Lam 1 bai Listening tren PREP.",
                "Xem transcript va ghi loi nghe sai.",
                "Dictation 5-10 phut va shadowing bang Parrot.",
            ],
        },
        {
            "title": "IELTS Speaking - Parrot",
            "weekday": 5,
            "startTime": "15:00",
            "durationMinutes": 60,
            "repeat": "weekly",
            "priority": "Trung bình",
            "description": "Luyen chu de Speaking, ghi am, nghe lai, sua phat am va shadowing bang Parrot.",
            "checklist": [
                "Chuan bi y cho 1 chu de Speaking.",
                "Ghi am cau tra loi va nghe lai.",
                "Sua phat am va shadowing bang Parrot.",
            ],
        },
        {
            "title": "IELTS Weekly Review + Mock",
            "weekday": 6,
            "startTime": "15:00",
            "durationMinutes": 90,
            "repeat": "weekly",
            "priority": "Trung bình",
            "description": "Cuoi tuan tong hop loi sai, lam mini mock test va dieu chinh ke hoach tuan sau.",
            "checklist": [
                "Tong hop loi sai cua 4 ky nang.",
                "Lam mini mock test hoac 2 ky nang yeu nhat.",
                "Chon 3 diem can sua trong tuan tiep theo.",
            ],
        },
    ]

    events = []
    suggested_tasks = []
    for session in sessions:
        date_value = (week_start + timedelta(days=session["weekday"])).date()
        start = iso_at(date_value, session["startTime"])
        end = add_minutes(start, session["durationMinutes"])
        recurrence = (
            {"frequency": "DAILY", "interval": 1}
            if session["repeat"] == "daily"
            else {"frequency": "WEEKLY", "interval": 1}
        )
        event = {
            "title": session["title"],
            "description": session["description"],
            "start": start,
            "end": end,
            "timezone": "Asia/Ho_Chi_Minh",
            "recurrence": recurrence,
            "reminders": [{"method": "popup", "minutes": 30}],
            "status": "draft",
            "source": "TamCam AI Orchestrator",
        }
        events.append(event)
        suggested_tasks.append(
            {
                "title": session["title"],
                "description": session["description"],
                "checklist": session["checklist"],
                "deadline": str(date_value),
                "date": str(date_value),
                "startTime": session["startTime"],
                "endTime": end[11:16],
                "durationMinutes": session["durationMinutes"],
                "priority": session["priority"],
                "category": "Study",
                "taskType": "Study",
                "repeat": session["repeat"],
                "status": "To do",
                "source": "AI Orchestrator",
            }
        )

    validation = validate_calendar_plan(events, hard_busy_blocks)
    soft_warnings = []
    if "cuoi tuan" in normalized:
        soft_warnings.append(
            {
                "type": "SOFT_PREFERENCE_APPLIED",
                "message": "Cuoi tuan da duoc uu tien Speaking va Review/Mock test thay vi hoc lien tuc qua lau.",
            }
        )

    feasibility = {
        "feasibilityScore": 0.91 if validation["valid"] else 0.45,
        "conflictCount": validation["conflictCount"],
        "hardConstraintViolations": validation["hardConstraintViolations"],
        "softConstraintViolations": [],
        "workloadBalanceScore": 0.88,
        "restQualityScore": 0.84,
    }

    return {
        "weekStart": str(week_start.date()),
        "timezone": "Asia/Ho_Chi_Minh",
        "events": events,
        "suggestedTasks": suggested_tasks,
        "constraints": constraints,
        "warnings": soft_warnings,
        "feasibility": feasibility,
        "validation": validation,
    }


def _extract_constraints(normalized: str, week_start) -> dict:
    hard_busy_blocks = []
    constraints = []

    if "di lam" in normalized and "thu 2" in normalized:
        for weekday in range(0, 5):
            day = (week_start + timedelta(days=weekday)).date()
            hard_busy_blocks.append(
                {
                    "label": "Gio lam viec",
                    "start": iso_at(day, "08:00"),
                    "end": iso_at(day, "17:00"),
                }
            )
        if "sang thu 7" in normalized or "sang thu bay" in normalized:
            day = (week_start + timedelta(days=5)).date()
            hard_busy_blocks.append(
                {
                    "label": "Gio lam sang thu 7",
                    "start": iso_at(day, "08:00"),
                    "end": iso_at(day, "12:00"),
                }
            )
        constraints.append("Khong xep lich hoc vao gio lam viec.")

    if "thu 2" in normalized and "thu 4" in normalized and ("5h30" in normalized or "17h30" in normalized):
        for weekday in [0, 2]:
            day = (week_start + timedelta(days=weekday)).date()
            hard_busy_blocks.append(
                {
                    "label": "Buoi hoc co dinh",
                    "start": iso_at(day, "17:30"),
                    "end": iso_at(day, "20:00"),
                }
            )
        constraints.append("Khong xep lich IELTS trung voi buoi hoc toi thu 2 va thu 4.")

    return {
        "hardConstraints": constraints,
        "softConstraints": [
            "Vocabulary moi ngay.",
            "Cuoi tuan hoc nhieu hon nhung co khoang nghi.",
            "Xen ke 4 ky nang IELTS.",
        ],
        "hardBusyBlocks": hard_busy_blocks,
    }

