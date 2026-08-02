def build_ielts_response(plan: dict, validation: dict, execution_result: dict) -> str:
    events = plan.get("events") or []
    warnings = plan.get("warnings") or []
    validated_text = "khong trung voi rang buoc gio lam/gio hoc co dinh" if validation.get("valid") else "co xung dot can sua"

    lines = [
        f"Minh da lap ke hoach IELTS gom {len(events)} lich nhap cho tuan toi.",
        f"Ke hoach da duoc kiem tra: {validated_text}.",
        "Vocabulary duoc xep moi ngay; Reading, Writing, Listening, Speaking va Review duoc chia vao cac khung ranh phu hop.",
    ]

    if execution_result.get("mode") == "draft_pending_confirmation":
        lines.append(
            "Hien minh chua tao truc tiep len Google Calendar trong luong production nay; ban co the xem lich nhap va xac nhan truoc khi luu."
        )

    if warnings:
        lines.append("Luu y: " + str(warnings[0].get("message") or warnings[0]))

    return "\n".join(lines)

