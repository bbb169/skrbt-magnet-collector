from __future__ import annotations

import mcp_entrypoint


def test_warms_every_native_module_before_server_start(monkeypatch) -> None:
    imported: list[str] = []
    monkeypatch.setattr(mcp_entrypoint, "import_module", imported.append)

    mcp_entrypoint.warm_native_modules()

    assert imported == list(mcp_entrypoint.NATIVE_MODULES)
