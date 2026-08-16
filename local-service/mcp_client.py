from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import Callable
from http import HTTPStatus
from pathlib import Path
from typing import Any, Protocol, Self

from fastmcp import Client
from fastmcp.client.client import CallToolResult as FastMcpCallToolResult
from fastmcp.client.transports import StdioTransport
from mcp.shared.exceptions import McpError
from mcp.types import CallToolResult, Tool


class PronunciationEngineTimeout(TimeoutError):
    pass


class ManagedMcpClient(Protocol):
    async def __aenter__(self) -> Self: ...

    async def __aexit__(self, exc_type, exc_value, traceback) -> None: ...

    async def list_tools(self) -> list[Tool]: ...

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        *,
        timeout: float,
        raise_on_error: bool,
    ) -> FastMcpCallToolResult: ...

    async def close(self) -> None: ...


def _create_fastmcp_client(timeout_seconds: float) -> Client:
    service_directory = Path(__file__).resolve().parent
    environment = os.environ.copy()
    environment.update(
        {
            "MCP_PRONUNCIATION_AUDIO_RETENTION": "session",
            "MCP_PRONUNCIATION_PRELOAD": "0",
        }
    )
    transport = StdioTransport(
        command=sys.executable,
        args=[str(service_directory / "mcp_entrypoint.py")],
        env=environment,
        cwd=str(service_directory),
        keep_alive=True,
    )
    return Client(transport, timeout=timeout_seconds)


class PronunciationMcpClient:
    def __init__(
        self,
        timeout_seconds: float = 90.0,
        client_factory: Callable[[], ManagedMcpClient] | None = None,
    ) -> None:
        self._timeout_seconds = timeout_seconds
        self._client_factory = client_factory or (
            lambda: _create_fastmcp_client(timeout_seconds)
        )
        self._client: ManagedMcpClient | None = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        async with self._lock:
            if self._client is None:
                await self._start_client()

    async def stop(self) -> None:
        async with self._lock:
            await self._close_client()

    async def assess(
        self, audio_path: Path, reference_text: str
    ) -> CallToolResult:
        async with self._lock:
            if self._client is None:
                await self._start_client()
            assert self._client is not None

            try:
                async with self._client:
                    result = await self._client.call_tool(
                        "assess",
                        {
                            "audio_path": str(audio_path),
                            "reference_text": reference_text,
                        },
                        timeout=self._timeout_seconds,
                        raise_on_error=False,
                    )
                    return CallToolResult(
                        content=result.content,
                        structuredContent=result.structured_content,
                        _meta=result.meta,
                        isError=result.is_error,
                    )
            except TimeoutError as error:
                await self._close_client()
                raise PronunciationEngineTimeout(
                    f"Assessment exceeded {self._timeout_seconds:g} seconds."
                ) from error
            except McpError as error:
                if error.error.code != HTTPStatus.REQUEST_TIMEOUT:
                    raise
                await self._close_client()
                raise PronunciationEngineTimeout(
                    f"Assessment exceeded {self._timeout_seconds:g} seconds."
                ) from error

    async def _start_client(self) -> None:
        client = self._client_factory()
        try:
            async with client:
                tools = await client.list_tools()
                if not any(tool.name == "assess" for tool in tools):
                    raise RuntimeError(
                        "The pronunciation MCP server has no assess tool."
                    )
        except BaseException:
            await client.close()
            raise
        self._client = client

    async def _close_client(self) -> None:
        client = self._client
        self._client = None
        if client is not None:
            await client.close()
