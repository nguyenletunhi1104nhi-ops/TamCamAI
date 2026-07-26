from __future__ import annotations

import json
from typing import Any


def build_data_analysis_prompt(
    *,
    file_name: str,
    document_text: str,
    data_profile: dict[str, Any],
    computed_insights: dict[str, Any],
) -> str:
    compact_text = str(document_text or "")[:3000]

    return f"""
Bạn là Data Analysis Agent của TamCam AI.

Nhiệm vụ:
- Đọc profile dữ liệu và execution result đã được hệ thống tính toán thật.
- Không bịa số liệu ngoài data_profile/computed_insights.
- Không tính lại số bằng suy đoán. Chỉ diễn giải structured result đã xác minh.
- Diễn giải bằng tiếng Việt rõ ràng cho người dùng phổ thông.
- Đề xuất hành động thực tế, biểu đồ phù hợp và task nháp nếu cần.
- Nếu thiếu dữ liệu để dự báo, nói rõ thiếu gì.
- Task nháp chỉ là gợi ý, người dùng phải xác nhận trước khi tạo task/calendar.

Tên file: {file_name}

TEXT PREVIEW:
{compact_text}

DATA_PROFILE_JSON:
{json.dumps(data_profile, ensure_ascii=False)}

COMPUTED_INSIGHTS_JSON:
{json.dumps(computed_insights, ensure_ascii=False)}

Chỉ trả JSON hợp lệ, không markdown:
{{
  "summary": "Tóm tắt dữ liệu trong 2-3 câu.",
  "insights": ["Insight cụ thể dựa trên số liệu thật"],
  "anomalies": ["Bất thường hoặc điểm cần kiểm tra"],
  "predictions": ["Dự báo hoặc nhận xét xu hướng nếu có đủ dữ liệu"],
  "chartSuggestions": ["Biểu đồ phù hợp"],
  "recommendedActions": ["Hành động nên làm tiếp"],
  "suggestedTasks": [
    {{
      "title": "Động từ + đối tượng, tối đa 8 từ",
      "description": "Bối cảnh và lý do tạo task",
      "category": "Work",
      "type": "Task",
      "domain": "Data Analysis",
      "difficulty": "Trung bình",
      "necessity": "Trung bình hoặc Cao",
      "priority": "Trung bình hoặc Cao",
      "startDate": "",
      "deadline": "",
      "startTime": "",
      "endTime": "",
      "estimate": "45 phút",
      "reminder": "Không nhắc",
      "assignee": "Tôi",
      "status": "To do",
      "completed": false,
      "suggestedSteps": ["Bước cụ thể 1", "Bước cụ thể 2", "Bước cụ thể 3"]
    }}
  ]
}}
"""
