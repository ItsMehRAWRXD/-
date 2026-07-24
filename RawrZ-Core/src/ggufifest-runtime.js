/**
 * GGUFIFEST Runtime - Agent Permission Manifest System
 * Parses and enforces GGUF metadata-based permission contracts
 * 
 * @module ggufifest-runtime
 * @version 1.0.0
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

/**
 * GGUFIFEST Runtime - Enforces agent permissions from GGUF metadata
 */
class GGUFIFESTRuntime extends EventEmitter {
  constructor(metadata = {}) {
    super();
    this.metadata = metadata;
    this.permissions = null;
    this.auditLog = [];
    this.startTime = Date.now();
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      disk: 0
    };
    this.isRevoked = false;
    this.childAgents = new Set();
    
    this._parseManifest();
  }

  /**
   * Parse GGUF metadata into structured permissions
   * @private
   */
  _parseManifest() {
    this.permissions = {
      agent: {
        id: this._getString('ggufifest.agent.id', 'unknown'),
        name: this._getString('ggufifest.agent.name', 'Unnamed Agent'),
        version: this._getString('ggufifest.agent.version', '1.0.0'),
        trustLevel: this._getUint8('ggufifest.agent.trust_level', 1),
        executionDomain: this._getString('ggufifest.agent.execution_domain', 'unknown')
      },
      capabilities: {
        code: {
          read: this._getBool('ggufifest.capability.code.read', false),
          write: this._getBool('ggufifest.capability.code.write', false),
          refactor: this._getBool('ggufifest.capability.code.refactor', false),
          delete: this._getString('ggufifest.capability.code.delete', 'deny'),
          maxChainDepth: this._getUint32('ggufifest.capability.code.max_chain_depth', 10),
          allowedLanguages: this._getArray('ggufifest.capability.code.allowed_languages', [])
        },
        build: {
          compile: this._getBool('ggufifest.capability.build.compile', false),
          executeBinary: this._getString('ggufifest.capability.build.execute_binary', 'deny'),
          allowedTools: this._getArray('ggufifest.capability.build.allowed_tools', [])
        },
        debug: {
          attach: this._getBool('ggufifest.capability.debug.attach', false),
          inspectMemory: this._getString('ggufifest.capability.debug.inspect_memory', 'deny'),
          modifyRuntime: this._getBool('ggufifest.capability.debug.modify_runtime', false)
        }
      },
      tools: {
        filesystem: {
          enabled: this._getBool('ggufifest.tool.filesystem.enabled', false),
          roots: this._getArray('ggufifest.tool.filesystem.roots', []),
          operations: {
            read: this._getBool('ggufifest.tool.filesystem.operations.read', false),
            write: this._getBool('ggufifest.tool.filesystem.operations.write', false),
            delete: this._getString('ggufifest.tool.filesystem.operations.delete', 'deny'),
            execute: this._getBool('ggufifest.tool.filesystem.operations.execute', false)
          }
        },
        terminal: {
          enabled: this._getBool('ggufifest.tool.terminal.enabled', false),
          allowedCommands: this._getArray('ggufifest.tool.terminal.allowed_commands', []),
          shellAccess: this._getString('ggufifest.tool.terminal.shell_access', 'deny'),
          timeoutSeconds: this._getUint32('ggufifest.tool.terminal.timeout_seconds', 60)
        },
        network: {
          mode: this._getString('ggufifest.tool.network.mode', 'isolated'),
          outbound: {
            default: this._getString('ggufifest.tool.network.outbound.default', 'deny'),
            allow: this._getArray('ggufifest.tool.network.outbound.allow', [])
          },
          inbound: this._getBool('ggufifest.tool.network.inbound', false)
        }
      },
      security: {
        sandbox: {
          enabled: this._getBool('ggufifest.security.sandbox.enabled', true),
          type: this._getString('ggufifest.security.sandbox.type', 'process'),
          privilegeLevel: this._getString('ggufifest.security.sandbox.privilege_level', 'user')
        },
        approval: {
          requiredFor: this._getArray('ggufifest.security.approval.required_for', [])
        },
        validation: {
          sanitizeInputs: this._getBool('ggufifest.security.validation.sanitize_inputs', true),
          maxPromptLength: this._getUint32('ggufifest.security.validation.max_prompt_length', 10000),
          blockPatterns: this._getArray('ggufifest.security.validation.block_patterns', [])
        }
      },
      limits: {
        cpuPercent: this._getUint32('ggufifest.limits.cpu.max_percent', 50),
        memoryGb: this._getUint32('ggufifest.limits.memory.max_gb', 4),
        diskGb: this._getUint32('ggufifest.limits.disk.max_gb', 10),
        runtimeMinutes: this._getUint32('ggufifest.limits.runtime.max_minutes', 60),
        concurrentTasks: this._getUint32('ggufifest.limits.concurrent_tasks', 4)
      },
      audit: {
        enabled: this._getBool('ggufifest.audit.enabled', true),
        events: this._getArray('ggufifest.audit.events', ['tool_call', 'permission_denied']),
        format: this._getString('ggufifest.audit.format', 'jsonl'),
        retentionDays: this._getUint32('ggufifest.audit.retention_days', 7)
      },
      revocation: {
        enabled: this._getBool('ggufifest.revocation.enabled', true),
        hotReload: this._getBool('ggufifest.revocation.hot_reload', true),
        killSwitch: this._getBool('ggufifest.revocation.kill_switch', true),
        keyRotation: this._getBool('ggufifest.revocation.key_rotation', false),
        expiry: this._getUint64('ggufifest.revocation.expiry', 0)
      },
      coupon: {
        id: this._getString('ggufifest.coupon.id', null),
        issuer: this._getString('ggufifest.coupon.issuer', null),
        issuedAt: this._getUint64('ggufifest.coupon.issued_at', 0),
        signature: this._getString('ggufifest.coupon.signature', null),
        publicKeyHash: this._getString('ggufifest.coupon.public_key_hash', null)
      }
    };

    // Validate parsed manifest
    this._validateManifest();
  }

  // Metadata getters
  _getString(key, defaultValue) {
    return this.metadata[key] !== undefined ? String(this.metadata[key]) : defaultValue;
  }

  _getBool(key, defaultValue) {
    if (this.metadata[key] === undefined) return defaultValue;
    return Boolean(this.metadata[key]);
  }

  _getUint8(key, defaultValue) {
    if (this.metadata[key] === undefined) return defaultValue;
    const val = parseInt(this.metadata[key], 10);
    return isNaN(val) ? defaultValue : Math.min(255, Math.max(0, val));
  }

  _getUint32(key, defaultValue) {
    if (this.metadata[key] === undefined) return defaultValue;
    const val = parseInt(this.metadata[key], 10);
    return isNaN(val) ? defaultValue : Math.min(4294967295, Math.max(0, val));
  }

  _getUint64(key, defaultValue) {
    if (this.metadata[key] === undefined) return defaultValue;
    const val = parseInt(this.metadata[key], 10);
    return isNaN(val) ? defaultValue : Math.max(0, val);
  }

  _getArray(key, defaultValue) {
    if (this.metadata[key] === undefined) return defaultValue;
    if (Array.isArray(this.metadata[key])) return this.metadata[key];
    if (typeof this.metadata[key] === 'string') {
      try {
        const parsed = JSON.parse(this.metadata[key]);
        return Array.isArray(parsed) ? parsed : defaultValue;
      } catch {
        return this.metadata[key].split(',').map(s => s.trim());
      }
    }
    return defaultValue;
  }

  /**
   * Validate the parsed manifest
   * @private
   */
  _validateManifest() {
    const required = ['ggufifest.agent.id'];
    const missing = required.filter(key => !(key in this.metadata));
    
    if (missing.length > 0) {
      throw new Error(`GGUFIFEST validation failed: Missing required keys: ${missing.join(', ')}`);
    }

    if (this.permissions.agent.trustLevel < 1 || this.permissions.agent.trustLevel > 5) {
      throw new Error('GGUFIFEST validation failed: Trust level must be 1-5');
    }

    // Check expiry
    if (this.permissions.revocation.expiry > 0) {
      const now = Math.floor(Date.now() / 1000);
      if (now > this.permissions.revocation.expiry) {
        throw new Error('GGUFIFEST validation failed: Manifest has expired');
      }
    }
  }

  /**
   * Verify coupon signature
   * @param {string} publicKey - Ed25519 public key for verification
   * @returns {Promise<boolean>} - True if signature is valid
   */
  async verifyCoupon(publicKey) {
    if (!this.permissions.coupon.signature) {
      return false;
    }

    try {
      // Build payload from permissions (excluding signature itself)
      const payload = this._serializeForSignature();
      const signature = this.permissions.coupon.signature.replace('ed25519:', '');
      
      // In production, use proper Ed25519 verification
      // For now, use crypto.verify as placeholder
      const verifier = crypto.createVerify('SHA256');
      verifier.update(payload);
      
      return verifier.verify(publicKey, signature, 'base64');
    } catch (error) {
      this._log('error', 'Coupon verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Serialize permissions for signature verification
   * @private
   */
  _serializeForSignature() {
    const signable = {
      agent: this.permissions.agent,
      capabilities: this.permissions.capabilities,
      tools: this.permissions.tools,
      limits: this.permissions.limits,
      coupon: {
        id: this.permissions.coupon.id,
        issuer: this.permissions.coupon.issuer,
        issuedAt: this.permissions.coupon.issuedAt
      }
    };
    return JSON.stringify(signable, Object.keys(signable).sort());
  }

  // ==================== PERMISSION CHECKS ====================

  /**
   * Check if code operation is allowed
   * @param {string} operation - read, write, refactor, delete
   * @param {string} language - Programming language
   * @returns {Object} - { allowed: boolean, requiresApproval: boolean }
   */
  checkCodeOperation(operation, language = null) {
    this._checkRevoked();
    
    const op = this.permissions.capabilities.code[operation];
    if (op === undefined) {
      return { allowed: false, requiresApproval: false, reason: 'Operation not defined' };
    }

    // Check language whitelist
    if (language && this.permissions.capabilities.code.allowedLanguages.length > 0) {
      if (!this.permissions.capabilities.code.allowedLanguages.includes(language)) {
        return { allowed: false, requiresApproval: false, reason: 'Language not allowed' };
      }
    }

    if (op === true) {
      return { allowed: true, requiresApproval: false };
    } else if (op === 'approval') {
      return { allowed: true, requiresApproval: true };
    } else {
      return { allowed: false, requiresApproval: false, reason: 'Operation denied' };
    }
  }

  /**
   * Check if filesystem operation is allowed
   * @param {string} operation - read, write, delete, execute
   * @param {string} path - File path
   * @returns {Object} - Permission check result
   */
  checkFilesystemOperation(operation, path) {
    this._checkRevoked();

    if (!this.permissions.tools.filesystem.enabled) {
      return { allowed: false, reason: 'Filesystem tool disabled' };
    }

    // Check root containment
    const isInRoot = this.permissions.tools.filesystem.roots.some(root => 
      path.startsWith(root) || path.startsWith(root.replace(/\//g, '\\'))
    );
    
    if (!isInRoot && this.permissions.tools.filesystem.roots.length > 0) {
      return { allowed: false, reason: 'Path outside allowed roots' };
    }

    const op = this.permissions.tools.filesystem.operations[operation];
    if (op === true) {
      return { allowed: true, requiresApproval: false };
    } else if (op === 'approval') {
      return { allowed: true, requiresApproval: true };
    } else {
      return { allowed: false, requiresApproval: false, reason: 'Operation denied' };
    }
  }

  /**
   * Check if terminal command is allowed
   * @param {string} command - Command to execute
   * @param {string[]} args - Command arguments
   * @returns {Object} - Permission check result
   */
  checkTerminalCommand(command, args = []) {
    this._checkRevoked();

    if (!this.permissions.tools.terminal.enabled) {
      return { allowed: false, reason: 'Terminal tool disabled' };
    }

    // Check blocked patterns
    const fullCommand = `${command} ${args.join(' ')}`;
    for (const pattern of this.permissions.security.validation.blockPatterns) {
      if (fullCommand.includes(pattern)) {
        return { allowed: false, reason: 'Command matches blocked pattern' };
      }
    }

    // Check allowed commands
    const isAllowed = this.permissions.tools.terminal.allowedCommands.some(
      allowed => command === allowed || command.startsWith(allowed)
    );

    if (!isAllowed) {
      return { allowed: false, reason: 'Command not in allowed list' };
    }

    // Check shell access requirement
    if (args.some(arg => arg.includes('&&') || arg.includes('|') || arg.includes(';'))) {
      if (this.permissions.tools.terminal.shellAccess === 'deny') {
        return { allowed: false, reason: 'Shell access denied' };
      } else if (this.permissions.tools.terminal.shellAccess === 'approval') {
        return { allowed: true, requiresApproval: true };
      }
    }

    return { allowed: true, requiresApproval: false };
  }

  /**
   * Check if network access is allowed
   * @param {string} host - Target host
   * @param {number} port - Target port
   * @returns {Object} - Permission check result
   */
  checkNetworkAccess(host, port) {
    this._checkRevoked();

    if (this.permissions.tools.network.mode === 'isolated') {
      return { allowed: false, reason: 'Network in isolated mode' };
    }

    // Check allowlist
    const isAllowed = this.permissions.tools.network.outbound.allow.some(
      allowed => host === allowed || host.endsWith(allowed.replace('*', ''))
    );

    if (this.permissions.tools.network.outbound.default === 'deny' && !isAllowed) {
      return { allowed: false, reason: 'Host not in allowlist' };
    }

    return { allowed: true, requiresApproval: false };
  }

  /**
   * Check if build operation is allowed
   * @param {string} tool - Build tool (cmake, ninja, etc.)
   * @param {boolean} willExecute - Whether this will execute a binary
   * @returns {Object} - Permission check result
   */
  checkBuildOperation(tool, willExecute = false) {
    this._checkRevoked();

    if (!this.permissions.capabilities.build.compile) {
      return { allowed: false, reason: 'Build compilation disabled' };
    }

    if (!this.permissions.capabilities.build.allowedTools.includes(tool)) {
      return { allowed: false, reason: 'Build tool not allowed' };
    }

    if (willExecute) {
      const exec = this.permissions.capabilities.build.executeBinary;
      if (exec === 'deny') {
        return { allowed: false, reason: 'Binary execution denied' };
      } else if (exec === 'approval') {
        return { allowed: true, requiresApproval: true };
      }
    }

    return { allowed: true, requiresApproval: false };
  }

  /**
   * Check if agent can spawn child agents
   * @returns {Object} - Permission check result
   */
  checkAgentSpawn() {
    this._checkRevoked();
    
    if (this.childAgents.size >= this.permissions.limits.concurrentTasks) {
      return { allowed: false, reason: 'Concurrent task limit reached' };
    }

    return { allowed: true, requiresApproval: false };
  }

  // ==================== RESOURCE MANAGEMENT ====================

  /**
   * Update resource usage
   * @param {Object} usage - { cpu, memory, disk }
   */
  updateResourceUsage(usage) {
    this.resourceUsage = { ...this.resourceUsage, ...usage };
    
    // Check limits
    if (this.resourceUsage.memory > this.permissions.limits.memoryGb * 1024 * 1024 * 1024) {
      this.emit('limitExceeded', { type: 'memory', current: this.resourceUsage.memory });
    }
  }

  /**
   * Check if runtime limit exceeded
   * @returns {boolean}
   */
  checkRuntimeLimit() {
    const elapsed = (Date.now() - this.startTime) / 1000 / 60; // minutes
    return elapsed > this.permissions.limits.runtimeMinutes;
  }

  // ==================== AUDIT LOGGING ====================

  /**
   * Log an event
   * @private
   */
  _log(eventType, message, details = {}) {
    if (!this.permissions.audit.enabled) return;
    if (!this.permissions.audit.events.includes(eventType)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      event: eventType,
      message,
      agent: this.permissions.agent.id,
      details
    };

    this.auditLog.push(entry);
    this.emit('audit', entry);

    // Trim old logs
    const maxAge = this.permissions.audit.retentionDays * 24 * 60 * 60 * 1000;
    this.auditLog = this.auditLog.filter(e => 
      Date.now() - new Date(e.timestamp).getTime() < maxAge
    );
  }

  /**
   * Log a tool call
   * @param {string} tool - Tool name
   * @param {Object} params - Tool parameters
   * @param {Object} result - Permission check result
   */
  logToolCall(tool, params, result) {
    this._log('tool_call', `Tool ${tool} invoked`, { tool, params, result });
  }

  /**
   * Log a permission denial
   * @param {string} action - Action that was denied
   * @param {string} reason - Denial reason
   */
  logPermissionDenied(action, reason) {
    this._log('permission_denied', `Action ${action} denied`, { action, reason });
  }

  /**
   * Get audit log
   * @returns {Array} - Audit log entries
   */
  getAuditLog() {
    return [...this.auditLog];
  }

  // ==================== REVOCATION ====================

  /**
   * Check if manifest is revoked
   * @private
   */
  _checkRevoked() {
    if (this.isRevoked) {
      throw new Error('GGUFIFEST has been revoked');
    }
  }

  /**
   * Revoke this manifest (kill switch)
   */
  revoke() {
    if (!this.permissions.revocation.enabled) {
      throw new Error('Revocation not enabled for this manifest');
    }

    this.isRevoked = true;
    this._log('revocation', 'Manifest revoked via kill switch');
    this.emit('revoked');
  }

  /**
   * Hot reload manifest with new metadata
   * @param {Object} newMetadata - New GGUF metadata
   */
  hotReload(newMetadata) {
    if (!this.permissions.revocation.hotReload) {
      throw new Error('Hot reload not enabled for this manifest');
    }

    this._log('hot_reload', 'Manifest hot reloaded');
    this.metadata = newMetadata;
    this._parseManifest();
    this.emit('reloaded');
  }

  // ==================== UTILITY ====================

  /**
   * Get full permission summary
   * @returns {Object} - Permission summary
   */
  getPermissionSummary() {
    return {
      agent: this.permissions.agent,
      capabilities: Object.keys(this.permissions.capabilities).filter(
        k => typeof this.permissions.capabilities[k] === 'object'
      ),
      tools: Object.keys(this.permissions.tools).filter(
        k => this.permissions.tools[k].enabled
      ),
      limits: this.permissions.limits,
      revoked: this.isRevoked,
      runtime: {
        started: new Date(this.startTime).toISOString(),
        elapsedMinutes: Math.floor((Date.now() - this.startTime) / 1000 / 60)
      }
    };
  }

  /**
   * Export manifest to GGUF-compatible metadata
   * @returns {Object} - Metadata key-value pairs
   */
  exportToMetadata() {
    const metadata = {};
    
    // Flatten permissions into GGUF format
    const flatten = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          flatten(value, fullKey);
        } else {
          metadata[`ggufifest.${fullKey}`] = value;
        }
      }
    };

    flatten(this.permissions);
    return metadata;
  }
}

/**
 * Create a GGUFIFEST runtime from a GGUF file
 * @param {string} ggufPath - Path to GGUF file
 * @returns {Promise<GGUFIFESTRuntime>}
 */
async function createFromGGUF(ggufPath) {
  // In production, use gguf-js or similar to parse GGUF
  // For now, return a runtime with empty metadata
  // TODO: Implement GGUF parsing
  const metadata = await parseGGUFFile(ggufPath);
  return new GGUFIFESTRuntime(metadata);
}

/**
 * Placeholder for GGUF parsing
 * @private
 */
async function parseGGUFFile(ggufPath) {
  // This would use a GGUF parser library
  // For now, return empty metadata
  console.log(`Would parse GGUF: ${ggufPath}`);
  return {};
}

/**
 * Create a default RawrXD agent manifest
 * @returns {Object} - Default metadata
 */
function createRawrXDManifest() {
  return {
    'ggufifest.schema_version': 1,
    'ggufifest.agent.id': 'rawrxd.coder.agent.v2',
    'ggufifest.agent.name': 'RawrXD-Sovereign-Coder',
    'ggufifest.agent.version': '1.0.0',
    'ggufifest.agent.trust_level': 4,
    'ggufifest.agent.execution_domain': 'workstation',
    
    'ggufifest.capability.code.read': true,
    'ggufifest.capability.code.write': true,
    'ggufifest.capability.code.refactor': true,
    'ggufifest.capability.code.delete': 'approval',
    'ggufifest.capability.code.allowed_languages': JSON.stringify([
      'javascript', 'typescript', 'python', 'cpp', 'rust', 'go', 'masm'
    ]),
    
    'ggufifest.capability.build.compile': true,
    'ggufifest.capability.build.execute_binary': 'approval',
    'ggufifest.capability.build.allowed_tools': JSON.stringify([
      'cmake', 'ninja', 'ml64', 'cl', 'clang'
    ]),
    
    'ggufifest.tool.filesystem.enabled': true,
    'ggufifest.tool.filesystem.roots': JSON.stringify([
      'D:/RawrXD/src',
      'D:/RawrXD/tests',
      'D:/RawrXD/build'
    ]),
    'ggufifest.tool.filesystem.operations.read': true,
    'ggufifest.tool.filesystem.operations.write': true,
    'ggufifest.tool.filesystem.operations.delete': 'approval',
    
    'ggufifest.tool.terminal.enabled': true,
    'ggufifest.tool.terminal.allowed_commands': JSON.stringify([
      'cmake', 'ninja', 'git', 'node', 'npm'
    ]),
    'ggufifest.tool.terminal.shell_access': 'approval',
    
    'ggufifest.tool.network.mode': 'isolated',
    'ggufifest.tool.network.outbound.default': 'deny',
    'ggufifest.tool.network.outbound.allow': JSON.stringify(['localhost']),
    
    'ggufifest.security.sandbox.enabled': true,
    'ggufifest.security.approval.required_for': JSON.stringify([
      'file_delete', 'network_enable', 'external_publish'
    ]),
    
    'ggufifest.limits.cpu.max_percent': 90,
    'ggufifest.limits.memory.max_gb': 64,
    'ggufifest.limits.runtime.max_minutes': 480,
    
    'ggufifest.audit.enabled': true,
    'ggufifest.audit.events': JSON.stringify([
      'tool_call', 'file_change', 'command_execute', 'permission_denied'
    ]),
    
    'ggufifest.revocation.enabled': true,
    'ggufifest.revocation.kill_switch': true
  };
}

module.exports = {
  GGUFIFESTRuntime,
  createFromGGUF,
  createRawrXDManifest
};
