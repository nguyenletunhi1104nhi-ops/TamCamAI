from datetime import datetime


def validate_calendar_plan(events: list[dict], hard_busy_blocks: list[dict] | None = None) -> dict:
    hard_busy_blocks = hard_busy_blocks or []
    conflicts = []

    for event in events:
        event_start = _parse_iso(event.get("start"))
        event_end = _parse_iso(event.get("end"))
        if not event_start or not event_end or event_end <= event_start:
            conflicts.append(
                {
                    "type": "INVALID_TIME",
                    "eventTitle": event.get("title") or "Lich",
                    "message": "Thoi gian bat dau/ket thuc khong hop le.",
                }
            )
            continue

        for block in hard_busy_blocks:
            block_start = _parse_iso(block.get("start"))
            block_end = _parse_iso(block.get("end"))
            if block_start and block_end and event_start < block_end and event_end > block_start:
                conflicts.append(
                    {
                        "type": "HARD_CONSTRAINT_CONFLICT",
                        "eventTitle": event.get("title") or "Lich",
                        "busyLabel": block.get("label") or "Khoang ban",
                        "message": "Lich de xuat trung voi rang buoc cung.",
                    }
                )

    return {
        "valid": len(conflicts) == 0,
        "conflicts": conflicts,
        "conflictCount": len(conflicts),
        "hardConstraintViolations": conflicts,
    }


def _parse_iso(value: str | None):
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None

