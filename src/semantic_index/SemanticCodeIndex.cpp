#include "SemanticCodeIndex.h"

#include <chrono>
#include <algorithm>
#include <random>
#include <cmath>

// HNSW header-only library (fallback when FAISS not available)
#include "hnswlib/hnswlib.h"

namespace rawrxd {

// Simple embedding generator (stub - replace with ONNX Runtime in production)
class SimpleEmbedder {
public:
    explicit SimpleEmbedder(int dim) : dimension(dim), rng(42) {}
    
    std::vector<float> embed(const std::string& text) {
        // Stub: Generate deterministic pseudo-embeddings based on text hash
        // In production, this should call ONNX Runtime with CodeBERT model
        std::vector<float> vec(dimension);
        
        // Simple hash-based embedding for testing
        size_t hash = std::hash<std::string>{}(text);
        std::uniform_real_distribution<float> dist(-1.0f, 1.0f);
        
        for (int i = 0; i < dimension; ++i) {
            hash = hash * 31 + i;
            rng.seed(static_cast<unsigned>(hash));
            vec[i] = dist(rng);
        }
        
        // Normalize
        float norm = 0.0f;
        for (float v : vec) norm += v * v;
        norm = std::sqrt(norm);
        if (norm > 0) {
            for (float& v : vec) v /= norm;
        }
        
        return vec;
    }
    
private:
    int dimension;
    std::mt19937 rng;
};

// PIMPL implementation structure
class SemanticCodeIndex::Impl {
public:
    explicit Impl(const SemanticIndexConfig& cfg) 
        : config(cfg), embedder(cfg.vector_dimension), next_id(1), initialized(false) {
        
        // Initialize HNSW index (L2 space)
        space = std::make_unique<hnswlib::L2Space>(config.vector_dimension);
        index = std::make_unique<hnswlib::HierarchicalNSW<float>>(
            space.get(),
            10000,      // max_elements
            16,         // M: number of bi-directional links
            200         // ef_construction
        );
    }
    
    SemanticIndexConfig config;
    SimpleEmbedder embedder;
    std::unique_ptr<hnswlib::L2Space> space;
    std::unique_ptr<hnswlib::HierarchicalNSW<float>> index;
    std::unordered_map<int64_t, ScoredSnippet> snippets;
    std::unordered_map<int64_t, std::vector<float>> embeddings;
    int64_t next_id;
    bool initialized;
};

// Constructor
SemanticCodeIndex::SemanticCodeIndex(const SemanticIndexConfig& config)
    : m_impl(std::make_unique<Impl>(config))
    , m_config(config)
    , m_initialized(false) {
}

// Destructor
SemanticCodeIndex::~SemanticCodeIndex() = default;

// Move constructor
SemanticCodeIndex::SemanticCodeIndex(SemanticCodeIndex&& other) noexcept
    : m_impl(std::move(other.m_impl))
    , m_config(other.m_config)
    , m_initialized(other.m_initialized) {
    other.m_initialized = false;
}

// Move assignment
SemanticCodeIndex& SemanticCodeIndex::operator=(SemanticCodeIndex&& other) noexcept {
    if (this != &other) {
        m_impl = std::move(other.m_impl);
        m_config = other.m_config;
        m_initialized = other.m_initialized;
        other.m_initialized = false;
    }
    return *this;
}

bool SemanticCodeIndex::initialize() {
    if (m_impl) {
        m_impl->initialized = true;
        m_initialized = true;
    }
    return m_initialized;
}

bool SemanticCodeIndex::is_initialized() const {
    return m_initialized;
}

int64_t SemanticCodeIndex::add_snippet(const std::string& snippet, 
                                        const std::string& metadata) {
    if (!m_initialized || !m_impl) {
        return -1;
    }
    
    // Generate embedding vector
    auto embedding = m_impl->embedder.embed(snippet);
    
    int64_t id = m_impl->next_id++;
    
    // Add to HNSW index
    m_impl->index->addPoint(embedding.data(), id);
    
    // Store snippet metadata
    ScoredSnippet ss;
    ss.code = snippet;
    ss.file_path = metadata;
    ss.line_number = 0;
    ss.similarity_score = 0.0f;
    
    m_impl->snippets[id] = std::move(ss);
    m_impl->embeddings[id] = std::move(embedding);
    
    return id;
}

std::vector<ScoredSnippet> SemanticCodeIndex::semantic_search(
    const std::string& intent_query,
    int top_k,
    float min_score) {
    
    std::vector<ScoredSnippet> results;
    
    if (!m_initialized || !m_impl) {
        return results;
    }
    
    float threshold = (min_score >= 0.0f) ? min_score : m_config.min_score_threshold;
    
    // Generate query embedding
    auto query_embedding = m_impl->embedder.embed(intent_query);
    
    // Search HNSW index - returns priority_queue of pairs (distance, label)
    auto search_results = m_impl->index->searchKnn(query_embedding.data(), top_k);
    
    // Convert to ScoredSnippet results
    while (!search_results.empty()) {
        auto result = search_results.top();
        search_results.pop();
        
        float distance = result.first;
        int64_t id = result.second;
        
        // Convert L2 distance to similarity score (0-1 range)
        // Using exponential decay: similarity = exp(-distance^2 / 2)
        float similarity = std::exp(-distance * distance / 2.0f);
        
        if (similarity >= threshold) {
            auto it = m_impl->snippets.find(id);
            if (it != m_impl->snippets.end()) {
                ScoredSnippet scored = it->second;
                scored.similarity_score = similarity;
                results.push_back(scored);
            }
        }
    }
    
    // Results are already sorted by distance (smallest first = highest similarity)
    // But we want highest similarity first, so reverse
    std::reverse(results.begin(), results.end());
    
    return results;
}

std::vector<ScoredSnippet> SemanticCodeIndex::search_with_budget(
    const std::string& query,
    int budget_ms,
    int top_k) {
    
    auto start = std::chrono::steady_clock::now();
    
    // Start with low nprobe for speed
    int original_nprobe = m_config.nprobe;
    m_config.nprobe = 4;
    
    auto results = semantic_search(query, top_k);
    
    auto elapsed = std::chrono::steady_clock::now() - start;
    auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();
    
    // If time permits and no results, increase nprobe
    if (elapsed_ms < budget_ms / 2 && results.empty()) {
        m_config.nprobe = 16;
        results = semantic_search(query, top_k);
    }
    
    m_config.nprobe = original_nprobe;
    return results;
}

bool SemanticCodeIndex::remove_snippet(int64_t snippet_id) {
    if (!m_impl) return false;
    
    // TODO: Phase 17 - Remove from FAISS/HNSW index
    
    auto it = m_impl->snippets.find(snippet_id);
    if (it != m_impl->snippets.end()) {
        m_impl->snippets.erase(it);
        return true;
    }
    return false;
}

size_t SemanticCodeIndex::memory_usage() const {
    if (!m_impl) return 0;
    
    size_t usage = sizeof(*this);
    usage += m_impl->snippets.size() * sizeof(ScoredSnippet);
    // TODO: Phase 17 - Add FAISS/HNSW index memory
    return usage;
}

size_t SemanticCodeIndex::snippet_count() const {
    if (!m_impl) return 0;
    return m_impl->snippets.size();
}

bool SemanticCodeIndex::save(const std::string& path) {
    if (!m_initialized || !m_impl) return false;
    
    // TODO: Phase 17 - Serialize FAISS index to disk
    // TODO: Serialize snippet metadata
    
    (void)path;
    return true;
}

bool SemanticCodeIndex::load(const std::string& path) {
    if (!m_impl) return false;
    
    // TODO: Phase 17 - Load FAISS index from disk
    // TODO: Load snippet metadata
    
    (void)path;
    return true;
}

} // namespace rawrxd
