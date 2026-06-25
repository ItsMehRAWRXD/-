#include "Win32SwarmBridge.h"
#include <windows.h>
#include <cstdint>
#include <cstdio>

namespace RawrXD::Bridge {

    // IAT slot indices from audit
constexpr int IAT_SLOT_INITIALIZE_SWARM = 20;
constexpr int IAT_SLOT_CREATE_ACCEL = 21;
constexpr int IAT_SLOT_REMOVE_TAB = 22;
constexpr int IAT_SLOT_ADD_TAB = 23;

constexpr int IAT_SLOT_AGENT_BRIDGE_GET = 48;
constexpr int IAT_SLOT_SA_MGR_SUMMARY = 49;
constexpr int IAT_SLOT_SA_MGR_COUNT = 50;
constexpr int IAT_SLOT_SA_MGR_HEALTHY = 51;

constexpr int IAT_SLOT_EXECUTE_SWARM = 54;
constexpr int IAT_SLOT_SHUTDOWN_SWARM = 55;

bool RegisterSwarmBridgeWithIAT() {
    // DISABLED: IAT hooks cause recursion crashes
    // The hooks were redirecting functions to themselves
    return false;
}

} // namespace RawrXD::Bridge
