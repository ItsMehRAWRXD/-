/**
 * RawrXD Native Message Bus
 * Zero-copy shared memory ring buffer for agent communication
 * NOT JSON. NOT HTTP. NOT sockets. Raw memory.
 */

#pragma once

#include <cstdint>
#include <cstddef>
#include <atomic>
#include <memory>
#include <string>

namespace RawrXD {

// ═════════════════════════════════════════════════════════════════════════════
// SHARED MEMORY RING BUFFER
// ═════════════════════════════════════════════════════════════════════════════

constexpr size_t MESSAGE_BUS_SIZE = 16 * 1024 * 1024;  // 16MB
constexpr size_t MAX_MESSAGE_SIZE = 64 * 1024;         // 64KB max message
constexpr uint32_t MESSAGE_MAGIC = 0x52425752;        // "RBWR" (Rawr Bus Writer)

struct MessageHeader {
    uint32_t magic{MESSAGE_MAGIC};
    uint32_t size{0};           // Payload size
    uint32_t type{0};           // Message type
    uint32_t sequence{0};       // Global sequence
    uint64_t timestamp{0};      // Nanoseconds since epoch
    char source[32]{0};         // Source agent/component
    char target[32]{0};         // Target agent/component (empty = broadcast)
};

struct RingBufferHeader {
    std::atomic<uint64_t> writeOffset{0};
    std::atomic<uint64_t> readOffset{0};
    std::atomic<uint32_t> messageCount{0};
    std::atomic<bool> initialized{false};
    char padding[4096 - sizeof(writeOffset) - sizeof(readOffset) - 
                 sizeof(messageCount) - sizeof(initialized)]{};
};

class NativeMessageBus {
public:
    NativeMessageBus(const std::string& name);
    ~NativeMessageBus();

    // Initialize shared memory
    bool initialize(bool create = true);
    void shutdown();

    // Write message - zero copy where possible
    bool write(uint32_t type, 
               const void* data, 
               size_t size,
               const std::string& source,
               const std::string& target = "");

    // Read message - returns pointer to shared memory (don't hold long!)
    const MessageHeader* read(uint64_t& sequence);
    
    // Acknowledge read (advance read pointer)
    void acknowledge();

    // Get current sequence number
    uint64_t getSequence() const;

    // Wait for new messages
    bool wait(std::chrono::milliseconds timeout);

    // Statistics
    struct Stats {
        uint64_t messagesWritten{0};
        uint64_t messagesRead{0};
        uint64_t bytesWritten{0};
        uint64_t bytesRead{0};
        uint32_t droppedMessages{0};
        double avgLatencyUs{0.0};
    };
    Stats getStats() const;

private:
    std::string name_;
    void* mappedMemory_{nullptr};
    RingBufferHeader* header_{nullptr};
    uint8_t* dataRegion_{nullptr};
    size_t dataRegionSize_{0};
    
    #ifdef _WIN32
    void* fileMapping_{nullptr};
    #else
    int shmFd_{-1};
    #endif
    
    Stats stats_;
    mutable std::mutex statsMutex_;
    
    bool mapSharedMemory(bool create);
    void unmapSharedMemory();
    size_t getAvailableSpace() const;
    bool wrapAroundIfNeeded(size_t needed);
};

// ═════════════════════════════════════════════════════════════════════════════
// TYPED MESSAGE TYPES
// ═════════════════════════════════════════════════════════════════════════════

enum class MessageType : uint32_t {
    // Intent lifecycle
    INTENT_CREATED = 1,
    INTENT_READY = 2,
    INTENT_LEASED = 3,
    INTENT_EXECUTING = 4,
    INTENT_COMPLETED = 5,
    INTENT_FAILED = 6,
    INTENT_RETRYING = 7,
    
    // Tool execution
    TOOL_CALL = 100,
    TOOL_RESULT = 101,
    TOOL_ERROR = 102,
    
    // File events
    FILE_CHANGED = 200,
    FILE_CREATED = 201,
    FILE_DELETED = 202,
    FILE_SAVED = 203,
    
    // Build events
    BUILD_STARTED = 300,
    BUILD_PROGRESS = 301,
    BUILD_COMPLETED = 302,
    BUILD_FAILED = 303,
    TEST_STARTED = 310,
    TEST_COMPLETED = 311,
    TEST_FAILED = 312,
    
    // Agent events
    AGENT_SPAWNED = 400,
    AGENT_BUSY = 401,
    AGENT_IDLE = 402,
    AGENT_TERMINATED = 403,
    
    // Model events
    MODEL_INFERENCE_START = 500,
    MODEL_INFERENCE_PROGRESS = 501,
    MODEL_INFERENCE_COMPLETE = 502,
    MODEL_INFERENCE_ERROR = 503,
    
    // System events
    HEARTBEAT = 900,
    SHUTDOWN_REQUEST = 901,
    ERROR = 999
};

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE BUILDER - Type-safe message construction
// ═════════════════════════════════════════════════════════════════════════════

class MessageBuilder {
public:
    MessageBuilder(MessageType type);
    
    // Add data
    MessageBuilder& withSource(const std::string& source);
    MessageBuilder& withTarget(const std::string& target);
    MessageBuilder& withPayload(const void* data, size_t size);
    
    template<typename T>
    MessageBuilder& withPayload(const T& data) {
        static_assert(std::is_trivially_copyable_v<T>, "T must be trivially copyable");
        return withPayload(&data, sizeof(T));
    }
    
    // Build and send
    bool send(NativeMessageBus& bus);
    
    // Get built message
    const MessageHeader* getHeader() const { return reinterpret_cast<const MessageHeader>(buffer_.data()); }
    const void* getPayload() const { return buffer_.data() + sizeof(MessageHeader); }
    size_t getSize() const { return buffer_.size(); }

private:
    std::vector<uint8_t> buffer_;
    MessageHeader* header_;
};

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE READER - Type-safe message reading
// ═════════════════════════════════════════════════════════════════════════════

class MessageReader {
public:
    explicit MessageReader(const MessageHeader* header);
    
    // Getters
    MessageType getType() const { return static_cast<MessageType>(header_->type); }
    uint32_t getSequence() const { return header_->sequence; }
    uint64_t getTimestamp() const { return header_->timestamp; }
    std::string getSource() const { return header_->source; }
    std::string getTarget() const { return header_->target; }
    
    // Get payload
    const void* getPayload() const;
    size_t getPayloadSize() const { return header_->size; }
    
    template<typename T>
    const T* getPayloadAs() const {
        if (header_->size != sizeof(T)) return nullptr;
        return reinterpret_cast<const T*>(getPayload());
    }

private:
    const MessageHeader* header_;
    const uint8_t* payload_{nullptr};
};

// ═════════════════════════════════════════════════════════════════════════════
// AGENT COMMUNICATION PATTERN
// ═════════════════════════════════════════════════════════════════════════════

// Planner → Coder → Reviewer → Debugger → Builder
// All exchange pointers, not serialized payloads

struct AgentMessage {
    MessageType type;
    uint64_t sequence;
    union {
        struct {
            IntentId intent;
            char operation[64];
        } intent;
        
        struct {
            char file[256];
            char content[4096];  // Inline small content
            uint64_t contentPtr; // Or pointer to large content
        } file;
        
        struct {
            char command[256];
            int exitCode;
            char output[4096];
        } tool;
        
        struct {
            char target[128];
            char status[32];
            int progress;
        } build;
        
        struct {
            char symbol[128];
            char file[256];
            int line;
        } symbol;
    } data;
};

// ═════════════════════════════════════════════════════════════════════════════
// BUS FACTORY
// ═════════════════════════════════════════════════════════════════════════════

class MessageBusFactory {
public:
    static std::shared_ptr<NativeMessageBus> getBus(const std::string& name);
    static void shutdownAll();
    
private:
    static std::unordered_map<std::string, std::weak_ptr<NativeMessageBus>> buses_;
    static std::mutex mutex_;
};

} // namespace RawrXD
