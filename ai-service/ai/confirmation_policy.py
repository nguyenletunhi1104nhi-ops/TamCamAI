READ_ACTIONS = {
    "GET_CALENDAR_EVENTS",
    "FIND_FREE_TIME",
    "SEARCH_TASKS",
    "SEARCH_DOCUMENT",
}

LOW_MEDIUM_WRITE_ACTIONS = {
    "CREATE_TASK",
    "UPDATE_TASK",
    "CREATE_CALENDAR_EVENT",
}

HIGH_IMPACT_ACTIONS = {
    "CREATE_CALENDAR_EVENTS",
    "DELETE_CALENDAR_EVENT",
    "DELETE_CALENDAR_EVENTS",
    "RESCHEDULE_CALENDAR_WEEK",
}


def classify_action_impact(action_type: str, payload: dict | None = None) -> str:
    payload = payload or {}
    event_count = len(payload.get("events") or [])

    if action_type in READ_ACTIONS:
        return "READ"

    if action_type in HIGH_IMPACT_ACTIONS:
        return "HIGH"

    if action_type == "CREATE_CALENDAR_EVENT":
        return "MEDIUM"

    if action_type == "CREATE_CALENDAR_EVENTS" and event_count <= 1:
        return "MEDIUM"

    if action_type in LOW_MEDIUM_WRITE_ACTIONS:
        return "MEDIUM"

    if action_type.startswith("DELETE") or event_count > 1:
        return "HIGH"

    return "MEDIUM"


def requires_confirmation(action_type: str, payload: dict | None = None, context: dict | None = None) -> bool:
    context = context or {}
    impact = classify_action_impact(action_type, payload)

    if impact == "READ":
        return False

    if impact == "HIGH":
        return True

    if context.get("hasHardConstraintConflict"):
        return True

    return bool(context.get("preferConfirmationForWrites", True))

