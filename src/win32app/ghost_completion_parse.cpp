// ghost_completion_parse.cpp - Stub implementation for Win32IDE build
// Minimal parser for ghost text completion suggestions

#include <windows.h>
#include <string>
#include <vector>

struct GhostCompletion {
    std::wstring text;
    int startPos;
    int endPos;
    float confidence;
};

class GhostCompletionParser {
public:
    GhostCompletionParser() {}
    
    std::vector<GhostCompletion> Parse(const std::wstring& input) {
        std::vector<GhostCompletion> results;
        // Minimal stub - return empty results
        return results;
    }
    
    bool Initialize() {
        return true;
    }
    
    void Shutdown() {}
};

// C API for MASM interop
extern "C" {
    __declspec(dllexport) void* GhostParser_Create() {
        return new GhostCompletionParser();
    }
    
    __declspec(dllexport) void GhostParser_Destroy(void* parser) {
        delete static_cast<GhostCompletionParser*>(parser);
    }
    
    __declspec(dllexport) int GhostParser_Parse(void* parser, const wchar_t* input, wchar_t* output, int outputLen) {
        return 0; // No completions in stub
    }
}
