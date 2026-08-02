from .text import normalize_text


REFERENCE_TOKENS = ["no", "cai do", "lich tren", "buoi do", "nhu luc nay", "them cai nay"]


def resolve_references(context: dict, request_analysis: dict) -> dict:
    normalized = context.get("normalizedMessage") or ""
    has_reference = any(token in normalized for token in REFERENCE_TOKENS)
    recent_entities = []

    for message in reversed(context.get("recentMessages") or []):
        content = normalize_text(message.get("content") or message.get("message") or "")
        if "ielts" in content:
            recent_entities.append(
                {
                    "type": "topic",
                    "value": "IELTS study plan",
                    "source": "recent_message",
                    "confidence": 0.82,
                }
            )
            break

    confidence = 0.9 if not has_reference else (0.82 if recent_entities else 0.35)
    return {
        "hasReference": has_reference,
        "resolvedReferences": recent_entities,
        "confidence": confidence,
        "needsClarification": has_reference and not recent_entities,
    }

