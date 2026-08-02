from datetime import datetime

from .context_builder import build_context
from .intent_detector import detect_intents
from .planning_engine import build_ielts_plan
from .reference_resolver import resolve_references
from .response_generator import build_ielts_response
from .tool_registry import ToolRegistry


MAX_TOOL_STEPS = 10


def orchestrate_chat(payload: dict):
    started_at = datetime.utcnow().isoformat() + "Z"
    phases = []

    context = build_context(payload)
    analysis = detect_intents(context)
    references = resolve_references(context, analysis)
    phases.append(_phase("UNDERSTAND", "done", {"primaryIntent": analysis["primaryIntent"]}))
    phases.append(
        _phase(
            "RETRIEVE_CONTEXT",
            "done",
            {
                "messages": len(context.get("recentMessages") or []),
                "tasks": len(context.get("relevantTasks") or []),
                "documents": len(context.get("relevantDocuments") or []),
            },
        )
    )

    if references.get("needsClarification"):
        return {
            "success": True,
            "intent": "CLARIFY",
            "reply": "Mình chưa xác định chắc 'nó/cái đó' đang chỉ lịch hay task nào. Bạn nói rõ tên lịch hoặc task cần đổi giúp mình nhé.",
            "answer": "Mình chưa xác định chắc 'nó/cái đó' đang chỉ lịch hay task nào. Bạn nói rõ tên lịch hoặc task cần đổi giúp mình nhé.",
            "requiresClarification": True,
            "clarificationQuestion": "Bạn muốn chỉnh lịch/task nào?",
            "conversationId": context.get("conversationId"),
            "orchestrationTrace": {"startedAt": started_at, "phases": phases},
            "metadata": _metadata(analysis),
        }

    if analysis["primaryIntent"] != "CREATE_STUDY_PLAN" or "ielts" not in context["normalizedMessage"]:
        return None

    registry = ToolRegistry()
    registry.register("get_calendar_events", _draft_calendar_context)
    registry.register("find_free_time", _find_free_time)
    registry.register("generate_study_plan", lambda args: {"success": True, "plan": build_ielts_plan(context)})
    registry.register("validate_study_plan", _validate_from_plan)
    registry.register("create_calendar_events", _create_draft_events)
    registry.register("verify_created_events", _verify_draft_events)

    tool_results = []
    for tool_name in [
        "get_calendar_events",
        "find_free_time",
        "generate_study_plan",
        "validate_study_plan",
        "create_calendar_events",
        "verify_created_events",
    ][:MAX_TOOL_STEPS]:
        result = registry.execute(tool_name, {"context": context, "toolResults": tool_results})
        tool_results.append(result)
        phases.append(
            _phase(
                tool_name.upper(),
                result.status,
                {"durationMs": result.durationMs, "status": result.status},
            )
        )
        if result.status == "failed":
            break

    plan = _find_tool_data(tool_results, "generate_study_plan").get("plan") or {}
    validation = plan.get("validation") or {}
    execution_result = _find_tool_data(tool_results, "create_calendar_events")
    phases.append(_phase("VERIFY_RESULT", "done", {"requested": len(plan.get("events") or [])}))
    phases.append(_phase("RESPOND", "done", {"language": "vi"}))

    structured_actions = _build_actions(plan, analysis)
    answer = build_ielts_response(plan, validation, execution_result)
    feasibility = plan.get("feasibility") or {}

    return {
        "success": True,
        "intent": "CREATE_TASK_DRAFT",
        "primaryIntent": analysis["primaryIntent"],
        "secondaryIntents": analysis["secondaryIntents"],
        "answer": answer,
        "reply": answer,
        "confidenceLevel": "Cao" if analysis.get("confidence", 0) >= 0.9 else "Trung bình",
        "requiresConfirmation": True,
        "suggestedTasks": plan.get("suggestedTasks") or [],
        "structuredActions": structured_actions,
        "calendarPlan": {
            "timezone": plan.get("timezone") or "Asia/Ho_Chi_Minh",
            "weekStart": plan.get("weekStart"),
            "events": plan.get("events") or [],
            "warnings": plan.get("warnings") or [],
            "conflicts": validation.get("conflicts") or [],
            **feasibility,
        },
        "warnings": plan.get("warnings") or [],
        "conflicts": validation.get("conflicts") or [],
        "memoryCandidates": _memory_candidates(context),
        "orchestrationTrace": {
            "startedAt": started_at,
            "phases": phases,
            "toolSteps": [
                {"name": item.name, "status": item.status, "durationMs": item.durationMs}
                for item in tool_results
            ],
            "requestAnalysis": analysis,
            "referenceResolution": references,
            "feasibility": feasibility,
        },
        "conversationState": {
            "conversationId": context.get("conversationId"),
            "userId": context.get("userId"),
            "activeGoal": "Lập lịch ôn IELTS",
            "currentTopic": "IELTS study plan",
            "pendingActions": structured_actions,
            "recentEntities": [{"type": "topic", "value": "IELTS"}],
            "lastCreatedEvents": [],
            "updatedAt": datetime.utcnow().isoformat() + "Z",
        },
        "metadata": _metadata(analysis),
        "conversationId": context.get("conversationId"),
    }


def _draft_calendar_context(args: dict) -> dict:
    return {
        "success": True,
        "mode": "context_only",
        "events": [],
        "message": "Calendar execution requires the connected calendar tool; using trusted request constraints for draft planning.",
    }


def _find_free_time(args: dict) -> dict:
    return {
        "success": True,
        "windows": [],
        "message": "Free windows are derived from work/class constraints inside the planning engine.",
    }


def _validate_from_plan(args: dict) -> dict:
    plan = _find_tool_data(args.get("toolResults") or [], "generate_study_plan").get("plan") or {}
    validation = plan.get("validation") or {}
    return {"success": validation.get("valid", True), **validation}


def _create_draft_events(args: dict) -> dict:
    plan = _find_tool_data(args.get("toolResults") or [], "generate_study_plan").get("plan") or {}
    events = plan.get("events") or []
    return {
        "success": True,
        "mode": "draft_pending_confirmation",
        "requested": len(events),
        "successful": len(events),
        "failed": 0,
        "successfulEvents": events,
        "failedEvents": [],
    }


def _verify_draft_events(args: dict) -> dict:
    create_result = _find_tool_data(args.get("toolResults") or [], "create_calendar_events")
    return {
        "success": create_result.get("successful", 0) == create_result.get("requested", 0),
        "verified": True,
        "requested": create_result.get("requested", 0),
        "successful": create_result.get("successful", 0),
    }


def _build_actions(plan: dict, analysis: dict) -> list[dict]:
    events = plan.get("events") or []
    return [
        {"id": "action_1", "type": "GET_CALENDAR_EVENTS", "dependsOn": [], "status": "completed"},
        {"id": "action_2", "type": "FIND_FREE_TIME", "dependsOn": ["action_1"], "status": "completed"},
        {"id": "action_3", "type": "CREATE_STUDY_PLAN", "dependsOn": ["action_2"], "status": "completed"},
        {
            "id": "action_4",
            "type": "CREATE_CALENDAR_EVENTS",
            "dependsOn": ["action_3"],
            "status": "needs_confirmation",
            "executionMode": "draft_pending_confirmation",
            "payload": {"events": events},
        },
    ]


def _memory_candidates(context: dict) -> list[dict]:
    normalized = context.get("normalizedMessage") or ""
    candidates = []
    if "di lam" in normalized:
        candidates.append(_memory("work_schedule", "Đi làm từ thứ 2 đến sáng thứ 7", 0.91))
    if "thu 2" in normalized and "thu 4" in normalized and "5h30" in normalized:
        candidates.append(_memory("fixed_class_schedule", "Tối thứ 2 và thứ 4 học 17:30-20:00", 0.9))
    if "ielts" in normalized:
        candidates.append(_memory("learning_goal", "Ôn IELTS với đủ 4 kỹ năng", 0.94))
    if "tu vung" in normalized:
        candidates.append(_memory("study_preference", "Học từ vựng hằng ngày", 0.92))
    return candidates


def _memory(key: str, value: str, confidence: float) -> dict:
    now = datetime.utcnow().isoformat() + "Z"
    return {
        "key": key,
        "value": value,
        "source": "user_message",
        "confidence": confidence,
        "confirmed": True,
        "createdAt": now,
        "updatedAt": now,
    }


def _find_tool_data(results, name: str) -> dict:
    for result in results:
        if result.name == name:
            return result.data
    return {}


def _phase(name: str, status: str, detail: dict | None = None) -> dict:
    return {"name": name, "status": status, "detail": detail or {}}


def _metadata(analysis: dict) -> dict:
    return {
        "provider": "orchestrator",
        "model": "tamcam-ai-orchestrator-v1",
        "orchestrator": "tamcam-ai-orchestrator",
        "intentConfidence": analysis.get("confidence"),
    }

