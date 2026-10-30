# Forge Editor

Forge Editor is a local AI workbench for running GGUF language models, chatting with them, and serving a local OpenAI-compatible API. It combines a web interface with the high-performance C/C++ inference engine from [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp).

## Build

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j
```

For the web interface, see [`tools/ui/README.md`](tools/ui/README.md). For server options and model setup, see [`docs/`](docs/) and [`server/README.md`](server/README.md).

## Upstream and license

The inference engine and web UI are based on the upstream `ggml-org/llama.cpp` source snapshot recorded in [`UPSTREAM.md`](UPSTREAM.md). Upstream copyright, author notices, and the MIT license are retained in this repository. Forge Editor branding does not imply that the upstream authors endorse this rebrand.
