from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from mcp.types import CallToolResult, TextContent

from app import CLIENT_HEADER, create_app

WAV = b"RIFF" + (b"\x00" * 4) + b"WAVEfmt "


class FakeEngine:
    def __init__(self) -> None:
        self.started = False
        self.stopped = False
        self.calls: list[tuple[Path, str]] = []

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True

    async def assess(self, audio_path: Path, reference_text: str):
        assert audio_path.exists()
        self.calls.append((audio_path, reference_text))
        return CallToolResult(
            content=[TextContent(type="text", text="raw result")],
            isError=False,
        )


def test_assessment_is_lossless_and_removes_temporary_wav() -> None:
    engine = FakeEngine()
    with TestClient(create_app(lambda: engine)) as client:
        response = client.post(
            "/api/pronunciation/assess",
            headers={"X-Pronunciation-Client": CLIENT_HEADER},
            files={"audio": ("recording.wav", WAV, "audio/wav")},
            data={"referenceText": "The weather is beautiful."},
        )

    assert response.status_code == 200
    assert response.json()["provider"] == "mcp-server-pronunciation"
    assert response.json()["result"]["content"][0]["type"] == "text"
    assert response.json()["result"]["content"][0]["text"] == "raw result"
    assert response.json()["result"]["isError"] is False
    assert engine.started and engine.stopped
    assert len(engine.calls) == 1
    assert not engine.calls[0][0].exists()


def test_rejects_page_origin_and_invalid_header() -> None:
    engine = FakeEngine()
    with TestClient(create_app(lambda: engine)) as client:
        page_response = client.post(
            "/api/pronunciation/assess",
            headers={
                "Origin": "https://example.com",
                "X-Pronunciation-Client": CLIENT_HEADER,
            },
            files={"audio": ("recording.wav", WAV, "audio/wav")},
            data={"referenceText": "Hello."},
        )
        header_response = client.post(
            "/api/pronunciation/assess",
            files={"audio": ("recording.wav", WAV, "audio/wav")},
            data={"referenceText": "Hello."},
        )

    assert page_response.status_code == 403
    assert header_response.status_code == 403


def test_rejects_non_wav_and_long_reference() -> None:
    engine = FakeEngine()
    with TestClient(create_app(lambda: engine)) as client:
        non_wav = client.post(
            "/api/pronunciation/assess",
            headers={"X-Pronunciation-Client": CLIENT_HEADER},
            files={"audio": ("recording.webm", b"not wav", "audio/webm")},
            data={"referenceText": "Hello."},
        )
        long_reference = client.post(
            "/api/pronunciation/assess",
            headers={"X-Pronunciation-Client": CLIENT_HEADER},
            files={"audio": ("recording.wav", WAV, "audio/wav")},
            data={"referenceText": "x" * 301},
        )

    assert non_wav.status_code == 415
    assert long_reference.status_code == 422
