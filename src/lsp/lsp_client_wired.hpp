#pragma once
// ============================================================================
// lsp_client_wired.hpp — Phase 22: LSP Diagnostics Wiring Harness
// ============================================================================
// Bridges RawrXD's internal LSP server (RawrXD_LSPServer) to the IDE's
// ProblemsPanel via JSON-RPC over stdin/stdout.
//
// Architecture:
//   RawrXD_LSPServer (child process) → JSON-RPC → LSPClientWired →
//   ProblemsAggregator → Win32IDE_ProblemsPanel
//
// Pattern: Thread-safe singleton, PatchResult-style error handling.
// ============================================================================

#include <string>
#include <vector>
#include <map>
#include <thread>
#include <mutex>
#include <atomic>
#include <functional>
#include <nlohmann/json.hpp>
#include "agentic/lsp/LSPClient.hpp"

// Forward declarations
namespace RawrXD {
    struct ProblemEntry;
}

namespace rawrxd::lsp {

using namespace RawrXD::Agentic;
using json = nlohmann::json;

// ============================================================================
// LSP Protocol Types
// ============================================================================
struct Location {
    std::string uri;
    struct {
        uint32_t line;
        uint32_t character;
    } start, end;
};

struct WorkspaceEdit {
    std::map<std::string, std::vector<struct TextEdit>> changes;
};

struct TextEdit {
    struct Range {
        Location start, end;
    } range;
    std::string newText;
};

// ============================================================================
// LSP Diagnostic (mirrors LSP spec)
// ============================================================================
struct LSPDiagnosticItem {
    uint32_t line;           // 0-based
    uint32_t character;      // 0-based start column
    uint32_t endLine;        // 0-based
    uint32_t endCharacter;   // 0-based end column
    uint32_t severity;       // 1=Error, 2=Warning, 3=Info, 4=Hint
    std::string code;        // Error code (e.g., "C2664")
    std::string source;      // "clangd", "RawrXD", etc.
    std::string message;
};

// Type aliases for LSP protocol types from base class
using Diagnostic = RawrXD::Agentic::LSPDiagnostic;
using CompletionItem = RawrXD::Agentic::LSPCompletionItem;

// ============================================================================
// LSP Client Wiring Harness (Phase 22)
// ============================================================================
class LSPClientWired : public RawrXD::Agentic::LSPClient {
public:
    static LSPClientWired& instance();
    
    // Phase 22: Lifecycle
    bool initializeForProject(const std::string& project_root);
    void shutdown();
    bool isConnected() const { return m_connected.load(); }
    
    // Phase 22: Diagnostics Pipeline (server → UI)
    void publishDiagnostics(const std::string& file_path,
                           std::vector<Diagnostic> diagnostics);
    
    // Phase 22: Request/Response (client → server)
    std::string getHoverInfo(const std::string& file, 
                             uint32_t line, 
                             uint32_t character);
    
    Location getDefinition(const std::string& file,
                          uint32_t line,
                          uint32_t character);
    
    std::vector<CompletionItem> getCompletions(const std::string& file,
                                                uint32_t line,
                                                uint32_t character,
                                                const std::string& prefix);
    
    WorkspaceEdit renameSymbol(const std::string& file,
                              uint32_t line,
                              uint32_t character,
                              const std::string& new_name);
    
    // Phase 22: File change notifications (trigger re-analysis)
    void notifyFileOpened(const std::string& file_path, const std::string& language, const std::string& content);
    void notifyFileChanged(const std::string& file_path, const std::string& content);
    void notifyFileClosed(const std::string& file_path);
    void notifyFileSaved(const std::string& file_path);

private:
    LSPClientWired() = default;
    ~LSPClientWired();
    
    // Process management
    bool startServerProcess(const std::string& project_root);
    void stopServerProcess();
    
    // Communication threads
    void readerThread();
    void dispatchMessage(const json& msg);
    
    // JSON-RPC helpers
    bool sendRequest(const json& request);
    json waitForResponse(const std::string& id, int timeout_ms = 5000);
    
    // Conversion helpers
    RawrXD::ProblemEntry convertDiagnostic(const std::string& file_path, const LSPDiagnosticItem& diag);
    
    // State
    std::atomic<bool> m_connected{false};
    std::atomic<bool> m_shutdown{false};
    std::string m_projectRoot;
    
    // Process handles (Windows)
    void* m_hServerProcess{nullptr};
    void* m_hStdinWrite{nullptr};
    void* m_hStdoutRead{nullptr};
    
    // Threading
    std::thread m_readerThread;
    std::mutex m_requestMutex;
    std::mutex m_responseMutex;
    std::map<std::string, json> m_pendingResponses;
    std::atomic<uint32_t> m_requestId{0};
    
    // Callbacks
    std::function<void(const std::string&, const std::vector<LSPDiagnosticItem>&)> m_onDiagnostics;
};

} // namespace rawrxd::lsp
