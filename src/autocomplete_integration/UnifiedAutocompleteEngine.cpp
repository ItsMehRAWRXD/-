#include "UnifiedAutocompleteEngine.h"
#include "../semantic_index/SemanticCodeIndex.h"
#include "../ast_parser/ASTContextProvider.h"

#include <chrono>
#include <algorithm>
#include <unordered_set>

namespace rawrxd {

// PIMPL implementation
struct UnifiedAutocompleteEngine::Impl {
    UnifiedAutocompleteConfig config;
    
    // Tier backends
    std::unique_ptr<SemanticCodeIndex> semantic_index;
    std::unique_ptr<ASTContextProvider> ast_provider;
    
    // Statistics
    Stats stats;
    float last_latency_ms = 0.0f;
    
    // Trie index (simplified - would connect to existing SymbolIndex)
    std::unordered_map<std::string, std::vector<std::string>> trie_index;
    
    explicit Impl(const UnifiedAutocompleteConfig& cfg) : config(cfg) {}
    
    void initialize_backends() {
        if (config.enable_semantic) {
            SemanticIndexConfig sem_cfg;
            semantic_index = std::make_unique<SemanticCodeIndex>(sem_cfg);
            semantic_index->initialize();
        }
        
        if (config.enable_ast) {
            ASTParserConfig ast_cfg;
            ast_provider = std::make_unique<ASTContextProvider>(ast_cfg);
        }
    }
    
    // Simple trie lookup (stub - would use actual SymbolIndex)
    std::vector<UnifiedCompletion> query_trie(const std::string& prefix) {
        std::vector<UnifiedCompletion> results;
        
        for (const auto& [key, values] : trie_index) {
            if (key.find(prefix) == 0 || prefix.empty()) {
                for (const auto& val : values) {
                    UnifiedCompletion comp;
                    comp.text = val;
                    comp.label = val;
                    comp.detail = "Trie match";
                    comp.score = 1.0f - (static_cast<float>(key.length() - prefix.length()) / 100.0f);
                    comp.source = QueryType::FAST_PREFIX;
                    results.push_back(comp);
                    
                    if (results.size() >= static_cast<size_t>(config.max_completions)) break;
                }
            }
            if (results.size() >= static_cast<size_t>(config.max_completions)) break;
        }
        
        return results;
    }
};

// Constructor
UnifiedAutocompleteEngine::UnifiedAutocompleteEngine(const UnifiedAutocompleteConfig& config)
    : m_impl(std::make_unique<Impl>(config))
    , m_config(config) {
}

// Destructor
UnifiedAutocompleteEngine::~UnifiedAutocompleteEngine() = default;

// Move constructor
UnifiedAutocompleteEngine::UnifiedAutocompleteEngine(UnifiedAutocompleteEngine&& other) noexcept
    : m_impl(std::move(other.m_impl))
    , m_config(other.m_config) {
}

// Move assignment
UnifiedAutocompleteEngine& UnifiedAutocompleteEngine::operator=(UnifiedAutocompleteEngine&& other) noexcept {
    if (this != &other) {
        m_impl = std::move(other.m_impl);
        m_config = other.m_config;
    }
    return *this;
}

bool UnifiedAutocompleteEngine::initialize() {
    if (!m_impl) return false;
    
    m_impl->initialize_backends();
    
    // Seed trie with common keywords (stub)
    m_impl->trie_index["int"] = {"int", "int16_t", "int32_t", "int64_t", "intptr_t"};
    m_impl->trie_index["void"] = {"void", "volatile"};
    m_impl->trie_index["class"] = {"class", "classifier"};
    m_impl->trie_index["std::"] = {"std::vector", "std::string", "std::map", "std::unique_ptr"};
    m_impl->trie_index["async"] = {"async", "async_read", "async_write", "async_operation"};
    
    return true;
}

QueryType UnifiedAutocompleteEngine::classify_query(const CursorContext& cursor) const {
    // Fast prefix: simple word completion
    if (cursor.current_word.length() >= 2 && 
        !cursor.is_after_dot && !cursor.is_after_arrow &&
        !cursor.is_type_context) {
        return QueryType::FAST_PREFIX;
    }
    
    // Context-aware: member access or type context
    if (cursor.is_after_dot || cursor.is_after_arrow || cursor.is_type_context) {
        return QueryType::CONTEXT_AWARE;
    }
    
    // Default to semantic for natural language-like queries
    return QueryType::SEMANTIC;
}

std::vector<UnifiedCompletion> UnifiedAutocompleteEngine::get_completions(const CursorContext& cursor) {
    std::vector<UnifiedCompletion> results;
    
    if (!m_impl) return results;
    
    auto start = std::chrono::steady_clock::now();
    QueryType query_type = classify_query(cursor);
    
    // Query appropriate backends based on classification
    auto trie_results = get_trie_completions(cursor);
    auto semantic_results = get_semantic_completions(cursor);
    auto ast_results = get_ast_completions(cursor);
    
    // Merge and deduplicate
    results = merge_results(std::move(trie_results), 
                           std::move(semantic_results), 
                           std::move(ast_results));
    
    // Update statistics
    auto elapsed = std::chrono::steady_clock::now() - start;
    m_impl->last_latency_ms = std::chrono::duration_cast<std::chrono::microseconds>(elapsed).count() / 1000.0f;
    
    m_impl->stats.total_queries++;
    m_impl->stats.avg_latency_ms = (m_impl->stats.avg_latency_ms * (m_impl->stats.total_queries - 1) + 
                                       m_impl->last_latency_ms) / m_impl->stats.total_queries;
    
    // Update hit counters
    for (const auto& r : results) {
        switch (r.source) {
            case QueryType::FAST_PREFIX: m_impl->stats.trie_hits++; break;
            case QueryType::SEMANTIC: m_impl->stats.semantic_hits++; break;
            case QueryType::CONTEXT_AWARE: m_impl->stats.ast_hits++; break;
        }
    }
    
    return results;
}

std::vector<UnifiedCompletion> UnifiedAutocompleteEngine::get_trie_completions(const CursorContext& cursor) {
    if (!m_config.enable_trie || !m_impl) return {};
    
    return m_impl->query_trie(cursor.current_word);
}

std::vector<UnifiedCompletion> UnifiedAutocompleteEngine::get_semantic_completions(const CursorContext& cursor) {
    std::vector<UnifiedCompletion> results;
    
    if (!m_config.enable_semantic || !m_impl || !m_impl->semantic_index) {
        return results;
    }
    
    // Build natural language query from context
    std::string query = cursor.current_word;
    if (cursor.is_after_dot || cursor.is_after_arrow) {
        query += " member function";
    }
    if (cursor.is_type_context) {
        query += " type";
    }
    
    auto snippets = m_impl->semantic_index->semantic_search(
        query, 
        m_config.max_completions / 2,
        m_config.semantic_min_score
    );
    
    for (const auto& snippet : snippets) {
        UnifiedCompletion comp;
        comp.text = snippet.code;
        comp.label = snippet.code.substr(0, 50);
        comp.detail = snippet.file_path + ":" + std::to_string(snippet.line_number);
        comp.score = snippet.similarity_score;
        comp.source = QueryType::SEMANTIC;
        comp.file_path = snippet.file_path;
        comp.line_number = snippet.line_number;
        results.push_back(comp);
    }
    
    return results;
}

std::vector<UnifiedCompletion> UnifiedAutocompleteEngine::get_ast_completions(const CursorContext& cursor) {
    std::vector<UnifiedCompletion> results;
    
    if (!m_config.enable_ast || !m_impl || !m_impl->ast_provider) {
        return results;
    }
    
    // Parse file if not already cached
    if (!m_impl->ast_provider->has_file(cursor.file_path)) {
        // In real implementation, would get content from IDE
        // For now, skip if not cached
        return results;
    }
    
    CursorPosition pos{cursor.line, cursor.column, cursor.file_path};
    auto symbols = m_impl->ast_provider->get_symbols_at_cursor(pos);
    
    for (const auto& sym : symbols) {
        UnifiedCompletion comp;
        comp.text = sym.name;
        comp.label = sym.name + " (" + sym.type + ")";
        comp.detail = sym.scope;
        comp.score = 0.9f;  // High score for AST matches
        comp.source = QueryType::CONTEXT_AWARE;
        comp.file_path = cursor.file_path;
        comp.line_number = sym.line_number;
        results.push_back(comp);
    }
    
    return results;
}

std::vector<UnifiedCompletion> UnifiedAutocompleteEngine::merge_results(
    std::vector<UnifiedCompletion>&& trie_results,
    std::vector<UnifiedCompletion>&& semantic_results,
    std::vector<UnifiedCompletion>&& ast_results) {
    
    std::vector<UnifiedCompletion> merged;
    std::unordered_set<std::string> seen;
    
    // Priority: AST > Trie > Semantic (for deduplication)
    auto add_unique = [&](std::vector<UnifiedCompletion>& src, float score_boost) {
        for (auto& comp : src) {
            if (seen.find(comp.text) == seen.end()) {
                comp.score += score_boost;
                merged.push_back(comp);
                seen.insert(comp.text);
            }
        }
    };
    
    add_unique(ast_results, 0.2f);      // Boost AST results
    add_unique(trie_results, 0.1f);   // Slight boost for trie
    add_unique(semantic_results, 0.0f); // No boost
    
    // Sort by score descending
    std::sort(merged.begin(), merged.end(), 
              [](const UnifiedCompletion& a, const UnifiedCompletion& b) {
                  return a.score > b.score;
              });
    
    // Limit results
    if (merged.size() > static_cast<size_t>(m_config.max_completions)) {
        merged.resize(m_config.max_completions);
    }
    
    return merged;
}

void UnifiedAutocompleteEngine::index_code_snippet(const std::string& code, 
                                                     const std::string& metadata) {
    if (m_impl && m_impl->semantic_index) {
        m_impl->semantic_index->add_snippet(code, metadata);
    }
}

void UnifiedAutocompleteEngine::parse_file_for_ast(const std::string& file_path, 
                                                    const std::string& content) {
    if (m_impl && m_impl->ast_provider) {
        m_impl->ast_provider->parse_file(file_path, content);
    }
}

bool UnifiedAutocompleteEngine::is_ready() const {
    return m_impl != nullptr;
}

float UnifiedAutocompleteEngine::get_last_latency_ms() const {
    return m_impl ? m_impl->last_latency_ms : 0.0f;
}

UnifiedAutocompleteEngine::Stats UnifiedAutocompleteEngine::get_stats() const {
    return m_impl ? m_impl->stats : Stats{};
}

} // namespace rawrxd