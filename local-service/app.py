from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Protocol

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from mcp.types import CallToolResult

from mcp_client import PronunciationEngineTimeout, PronunciationMcpClient

MAX_REFERENCE_CHARACTERS = 300
MAX_WAV_BYTES = 2 * 1024 * 1024
CLIENT_HEADER = "skrbt-extension"
PROVIDER = "mcp-server-pronunciation"


class PronunciationEngine(Protocol):
    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    async def assess(
        self, audio_path: Path, reference_text: str
    ) -> CallToolResult: ...


def _origin_is_allowed(origin: str | None) -> bool:
    if origin is None:
        return True

    configured_origin = os.getenv("PRONUNCIATION_EXTENSION_ORIGIN")
    if configured_origin:
        return origin == configured_origin

    prefix = "chrome-extension://"
    extension_id = origin.removeprefix(prefix)
    return origin.startswith(prefix) and len(extension_id) == 32 and all(
        "a" <= character <= "p" for character in extension_id
    )


def _is_wav(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"


def create_app(
    engine_factory: Callable[[], PronunciationEngine] = PronunciationMcpClient,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = engine_factory()
        await engine.start()
        app.state.engine = engine
        try:
            yield
        finally:
            await engine.stop()

    service = FastAPI(title="SKRBT pronunciation companion", lifespan=lifespan)

    @service.middleware("http")
    async def reject_untrusted_browser_origins(request: Request, call_next):
        origin = request.headers.get("origin")
        if not _origin_is_allowed(origin):
            return JSONResponse(status_code=403, content={"detail": "Origin is not allowed."})
        response = await call_next(request)
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response

    @service.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "provider": PROVIDER}

    @service.post("/api/pronunciation/assess")
    async def assess(
        request: Request,
        audio: UploadFile = File(...),
        reference_text: str = Form(..., alias="referenceText"),
        client: str | None = Header(None, alias="X-Pronunciation-Client"),
    ) -> dict[str, Any]:
        if client != CLIENT_HEADER:
            raise HTTPException(status_code=403, detail="Invalid pronunciation client.")
        if not reference_text.strip() or len(reference_text) > MAX_REFERENCE_CHARACTERS:
            raise HTTPException(
                status_code=422,
                detail=f"referenceText must contain 1 to {MAX_REFERENCE_CHARACTERS} characters.",
            )
        if Path(audio.filename or "").suffix.lower() != ".wav":
            raise HTTPException(status_code=415, detail="Only .wav uploads are accepted.")
        if audio.content_type not in {"audio/wav", "audio/wave", "audio/x-wav"}:
            raise HTTPException(status_code=415, detail="The upload must use a WAV content type.")

        data = await audio.read(MAX_WAV_BYTES + 1)
        await audio.close()
        if len(data) > MAX_WAV_BYTES:
            raise HTTPException(status_code=413, detail="The WAV upload is too large.")
        if not _is_wav(data):
            raise HTTPException(status_code=415, detail="The upload is not a valid WAV container.")

        descriptor, temporary_name = tempfile.mkstemp(prefix="skrbt-pronunciation-", suffix=".wav")
        os.close(descriptor)
        temporary_path = Path(temporary_name)
        try:
            temporary_path.write_bytes(data)
            try:
                result = await request.app.state.engine.assess(
                    temporary_path, reference_text
                )
            except PronunciationEngineTimeout as error:
                raise HTTPException(status_code=504, detail=str(error)) from error
            return {
                "provider": PROVIDER,
                "result": result.model_dump(
                    mode="json", by_alias=True, exclude_none=False
                ),
            }
        finally:
            temporary_path.unlink(missing_ok=True)

    return service


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)


if __name__ == "__main__":
    main()
