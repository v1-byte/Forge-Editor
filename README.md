# Forge Editor

Forge Editor is a local AI code editor built around Monaco and the OpenAI-compatible API exposed by `llama-server`. The repository is organized as a monorepo: the llama.cpp engine, shared AI core, editor UI, desktop shell, and optional VS Code extension are separate components.

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
- `apps/desktop`: browser-first React app with a Tauri desktop shell.
- `apps/extension`: optional VS Code extension for selected-code questions.

The C/C++ source snapshot at repository root is retained unchanged for compatibility. The new app uses the separately pinned engine submodule. To start the UI, use Node.js 20+ and npm 10+, then run `npm install` and `npm run dev` at the repository root. Start `engine/llama.cpp/build/bin/llama-server` separately with a GGUF model on port 8080. The browser UI opens/downloads individual files; native folder access and GGUF downloads require a future host service.

Update the engine with `git submodule update --init --recursive`; to select a newer upstream version, checkout the desired tag/commit inside `engine/llama.cpp` and commit the resulting gitlink change.

## Upstream and license

The inference engine and web UI are based on the upstream `ggml-org/llama.cpp` source snapshot recorded in [`UPSTREAM.md`](UPSTREAM.md). Upstream copyright, author notices, and the MIT license are retained in this repository. Forge Editor branding does not imply that the upstream authors endorse this rebrand.
