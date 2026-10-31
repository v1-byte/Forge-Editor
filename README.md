# Forge Editor

Forge Editor is a local GGUF workbench with model inspection, metadata sidecar editing, quantization command previews, and chat through the OpenAI-compatible API exposed by `llama-server`. Monaco remains available as an editor package. The repository is organized as a monorepo with separate engine, AI core, UI, desktop shell, and optional VS Code extension components.

## Build

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j
```

For the web interface, see [`tools/ui/README.md`](tools/ui/README.md). For server options and model setup, see [`docs/`](docs/) and [`server/README.md`](server/README.md).

## New editor monorepo

- `engine/llama.cpp`: upstream `ggml-org/llama.cpp` pinned as a Git submodule; update the gitlink rather than editing engine sources here.
- `packages/core`: client for `llama-server`, chat, completion, and model catalog.
- `packages/editor`: Monaco editor and workspace helpers.
- `packages/ui`: chat panel, model picker, and status bar.
- `apps/desktop`: browser-first GGUF workbench with a Tauri desktop shell.
- `apps/extension`: optional VS Code extension for selected-code questions.

The C/C++ source snapshot at repository root is retained unchanged for compatibility. The new app uses the separately pinned engine submodule. To start the UI, use Node.js 20+ and npm 10+, then run `npm install` and `npm run dev` at the repository root. Start `engine/llama.cpp/build/bin/llama-server` separately with a GGUF model on port 8080. The main screen imports a local GGUF, reads its header, exports metadata JSON sidecars, previews quantization commands, and chats with the connected local model. Full tensor inspection, in-place GGUF metadata rewriting, and launching quantization require a native host backend and are not performed by this browser prototype.

Update the engine with `git submodule update --init --recursive`; to select a newer upstream version, checkout the desired tag/commit inside `engine/llama.cpp` and commit the resulting gitlink change.

## Upstream and license
