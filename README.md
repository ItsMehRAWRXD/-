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