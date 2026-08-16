# Pronunciation companion service

This Python 3.11+ service accepts the extension's WAV recording on loopback and forwards it to one warm `mcp-server-pronunciation` 0.3.0 process. It never accepts a caller-provided file path and removes each temporary WAV after the assessment finishes or fails.

## Setup and start

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run:

```powershell
cd local-service
uv sync
uv run python app.py
```

The service binds only to `127.0.0.1:8765`. Model files are downloaded locally on first use. To download and verify them before starting the extension:

```powershell
uv run mcp-server-pronunciation pull-model
uv run mcp-server-pronunciation doctor
```

For stricter origin checking, set the extension's complete origin before starting:

```powershell
$env:PRONUNCIATION_EXTENSION_ORIGIN = 'chrome-extension://your-extension-id'
uv run python app.py
```

Without that setting, the service accepts valid Chrome extension origins and non-browser clients that provide `X-Pronunciation-Client: skrbt-extension`. HTTP(S) page origins are rejected. The fixed header identifies the intended client but is not a secret or an authentication boundary.

## Engine and license

The service pins `mcp-server-pronunciation[phoneme]==0.3.0`; the optional phoneme extra enables its wav2vec2 alignment path. The engine, authored by JuhongPark, is distributed under the MIT License. Its copyright and license are available in the installed package and at <https://github.com/JuhongPark/mcp-server-pronunciation/blob/v0.3.0/LICENSE>.

The persistent stdio connection is managed by `fastmcp==3.4.4`, distributed under the Apache-2.0 License.

Pronunciation results are coaching estimates, not standardized or high-stakes assessments. Audio processing is local. Do not enable `MCP_PRONUNCIATION_AUDIO_RETENTION=keep`; the adapter and managed MCP session are configured to clean up temporary recordings.
