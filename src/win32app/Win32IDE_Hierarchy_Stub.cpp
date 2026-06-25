// ============================================================================
// Win32IDE_Hierarchy_Stub.cpp — Call/Type Hierarchy Stub Implementation
// ============================================================================
// Stub implementations for Call/Type Hierarchy. These will be integrated with
// the actual LSP client in a future phase.
// ============================================================================

#include "Win32IDE.h"
#include "IDELogger.h"
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// ============================================================================
// Call/Type Hierarchy - Stub Implementations
// ============================================================================

namespace Win32IDE_Hierarchy {

    json lspPrepareCallHierarchy(const std::string& fileUri, int line, int column) {
        (void)fileUri; (void)line; (void)column;
        // Stub - returns empty hierarchy
        return json::array();
    }
    
    json lspIncomingCalls(const std::string& itemUri, int line, int column) {
        (void)itemUri; (void)line; (void)column;
        // Stub - returns empty calls
        return json::array();
    }
    
    json lspOutgoingCalls(const std::string& itemUri, int line, int column) {
        (void)itemUri; (void)line; (void)column;
        // Stub - returns empty calls
        return json::array();
    }
    
    json lspPrepareTypeHierarchy(const std::string& fileUri, int line, int column) {
        (void)fileUri; (void)line; (void)column;
        // Stub - returns empty hierarchy
        return json::array();
    }
    
    json lspSupertypes(const std::string& itemUri) {
        (void)itemUri;
        // Stub - returns empty types
        return json::array();
    }
    
    json lspSubtypes(const std::string& itemUri) {
        (void)itemUri;
        // Stub - returns empty types
        return json::array();
    }
    
    void cmdShowCallHierarchy() {
        // Stub - will be implemented with actual UI
    }
    
    void cmdShowTypeHierarchy() {
        // Stub - will be implemented with actual UI
    }

}  // namespace Win32IDE_Hierarchy