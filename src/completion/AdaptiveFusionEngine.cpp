#include "AdaptiveFusionEngine.h"

#include <filesystem>
#include <fstream>
#include <json/json.h>
#include <algorithm>
#include <math>

namespace RawrXD {

// =============================================================================
// Singleton Implementation
// =============================================================================

AdaptiveFusionEngine& AdaptiveFusionEngine::instance() {
    static AdaptiveFusionEngine instance;
    return instance;
}

AdaptiveFusionEngine::AdaptiveFusionEngine() {
    // Set default cache path
    m_cache_path = get_default_cache_path();
    
    // Attempt to load persisted state
    if (!load_state()) {
        // Initialize with default values
        m_alpha.store(0.75f, std::memory_order_relaxed);
        m_learning_rate = 0.01f;
    }
}

// =============================================================================
// Core Learning Algorithm
// =============================================================================

void AdaptiveFusionEngine::update_weights(float reward) {
    // Clamp reward to valid range
    reward = std::clamp(reward, 0.0f, 1.0f);
    
    // SGD Update Rule: α_new = α_old + η · (Reward - α_old)
    float current_alpha = m_alpha.load(std::memory_order_relaxed);
    float delta = m_learning_rate * (reward - current_alpha);
    float new_alpha = current_alpha + delta;
    
    // Clamp alpha to valid range [0.0, 1.0]
    new_alpha = std::clamp(new_alpha, 0.0f, 1.0f);
    
    // Atomic update
    m_alpha.store(new_alpha, std::memory_order_relaxed);
    
    // Update statistics
    {
        std::lock_guard<std::mutex> lock(m_stats_mutex);
        m_update_count++;
        m_alpha_sum += new_alpha;
        m_alpha_squared_sum += new_alpha * new_alpha;
    }
    
    // Auto-save every 10 updates
    if (m_update_count % 10 == 0) {
        save_state();
    }
}

void AdaptiveFusionEngine::reset() {
    m_alpha.store(0.75f, std::memory_order_relaxed);
    m_learning_rate = 0.01f;
    
    {
        std::lock_guard<std::mutex> lock(m_stats_mutex);
        m_update_count = 0;
        m_alpha_sum = 0.0f;
        m_alpha_squared_sum = 0.0f;
    }
    
    save_state();
}

// =============================================================================
// Persistence
// =============================================================================

std::string AdaptiveFusionEngine::get_default_cache_path() {
    // Use rawrxd cache directory
    std::filesystem::path cache_dir = std::filesystem::path(getenv("USERPROFILE") ? getenv("USERPROFILE") : ".") 
                                      / ".rawrxd" / "cache";
    
    // Create directory if it doesn't exist
    std::filesystem::create_directories(cache_dir);
    
    return (cache_dir / "fusion_weights.json").string();
}

bool AdaptiveFusionEngine::load_state() {
    std::lock_guard<std::mutex> lock(m_io_mutex);
    
    std::ifstream file(m_cache_path);
    if (!file.is_open()) {
        return false;  // No saved state yet - use defaults
    }
    
    try {
        Json::Value root;
        file >> root;
        
        if (root.isMember("alpha")) {
            float loaded_alpha = root["alpha"].asFloat();
            m_alpha.store(std::clamp(loaded_alpha, 0.0f, 1.0f), std::memory_order_relaxed);
        }
        
        if (root.isMember("learning_rate")) {
            m_learning_rate = std::clamp(root["learning_rate"].asFloat(), 0.001f, 0.1f);
        }
        
        if (root.isMember("update_count")) {
            m_update_count = root["update_count"].asUInt64();
        }
        
        if (root.isMember("alpha_sum")) {
            m_alpha_sum = root["alpha_sum"].asFloat();
        }
        
        if (root.isMember("alpha_squared_sum")) {
            m_alpha_squared_sum = root["alpha_squared_sum"].asFloat();
        }
        
        return true;
    } catch (const std::exception& e) {
        // Corrupted state - reset to defaults
        m_alpha.store(0.75f, std::memory_order_relaxed);
        return false;
    }
}

bool AdaptiveFusionEngine::save_state() const {
    std::lock_guard<std::mutex> lock(m_io_mutex);
    
    // Ensure directory exists
    std::filesystem::path cache_file(m_cache_path);
    std::filesystem::create_directories(cache_file.parent_path());
    
    std::ofstream file(m_cache_path);
    if (!file.is_open()) {
        return false;
    }
    
    try {
        Json::Value root;
        root["alpha"] = m_alpha.load(std::memory_order_relaxed);
        root["learning_rate"] = m_learning_rate;
        root["update_count"] = static_cast<Json::UInt64>(m_update_count);
        root["alpha_sum"] = m_alpha_sum;
        root["alpha_squared_sum"] = m_alpha_squared_sum;
        root["version"] = "1.0";
        root["last_saved"] = static_cast<Json::UInt64>(
            std::chrono::system_clock::now().time_since_epoch().count()
        );
        
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "  ";
        std::unique_ptr<Json::StreamWriter> writer(builder.newStreamWriter());
        writer->write(root, &file);
        
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

// =============================================================================
// Statistics
// =============================================================================

AdaptiveFusionEngine::Stats AdaptiveFusionEngine::get_stats() const {
    std::lock_guard<std::mutex> lock(m_stats_mutex);
    
    Stats stats;
    stats.update_count = m_update_count;
    stats.current_alpha = m_alpha.load(std::memory_order_relaxed);
    
    if (m_update_count > 0) {
        float mean = m_alpha_sum / static_cast<float>(m_update_count);
        float mean_squared = m_alpha_squared_sum / static_cast<float>(m_update_count);
        float variance = mean_squared - (mean * mean);
        stats.alpha_variance = std::max(0.0f, variance);  // Ensure non-negative
        stats.is_converged = stats.alpha_variance < CONVERGENCE_THRESHOLD;
    }
    
    return stats;
}

// =============================================================================
// Scoped Alpha Override
// =============================================================================

ScopedAlphaOverride::ScopedAlphaOverride(float temp_alpha) {
    auto& engine = AdaptiveFusionEngine::instance();
    m_original_alpha = engine.get_alpha();
    
    // Only override if significantly different
    if (std::abs(temp_alpha - m_original_alpha) > 0.01f) {
        engine.m_alpha.store(std::clamp(temp_alpha, 0.0f, 1.0f), std::memory_order_relaxed);
        m_active = true;
    }
}

ScopedAlphaOverride::~ScopedAlphaOverride() {
    if (m_active) {
        AdaptiveFusionEngine::instance().m_alpha.store(
            m_original_alpha, std::memory_order_relaxed
        );
    }
}

} // namespace RawrXD
