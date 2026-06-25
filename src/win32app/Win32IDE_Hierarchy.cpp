// ============================================================================
// Win32IDE_Hierarchy.cpp — Call Hierarchy & Type Hierarchy Navigation
// ============================================================================
// Implements LSP 3.16+ hierarchy features:
//   - textDocument/callHierarchy/incomingCalls
//   - textDocument/callHierarchy/outgoingCalls
//   - textDocument/typeHierarchy/subtypes
//   - textDocument/typeHierarchy/supertypes
//
// Pattern: No exceptions, PatchResult-compatible
// Threading: Background LSP request, UI thread for rendering
// ============================================================================

#include "Win32IDE.h"
#include "IDELogger.h"
#include <nlohmann/json.hpp>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <commctrl.h>

using json = nlohmann::json;

// ============================================================================
// CALL HIERARCHY ITEM
// ============================================================================

struct CallHierarchyItem {
    std::string name;
    std::string kind;  // "function", "method", "constructor", etc.
    std::string detail;
    std::string uri;
    struct {
        int startLine;
        int startCharacter;
        int endLine;
        int endCharacter;
    } range;
    struct {
        int startLine;
        int startCharacter;
        int endLine;
        int endCharacter;
    } selectionRange;
};

struct CallHierarchyCall {
    CallHierarchyItem from;
    CallHierarchyItem to;
    struct {
        int startLine;
        int startCharacter;
        int endLine;
        int endCharacter;
    } fromRanges;
};

// ============================================================================
// TYPE HIERARCHY ITEM
// ============================================================================

struct TypeHierarchyItem {
    std::string name;
    std::string kind;  // "class", "interface", "struct", "enum", etc.
    std::string detail;
    std::string uri;
    struct {
        int startLine;
        int startCharacter;
        int endLine;
        int endCharacter;
    } range;
    struct {
        int startLine;
        int startCharacter;
        int endLine;
        int endCharacter;
    } selectionRange;
    std::vector<TypeHierarchyItem> parents;   // supertypes
    std::vector<TypeHierarchyItem> children;  // subtypes
};

// ============================================================================
// CALL HIERARCHY IMPLEMENTATION
// ============================================================================

CallHierarchyItem Win32IDE::lspPrepareCallHierarchy(const std::string& uri, int line, int character) {
    CallHierarchyItem result;
    LSPLanguage lang = detectLanguageForFile(uriToFilePath(uri));
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return result;
    }

    json params;
    params["textDocument"]["uri"] = uri;
    params["position"]["line"] = line;
    params["position"]["character"] = character;

    int id = sendLSPRequest(lang, "textDocument/prepareCallHierarchy", params);
    if (id < 0) {
        return result;
    }

    json resp = readLSPResponse(lang, id, 5000);
    m_lspStats.totalCallHierarchyRequests++;

    if (!resp.contains("result") || resp["result"].is_null() || !resp["result"].is_array()) {
        return result;
    }

    if (!resp["result"].empty()) {
        const auto& item = resp["result"][0];
        result.name = item.value("name", "");
        result.kind = item.value("kind", "");
        result.detail = item.value("detail", "");
        result.uri = item.value("uri", "");

        if (item.contains("range")) {
            const auto& r = item["range"];
            result.range.startLine = r["start"].value("line", 0);
            result.range.startCharacter = r["start"].value("character", 0);
            result.range.endLine = r["end"].value("line", 0);
            result.range.endCharacter = r["end"].value("character", 0);
        }

        if (item.contains("selectionRange")) {
            const auto& sr = item["selectionRange"];
            result.selectionRange.startLine = sr["start"].value("line", 0);
            result.selectionRange.startCharacter = sr["start"].value("character", 0);
            result.selectionRange.endLine = sr["end"].value("line", 0);
            result.selectionRange.endCharacter = sr["end"].value("character", 0);
        }
    }

    return result;
}

std::vector<CallHierarchyCall> Win32IDE::lspIncomingCalls(const CallHierarchyItem& item) {
    std::vector<CallHierarchyCall> calls;
    LSPLanguage lang = detectLanguageForFile(uriToFilePath(item.uri));
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return calls;
    }

    json params;
    json itemJson;
    itemJson["name"] = item.name;
    itemJson["kind"] = item.kind;
    itemJson["uri"] = item.uri;
    itemJson["range"]["start"]["line"] = item.range.startLine;
    itemJson["range"]["start"]["character"] = item.range.startCharacter;
    itemJson["range"]["end"]["line"] = item.range.endLine;
    itemJson["range"]["end"]["character"] = item.range.endCharacter;
    itemJson["selectionRange"]["start"]["line"] = item.selectionRange.startLine;
    itemJson["selectionRange"]["start"]["character"] = item.selectionRange.startCharacter;
    itemJson["selectionRange"]["end"]["line"] = item.selectionRange.endLine;
    itemJson["selectionRange"]["end"]["character"] = item.selectionRange.endCharacter;
    params["item"] = itemJson;

    int id = sendLSPRequest(lang, "callHierarchy/incomingCalls", params);
    if (id < 0) {
        return calls;
    }

    json resp = readLSPResponse(lang, id, 10000);

    if (!resp.contains("result") || !resp["result"].is_array()) {
        return calls;
    }

    for (const auto& call : resp["result"]) {
        CallHierarchyCall chc;

        // Parse "from" item
        if (call.contains("from")) {
            const auto& from = call["from"];
            chc.from.name = from.value("name", "");
            chc.from.kind = from.value("kind", "");
            chc.from.uri = from.value("uri", "");

            if (from.contains("range")) {
                const auto& r = from["range"];
                chc.from.range.startLine = r["start"].value("line", 0);
                chc.from.range.startCharacter = r["start"].value("character", 0);
                chc.from.range.endLine = r["end"].value("line", 0);
                chc.from.range.endCharacter = r["end"].value("character", 0);
            }
        }

        // Parse "fromRanges"
        if (call.contains("fromRanges") && call["fromRanges"].is_array()) {
            for (const auto& fr : call["fromRanges"]) {
                chc.fromRanges.startLine = fr["start"].value("line", 0);
                chc.fromRanges.startCharacter = fr["start"].value("character", 0);
                chc.fromRanges.endLine = fr["end"].value("line", 0);
                chc.fromRanges.endCharacter = fr["end"].value("character", 0);
                break;  // Just use first range
            }
        }

        calls.push_back(chc);
    }

    return calls;
}

std::vector<CallHierarchyCall> Win32IDE::lspOutgoingCalls(const CallHierarchyItem& item) {
    std::vector<CallHierarchyCall> calls;
    LSPLanguage lang = detectLanguageForFile(uriToFilePath(item.uri));
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return calls;
    }

    json params;
    json itemJson;
    itemJson["name"] = item.name;
    itemJson["kind"] = item.kind;
    itemJson["uri"] = item.uri;
    itemJson["range"]["start"]["line"] = item.range.startLine;
    itemJson["range"]["start"]["character"] = item.range.startCharacter;
    itemJson["range"]["end"]["line"] = item.range.endLine;
    itemJson["range"]["end"]["character"] = item.range.endCharacter;
    itemJson["selectionRange"]["start"]["line"] = item.selectionRange.startLine;
    itemJson["selectionRange"]["start"]["character"] = item.selectionRange.startCharacter;
    itemJson["selectionRange"]["end"]["line"] = item.selectionRange.endLine;
    itemJson["selectionRange"]["end"]["character"] = item.selectionRange.endCharacter;
    params["item"] = itemJson;

    int id = sendLSPRequest(lang, "callHierarchy/outgoingCalls", params);
    if (id < 0) {
        return calls;
    }

    json resp = readLSPResponse(lang, id, 10000);

    if (!resp.contains("result") || !resp["result"].is_array()) {
        return calls;
    }

    for (const auto& call : resp["result"]) {
        CallHierarchyCall chc;

        // Parse "to" item
        if (call.contains("to")) {
            const auto& to = call["to"];
            chc.to.name = to.value("name", "");
            chc.to.kind = to.value("kind", "");
            chc.to.uri = to.value("uri", "");

            if (to.contains("range")) {
                const auto& r = to["range"];
                chc.to.range.startLine = r["start"].value("line", 0);
                chc.to.range.startCharacter = r["start"].value("character", 0);
                chc.to.range.endLine = r["end"].value("line", 0);
                chc.to.range.endCharacter = r["end"].value("character", 0);
            }
        }

        // Parse "fromRanges"
        if (call.contains("fromRanges") && call["fromRanges"].is_array()) {
            for (const auto& fr : call["fromRanges"]) {
                chc.fromRanges.startLine = fr["start"].value("line", 0);
                chc.fromRanges.startCharacter = fr["start"].value("character", 0);
                chc.fromRanges.endLine = fr["end"].value("line", 0);
                chc.fromRanges.endCharacter = fr["end"].value("character", 0);
                break;
            }
        }

        calls.push_back(chc);
    }

    return calls;
}

// ============================================================================
// TYPE HIERARCHY IMPLEMENTATION
// ============================================================================

TypeHierarchyItem Win32IDE::lspPrepareTypeHierarchy(const std::string& uri, int line, int character) {
    TypeHierarchyItem result;
    LSPLanguage lang = detectLanguageForFile(uriToFilePath(uri));
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return result;
    }

    json params;
    params["textDocument"]["uri"] = uri;
    params["position"]["line"] = line;
    params["position"]["character"] = character;

    int id = sendLSPRequest(lang, "textDocument/prepareTypeHierarchy", params);
    if (id < 0) {
        return result;
    }

    json resp = readLSPResponse(lang, id, 5000);
    m_lspStats.totalTypeHierarchyRequests++;

    if (!resp.contains("result") || resp["result"].is_null() || !resp["result"].is_array()) {
        return result;
    }

    if (!resp["result"].empty()) {
        const auto& item = resp["result"][0];
        result.name = item.value("name", "");
        result.kind = item.value("kind", "");
        result.detail = item.value("detail", "");
        result.uri = item.value("uri", "");

        if (item.contains("range")) {
            const auto& r = item["range"];
            result.range.startLine = r["start"].value("line", 0);
            result.range.startCharacter = r["start"].value("character", 0);
            result.range.endLine = r["end"].value("line", 0);
            result.range.endCharacter = r["end"].value("character", 0);
        }

        if (item.contains("selectionRange")) {
            const auto& sr = item["selectionRange"];
            result.selectionRange.startLine = sr["start"].value("line", 0);
            result.selectionRange.startCharacter = sr["start"].value("character", 0);
            result.selectionRange.endLine = sr["end"].value("line", 0);
            result.selectionRange.endCharacter = sr["end"].value("character", 0);
        }
    }

    return result;
}

std::vector<TypeHierarchyItem> Win32IDE::lspSupertypes(const TypeHierarchyItem& item) {
    std::vector<TypeHierarchyItem> supertypes;
    LSPLanguage lang = detectLanguageForFile(uriToFilePath(item.uri));
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return supertypes;
    }

    json params;
    json itemJson;
    itemJson["name"] = item.name;
    itemJson["kind"] = item.kind;
    itemJson["uri"] = item.uri;
    itemJson["range"]["start"]["line"] = item.range.startLine;
    itemJson["range"]["start"]["character"] = item.range.startCharacter;
    itemJson["range"]["end"]["line"] = item.range.endLine;
    itemJson["range"]["end"]["character"] = item.range.endCharacter;
    itemJson["selectionRange"]["start"]["line"] = item.selectionRange.startLine;
    itemJson["selectionRange"]["start"]["character"] = item.selectionRange.startCharacter;
    itemJson["selectionRange"]["end"]["line"] = item.selectionRange.endLine;
    itemJson["selectionRange"]["end"]["character"] = item.selectionRange.endCharacter;
    params["item"] = itemJson;

    int id = sendLSPRequest(lang, "typeHierarchy/supertypes", params);
    if (id < 0) {
        return supertypes;
    }

    json resp = readLSPResponse(lang, id, 10000);

    if (!resp.contains("result") || !resp["result"].is_array()) {
        return supertypes;
    }

    for (const auto& sup : resp["result"]) {
        TypeHierarchyItem thi;
        thi.name = sup.value("name", "");
        thi.kind = sup.value("kind", "");
        thi.detail = sup.value("detail", "");
        thi.uri = sup.value("uri", "");

        if (sup.contains("range")) {
            const auto& r = sup["range"];
            thi.range.startLine = r["start"].value("line", 0);
            thi.range.startCharacter = r["start"].value("character", 0);
            thi.range.endLine = r["end"].value("line", 0);
            thi.range.endCharacter = r["end"].value("character", 0);
        }

        supertypes.push_back(thi);
    }

    return supertypes;
}

std::vector<TypeHierarchyItem> Win32IDE::lspSubtypes(const TypeHierarchyItem& item) {
    std::vector<TypeHierarchyItem> subtypes;
    LSPLanguage lang = detectLanguageForFile(uriToFilePath(item.uri));
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return subtypes;
    }

    json params;
    json itemJson;
    itemJson["name"] = item.name;
    itemJson["kind"] = item.kind;
    itemJson["uri"] = item.uri;
    itemJson["range"]["start"]["line"] = item.range.startLine;
    itemJson["range"]["start"]["character"] = item.range.startCharacter;
    itemJson["range"]["end"]["line"] = item.range.endLine;
    itemJson["range"]["end"]["character"] = item.range.endCharacter;
    itemJson["selectionRange"]["start"]["line"] = item.selectionRange.startLine;
    itemJson["selectionRange"]["start"]["character"] = item.selectionRange.startCharacter;
    itemJson["selectionRange"]["end"]["line"] = item.selectionRange.endLine;
    itemJson["selectionRange"]["end"]["character"] = item.selectionRange.endCharacter;
    params["item"] = itemJson;

    int id = sendLSPRequest(lang, "typeHierarchy/subtypes", params);
    if (id < 0) {
        return subtypes;
    }

    json resp = readLSPResponse(lang, id, 10000);

    if (!resp.contains("result") || !resp["result"].is_array()) {
        return subtypes;
    }

    for (const auto& sub : resp["result"]) {
        TypeHierarchyItem thi;
        thi.name = sub.value("name", "");
        thi.kind = sub.value("kind", "");
        thi.detail = sub.value("detail", "");
        thi.uri = sub.value("uri", "");

        if (sub.contains("range")) {
            const auto& r = sub["range"];
            thi.range.startLine = r["start"].value("line", 0);
            thi.range.startCharacter = r["start"].value("character", 0);
            thi.range.endLine = r["end"].value("line", 0);
            thi.range.endCharacter = r["end"].value("character", 0);
        }

        subtypes.push_back(thi);
    }

    return subtypes;
}

// ============================================================================
// UI COMMANDS
// ============================================================================

void Win32IDE::cmdShowCallHierarchy() {
    if (m_currentFile.empty() || !m_hwndEditor) {
        appendToOutput("[CallHierarchy] No file open.", "General", OutputSeverity::Warning);
        return;
    }

    // Get cursor position
    CHARRANGE sel;
    SendMessage(m_hwndEditor, EM_EXGETSEL, 0, reinterpret_cast<LPARAM>(&sel));
    int line = SendMessage(m_hwndEditor, EM_LINEFROMCHAR, sel.cpMin, 0);
    int lineStart = SendMessage(m_hwndEditor, EM_LINEINDEX, line, 0);
    int character = sel.cpMin - lineStart;

    std::string uri = filePathToUri(m_currentFile);

    // Prepare call hierarchy
    CallHierarchyItem item = lspPrepareCallHierarchy(uri, line, character);

    if (item.name.empty()) {
        appendToOutput("[CallHierarchy] No call hierarchy available at this location.", "General", OutputSeverity::Info);
        return;
    }

    // Show incoming/outgoing calls
    std::thread([this, item]() {
        auto incoming = lspIncomingCalls(item);
        auto outgoing = lspOutgoingCalls(item);

        // Post results to UI thread
        std::string result = "Call Hierarchy for: " + item.name + "\n\n";
        result += "=== Incoming Calls (" + std::to_string(incoming.size()) + ") ===\n";
        for (const auto& call : incoming) {
            result += "  " + call.from.name + " (" + call.from.kind + ") - " + call.from.uri + ":" + std::to_string(call.fromRanges.startLine + 1) + "\n";
        }
        result += "\n=== Outgoing Calls (" + std::to_string(outgoing.size()) + ") ===\n";
        for (const auto& call : outgoing) {
            result += "  " + call.to.name + " (" + call.to.kind + ") - " + call.to.uri + ":" + std::to_string(call.fromRanges.startLine + 1) + "\n";
        }

        // Store result and notify UI
        {
            std::lock_guard<std::mutex> lock(m_callHierarchyMutex);
            m_lastCallHierarchyResult = result;
        }
        PostMessageA(m_hwndMain, WM_APP + 510, 0, 0);
    }).detach();

    appendToOutput("[CallHierarchy] Loading call hierarchy...", "General", OutputSeverity::Info);
}

void Win32IDE::cmdShowTypeHierarchy() {
    if (m_currentFile.empty() || !m_hwndEditor) {
        appendToOutput("[TypeHierarchy] No file open.", "General", OutputSeverity::Warning);
        return;
    }

    // Get cursor position
    CHARRANGE sel;
    SendMessage(m_hwndEditor, EM_EXGETSEL, 0, reinterpret_cast<LPARAM>(&sel));
    int line = SendMessage(m_hwndEditor, EM_LINEFROMCHAR, sel.cpMin, 0);
    int lineStart = SendMessage(m_hwndEditor, EM_LINEINDEX, line, 0);
    int character = sel.cpMin - lineStart;

    std::string uri = filePathToUri(m_currentFile);

    // Prepare type hierarchy
    TypeHierarchyItem item = lspPrepareTypeHierarchy(uri, line, character);

    if (item.name.empty()) {
        appendToOutput("[TypeHierarchy] No type hierarchy available at this location.", "General", OutputSeverity::Info);
        return;
    }

    // Show supertypes/subtypes
    std::thread([this, item]() {
        auto supertypes = lspSupertypes(item);
        auto subtypes = lspSubtypes(item);

        // Build result string
        std::string result = "Type Hierarchy for: " + item.name + " (" + item.kind + ")\n\n";
        result += "=== Supertypes (" + std::to_string(supertypes.size()) + ") ===\n";
        for (const auto& sup : supertypes) {
            result += "  " + sup.name + " (" + sup.kind + ")";
            if (!sup.detail.empty()) result += " - " + sup.detail;
            result += "\n";
        }
        result += "\n=== Subtypes (" + std::to_string(subtypes.size()) + ") ===\n";
        for (const auto& sub : subtypes) {
            result += "  " + sub.name + " (" + sub.kind + ")";
            if (!sub.detail.empty()) result += " - " + sub.detail;
            result += "\n";
        }

        // Store result and notify UI
        {
            std::lock_guard<std::mutex> lock(m_typeHierarchyMutex);
            m_lastTypeHierarchyResult = result;
        }
        PostMessageA(m_hwndMain, WM_APP + 511, 0, 0);
    }).detach();

    appendToOutput("[TypeHierarchy] Loading type hierarchy...", "General", OutputSeverity::Info);
}