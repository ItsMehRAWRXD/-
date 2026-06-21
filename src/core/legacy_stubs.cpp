// legacy_stubs.cpp - Battle-Hardened Stubs for Legacy Dependencies
// Architecture: C++20, Win32, no Qt, no exceptions
// Provides no-op implementations for missing globals and registry-dependent symbols
// ============================================================================

#include <cstdint>
#include <cstdio>
#include <string>

// ============================================================================
// Global Pulse Ring (Stub)
// ============================================================================

// Forward declaration from pulse_ring_buffer.h
namespace RawrXD {
namespace Pulse {
    struct PulseRingBuffer;
}
}

// Global pulse ring instance (stub)
RawrXD::Pulse::PulseRingBuffer* g_pulseRing = nullptr;

// ============================================================================
// IDM_TOOLS_KILL_BUILD_LOCKS (Stub)
// This should be defined in ide_constants.h or resource.h
// ============================================================================

#ifndef IDM_TOOLS_KILL_BUILD_LOCKS
#define IDM_TOOLS_KILL_BUILD_LOCKS 42000
#endif

// ============================================================================
// Telemetry Pager Extensions (Stub)
// ============================================================================

namespace sov {

std::string formatPagerLastLoadTelemetryReport()
{
    // No-op stub - telemetry report disabled
    return "[telemetry] Pager last load report not available (stub)";
}

} // namespace sov

// ============================================================================
// Vulkan Compute Extensions (Stub)
// ============================================================================

namespace VulkanCompute {

bool IsFlashAttentionFP8TiledPipelineReady()
{
    // No-op stub - Vulkan acceleration not available
    return false;
}

} // namespace VulkanCompute

// ============================================================================
// VirtualAlloc Reservation Manager Extensions (Stub)
// ============================================================================

namespace RawrXD {
namespace Compression {

class VirtualAllocReservationManagerExtensions
{
public:
    static int GetPreferredNumaNode()
    {
        // No-op stub - NUMA preference not available
        return -1; // kPreferredNumaNodeAuto
    }
    
    static constexpr int kPreferredNumaNodeAuto = -1;
    static constexpr int kPreferredNumaNode0 = 0;
    static constexpr int kPreferredNumaNode1 = 1;
};

} // namespace Compression
} // namespace RawrXD

// ============================================================================
// UI Sidebar Staging Panel (Stub)
// ============================================================================

namespace RawrXD {
namespace UI {

void drainPendingVcsIndexSnapshots(void* hwnd)
{
    (void)hwnd;
    // No-op stub - VCS index snapshot draining disabled
}

} // namespace UI
} // namespace RawrXD

// ============================================================================
// END OF FILE
// ============================================================================