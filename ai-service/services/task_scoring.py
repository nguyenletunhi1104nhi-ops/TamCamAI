from datetime import date, datetime


PRIORITY_SCORES = {
    "Cao": 3,
    "High": 3,
    "Trung bình": 2,
    "Medium": 2,
    "Thấp": 1,
    "Low": 1,
}


DIFFICULTY_SCORES = {
    "Khó": 3,
    "Cao": 3,
    "Trung bình": 2,
    "Dễ": 1,
    "Thấp": 1,
}


NECESSITY_SCORES = {
    "Cao": 3,
    "High": 3,
    "Trung bình": 2,
    "Medium": 2,
    "Thấp": 1,
    "Low": 1,
}


def calculate_urgency(deadline):
    if not deadline:
        return 1

    try:
        deadline_date = datetime.strptime(
            deadline,
            "%Y-%m-%d"
        ).date()

        days_left = (
            deadline_date - date.today()
        ).days

        if days_left <= 1:
            return 3

        if days_left <= 7:
            return 2

        return 1

    except ValueError:
        return 1


def calculate_task_score(task):
    priority = PRIORITY_SCORES.get(
        task.get("priority"),
        1
    )

    difficulty = DIFFICULTY_SCORES.get(
        task.get("difficulty"),
        1
    )

    necessity = NECESSITY_SCORES.get(
        task.get("necessity"),
        1
    )

    urgency = calculate_urgency(
        task.get("deadline")
    )

    score = (
        priority * 0.30
        + urgency * 0.30
        + necessity * 0.25
        + difficulty * 0.15
    )

    return round(score, 2)


def rank_tasks(tasks):
    scored_tasks = []

    for task in tasks:
        task_copy = task.copy()

        task_copy["aiScore"] = (
            calculate_task_score(task)
        )

        scored_tasks.append(task_copy)

    return sorted(
        scored_tasks,
        key=lambda task: task["aiScore"],
        reverse=True
    )

def explain_task_score(task):
    reasons = []

    priority = task.get("priority", "Chưa xác định")
    difficulty = task.get("difficulty", "Chưa xác định")
    necessity = task.get("necessity", "Chưa xác định")
    deadline = task.get("deadline")

    urgency = calculate_urgency(deadline)

    if urgency == 3:
        reasons.append("deadline rất gần hoặc đã đến hạn")
    elif urgency == 2:
        reasons.append("deadline đang đến gần")
    else:
        reasons.append("deadline vẫn còn thời gian")

    if priority in ["Cao", "High"]:
        reasons.append("mức ưu tiên cao")

    if necessity in ["Cao", "High"]:
        reasons.append("mức cần thiết cao")
    elif necessity in ["Trung bình", "Medium"]:
        reasons.append("mức cần thiết trung bình")

    if difficulty in ["Khó", "Cao"]:
        reasons.append("độ khó cao")
    elif difficulty in ["Trung bình", "Medium"]:
        reasons.append("độ khó trung bình")

    if not reasons:
        return "Nhiệm vụ này có mức ưu tiên phù hợp để thực hiện trước."

    return ", ".join(reasons)