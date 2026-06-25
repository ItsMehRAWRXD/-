// ============================================================================
// Win32IDE_CodeActions.cpp — LSP Code Actions (Quick Fixes)
// ============================================================================
// Implements LSP textDocument/codeAction for quick fixes from diagnostics:
//   - Quick fix suggestions from LSP server
//   - Refactor actions (extract method, rename, etc.)
//   - Organize imports
//   - Fix all (auto-fix all diagnostics in file)
//   - Source actions (generate getters/setters, etc.)
//
// Pattern: No exceptions, PatchResult-compatible
// Threading: Background LSP request, UI thread for applying edits
// ============================================================================

#include "Win32IDE.h"
#include "IDELogger.h"
#include <nlohmann/json.hpp>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>

using json = nlohmann::json;

// ============================================================================
// CODE ACTION STRUCTURES
// ============================================================================

struct CodeAction {
    std::string title;
    std::string kind;  // "quickfix", "refactor", "source.organizeImports", etc.
    bool isPreferred;
    std::string editUri;
    std::vector<Win32IDE::LSPWorkspaceEdit::TextEdit> edits;
    std::string command;
    json commandArgs;
};

// ============================================================================
// CODE ACTION REQUEST/RESPONSE
// ============================================================================

std::vector<CodeAction> Win32IDE::lspCodeActions(const std::string& uri, int line, int character,
                                                  const std::vector<LSPDiagnostic>& diagnostics) {
    std::vector<CodeAction> actions;
    LSPLanguage lang = detectLanguageForFile(uriToFilePath(uri));
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return actions;
    }

    // Build code action request
    json params;
    params["textDocument"]["uri"] = uri;
    params["range"]["start"]["line"] = line;
    params["range"]["start"]["character"] = character;
    params["range"]["end"]["line"] = line;
    params["range"]["end"]["character"] = character;

    // Include diagnostics context
    json diagArray = json::array();
    for (const auto& diag : diagnostics) {
        if (diag.range.start.line == line) {
            json d;
            d["range"]["start"]["line"] = diag.range.start.line;
            d["range"]["start"]["character"] = diag.range.start.character;
            d["range"]["end"]["line"] = diag.range.end.line;
            d["range"]["end"]["character"] = diag.range.end.character;
            d["message"] = diag.message;
            d["severity"] = diag.severity;
            d["source"] = diag.source;
            if (!diag.code.empty()) {
                d["code"] = diag.code;
            }
            diagArray.push_back(d);
        }
    }
    params["context"]["diagnostics"] = diagArray;

    // Request only quick fixes and refactors
    params["context"]["only"] = json::array({"quickfix", "refactor", "source"});

    int id = sendLSPRequest(lang, "textDocument/codeAction", params);
    if (id < 0) {
        return actions;
    }

    json resp = readLSPResponse(lang, id, 5000);
    m_lspStats.totalCodeActionRequests++;

    if (!resp.contains("result") || resp["result"].is_null() || !resp["result"].is_array()) {
        return actions;
    }

    // Parse code actions
    for (const auto& actionJson : resp["result"]) {
        CodeAction action;
        action.title = actionJson.value("title", "");
        action.kind = actionJson.value("kind", "");
        action.isPreferred = actionJson.value("isPreferred", false);

        // Parse edit
        if (actionJson.contains("edit")) {
            const auto& edit = actionJson["edit"];
            if (edit.contains("changes")) {
                for (auto it = edit["changes"].begin(); it != edit["changes"].end(); ++it) {
                    action.editUri = it.key();
                    if (it.value().is_array()) {
                        for (const auto& textEdit : it.value()) {
                            Win32IDE::LSPWorkspaceEdit::TextEdit te;
                            te.newText = textEdit.value("newText", "");
                            if (textEdit.contains("range")) {
                                const auto& r = textEdit["range"];
                                te.range.start.line = r["start"].value("line", 0);
                                te.range.start.character = r["start"].value("character", 0);
                                te.range.end.line = r["end"].value("line", 0);
                                te.range.end.character = r["end"].value("character", 0);
                            }
                            action.edits.push_back(te);
                        }
                    }
                }
            }
        }

        // Parse command (for actions that execute commands)
        if (actionJson.contains("command")) {
            const auto& cmd = actionJson["command"];
            action.command = cmd.value("command", "");
            if (cmd.contains("arguments")) {
                action.commandArgs = cmd["arguments"];
            }
        }

        actions.push_back(action);
    }

    return actions;
}

// ============================================================================
// APPLY CODE ACTION
// ============================================================================

bool Win32IDE::applyCodeAction(const CodeAction& action) {
    if (action.edits.empty() && action.command.empty()) {
        return false;
    }

    // Apply text edits
    if (!action.edits.empty()) {
        // Sort edits by position (reverse order for safe application)
        std::vector<Win32IDE::LSPWorkspaceEdit::TextEdit> sortedEdits = action.edits;
        std::sort(sortedEdits.begin(), sortedEdits.end(), 
            [](const auto& a, const auto& b) {
                if (a.range.start.line != b.range.start.line)
                    return a.range.start.line > b.range.start.line;
                return a.range.start.character > b.range.start.character;
            });

        // Apply each edit
        for (const auto& edit : sortedEdits) {
            applyTextEdit(edit);
        }
    }

    // Execute command if present
    if (!action.command.empty()) {
        executeLSPCommand(action.command, action.commandArgs);
    }

    return true;
}

void Win32IDE::applyTextEdit(const LSPWorkspaceEdit::TextEdit& edit) {
    if (!m_hwndEditor) return;

    // Convert line/character to character position
    int startPos = 0;
    int endPos = 0;

    // Get line start positions
    int lineCount = SendMessage(m_hwndEditor, EM_GETLINECOUNT, 0, 0);
    
    // Calculate start position
    for (int i = 0; i < edit.range.start.line && i < lineCount; i++) {
        int lineLen = SendMessage(m_hwndEditor, EM_LINELENGTH, 
            SendMessage(m_hwndEditor, EM_LINEINDEX, i, 0), 0);
        startPos += lineLen;
    }
    startPos += edit.range.start.character;

    // Calculate end position
    for (int i = 0; i < edit.range.end.line && i < lineCount; i++) {
        int lineLen = SendMessage(m_hwndEditor, EM_LINELENGTH,
            SendMessage(m_hwndEditor, EM_LINEINDEX, i, 0), 0);
        endPos += lineLen;
    }
    endPos += edit.range.end.character;

    // Select range and replace
    CHARRANGE cr;
    cr.cpMin = startPos;
    cr.cpMax = endPos;
    SendMessage(m_hwndEditor, EM_EXSETSEL, 0, reinterpret_cast<LPARAM>(&cr));
    SendMessage(m_hwndEditor, EM_REPLACESEL, TRUE, reinterpret_cast<LPARAM>(edit.newText.c_str()));

    m_modified = true;
}

// ============================================================================
// FIX ALL DIAGNOSTICS
// ============================================================================

void Win32IDE::cmdFixAllDiagnostics() {
    if (m_currentFile.empty() || !m_hwndEditor) {
        appendToOutput("[CodeAction] No file open.", "General", OutputSeverity::Warning);
        return;
    }

    std::string uri = filePathToUri(m_currentFile);
    
    // Get all diagnostics for current file
    std::vector<LSPDiagnostic> fileDiags;
    {
        std::lock_guard<std::mutex> lock(m_lspDiagnosticsMutex);
        for (const auto& diag : m_lspDiagnostics) {
            if (diag.uri == uri) {
                fileDiags.push_back(diag);
            }
        }
    }

    if (fileDiags.empty()) {
        appendToOutput("[CodeAction] No diagnostics to fix.", "General", OutputSeverity::Info);
        return;
    }

    // Request code actions for all diagnostics
    auto actions = lspCodeActions(uri, 0, 0, fileDiags);

    // Filter for "fix all" actions
    std::vector<CodeAction> fixAllActions;
    for (const auto& action : actions) {
        if (action.kind.find("source.fixAll") != std::string::npos ||
            action.kind.find("quickfix.fixAll") != std::string::npos) {
            fixAllActions.push_back(action);
        }
    }

    if (fixAllActions.empty()) {
        // Fall back to applying individual quick fixes
        for (const auto& action : actions) {
            if (action.kind.find("quickfix") != std::string::npos && action.isPreferred) {
                applyCodeAction(action);
            }
        }
    } else {
        // Apply fix all
        applyCodeAction(fixAllActions[0]);
    }

    appendToOutput("[CodeAction] Applied fix all.", "General", OutputSeverity::Info);
}

// ============================================================================
// ORGANIZE IMPORTS
// ============================================================================

void Win32IDE::cmdOrganizeImports() {
    if (m_currentFile.empty() || !m_hwndEditor) {
        appendToOutput("[CodeAction] No file open.", "General", OutputSeverity::Warning);
        return;
    }

    std::string uri = filePathToUri(m_currentFile);
    LSPLanguage lang = detectLanguageForFile(m_currentFile);
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        appendToOutput("[CodeAction] LSP server not running.", "General", OutputSeverity::Warning);
        return;
    }

    // Request organize imports action
    json params;
    params["textDocument"]["uri"] = uri;
    params["range"]["start"]["line"] = 0;
    params["range"]["start"]["character"] = 0;
    params["range"]["end"]["line"] = 999999;
    params["range"]["end"]["character"] = 999999;
    params["context"]["only"] = json::array({"source.organizeImports"});

    int id = sendLSPRequest(lang, "textDocument/codeAction", params);
    if (id < 0) {
        appendToOutput("[CodeAction] Failed to request organize imports.", "General", OutputSeverity::Error);
        return;
    }

    json resp = readLSPResponse(lang, id, 5000);

    if (resp.contains("result") && resp["result"].is_array() && !resp["result"].empty()) {
        const auto& action = resp["result"][0];
        CodeAction ca;
        ca.title = action.value("title", "Organize Imports");
        ca.kind = action.value("kind", "");

        if (action.contains("edit")) {
            const auto& edit = action["edit"];
            if (edit.contains("changes")) {
                for (auto it = edit["changes"].begin(); it != edit["changes"].end(); ++it) {
                    ca.editUri = it.key();
                    for (const auto& textEdit : it.value()) {
                        LSPWorkspaceEdit::TextEdit te;
                        te.newText = textEdit.value("newText", "");
                        if (textEdit.contains("range")) {
                            const auto& r = textEdit["range"];
                            te.range.start.line = r["start"].value("line", 0);
                            te.range.start.character = r["start"].value("character", 0);
                            te.range.end.line = r["end"].value("line", 0);
                            te.range.end.character = r["end"].value("character", 0);
                        }
                        ca.edits.push_back(te);
                    }
                }
            }
        }

        if (applyCodeAction(ca)) {
            appendToOutput("[CodeAction] Organized imports.", "General", OutputSeverity::Info);
        }
    } else {
        appendToOutput("[CodeAction] No organize imports action available.", "General", OutputSeverity::Warning);
    }
}

// ============================================================================
// SHOW CODE ACTIONS (CONTEXT MENU)
// ============================================================================

void Win32IDE::showCodeActions(int line, int character) {
    if (m_currentFile.empty()) return;

    std::string uri = filePathToUri(m_currentFile);

    // Get diagnostics for this line
    std::vector<LSPDiagnostic> lineDiags;
    {
        std::lock_guard<std::mutex> lock(m_lspDiagnosticsMutex);
        for (const auto& diag : m_lspDiagnostics) {
            if (diag.uri == uri && diag.range.start.line == line) {
                lineDiags.push_back(diag);
            }
        }
    }

    // Request code actions
    auto actions = lspCodeActions(uri, line, character, lineDiags);

    if (actions.empty()) {
        appendToOutput("[CodeAction] No actions available at this location.", "General", OutputSeverity::Info);
        return;
    }

    // Build context menu
    HMENU hMenu = CreatePopupMenu();
    int menuId = 1000;

    for (const auto& action : actions) {
        std::string label = action.title;
        if (action.isPreferred) {
            label = "★ " + label;
        }

        AppendMenuA(hMenu, MF_STRING, menuId++, label.c_str());

        // Add separator between different kinds
        if (menuId > 1001 && !actions.empty()) {
            const auto& prev = actions[(menuId - 2) - 1000];
            if (prev.kind != action.kind) {
                AppendMenuA(hMenu, MF_SEPARATOR, 0, nullptr);
            }
        }
    }

    // Show menu at cursor position
    POINT pt;
    GetCursorPos(&pt);

    int result = TrackPopupMenu(hMenu, TPM_LEFTALIGN | TPM_RIGHTBUTTON | TPM_RETURNCMD,
        pt.x, pt.y, 0, m_hwndMain, nullptr);

    if (result >= 1000) {
        int actionIndex = result - 1000;
        if (actionIndex >= 0 && actionIndex < (int)actions.size()) {
            applyCodeAction(actions[actionIndex]);
        }
    }

    DestroyMenu(hMenu);
}

// ============================================================================
// EXECUTE LSP COMMAND
// ============================================================================

void Win32IDE::executeLSPCommand(const std::string& command, const json& arguments) {
    if (m_currentFile.empty()) return;

    LSPLanguage lang = detectLanguageForFile(m_currentFile);
    if (lang >= LSPLanguage::Count || m_lspStatuses[(size_t)lang].state != LSPServerState::Running) {
        return;
    }

    json params;
    params["command"] = command;
    if (!arguments.is_null()) {
        params["arguments"] = arguments;
    }

    sendLSPRequest(lang, "workspace/executeCommand", params);
    // Note: executeCommand typically doesn't return a result
}