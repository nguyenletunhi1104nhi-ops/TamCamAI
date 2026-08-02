import re
from datetime import datetime, time, timedelta, timezone

from .text import normalize_text


VN_TIMEZONE = timezone(timedelta(hours=7))
WEEKDAY_TO_INDEX = {
    "thu 2": 0,
    "thu hai": 0,
    "thu 3": 1,
    "thu ba": 1,
    "thu 4": 2,
    "thu tu": 2,
    "thu 5": 3,
    "thu nam": 3,
    "thu 6": 4,
    "thu sau": 4,
    "thu 7": 5,
    "thu bay": 5,
    "chu nhat": 6,
    "cn": 6,
}


def now_vn() -> datetime:
    return datetime.now(VN_TIMEZONE)


def next_week_start(reference: datetime | None = None) -> datetime:
    base = reference or now_vn()
    days_until_monday = (7 - base.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 1
    monday = base + timedelta(days=days_until_monday)
    return datetime.combine(monday.date(), time(0, 0), VN_TIMEZONE)


def parse_clock(text: str, default_period: str = "evening") -> str | None:
    normalized = normalize_text(text)
    match = re.search(r"(\d{1,2})(?:h|:)(\d{1,2})?", normalized)
    if not match:
        match = re.search(r"luc\s+(\d{1,2})\s*(?:gio)?(?:\s*(ruoi))?", normalized)
    if not match:
        return None

    hour = int(match.group(1))
    minute = 30 if "ruoi" in match.groups() else int(match.group(2) or 0)

    is_morning = any(token in normalized for token in ["sang", "buoi sang"])
    is_evening = any(token in normalized for token in ["toi", "chieu", "dem"])
    if hour < 12 and (is_evening or (default_period == "evening" and not is_morning)):
        hour += 12

    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def iso_at(day, clock: str) -> str:
    hour, minute = [int(part) for part in clock.split(":")]
    dt = datetime.combine(day, time(hour, minute), VN_TIMEZONE)
    return dt.isoformat()


def add_minutes(iso_value: str, minutes: int) -> str:
    return (datetime.fromisoformat(iso_value) + timedelta(minutes=minutes)).isoformat()

