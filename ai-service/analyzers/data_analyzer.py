from __future__ import annotations

from typing import Any


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _fmt_number(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value or "")

    if number.is_integer():
        return f"{int(number):,}".replace(",", ".")

    return f"{number:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def build_data_profile(data_insights: dict[str, Any] | None) -> dict[str, Any]:
    """Turn Node spreadsheet insights into a compact agent-ready profile."""

    data_insights = data_insights or {}
    sheets = _as_list(data_insights.get("sheets"))
    numeric_columns = _as_list(data_insights.get("numericColumns"))
    quality_checks = _as_list(data_insights.get("qualityChecks"))
    group_insights = _as_list(data_insights.get("groupInsights"))
    outliers = _as_list(data_insights.get("outliers"))
    correlations = _as_list(data_insights.get("correlations"))
    time_series = _as_list(data_insights.get("timeSeries"))
    predictions = _as_list(data_insights.get("predictions"))
    chart_suggestions = _as_list(data_insights.get("chartSuggestions"))
    row_sample = [
        row
        for row in _as_list(data_insights.get("rowSample"))
        if isinstance(row, dict)
    ][:200]

    total_rows = sum(int(sheet.get("rowCount") or 0) for sheet in sheets if isinstance(sheet, dict))
    total_missing = sum(
        int(item.get("missingCellCount") or 0)
        for item in quality_checks
        if isinstance(item, dict)
    )
    total_duplicates = sum(
        int(item.get("duplicateRows") or 0)
        for item in quality_checks
        if isinstance(item, dict)
    )

    strongest_numeric_columns = []
    for column in numeric_columns[:8]:
        if not isinstance(column, dict):
            continue

        strongest_numeric_columns.append(
            {
                "name": column.get("name") or column.get("column") or "Cột số",
                "sheetName": column.get("sheetName") or "",
                "sum": column.get("sum"),
                "average": column.get("average"),
                "min": column.get("min"),
                "max": column.get("max"),
            }
        )

    top_groups = []
    for insight in group_insights[:5]:
        if not isinstance(insight, dict):
            continue

        groups = _as_list(insight.get("topGroups"))
        if groups:
            top_groups.append(
                {
                    "groupBy": insight.get("groupBy") or insight.get("dimension") or "",
                    "metric": insight.get("metric") or "",
                    "topGroups": groups[:3],
                    "sheetName": insight.get("sheetName") or "",
                }
            )

    anomalies = []
    for item in outliers[:5]:
        if not isinstance(item, dict):
            continue

        anomalies.append(
            {
                "type": "outlier",
                "column": item.get("column") or item.get("name") or "",
                "count": item.get("count") or 0,
                "sheetName": item.get("sheetName") or "",
            }
        )

    return {
        "rowCount": total_rows,
        "sheetCount": len(sheets),
        "numericColumnCount": len(numeric_columns),
        "quality": {
            "missingCells": total_missing,
            "duplicateRows": total_duplicates,
        },
        "numericColumns": strongest_numeric_columns,
        "topGroups": top_groups,
        "anomalies": anomalies,
        "correlations": correlations[:5],
        "timeSeries": time_series[:5],
        "predictions": predictions[:5],
        "chartSuggestions": chart_suggestions[:5],
        "rowSample": row_sample,
    }


def build_computed_data_insights(profile: dict[str, Any]) -> dict[str, Any]:
    insights: list[str] = []
    recommended_actions: list[str] = []

    row_count = profile.get("rowCount") or 0
    sheet_count = profile.get("sheetCount") or 0
    numeric_count = profile.get("numericColumnCount") or 0
    quality = profile.get("quality") or {}

    insights.append(
        f"Bộ dữ liệu có {sheet_count} sheet/bảng và {row_count} dòng dữ liệu."
    )

    if numeric_count:
        insights.append(
            f"Phát hiện {numeric_count} cột số có thể dùng để tính tổng, trung bình, min/max và xu hướng."
        )
    else:
        insights.append(
            "Chưa phát hiện cột số rõ ràng, nên phân tích hiện phù hợp với tổng hợp danh sách hơn là dự báo."
        )

    if quality.get("missingCells"):
        recommended_actions.append(
            "Kiểm tra và bổ sung các ô thiếu dữ liệu trước khi ra quyết định."
        )

    if quality.get("duplicateRows"):
        recommended_actions.append(
            "Rà soát các dòng trùng lặp để tránh tổng hợp sai."
        )

    for column in profile.get("numericColumns", [])[:3]:
        name = column.get("name") or "Cột số"
        insights.append(
            f"{name}: tổng {_fmt_number(column.get('sum'))}, trung bình {_fmt_number(column.get('average'))}, thấp nhất {_fmt_number(column.get('min'))}, cao nhất {_fmt_number(column.get('max'))}."
        )

    for anomaly in profile.get("anomalies", [])[:3]:
        column = anomaly.get("column") or "một cột"
        count = anomaly.get("count") or 0
        insights.append(f"Cột {column} có {count} giá trị bất thường cần kiểm tra.")
        recommended_actions.append(f"Kiểm tra các giá trị bất thường ở cột {column}.")

    for prediction in profile.get("predictions", [])[:3]:
        metric = prediction.get("metric") or prediction.get("column") or "chỉ số"
        forecast = prediction.get("nextPeriodForecast")
        if forecast is not None:
            insights.append(f"Dự báo kỳ tiếp theo cho {metric}: khoảng {_fmt_number(forecast)}.")
        if prediction.get("recommendedAction"):
            recommended_actions.append(str(prediction.get("recommendedAction")))

    if not recommended_actions:
        recommended_actions.append(
            "Chọn chỉ số quan trọng nhất và tạo biểu đồ để theo dõi xu hướng."
        )

    return {
        "insights": insights[:8],
        "anomalies": profile.get("anomalies", [])[:5],
        "predictions": profile.get("predictions", [])[:5],
        "chartSuggestions": profile.get("chartSuggestions", [])[:5],
        "recommendedActions": list(dict.fromkeys(recommended_actions))[:6],
    }
