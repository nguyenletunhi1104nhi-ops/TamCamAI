from dataclasses import dataclass
from time import perf_counter
from typing import Any, Callable


@dataclass
class ToolResult:
    name: str
    status: str
    durationMs: int
    data: dict[str, Any]


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Callable[[dict], dict]] = {}

    def register(self, name: str, handler: Callable[[dict], dict]):
        self._tools[name] = handler

    def execute(self, name: str, args: dict) -> ToolResult:
        started = perf_counter()
        if name not in self._tools:
            return ToolResult(name, "failed", 0, {"errorCode": "TOOL_NOT_FOUND"})
        try:
            data = self._tools[name](args)
            status = "success" if data.get("success", True) else "failed"
        except Exception as error:
            data = {"success": False, "errorCode": "TOOL_ERROR", "message": str(error)}
            status = "failed"
        return ToolResult(name, status, int((perf_counter() - started) * 1000), data)

