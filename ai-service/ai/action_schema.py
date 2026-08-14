import hashlib
import json
from datetime import datetime

from .confirmation_policy import classify_action_impact, requires_confirmation


REQUIRED_ACTION_FIELDS = {"id", "type", "status", "impact", "requiresConfirmation", "idempotencyKey"}


def make_idempotency_key(
    conversation_id: str,
    user_id: str,
    action_id: str,
    action_type: str,
    payload: dict | None = None,
) -> str:
    stable_payload = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True, default=str)
    raw = "|".join([conversation_id or "anonymous", user_id or "anonymous", action_id, action_type, stable_payload])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def build_action(
    *,
    action_id: str,
    action_type: str,
    depends_on: list[str] | None = None,
    payload: dict | None = None,
    status: str = "pending",
    execution_mode: str = "tool",
    context: dict | None = None,
) -> dict:
    context = context or {}
    payload = payload or {}
    conversation_id = context.get("conversationId") or ""
    user_id = context.get("userId") or ""
    impact = classify_action_impact(action_type, payload)
    confirmation = requires_confirmation(action_type, payload, context)
    idempotency_key = make_idempotency_key(
        conversation_id,
        user_id,
        action_id,
        action_type,
        payload,
    )

    action = {
        "id": action_id,
        "actionId": action_id,
        "type": action_type,
        "dependsOn": depends_on or [],
        "status": status,
        "impact": impact,
        "requiresConfirmation": confirmation,
        "executionMode": execution_mode,
        "idempotencyKey": idempotency_key,
        "payload": payload,
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
    action["validation"] = validate_action(action)
    return action


def validate_action(action: dict) -> dict:
    missing = sorted(field for field in REQUIRED_ACTION_FIELDS if not action.get(field) and action.get(field) is not False)
    errors = []

    if missing:
        errors.append(
            {
                "type": "MISSING_REQUIRED_FIELD",
                "fields": missing,
                "message": "Action is missing required fields.",
            }
        )

    if action.get("type") == "CREATE_CALENDAR_EVENTS":
        events = action.get("payload", {}).get("events") or []
        if not isinstance(events, list) or not events:
            errors.append(
                {
                    "type": "EMPTY_EVENTS",
                    "message": "CREATE_CALENDAR_EVENTS requires at least one event draft.",
                }
            )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }


def validate_action_sequence(actions: list[dict]) -> dict:
    seen_ids = set()
    errors = []

    for action in actions:
        action_id = action.get("id")
        if action_id in seen_ids:
            errors.append(
                {
                    "type": "DUPLICATE_ACTION_ID",
                    "actionId": action_id,
                    "message": "Action IDs must be unique inside a plan.",
                }
            )
        seen_ids.add(action_id)

        validation = action.get("validation") or validate_action(action)
        if not validation.get("valid"):
            errors.extend(validation.get("errors") or [])

    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }

