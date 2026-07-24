# GGUFIFEST Specification v1.0
## GGUF Agent Permission Manifest Format

**Status:** Draft  
**Date:** 2026-07-21  
**Compatibility:** GGUF v3  

---

## Overview

GGUFIFEST extends the GGUF format with agent-runtime metadata, enabling models to carry their own execution contracts, permission boundaries, and capability declarations.

---

## Metadata Schema

### Core Agent Identity

```
ggufifest.schema_version: uint32 = 1
ggufifest.agent.id: string = "rawrxd.coder.agent"
ggufifest.agent.name: string = "SovereignCoder"
ggufifest.agent.version: string = "1.0.0"
ggufifest.agent.class: string = "autonomous-software-engineer"
ggufifest.agent.trust_level: uint8 = 3  # L1-L5
ggufifest.agent.owner_scope: string = "local-user"
ggufifest.agent.execution_domain: string = "workstation"
```

### Model Information

```
ggufifest.model.format: string = "GGUF"
ggufifest.model.quantization: string = "Q4_K_M"
ggufifest.model.context_length: uint32 = 32768
ggufifest.model.architecture: string = "transformer"
```

---

## Capability Gates

### Code Operations

```
ggufifest.capability.code.read: bool = true
ggufifest.capability.code.write: bool = true
ggufifest.capability.code.refactor: bool = true
ggufifest.capability.code.generate_tests: bool = true
ggufifest.capability.code.delete: bool = false  # Requires approval

ggufifest.capability.code.max_chain_depth: uint32 = 64
ggufifest.capability.code.allowed_languages: array[string] = [
  "javascript", "typescript", "python", "cpp", "rust", "go", "masm"
]
```

### Build Operations

```
ggufifest.capability.build.compile: bool = true
ggufifest.capability.build.link: bool = true
ggufifest.capability.build.execute_binary: string = "approval"  # allow|deny|approval
ggufifest.capability.build.allowed_tools: array[string] = [
  "cmake", "ninja", "clang", "ml64", "rustc", "go"
]
```

### Debug Operations

```
ggufifest.capability.debug.attach: bool = true
ggufifest.capability.debug.inspect_memory: string = "approval"
ggufifest.capability.debug.modify_runtime: bool = false
```

---

## Tool Permissions

### Filesystem

```
ggufifest.tool.filesystem.enabled: bool = true
ggufifest.tool.filesystem.roots: array[string] = [
  "D:/RawrXD/src",
  "D:/RawrXD/tests",
  "D:/RawrXD/build"
]
ggufifest.tool.filesystem.operations.read: bool = true
ggufifest.tool.filesystem.operations.write: bool = true
ggufifest.tool.filesystem.operations.delete: string = "approval"
ggufifest.tool.filesystem.operations.execute: bool = false
```

### Terminal

```
ggufifest.tool.terminal.enabled: bool = true
ggufifest.tool.terminal.allowed_commands: array[string] = [
  "cmake", "ninja", "git", "node", "npm"
]
ggufifest.tool.terminal.shell_access: string = "approval"
ggufifest.tool.terminal.timeout_seconds: uint32 = 300
```

### Network

```
ggufifest.tool.network.mode: string = "isolated"  # isolated|sandbox|full
ggufifest.tool.network.outbound.default: string = "deny"
ggufifest.tool.network.outbound.allow: array[string] = [
  "localhost",
  "127.0.0.1",
  "model-cache.local"
]
ggufifest.tool.network.inbound: bool = false
```

---

## Security Policy

### Sandbox Configuration

```
ggufifest.security.sandbox.enabled: bool = true
ggufifest.security.sandbox.type: string = "process"  # process|container|vm
ggufifest.security.sandbox.privilege_level: string = "user"  # user|elevated|system
```

### Approval Requirements

```
ggufifest.security.approval.required_for: array[string] = [
  "file_delete",
  "network_enable",
  "external_publish",
  "privilege_escalation",
  "registry_write",
  "service_install"
]
```

### Input Validation

```
ggufifest.security.validation.sanitize_inputs: bool = true
ggufifest.security.validation.max_prompt_length: uint32 = 100000
ggufifest.security.validation.block_patterns: array[string] = [
  "rm -rf /",
  "format C:",
  "dd if=/dev/zero"
]
```

---

## Agent Lifecycle

### Spawning

```
ggufifest.agent.spawn.enabled: bool = true
ggufifest.agent.spawn.max_children: uint32 = 4
ggufifest.agent.spawn.inheritance: string = "restricted"  # full|restricted|none
ggufifest.agent.spawn.escalation: bool = false
```

### Memory

```
ggufifest.agent.memory.persistent.enabled: bool = true
ggufifest.agent.memory.persistent.scope: string = "session"  # session|permanent
ggufifest.agent.memory.write_policy.decisions: bool = true
ggufifest.agent.memory.write_policy.credentials: bool = false
ggufifest.agent.memory.write_policy.secrets: bool = false
```

### Self-Modification

```
ggufifest.agent.self_modify.weights: bool = false
ggufifest.agent.self_modify.adapters: string = "approval"
ggufifest.agent.self_modify.prompts: bool = true
ggufifest.agent.self_modify.configuration: bool = true
```

---

## Resource Limits

```
ggufifest.limits.cpu.max_percent: uint32 = 90
ggufifest.limits.memory.max_gb: uint32 = 32
ggufiest.limits.disk.max_gb: uint32 = 100
ggufifest.limits.runtime.max_minutes: uint32 = 240
ggufifest.limits.concurrent_tasks: uint32 = 8
```

---

## Audit & Logging

```
ggufifest.audit.enabled: bool = true
ggufifest.audit.events: array[string] = [
  "tool_call",
  "file_change",
  "command_execute",
  "permission_denied",
  "agent_spawn",
  "agent_terminate"
]
ggufifest.audit.format: string = "jsonl"
ggufifest.audit.retention_days: uint32 = 30
```

---

## Revocation

```
ggufifest.revocation.enabled: bool = true
ggufifest.revocation.hot_reload: bool = true
ggufifest.revocation.kill_switch: bool = true
ggufifest.revocation.key_rotation: bool = true
ggufifest.revocation.expiry: uint64 = 0  # Unix timestamp, 0 = no expiry
```

---

## Coupon Format (Signed Manifest)

For signed permission tokens:

```
ggufifest.coupon.id: string = "rawrxd-coder-001"
ggufifest.coupon.issuer: string = "local-owner"
ggufifest.coupon.issued_at: uint64 = 1752604800  # Unix timestamp
ggufifest.coupon.signature: string = "ed25519:xxxx..."
ggufifest.coupon.public_key_hash: string = "sha256:xxxx..."
```

---

## Runtime Enforcement

### Loader Flow

```
GGUF File
    |
    v
Metadata Parser
    |
    v
GGUFIFEST Validator
    |
    +--> Schema Version Check
    +--> Signature Verification (if coupon)
    +--> Capability Gate Construction
    +--> Sandbox Initialization
    |
    v
Agent Runtime
    |
    +--> Tool Router (enforces permissions)
    +--> Sandbox Monitor
    +--> Audit Logger
    +--> Resource Limiter
```

### Permission Check Flow

```
Agent Request
    |
    v
Capability Gate
    |
    +--> Check ggufifest.capability.*
    +--> Verify resource limits
    +--> Check approval requirements
    |
    v
Decision: ALLOW | DENY | APPROVAL_REQUIRED
```

---

## Example: RawrXD Agent Manifest

```yaml
# Embedded in GGUF as metadata key-value pairs

ggufifest:
  schema_version: 1
  
  agent:
    id: "rawrxd.coder.agent.v2"
    name: "RawrXD-Sovereign-Coder"
    trust_level: 4
    execution_domain: "workstation"
  
  capabilities:
    code:
      read: true
      write: true
      refactor: true
      delete: "approval"
    
    build:
      compile: true
      execute_binary: "approval"
      allowed_tools: ["cmake", "ninja", "ml64", "cl"]
    
    debug:
      attach: true
      inspect_memory: "approval"
  
  tools:
    filesystem:
      roots: ["D:/RawrXD"]
      operations:
        read: true
        write: true
        delete: "approval"
    
    terminal:
      allowed_commands: ["cmake", "ninja", "git", "node"]
      shell_access: "approval"
    
    network:
      mode: "isolated"
      outbound:
        default: "deny"
        allow: ["localhost"]
  
  security:
    sandbox:
      enabled: true
      type: "process"
    
    approval_required:
      - "file_delete"
      - "network_enable"
      - "external_publish"
  
  limits:
    cpu_percent: 90
    memory_gb: 64
    runtime_minutes: 480
  
  audit:
    enabled: true
    events: ["tool_call", "file_change", "command_execute"]
  
  revocation:
    enabled: true
    kill_switch: true
```

---

## Binary Embedding

In GGUF binary format:

```c
// Header metadata section
struct gguf_metadata_kv_t {
    // Key: "ggufifest.agent.id"
    // Value Type: GGUF_METADATA_VALUE_TYPE_STRING
    // Value: "rawrxd.coder.agent"
    
    // Key: "ggufifest.capability.code.read"
    // Value Type: GGUF_METADATA_VALUE_TYPE_BOOL
    // Value: true
    
    // Key: "ggufifest.limits.memory.max_gb"
    // Value Type: GGUF_METADATA_VALUE_TYPE_UINT32
    // Value: 32
    
    // ... additional keys
};
```

---

## Validation

### Schema Validation

```javascript
// Validate GGUFIFEST against schema
function validateGGUFIFEST(metadata) {
  const required = [
    'ggufifest.schema_version',
    'ggufifest.agent.id',
    'ggufifest.agent.trust_level'
  ];
  
  for (const key of required) {
    if (!(key in metadata)) {
      throw new Error(`Missing required key: ${key}`);
    }
  }
  
  // Validate trust level range
  if (metadata['ggufifest.agent.trust_level'] > 5) {
    throw new Error('Trust level must be 1-5');
  }
  
  return true;
}
```

### Signature Verification (Coupon)

```javascript
// Verify signed coupon
async function verifyCoupon(metadata, publicKey) {
  const couponId = metadata['ggufifest.coupon.id'];
  const signature = metadata['ggufifest.coupon.signature'];
  const payload = serializePermissions(metadata);
  
  return await ed25519.verify(signature, payload, publicKey);
}
```

---

## Security Considerations

1. **Immutable Manifest**: Once embedded in GGUF, the manifest should be treated as immutable
2. **Signature Verification**: Coupons must be verified before trust is established
3. **Runtime Enforcement**: All permissions must be enforced at the tool execution level
4. **Audit Trail**: All permission checks and denials must be logged
5. **Revocation**: Support for hot-reload and kill-switch for emergency shutdown

---

## Future Extensions

- **v2.0**: Multi-agent coordination permissions
- **v2.0**: Fine-grained network policy (per-domain rules)
- **v2.0**: Dynamic capability negotiation
- **v3.0**: Federated identity and cross-domain permissions

---

*GGUFIFEST: Executable security contracts for AI agents*
