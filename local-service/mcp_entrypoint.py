from __future__ import annotations

from importlib import import_module


NATIVE_MODULES = (
    "ctranslate2",
    "numpy",
    "scipy.linalg",
    "scipy.signal",
    "librosa.core.audio",
    "torch",
    "torchaudio",
)


def warm_native_modules() -> None:
    # The upstream MCP server runs its synchronous assessment on its asyncio
    # thread. Import native modules before that event loop starts so their lazy
    # initialization cannot stall the MCP request/response transport.
    for module_name in NATIVE_MODULES:
        import_module(module_name)


def main() -> None:
    warm_native_modules()

    from mcp_server_pronunciation.server import run

    run()


if __name__ == "__main__":
    main()
