from .text import normalize_text


def detect_intents(context: dict) -> dict:
    normalized = context.get("normalizedMessage") or normalize_text(context.get("message"))
    intents = []

    if any(token in normalized for token in ["xem lich", "kiem tra lich", "lich tuan"]):
        intents.append("LIST_CALENDAR_EVENTS")
    if any(token in normalized for token in ["gio ranh", "thoi gian ranh", "sap xep", "phan bo"]):
        intents.append("FIND_FREE_TIME")
    if "ielts" in normalized and any(
        token in normalized
        for token in ["sap xep", "lich", "hoc", "on", "4 ky nang", "reading", "writing"]
    ):
        intents.append("CREATE_STUDY_PLAN")
    if any(token in normalized for token in ["tao lich", "them vao calendar", "dat lich", "nhac nho"]):
        intents.append("CREATE_CALENDAR_EVENTS")
    if any(token in normalized for token in ["doi no", "doi lich", "dời", "sang thu", "sang 2 gio"]):
        intents.append("UPDATE_CALENDAR_EVENT")
    if any(token in normalized for token in ["xoa het", "xoa lich", "xoa no"]):
        intents.append("DELETE_CALENDAR_EVENTS")

    if not intents:
        intents.append("GENERAL_CONVERSATION")

    primary = "CREATE_STUDY_PLAN" if "CREATE_STUDY_PLAN" in intents else intents[0]
    confidence = 0.94 if primary == "CREATE_STUDY_PLAN" and "ielts" in normalized else 0.72

    return {
        "primaryIntent": primary,
        "secondaryIntents": [intent for intent in intents if intent != primary],
        "confidence": confidence,
        "language": "vi",
    }

