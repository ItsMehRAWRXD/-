// RawrXD_BuildStubs.cpp - Comprehensive stub implementations for production build
// This file provides minimal stub implementations for all unresolved external symbols

#include <windows.h>
#include <cstdint>
#include <cstring>
#include <vector>
#include <atomic>

// ============================================================================
// Agent Bridge Stubs (truly missing symbols only)
// ============================================================================

extern "C" {

void AgentBridge_SetShuttingDown(bool) {}
void AgentBridge_SetInitComplete(bool) {}
void AgentBridge_BindMainWindow(void*) {}
void PromptWarm_SetAcceptRequests(bool) {}

// Smoke test stubs
int runAgentWalCliSmokeTest() { return 0; }

} // extern "C"

namespace rawrxd {
namespace ghost_pipeline_probe {
    int runGhostPipelineProbeCli() { return 0; }
}
}

// ============================================================================
// GGUF/Inference Stubs
// ============================================================================

extern "C" {

void matmul_kernel_avx2(const float*, const float*, float*, int, int, int) {}
void ggml_rxd_gemm_q4_0() {}

} // extern "C"

// ============================================================================
// Self-Host Engine Stubs
// ============================================================================

extern "C" {

void* asm_selfhost_init() { return nullptr; }
void asm_selfhost_compile() {}
void asm_selfhost_patch() {}
void asm_selfhost_write_source() {}
void* asm_selfhost_get_generation() { return nullptr; }
void* asm_selfhost_get_stats() { return nullptr; }
void asm_selfhost_shutdown() {}

} // extern "C"

// ============================================================================
// Global Variables
// ============================================================================

std::atomic<bool> s_isThinking{false};