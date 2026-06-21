// Win32IDE_Stubs_Minimal.cpp — Minimal stub implementations for truly missing symbols

#include "Win32IDE.h"
#include "resource.h"
#include "rawrxd_ide_features.h"
#include <windows.h>
#include <atomic>
#include <string>
#include <cstdint>
#include <unordered_set>

// ============================================================================
// main_win32.cpp stubs
// ============================================================================

extern "C" {
    void* Sovereign_VEH_Handler(void* ExceptionPointers) {
        return nullptr;
    }
}

// ============================================================================
// Agent bridge stubs
// ============================================================================

extern "C" {
    void AgentBridge_SetShuttingDown(bool value) {}
    void AgentBridge_SetInitComplete(bool value) {}
    void AgentBridge_BindMainWindow(void* hwnd) {}
    void PromptWarm_SetAcceptRequests(bool value) {}
}

// ============================================================================
// Global atomic variable
// ============================================================================

std::atomic<bool> s_isThinking{false};

// ============================================================================
// DynamicModelLoader
// ============================================================================

#include "dynamic_model_loader.h"

namespace RawrXD {
    DynamicModelLoader& DynamicModelLoader::instance() {
        static DynamicModelLoader inst;
        return inst;
    }
    LoadResult DynamicModelLoader::loadTinyModel() {
        return LoadResult{false, "Stub: No tiny model", "none", 0.0f, 0, 0};
    }
    bool DynamicModelLoader::enableMedusa(const std::string&) { return false; }
    bool DynamicModelLoader::enableSpeculativeDecoding(int) { return false; }
}

// ============================================================================
// SymbolIndex - Trie-based autocomplete backend stubs
// ============================================================================

namespace RawrXD {
    
    struct SymbolIndex::Impl {
        std::vector<Symbol> symbols;
    };
    
    SymbolIndex::SymbolIndex() : impl_(std::make_unique<Impl>()) {}
    SymbolIndex::~SymbolIndex() = default;
    
    void SymbolIndex::addSymbol(const Symbol& symbol) {
        if (impl_) impl_->symbols.push_back(symbol);
    }
    
    void SymbolIndex::removeSymbol(const std::string& usr) {
        if (!impl_) return;
        impl_->symbols.erase(
            std::remove_if(impl_->symbols.begin(), impl_->symbols.end(),
                [&usr](const Symbol& s) { return s.usr == usr; }),
            impl_->symbols.end());
    }
    
    void SymbolIndex::clearFile(const std::string& uri) {
        if (!impl_) return;
        impl_->symbols.erase(
            std::remove_if(impl_->symbols.begin(), impl_->symbols.end(),
                [&uri](const Symbol& s) { return s.uri == uri; }),
            impl_->symbols.end());
    }
    
    void SymbolIndex::buildIndex(const std::string& uri, const std::string& text) {}
    
    std::vector<Symbol> SymbolIndex::findByName(const std::string& name) const {
        std::vector<Symbol> results;
        if (!impl_) return results;
        for (const auto& s : impl_->symbols) {
            if (s.name == name) results.push_back(s);
        }
        return results;
    }
    
    std::optional<Symbol> SymbolIndex::findByUsr(const std::string& usr) const {
        if (!impl_) return std::nullopt;
        for (const auto& s : impl_->symbols) {
            if (s.usr == usr) return s;
        }
        return std::nullopt;
    }
    
    std::vector<Symbol> SymbolIndex::findByUri(const std::string& uri) const {
        std::vector<Symbol> results;
        if (!impl_) return results;
        for (const auto& s : impl_->symbols) {
            if (s.uri == uri) results.push_back(s);
        }
        return results;
    }
    
    std::optional<Symbol> SymbolIndex::findAtPosition(const std::string& uri, const Position& pos) const {
        if (!impl_) return std::nullopt;
        for (const auto& s : impl_->symbols) {
            if (s.uri == uri && s.range.start.line <= pos.line && s.range.end.line >= pos.line) {
                return s;
            }
        }
        return std::nullopt;
    }
    
    std::vector<Symbol> SymbolIndex::findReferences(const std::string& usr) const {
        return {};
    }
    
    std::vector<Symbol> SymbolIndex::findInScope(const std::string& containerName) const {
        std::vector<Symbol> results;
        if (!impl_) return results;
        for (const auto& s : impl_->symbols) {
            if (s.containerName == containerName) results.push_back(s);
        }
        return results;
    }
    
    std::vector<Symbol> SymbolIndex::fuzzyFind(const std::string& query, uint32_t maxResults) const {
        std::vector<Symbol> results;
        if (!impl_) return results;
        for (const auto& s : impl_->symbols) {
            if (s.name.find(query) == 0) {
                results.push_back(s);
                if (results.size() >= maxResults) break;
            }
        }
        return results;
    }
    
    size_t SymbolIndex::symbolCount() const {
        return impl_ ? impl_->symbols.size() : 0;
    }
    
    size_t SymbolIndex::fileCount() const {
        if (!impl_) return 0;
        std::unordered_set<std::string> files;
        for (const auto& s : impl_->symbols) {
            files.insert(s.uri);
        }
        return files.size();
    }
}

// ============================================================================
// IsStubFunction
// ============================================================================

extern "C" int IsStubFunction(void* funcPtr, size_t maxBytesToScan) {
    return 0;
}

// ============================================================================
// RawrXD Agentic Orchestrator stubs
// ============================================================================

extern "C" {
    int RawrXD_InferenceEngine_Init(void* engine) { return 0; }
    int RawrXD_InferenceEngine_Run(void* engine, const char* input, char* output, size_t outputSize) { return 0; }
    int RawrXD_AgenticToolExecutor_Init(void* executor) { return 0; }
    int RawrXD_AgenticToolExecutor_Execute(void* executor, const char* tool, const char* args, char* result, size_t resultSize) { return 0; }
    void* RawrXD_AgenticMemorySystem_Alloc(size_t size) { return nullptr; }
    int RawrXD_AgenticMemorySystem_Write(void* ptr, const void* data, size_t size) { return 0; }
    int RawrXD_AgenticMemorySystem_Free(void* ptr) { return 0; }
    int RawrXD_AgenticDeepThinking_Init(void* engine) { return 0; }
}
