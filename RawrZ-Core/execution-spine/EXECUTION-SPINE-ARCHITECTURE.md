# RawrXD Execution Spine Architecture

**The Missing Glue: From Chat-Centric to Execution-Centric**

---

## 🎯 The Problem

Current AI IDEs follow this pattern:
```
Chat → Think → Tool → Wait → Poll → Think → Tool → Wait...
```

**Problems:**
- Agents lose state between turns
- No persistent execution context
- Polling wastes resources
- No shared world model
- Each agent rescans everything
- No coordination between agents

---

## ✅ The Solution: Execution Spine

```
User Intent
     │
     ▼
Intent Compiler
     │
     ▼
Execution Capsule (persistent)
     │
     ├── Memory
     ├── Tools (leased, not owned)
     ├── Project Graph (shared)
     ├── Terminal Handles
     ├── Model Context
     ├── Rollback Points
     └── Telemetry
     │
     ▼
Event Fabric (pub/sub, zero-copy)
     │
     ▼
Autonomous Result
```

**The LLM becomes a component, not the environment.**

---

## 🏗️ Core Components

### 1. Intent Graph (Dependency Graph, Not Queue)

```cpp
Build
 ├── Parse
 ├── Index
 ├── Compile
 ├── Test
 └── Package
```

**Features:**
- Every request becomes a dependency graph
- Agents lease vertices, don't create threads
- Incremental updates - only affected nodes
- Automatic retry with backoff

**Status Flow:**
```
PENDING → READY → LEASED → EXECUTING → COMPLETED
                    ↓
                 FAILED → RETRYING
```

### 2. Resource Scheduler (Agents Never Own, Only Lease)

**Resources Managed:**
- Terminals (persistent sessions)
- Compilers (instances with state)
- Debuggers (attachments)
- GPUs (compute slots)
- Disk I/O bandwidth
- Network connections
- Memory allocations
- CPU time slices

**Lease Model:**
```cpp
// Agent requests lease
auto lease = scheduler.requestLease(
    ResourceType::TERMINAL,
    agentId,
    intentId,
    timeout=30s
);

// Use leased resource
lease->terminal->execute("cmake --build .");

// Release when done
scheduler.releaseLease(lease->id);
```

### 3. Event Fabric (Pub/Sub, Zero-Copy, No Polling)

**Event Types:**
- `INTENT_CREATED`, `INTENT_READY`, `INTENT_EXECUTING`, `INTENT_COMPLETED`
- `FILE_CHANGED`, `FILE_SAVED`, `FILE_DELETED`
- `BUILD_STARTED`, `BUILD_PROGRESS`, `BUILD_COMPLETED`, `BUILD_FAILED`
- `TOOL_CALL`, `TOOL_RESULT`, `TOOL_ERROR`
- `AGENT_SPAWNED`, `AGENT_BUSY`, `AGENT_IDLE`, `AGENT_TERMINATED`
- `MODEL_INFERENCE_START`, `MODEL_INFERENCE_COMPLETE`

**Pattern:**
```cpp
// Subscribe to events
eventFabric.subscribe("BUILD_COMPLETED", [](const Event& e) {
    // Trigger next step automatically
    spine.submitIntent("test", e.outputs);
});

// Publish events
eventFabric.publish("BUILD_COMPLETED", agent, intent, result);
```

### 4. World Model (Persistent Shared State, Never Rescanned)

**Shared State:**
- Files (content, hash, AST, symbols)
- Symbols (definitions, references)
- Build states (targets, dependencies, outputs)
- Git state (branches, commits, diffs)
- Running processes
- Memory allocations

**Snapshot Model:**
```cpp
// All agents see same snapshot
auto snapshot = worldModel.captureSnapshot();

// Incremental updates only
auto affected = worldModel.getAffectedFiles("src/main.cpp");
// Returns: ["src/main.o", "bin/app", "tests/test_main"]
```

### 5. Token Budget Manager (Dynamic Resource Allocation)

**Budgets Per Agent:**
- Context tokens
- Max latency (ms)
- VRAM bytes
- Power watts
- Memory bytes

**Allocation:**
```cpp
Budget budget{
    .contextTokens = 8192,
    .maxLatencyMs = 5000,
    .vramBytes = 4 * 1024 * 1024 * 1024ULL,  // 4GB
    .powerWatts = 300,
    .memoryBytes = 8 * 1024 * 1024 * 1024ULL   // 8GB
};

if (budgetManager.allocateBudget(agentId, budget)) {
    // Agent can execute
} else {
    // Reclaim from low-priority agents
    budgetManager.reclaimForPriority(agentId, needed);
}
```

### 6. Native Message Bus (Zero-Copy Shared Memory)

**NOT:** JSON, HTTP, sockets
**IS:** Raw shared memory ring buffer

```cpp
// Planner → Coder → Reviewer → Debugger → Builder
// All exchange pointers, not serialized payloads

struct AgentMessage {
    MessageType type;
    union {
        IntentData intent;
        FileData file;
        ToolData tool;
        BuildData build;
    } data;
};

// Write directly to shared memory
MessageBuilder(MessageType::INTENT_CREATED)
    .withSource("planner")
    .withTarget("coder")
    .withPayload(intentData)
    .send(bus);
```

### 7. Execution Capsule (Persistent Container)

**Owns:**
- Terminal session (PID tracked)
- Compiler state
- Debugger attachment
- Memory pool
- GPU contexts

**Lifecycle:**
```cpp
// Create capsule for intent
auto capsule = spine.createCapsule(intentId);

// Capsule executes autonomously
auto result = capsule->execute(intent);

// Events emitted throughout
// UI subscribes to events
// Model only plans
```

### 8. Flight Recorder (Complete Audit Trail)

**Records:**
- Every intent created
- Every tool called
- Every event emitted
- Every decision made
- Every failure and retry

**Usage:**
```cpp
flightRecorder.record(
    "intent",           // category
    "created",          // action
    agentId,
    intentId,
    "Build target: bin/app"
);

// Export for analysis
flightRecorder.exportToJson("flight-log.json");
```

---

## 🔄 Execution Flow

### Traditional (Chat-Centric):
```
1. User: "Fix the build"
2. Agent: "Let me check..."
3. Agent: runs "cmake --build ."
4. Agent: waits...
5. Agent: polls terminal
6. Agent: "Build failed"
7. Agent: "Let me check errors..."
8. Agent: reads output
9. Agent: "I see the issue..."
10. Agent: proposes fix
11. User: approves
12. Agent: applies fix
13. Agent: "Let me rebuild..."
14. GOTO 3
```

### Execution Spine:
```
1. User: "Fix the build"
2. Intent Compiler: creates intent graph
   Build
    ├── Diagnose
    ├── Generate Fix
    ├── Apply Fix
    └── Rebuild
3. Execution Capsule created
4. Capsule leases resources
5. Capsule executes autonomously:
   - Diagnose runs
   - Emits: DIAGNOSIS_COMPLETE
   - Generate Fix runs
   - Emits: FIX_GENERATED
   - Apply Fix runs
   - Emits: FIX_APPLIED
   - Rebuild runs
   - Emits: BUILD_SUCCESS
6. UI subscribes to events, shows progress
7. Result delivered
```

**No polling. No waiting. No state loss.**

---

## 📊 Comparison

| Aspect | Traditional | Execution Spine |
|--------|-------------|-----------------|
| **Center** | Editor | Execution Fabric |
| **State** | Lost between turns | Persistent in capsule |
| **Resources** | Agents own | Leased from spine |
| **Communication** | Polling | Event-driven |
| **Coordination** | None | Intent graph |
| **Memory** | Per-agent | Shared world model |
| **Messages** | JSON/HTTP | Zero-copy shared memory |
| **Recovery** | Manual | Autonomous retry |
| **Audit** | None | Flight recorder |

---

## 🚀 Implementation Status

| Component | Status | File |
|-----------|--------|------|
| Intent Graph | ✅ Designed | `execution-spine.h` |
| Resource Scheduler | ✅ Designed | `execution-spine.h` |
| Event Fabric | ✅ Designed | `execution-spine.h` |
| World Model | ✅ Designed | `execution-spine.h` |
| Token Budget | ✅ Designed | `execution-spine.h` |
| Native Message Bus | ✅ Designed | `native-message-bus.h` |
| Execution Capsule | ✅ Designed | `execution-spine.h` |
| Flight Recorder | ✅ Designed | `execution-spine.h` |

---

## 🎓 Key Insights

1. **The LLM is not the environment** - it's a component that plans
2. **Execution owns resources** - agents lease, never own
3. **Shared world model** - never rescan, incremental updates
4. **Event-driven** - no polling, pub/sub fabric
5. **Zero-copy** - raw memory, not serialization
6. **Autonomous recovery** - detect and fix without user
7. **Complete audit** - every action recorded

---

## 🔮 Next Steps

1. Implement `ExecutionSpine::initialize()`
2. Create first `ExecutionCapsule`
3. Wire `IntentGraph` → `ResourceScheduler`
4. Connect `EventFabric` → UI
5. Test end-to-end with real build

---

**RawrXD Execution Spine**  
*From chat-centric to execution-centric*  
*The operating substrate for autonomous software engineering*
