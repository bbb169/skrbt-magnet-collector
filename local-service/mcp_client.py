from __future__ import annotations

import asyncio
import os
import sys
from contextlib import AsyncExitStack
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import CallToolResult


class PronunciationEngineTimeout(TimeoutError):
    pass


class PronunciationMcpClient:
    def __init__(self, timeout_seconds: float = 90.0) -> None:
        self._timeout_seconds = timeout_seconds
        self._stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        async with self._lock:
            if self._session is None:
                await self._start_locked()

    async def stop(self) -> None:
        async with self._lock:
            await self._stop_locked()

    async def assess(
        self, audio_path: Path, reference_text: str
    ) -> CallToolResult:
        async with self._lock:
            if self._session is None:
                await self._start_locked()
            assert self._session is not None

            try:
                return await asyncio.wait_for(
                    self._session.call_tool(
                        "assess",
                        {
                            "audio_path": str(audio_path),
                            "reference_text": reference_text,
                        },
                    ),
                    timeout=self._timeout_seconds,
                )
            except TimeoutError as error:
                await self._restart_locked()
                raise PronunciationEngineTimeout(
                    f"Assessment exceeded {self._timeout_seconds:g} seconds."
                ) from error

    async def _start_locked(self) -> None:
        stack = AsyncExitStack()
        env = os.environ.copy()
        env["MCP_PRONUNCIATION_AUDIO_RETENTION"] = "session"
        parameters = StdioServerParameters(
            command=sys.executable,
            args=["-m", "mcp_server_pronunciation"],
            env=env,
        )

        try:
            read_stream, write_stream = await stack.enter_async_context(
                stdio_client(parameters)
            )
            session = await stack.enter_async_context(
                ClientSession(read_stream, write_stream)
            )
            await session.initialize()
            tools = await session.list_tools()
            if not any(tool.name == "assess" for tool in tools.tools):
                raise RuntimeError("The pronunciation MCP server has no assess tool.")
        except BaseException:
            await stack.aclose()
            raise

        self._stack = stack
        self._session = session

    async def _stop_locked(self) -> None:
        stack = self._stack
        self._stack = None
        self._session = None
        if stack is not None:
            await stack.aclose()

    async def _restart_locked(self) -> None:
        await self._stop_locked()
        await self._start_locked()
