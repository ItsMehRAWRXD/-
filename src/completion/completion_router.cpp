#include "completion_router.h"

#include "../semantic_index/SemanticCodeIndex.h"
#include "../KeywordHashTable.h"

#include <algorithm>
#include <chrono>
#include <math>

namespace RawrXD {

// Anonymous namespace for internal helpers
namespace {
    
    // Normalize scores to 0-1 range using min-max scaling
    void normalize_scores(std::vector<CompletionSuggestion>& suggestions) {
        if (suggestions.empty()) return;
        
        float min_score = suggestions.back().relevance_score;
        float max_score = suggestions.front().relevance_score;
        
        if (max_score > min_score) {
            float range = max_score - min_score;
            for (auto& s : suggestions) {
                s.relevance_score = (s.relevance_score - min_score) / range;
            }
        } else {
            // All same score - set to 0.5
            for (auto& s : suggestions) {
                s.relevance_score = 0.5f;
            }
        }
    }
    
    // Deduplicate suggestions by text content
    void deduplicate(std::vector<CompletionSuggestion>& suggestions) {
        auto it = std::unique(suggestions.begin(), suggestions.end(),
            [](const CompletionSuggestion& a, const CompletionSuggestion& b) {
                return a.text == b.text;
            });
        suggestions.erase(it, suggestions.end());
    }
    
    // Calculate latency for statistics
    class LatencyTimer {
    public:
        LatencyTimer() : m_start(std::chrono::steady_clock::now()) {}
        
        double elapsed_ms() const {
            auto end = std::chrono::steady_clock::now();
            return std::chrono::duration<double, std::milli>(end - m_start).count();
        }
        
    private:
        std::chrono::steady_clock::time_point m_start;
    };
    
} // anonymous namespace

CompletionRouter::CompletionRouter() = default;
CompletionRouter::~CompletionRouter() = default;

bool CompletionRouter::initialize(
    std::shared_ptr<rawrxd::SemanticCodeIndex> semantic_index,
    std::unique_ptr<KeywordHashTable> trie) {
    
    if (!trie) {
        return false;  // Trie is required (fallback)
    }
    
    m_semantic_index = std::move(semantic_index);
    m_trie = std::move(trie);
    m_initialized = true;
    
    return true;
}

void CompletionRouter::set_weights(const FusionWeights& weights) {
    // Validate weights sum to approximately 1.0
    float total = weights.trie_weight + weights.semantic_weight + weights.lsp_weight;
    if (std::abs(total - 1.0f) > 0.01f) {
        // Normalize to sum to 1.0
        m_weights.trie_weight = weights.trie_weight / total;
        m_weights.semantic_weight = weights.semantic_weight / total;
        m_weights.lsp_weight = weights.lsp_weight / total;
    } else {
        m_weights = weights;
    }
}

std::vector<CompletionSuggestion> CompletionRouter::get_suggestions(
    const EditorContext& ctx,
    std::string_view query,
    int max_results) {
    
    if (!m_initialized) {
        return {};
    }
    
    LatencyTimer timer;
    m_stats.total_requests++;
    
    std::vector<CompletionSuggestion> results;
    
    switch (m_mode) {
        case Mode::TRIE_ONLY:
            results = query_trie(query, max_results);
            m_stats.trie_requests++;
            break;
            
        case Mode::SEMANTIC_ONLY:
            if (m_semantic_index) {
                results = query_semantic(ctx, query, max_results);
                m_stats.semantic_requests++;
            } else {
                // Fallback to trie if semantic unavailable
                results = query_trie(query, max_results);
                m_stats.trie_requests++;
            }
            break;
            
        case Mode::HYBRID_FUSION:
            if (m_semantic_index && should_use_semantic(query)) {
                auto trie_results = query_trie(query, max_results / 2);
                auto semantic_results = query_semantic(ctx, query, max_results / 2);
                results = fuse_results(trie_results, semantic_results, max_results);
                m_stats.hybrid_requests++;
            } else {
                results = query_trie(query, max_results);
                m_stats.trie_requests++;
            }
            break;
            
        case Mode::SMART_FALLBACK:
            // Auto-select based on query characteristics
            if (query.length() > 3 && m_semantic_index) {
                // Longer queries benefit from semantic search
                auto trie_results = query_trie(query, max_results / 2);
                auto semantic_results = query_semantic(ctx, query, max_results / 2);
                results = fuse_results(trie_results, semantic_results, max_results);
                m_stats.hybrid_requests++;
            } else {
                // Short queries: fast trie lookup
                results = query_trie(query, max_results);
                m_stats.trie_requests++;
            }
            break;
    }
    
    // Update latency statistics
    double latency = timer.elapsed_ms();
    m_stats.avg_latency_ms = (m_stats.avg_latency_ms * (m_stats.total_requests - 1) + latency) 
                               / m_stats.total_requests;
    m_latency_history.push_back(latency);
    
    // Keep only last 1000 samples for p95 calculation
    if (m_latency_history.size() > 1000) {
        m_latency_history.erase(m_latency_history.begin());
    }
    
    // Calculate p95
    if (!m_latency_history.empty()) {
        auto sorted = m_latency_history;
        std::sort(sorted.begin(), sorted.end());
        size_t p95_idx = static_cast<size_t>(sorted.size() * 0.95);
        m_stats.p95_latency_ms = sorted[p95_idx];
    }
    
    return results;
}

std::vector<CompletionSuggestion> CompletionRouter::get_suggestions_with_budget(
    const EditorContext& ctx,
    std::string_view query,
    int budget_ms,
    int max_results) {
    
    if (!m_initialized) {
        return {};
    }
    
    auto start = std::chrono::steady_clock::now();
    
    // Start with trie results (fastest)
    auto results = query_trie(query, max_results);
    
    auto elapsed = std::chrono::steady_clock::now() - start;
    auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();
    
    // If we have time budget remaining, try semantic search
    if (elapsed_ms < budget_ms / 2 && m_semantic_index && should_use_semantic(query)) {
        int remaining_budget = budget_ms - static_cast<int>(elapsed_ms);
        
        auto semantic_results = query_semantic(ctx, query, max_results / 2);
        
        auto semantic_elapsed = std::chrono::steady_clock::now() - start;
        auto semantic_elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            semantic_elapsed).count();
        
        if (semantic_elapsed_ms < budget_ms) {
            results = fuse_results(results, semantic_results, max_results);
        } else {
            m_stats.budget_exceeded_count++;
        }
    }
    
    return results;
}

std::vector<CompletionSuggestion> CompletionRouter::query_trie(
    std::string_view query,
    int max_results) {
    
    std::vector<CompletionSuggestion> results;
    
    if (!m_trie || query.empty()) {
        return results;
    }
    
    // Query the legacy Trie
    // Note: This assumes KeywordHashTable has a prefix search method
    // Adapt based on actual Trie API
    std::string query_str(query);
    auto trie_matches = m_trie->find_prefix_matches(query_str, max_results * 2);
    
    for (const auto& match : trie_matches) {
        CompletionSuggestion suggestion;
        suggestion.text = match.keyword;
        suggestion.display_text = match.keyword;
        suggestion.detail = match.type;  // e.g., "function", "variable"
        suggestion.relevance_score = match.score;
        suggestion.source = CompletionSuggestion::Source::TRIE_PREFIX;
        results.push_back(std::move(suggestion));
        
        if (results.size() >= static_cast<size_t>(max_results)) {
            break;
        }
    }
    
    return results;
}

std::vector<CompletionSuggestion> CompletionRouter::query_semantic(
    const EditorContext& ctx,
    std::string_view query,
    int max_results) {
    
    std::vector<CompletionSuggestion> results;
    
    if (!m_semantic_index || query.empty()) {
        return results;
    }
    
    // Build intent query from context + current input
    std::string intent_query;
    if (!ctx.surrounding_context.empty()) {
        intent_query = ctx.surrounding_context + " " + std::string(query);
    } else {
        intent_query = query;
    }
    
    // Query semantic index
    auto semantic_results = m_semantic_index->semantic_search(
        intent_query,
        max_results,
        0.5f  // Minimum similarity threshold
    );
    
    for (const auto& snippet : semantic_results) {
        CompletionSuggestion suggestion;
        suggestion.text = snippet.code;
        suggestion.display_text = snippet.code.substr(0, 50);  // Truncate for display
        suggestion.detail = snippet.file_path + ":" + std::to_string(snippet.line_number);
        suggestion.relevance_score = snippet.similarity_score;
        suggestion.semantic_similarity = snippet.similarity_score;
        suggestion.source = CompletionSuggestion::Source::SEMANTIC_INTENT;
        results.push_back(std::move(suggestion));
    }
    
    return results;
}

std::vector<CompletionSuggestion> CompletionRouter::fuse_results(
    const std::vector<CompletionSuggestion>& trie_results,
    const std::vector<CompletionSuggestion>& semantic_results,
    int max_results) {
    
    std::vector<CompletionSuggestion> fused;
    fused.reserve(trie_results.size() + semantic_results.size());
    
    // Normalize scores within each result set
    auto trie_normalized = trie_results;
    auto semantic_normalized = semantic_results;
    
    normalize_scores(trie_normalized);
    normalize_scores(semantic_normalized);
    
    // Apply fusion weights and combine
    for (auto& s : trie_normalized) {
        s.relevance_score *= m_weights.trie_weight;
        s.source = CompletionSuggestion::Source::HYBRID_FUSION;
        fused.push_back(s);
    }
    
    for (auto& s : semantic_normalized) {
        s.relevance_score *= m_weights.semantic_weight;
        s.source = CompletionSuggestion::Source::HYBRID_FUSION;
        fused.push_back(s);
    }
    
    // Sort by fused relevance score (descending)
    std::sort(fused.begin(), fused.end(),
        [](const CompletionSuggestion& a, const CompletionSuggestion& b) {
            return a.relevance_score > b.relevance_score;
        });
    
    // Deduplicate by text content
    deduplicate(fused);
    
    // Trim to max_results
    if (fused.size() > static_cast<size_t>(max_results)) {
        fused.resize(max_results);
    }
    
    return fused;
}

bool CompletionRouter::should_use_semantic(std::string_view query) const {
    // Heuristics for when semantic search is beneficial
    
    // 1. Query length - longer queries have more semantic content
    if (query.length() < 3) {
        return false;  // Too short for meaningful semantic search
    }
    
    // 2. Check for natural language patterns (spaces, descriptive words)
    bool has_natural_language = query.find(' ') != std::string_view::npos;
    
    // 3. Check for camelCase/snake_case (likely symbol names - use trie)
    bool looks_like_symbol = 
        (query.find('_') != std::string_view::npos) ||
        std::any_of(query.begin(), query.end(), [](char c) {
            return c >= 'A' && c <= 'Z';  // Has uppercase (camelCase)
        });
    
    // Use semantic if it looks like natural language OR if it's a longer query
    return has_natural_language || (query.length() >= 5 && !looks_like_symbol);
}

float CompletionRouter::calculate_fusion_score(
    float trie_score,
    float semantic_score,
    Source source) const {
    
    switch (source) {
        case Source::TRIE_PREFIX:
            return trie_score * m_weights.trie_weight;
        case Source::SEMANTIC_INTENT:
            return semantic_score * m_weights.semantic_weight;
        case Source::HYBRID_FUSION:
            // Already fused - return as-is
            return (trie_score + semantic_score) / 2.0f;
        default:
            return trie_score;
    }
}

} // namespace RawrXD
