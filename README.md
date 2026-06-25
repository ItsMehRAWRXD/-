# RawrXD IDE v1.0.0

**A Pure Win32/MASM-Compatible Native Development Environment**

---

## 🎯 Overview

RawrXD IDE is a high-performance, dependency-free development environment built for Windows using pure Win32 APIs and C++20. Zero Electron. Zero bloat. Maximum speed.

### Key Features

- **⚡ Native Performance**: Direct Win32 API, no frameworks or virtual machines
- **🧠 LSP Intelligence**: Full Language Server Protocol support (clangd, pyright, rust-analyzer)
- **🎨 VS Code Parity**: Command Palette, Quick Open, File Explorer, 16 themes
- **🤖 AI-Native**: Integrated agent loop, ghost text completion, autonomous debugging
- **🔧 MASM x64**: Native assembly development with syntax highlighting
- **📦 Zero Dependencies**: Single executable, no runtime requirements

---

## 🚀 Quick Start

### Prerequisites

- Windows 10/11 (x64)
- Visual Studio 2022 (or Build Tools)
- Ninja build system
- CMake 3.20+

### Build

```powershell
# Clone repository
git clone https://github.com/ItsMehRAWRXD/RawrXD.git
cd RawrXD

# Configure and build
cmake -B build-ninja -G Ninja -DCMAKE_BUILD_TYPE=Release
ninja -C build-ninja

# Run
.\build-ninja\bin\RawrXD-Win32IDE.exe
```

### LSP Setup

Install language servers for your languages:

```powershell
# C/C++ (clangd)
# Download from: https://github.com/clangd/clangd/releases

# Python (pyright)
pip install pyright

# Rust (rust-analyzer)
rustup component add rust-analyzer
```

The IDE will auto-detect and connect to available language servers.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+P` | Quick Open |
| `Ctrl+Shift+E` | File Explorer |
| `Ctrl+N` | New File |
| `Ctrl+O` | Open File |
| `Ctrl+S` | Save |
| `Ctrl+F` | Find |
| `Ctrl+H` | Replace |
| `Ctrl+B` | Toggle Sidebar |
| `Ctrl+`` ` | Toggle Terminal |
| `F5` | Debug / Run |
| `F9` | Toggle Breakpoint |
| `F10` | Step Over |
| `F11` | Step Into |

---

## 🏗️ Architecture

```
RawrXD-Win32IDE.exe (35MB)
├── Win32 API (Native UI)
├── RichEdit 5.0 (Editor Core)
├── LSP Client (JSON-RPC over stdio)
├── MASM x64 Kernels (AVX2/AVX-512)
└── AI Inference Engine (GGUF/Vulkan)
```

### Design Principles

1. **No Dependencies**: No Qt, no Electron, no .NET runtime
2. **Zero-Copy**: Direct memory mapping where possible
3. **Async I/O**: Non-blocking LSP communication
4. **Hardware Acceleration**: Vulkan for GPU inference, AVX-512 for CPU kernels

---

## 🎨 Themes

16 built-in themes including:
- Dark+ (VS Code default)
- Monokai
- Dracula
- Nord
- Solarized
- Gruvbox
- Catppuccin
- Tokyo Night
- Cyberpunk
- Synthwave

Switch themes via Command Palette (`Ctrl+Shift+P` → "Theme").

---

## 🤖 AI Features

### Agent Loop
- Autonomous code analysis and generation
- Multi-step planning with approval gates
- Context-aware suggestions

### Ghost Text
- Inline AI completion
- Token-by-token streaming
- Contextual awareness

### Model Support
- Local GGUF models (Llama, Qwen, etc.)
- Ollama integration
- Hugging Face Hub
- Custom model URLs

---

## 🛠️ Development

### Project Structure

```
RawrXD/
├── src/
│   ├── win32app/          # Main IDE implementation
│   ├── lsp/               # LSP client/server
│   ├── core/              # Shared utilities
│   └── masm/              # Assembly kernels
├── include/               # Public headers
├── build-ninja/           # Build output
└── docs/                  # Documentation
```

### Building from Source

```powershell
# Debug build
cmake -B build-debug -G Ninja -DCMAKE_BUILD_TYPE=Debug
ninja -C build-debug

# Release build (optimized)
cmake -B build-rel -G Ninja -DCMAKE_BUILD_TYPE=Release
ninja -C build-rel
```

---

## 📊 Performance

| Metric | RawrXD | VS Code |
|--------|--------|---------|
| Startup Time | ~200ms | ~2-5s |
| Memory (Idle) | ~45MB | ~300MB |
| Memory (Large Project) | ~150MB | ~1-2GB |
| File Open (10k files) | Instant | ~2s |
| LSP Response | <50ms | <100ms |

---

## 🐛 Troubleshooting

### Editor appears black
- Fixed in v1.0.0: Editor now has minimum 800x600 initial size
- Check that RichEdit libraries are available: `Msftedit.dll`

### LSP not connecting
- Verify language server is in PATH
- Check Output panel for connection errors
- Ensure project root contains valid configuration (e.g., `compile_commands.json` for clangd)

### Crash on startup
- Check `crash_dumps/` folder for minidumps
- Verify Windows SDK is installed
- Try deleting `rawrxd.config.json` to reset settings

---

## 📜 License

MIT License - See LICENSE file for details.

---

## 🙏 Acknowledgments

- LLVM Project (clangd)
- Microsoft (RichEdit, Windows SDK)
- ggml-org (llama.cpp)
- The LSP community

---

**Built with ❤️ for the native development community.**

*Version 1.0.0 - Gold Master Release*

## Section Layout Behavior

The writer supports dynamic section management, and `PEWriter_WriteFile` currently normalizes output to a canonical 5-section baseline:
- `.text`
- `.rdata`
- `.idata`
- `.data`
- `.reloc`

Imports and base relocations are written as part of the final image emission path.

## Import Table Handling

Import support includes:
- Multiple DLL descriptors
- DLL deduplication logic
- Import-by-name entries
- IAT/ILT construction
- Import directory population in PE data directories

## Relocation Support

Base relocation support is implemented:
- `PEWriter_AddBaseRelocation`
- `PEWriter_BuildRelocSection`
- `.reloc` section emission in `PEWriter_WriteFile`

## Minimal Usage Example

```assembly
; Create PE context
mov rcx, 0          ; default image base
mov rdx, 1000h      ; entry point RVA
call PEWriter_CreateExecutable
mov rbx, rax

; Add an import
mov rcx, rbx
mov rdx, offset dll_kernel32
mov r8,  offset func_ExitProcess
call PEWriter_AddImport

; Add code bytes
mov rcx, rbx
mov rdx, offset code_buffer
mov r8,  code_size
call PEWriter_AddCode

; Emit PE file
mov rcx, rbx
mov rdx, offset out_name
call PEWriter_WriteFile
```

## Build and Test Notes

- `build.bat` currently runs a CMake Debug build for the repository workspace.
- The standalone PE writer demonstration source is `RawrXD_PE_Writer_Test.asm`.
- The test source writes `test_output.exe`.

## Error Handling Contract

Writer routines follow a simple return contract:
- `0` = failure
- non-zero = success (or valid RVA/handle for APIs that return addresses)

Checks include allocation validation, input checks, capacity bounds, and file I/O result handling.

## Scope Boundaries

Implemented:
- PE32+ header/section emission
- Import table construction
- Code/data/bss support
- Base relocation support
- Machine-code emitter primitives

Out of scope in current writer path:
- Authenticode/digital signing pipeline
- Full production resource compiler workflow (beyond raw section buffer support)
=======
# RawrXD Pure MASM64

**845 hand-written x64 MASM assembly files** - Zero CRT dependencies, zero external libraries.

## What This Is

A complete AI-assisted IDE implementation in pure assembly:
- **Inference Engine**: Sovereign standalone engine with AVX-512 kernels, KV cache, BPE tokenizer
- **Agentic System**: Full orchestrator with task queue, deep thinking kernels, agent core
- **IDE**: MonacoCore editor with gap buffer, AVX2 lexer, syntax highlighting, ghost text
- **LSP/DAP**: Complete Language Server and Debug Adapter Protocol implementations
- **GPU/Vulkan**: Multi-GPU swarm orchestration, Vulkan compute bridge
- **Build System**: Genesis MASM64 - pure assembly build system (PowerShell replacement)

## Architecture

```
src/asm/
├── monolithic/           # Core IDE (main.asm, inference.asm, ui.asm, lsp.asm, dap.asm, agent.asm)
├── gpu/                  # RDNA3-specific optimizations
├── genesis_masm64.asm     # Pure MASM build system
├── SovereignStandaloneEngine.asm
├── RawrXD_AgenticOrchestrator.asm
├── RawrXD_MonacoCore.asm
├── inference_core.asm
├── kv_cache_mgr.asm
└── ... (840+ more files)
```

## Build Requirements

- **ml64.exe** (MASM x64 assembler)
- **link.exe** (Microsoft linker)
- Windows SDK (kernel32.lib, user32.lib)

## Build Command

```powershell
# Using genesis_masm64.asm (pure MASM build system)
ml64 /c genesis_masm64.asm
link /SUBSYSTEM:WINDOWS /ENTRY:WinMain genesis_masm64.obj
```

## Key Features

| Component | File | Description |
|-----------|------|-------------|
| Inference Core | `inference_core.asm` | SGEMM/SGEMV kernels, AVX-512 dispatch |
| KV Cache | `kv_cache_mgr.asm` | VirtualAlloc-backed cache management |
| Tokenizer | `RawrXD_Tokenizer.asm` | BPE with FNV-1a hash merge table |
| Agentic | `RawrXD_AgenticOrchestrator.asm` | Task queue, worker threads, telemetry |
| Editor | `RawrXD_MonacoCore.asm` | Gap buffer, ASM tokenizer, syntax highlighting |
| LSP | `monolithic/lsp.asm` | JSON-RPC over stdin/stdout |
| DAP | `monolithic/dap.asm` | Debug Adapter Protocol |
| Vulkan | `RawrXD_VulkanBridge.asm` | GPU compute dispatch |
| Swarm | `monolithic/swarm.asm` | Multi-GPU orchestration |

## Calling Convention

All code follows **Windows x64 ABI**:
- Volatile: RAX, RCX, RDX, R8, R9, R10, R11, XMM0-XMM5
- Non-volatile: RBX, RBP, RSI, RDI, R12-R15, XMM6-XMM15
- Stack: 16-byte aligned before CALL

## License

MIT

## Author

ItsMehRAWRXD
>>>>>>> 5d06bca79190edcc5ccb7d4763eb2bdab10aecbd
