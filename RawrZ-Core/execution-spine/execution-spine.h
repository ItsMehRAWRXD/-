/**
 * RawrXD Execution Spine
 * Core execution fabric - owns all resources, agents lease vertices
 * 
 * Architecture: Intent → Execution Capsule → Resource Lease → Event Fabric
 * NOT: Chat → Think → Tool → Wait → Poll
 */

#pragma once

#include <memory>
#include <vector>
#include <queue>
#include <unordered_map>
#include <functional>
#include <atomic>
#include <mutex>
#include <shared_mutex>
#include <condition_variable>
#include <thread>
#include <chrono>
#include <string>
#include <any>
#include <variant>

namespace RawrXD {

// ═════════════════════════════════════════════════════════════════════════════
// FORWARD DECLARATIONS
// ═════════════════════════════════════════════════════════════════════════════

class ExecutionSpine;
class ExecutionCapsule;
class ResourceLease;
class EventFabric;
class Scheduler;
class WorldModel;
class TokenBudgetManager;
class IntentGraph;
class CapabilityBus;
class FlightRecorder;

using CapsuleId = std::string;
using ResourceId = std::string;
using AgentId = std::string;
using IntentId = std::string;
using EventType = std::string;

// ═════════════════════════════════════════════════════════════════════════════
// INTENT GRAPH - Dependency graph, not queue
// ═════════════════════════════════════════════════════════════════════════════

enum class IntentStatus {
    PENDING,      // Waiting for dependencies
    READY,        // All dependencies satisfied
    LEASED,       // Resources acquired
    EXECUTING,   // Currently running
    COMPLETED,   // Success
    FAILED,      // Error occurred
    RETRYING     // Autonomous retry
};

struct IntentVertex {
    IntentId id;
    std::string operation;           // "parse", "compile", "test", "patch"
    std::vector<std::string> inputs;   // File paths, symbols
    std::vector<std::string> outputs;  // Generated artifacts
    std::vector<IntentId> dependencies;  // Must complete first
    std::vector<IntentId> dependents;    // Waiting on this
    IntentStatus status{IntentStatus::PENDING};
    std::chrono::steady_clock::time_point created;
    std::chrono::steady_clock::time_point started;
    std::chrono::steady_clock::time_point completed;
    AgentId assignedAgent;
    ResourceLease* lease{nullptr};
    std::any result;
    std::string error;
    int retryCount{0};
    static constexpr int MAX_RETRIES = 3;
};

class IntentGraph {
public:
    IntentGraph();
    ~IntentGraph();

    // Create vertex, returns id
    IntentId createVertex(const std::string& operation,
                         const std::vector<std::string>& inputs,
                         const std::vector<std::string>& outputs);
    
    // Add dependency edge
    void addDependency(IntentId from, IntentId to);
    
    // Get all ready vertices (dependencies satisfied)
    std::vector<IntentId> getReadyVertices();
    
    // Mark vertex status
    void markLeased(IntentId id, ResourceLease* lease);
    void markExecuting(IntentId id, AgentId agent);
    void markCompleted(IntentId id, std::any result);
    void markFailed(IntentId id, const std::string& error);
    void markRetrying(IntentId id);
    
    // Get vertex
    IntentVertex* getVertex(IntentId id);
    
    // Get dependency chain for visualization
    std::vector<std::vector<IntentId>> getDependencyChains();
    
    // Incremental update - only affected nodes
    std::vector<IntentId> getAffectedVertices(const std::string& changedFile);
    
    // Statistics
    struct Stats {
        size_t total{0};
        size_t pending{0};
        size_t ready{0};
        size_t executing{0};
        size_t completed{0};
        size_t failed{0};
    };
    Stats getStats() const;

private:
    mutable std::shared_mutex mutex_;
    std::unordered_map<IntentId, std::unique_ptr<IntentVertex>> vertices_;
    std::unordered_map<std::string, std::vector<IntentId>> fileToVertices_;
    std::atomic<uint64_t> nextId_{0};
    
    void updateDependents(IntentId completed);
    bool dependenciesSatisfied(const IntentVertex& vertex);
};

// ═════════════════════════════════════════════════════════════════════════════
// RESOURCE LEASE - Agents never own, only lease
// ═════════════════════════════════════════════════════════════════════════════

enum class ResourceType {
    TERMINAL,       // Terminal session
    COMPILER,       // Compiler instance
    DEBUGGER,       // Debugger attachment
    GPU,           // GPU compute
    DISK,          // Disk I/O bandwidth
    NETWORK,       // Network connection
    MEMORY,        // RAM allocation
    CPU            // CPU time
};

struct ResourceLease {
    ResourceId id;
    ResourceType type;
    AgentId agent;
    IntentId intent;
    std::chrono::steady_clock::time_point acquired;
    std::chrono::seconds duration;
    std::atomic<bool> active{true};
    std::function<void()> onExpire;
    
    // Resource-specific handles
    union {
        void* terminalHandle;
        void* compilerHandle;
        void* debuggerHandle;
        int gpuId;
        struct { size_t memoryBytes; void* ptr; } memory;
    } handle;
};

class ResourceScheduler {
public:
    ResourceScheduler();
    ~ResourceScheduler();

    // Request lease - blocks until available or timeout
    std::shared_ptr<ResourceLease> requestLease(
        ResourceType type,
        AgentId agent,
        IntentId intent,
        std::chrono::seconds timeout = std::chrono::seconds(30));
    
    // Release lease
    void releaseLease(ResourceId id);
    
    // Extend lease
    bool extendLease(ResourceId id, std::chrono::seconds additional);
    
    // Preempt lease (higher priority)
    bool preemptLease(ResourceId id, AgentId newAgent, IntentId newIntent);
    
    // Get available resources
    size_t getAvailable(ResourceType type) const;
    
    // Configure resource pools
    void configurePool(ResourceType type, size_t count);

private:
    mutable std::mutex mutex_;
    std::unordered_map<ResourceType, size_t> poolSizes_;
    std::unordered_map<ResourceType, std::queue<ResourceId>> available_;
    std::unordered_map<ResourceId, std::shared_ptr<ResourceLease>> activeLeases_;
    std::condition_variable cv_;
    std::thread cleanupThread_;
    std::atomic<bool> running_{true};
    
    void cleanupExpired();
    ResourceId generateId();
};

// ═════════════════════════════════════════════════════════════════════════════
// EVENT FABRIC - Pub/sub, zero-copy, no polling
// ═════════════════════════════════════════════════════════════════════════════

struct Event {
    EventType type;
    std::chrono::steady_clock::time_point timestamp;
    AgentId source;
    IntentId intent;
    std::any payload;
    uint64_t sequence;  // Global ordering
};

class EventFabric {
public:
    using EventHandler = std::function<void(const Event&)>;
    
    EventFabric(size_t ringBufferSize = 65536);
    ~EventFabric();

    // Publish event - lock-free where possible
    void publish(EventType type, AgentId source, IntentId intent, std::any payload);
    
    // Subscribe to event type
    void subscribe(EventType type, EventHandler handler);
    void unsubscribe(EventType type, void* handlerPtr);
    
    // Subscribe to all events (flight recorder)
    void subscribeAll(EventHandler handler);
    
    // Get events since sequence
    std::vector<Event> getSince(uint64_t sequence);
    
    // Wait for specific event
    bool waitFor(EventType type, std::chrono::milliseconds timeout);

private:
    struct RingBuffer {
        std::vector<Event> buffer;
        std::atomic<uint64_t> writeSeq{0};
        std::atomic<uint64_t> readSeq{0};
    };
    
    RingBuffer ringBuffer_;
    std::unordered_map<EventType, std::vector<EventHandler>> subscribers_;
    std::vector<EventHandler> allSubscribers_;
    mutable std::shared_mutex subscriberMutex_;
    std::thread dispatchThread_;
    std::atomic<bool> running_{true};
    
    void dispatchLoop();
};

// ═════════════════════════════════════════════════════════════════════════════
// WORLD MODEL - Persistent shared state, never rescanned
// ═════════════════════════════════════════════════════════════════════════════

struct FileState {
    std::string path;
    std::string content;
    std::string hash;
    std::chrono::system_clock::time_point modified;
    std::vector<std::string> symbols;
    std::any ast;
    bool indexed{false};
};

struct SymbolState {
    std::string name;
    std::string type;
    std::string file;
    size_t line;
    size_t column;
    std::vector<std::string> references;
};

struct BuildState {
    std::string target;
    std::string status;  // "pending", "building", "success", "failed"
    std::vector<std::string> dependencies;
    std::vector<std::string> outputs;
    std::string compilerOutput;
    int exitCode{-1};
};

class WorldModel {
public:
    WorldModel();
    ~WorldModel();

    // File operations
    void updateFile(const std::string& path, const std::string& content);
    void removeFile(const std::string& path);
    FileState* getFile(const std::string& path);
    std::vector<FileState*> getAllFiles();
    
    // Symbol operations
    void indexSymbol(const SymbolState& symbol);
    std::vector<SymbolState> findSymbol(const std::string& name);
    std::vector<SymbolState> getSymbolsInFile(const std::string& path);
    
    // Build state
    void updateBuildState(const BuildState& state);
    BuildState* getBuildState(const std::string& target);
    std::vector<BuildState*> getAllBuilds();
    
    // Incremental update
    std::vector<std::string> getAffectedFiles(const std::string& changedFile);
    
    // Snapshot for agents
    struct Snapshot {
        std::unordered_map<std::string, FileState> files;
        std::unordered_map<std::string, SymbolState> symbols;
        std::unordered_map<std::string, BuildState> builds;
        std::chrono::steady_clock::time_point captured;
    };
    Snapshot captureSnapshot();

private:
    mutable std::shared_mutex mutex_;
    std::unordered_map<std::string, FileState> files_;
    std::unordered_map<std::string, SymbolState> symbols_;
    std::unordered_map<std::string, BuildState> builds_;
    std::unordered_map<std::string, std::vector<std::string>> dependencyGraph_;
};

// ═════════════════════════════════════════════════════════════════════════════
// TOKEN BUDGET MANAGER - Dynamic resource allocation
// ═════════════════════════════════════════════════════════════════════════════

struct Budget {
    size_t contextTokens{0};
    size_t maxLatencyMs{0};
    size_t vramBytes{0};
    size_t powerWatts{0};
    size_t memoryBytes{0};
};

class TokenBudgetManager {
public:
    TokenBudgetManager();
    
    // Allocate budget to agent
    bool allocateBudget(AgentId agent, const Budget& budget);
    
    // Release budget
    void releaseBudget(AgentId agent);
    
    // Check if operation fits within budget
    bool canAfford(AgentId agent, const Budget& cost);
    
    // Get remaining budget
    Budget getRemaining(AgentId agent);
    
    // Reclaim from low-priority agents
    bool reclaimForPriority(AgentId highPriorityAgent, const Budget& needed);

private:
    mutable std::mutex mutex_;
    std::unordered_map<AgentId, Budget> allocations_;
    Budget totalAvailable_;
    Budget totalUsed_;
};

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION CAPSULE - Persistent execution container
// ═════════════════════════════════════════════════════════════════════════════

class ExecutionCapsule {
public:
    ExecutionCapsule(CapsuleId id, std::shared_ptr<ExecutionSpine> spine);
    ~ExecutionCapsule();

    // Capsule owns these resources
    struct Resources {
        std::shared_ptr<ResourceLease> terminal;
        std::shared_ptr<ResourceLease> compiler;
        std::shared_ptr<ResourceLease> debugger;
        std::shared_ptr<ResourceLease> memory;
        std::vector<std::shared_ptr<ResourceLease>> gpus;
    };

    // Execute intent within capsule
    std::any execute(IntentId intent);
    
    // Get resources
    Resources& getResources() { return resources_; }
    
    // Capsule state
    bool isActive() const { return active_.load(); }
    void deactivate() { active_.store(false); }
    
    // Event subscription
    void onEvent(EventType type, std::function<void(const Event&)> handler);

private:
    CapsuleId id_;
    std::weak_ptr<ExecutionSpine> spine_;
    Resources resources_;
    std::atomic<bool> active_{true};
    std::thread executionThread_;
    std::queue<IntentId> pendingIntents_;
    std::mutex queueMutex_;
    std::condition_variable cv_;
};

// ═════════════════════════════════════════════════════════════════════════════
// FLIGHT RECORDER - Complete audit trail
// ═════════════════════════════════════════════════════════════════════════════

struct FlightRecord {
    uint64_t sequence;
    std::chrono::steady_clock::time_point timestamp;
    std::string category;  // "intent", "tool", "event", "decision"
    std::string action;
    AgentId agent;
    IntentId intent;
    std::string details;
    std::any data;
};

class FlightRecorder {
public:
    FlightRecorder(size_t maxRecords = 100000);
    
    void record(const std::string& category,
                const std::string& action,
                AgentId agent,
                IntentId intent,
                const std::string& details);
    
    std::vector<FlightRecord> getRecent(size_t count);
    std::vector<FlightRecord> getForAgent(AgentId agent);
    std::vector<FlightRecord> getForIntent(IntentId intent);
    
    // Export for analysis
    void exportToJson(const std::string& path);

private:
    std::vector<FlightRecord> records_;
    mutable std::mutex mutex_;
    std::atomic<uint64_t> sequence_{0};
    size_t maxRecords_;
};

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION SPINE - Central orchestrator
// ═════════════════════════════════════════════════════════════════════════════

class ExecutionSpine : public std::enable_shared_from_this<ExecutionSpine> {
public:
    static std::shared_ptr<ExecutionSpine> create();
    ~ExecutionSpine();

    // Initialize spine
    bool initialize();
    void shutdown();

    // Create execution capsule for intent
    std::shared_ptr<ExecutionCapsule> createCapsule(IntentId intent);
    
    // Submit intent to spine
    IntentId submitIntent(const std::string& operation,
                         const std::vector<std::string>& inputs,
                         AgentId requestingAgent);
    
    // Get components
    IntentGraph* getIntentGraph() { return intentGraph_.get(); }
    ResourceScheduler* getScheduler() { return scheduler_.get(); }
    EventFabric* getEventFabric() { return eventFabric_.get(); }
    WorldModel* getWorldModel() { return worldModel_.get(); }
    TokenBudgetManager* getBudgetManager() { return budgetManager_.get(); }
    FlightRecorder* getFlightRecorder() { return flightRecorder_.get(); }

    // Spine status
    struct Status {
        bool running{false};
        size_t activeCapsules{0};
        size_t pendingIntents{0};
        size_t executingIntents{0};
        size_t completedIntents{0};
        size_t failedIntents{0};
    };
    Status getStatus() const;

private:
    ExecutionSpine();

    std::unique_ptr<IntentGraph> intentGraph_;
    std::unique_ptr<ResourceScheduler> scheduler_;
    std::unique_ptr<EventFabric> eventFabric_;
    std::unique_ptr<WorldModel> worldModel_;
    std::unique_ptr<TokenBudgetManager> budgetManager_;
    std::unique_ptr<FlightRecorder> flightRecorder_;
    
    std::unordered_map<CapsuleId, std::shared_ptr<ExecutionCapsule>> capsules_;
    mutable std::shared_mutex capsulesMutex_;
    
    std::thread orchestratorThread_;
    std::atomic<bool> running_{false};
    
    void orchestratorLoop();
    void processReadyIntents();
    void handleEvent(const Event& event);
};

} // namespace RawrXD
