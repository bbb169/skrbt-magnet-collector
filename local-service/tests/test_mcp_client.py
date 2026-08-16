from __future__ import annotations

from pathlib import Path
from typing import Any, Self

import pytest
from fastmcp.client.client import CallToolResult as FastMcpCallToolResult
from mcp.shared.exceptions import McpError
from mcp.types import ErrorData, TextContent, Tool

from mcp_client import PronunciationEngineTimeout, PronunciationMcpClient


class FakeClient:
    def __init__(
        self, results: list[FastMcpCallToolResult | BaseException]
    ) -> None:
        self.results = results
        self.closed = False
        self.calls: list[tuple[str, dict[str, Any], float, bool]] = []

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        return None

    async def list_tools(self) -> list[Tool]:
        return [Tool(name="assess", description="Assess pronunciation", inputSchema={})]

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        *,
        timeout: float,
        raise_on_error: bool,
    ) -> FastMcpCallToolResult:
        self.calls.append((name, arguments, timeout, raise_on_error))
        result = self.results.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result

    async def close(self) -> None:
        self.closed = True


def result(text: str) -> FastMcpCallToolResult:
    return FastMcpCallToolResult(
        content=[TextContent(type="text", text=text)],
        structured_content=None,
        meta=None,
        is_error=False,
    )


@pytest.mark.anyio
async def test_reuses_fastmcp_client_and_preserves_tool_result() -> None:
    client = FakeClient([result("first"), result("second")])
    engine = PronunciationMcpClient(
        timeout_seconds=12,
        client_factory=lambda: client,
    )

    await engine.start()
    first = await engine.assess(Path("first.wav"), "First sentence.")
    second = await engine.assess(Path("second.wav"), "Second sentence.")
    await engine.stop()

    assert first.content[0].text == "first"
    assert second.content[0].text == "second"
    assert client.calls == [
        (
            "assess",
            {"audio_path": "first.wav", "reference_text": "First sentence."},
            12,
            False,
        ),
        (
            "assess",
            {"audio_path": "second.wav", "reference_text": "Second sentence."},
            12,
            False,
        ),
    ]
    assert client.closed


@pytest.mark.anyio
async def test_timeout_closes_failed_client_and_next_call_reconnects() -> None:
    timeout = McpError(ErrorData(code=408, message="Timed out"))
    clients = [FakeClient([timeout]), FakeClient([result("recovered")])]
    engine = PronunciationMcpClient(
        timeout_seconds=3,
        client_factory=lambda: clients.pop(0),
    )

    await engine.start()
    failed_client = engine._client
    with pytest.raises(
        PronunciationEngineTimeout,
        match="Assessment exceeded 3 seconds",
    ):
        await engine.assess(Path("failed.wav"), "Failed sentence.")

    assert failed_client is not None and failed_client.closed
    recovered = await engine.assess(Path("retry.wav"), "Retry sentence.")
    await engine.stop()

    assert recovered.content[0].text == "recovered"
