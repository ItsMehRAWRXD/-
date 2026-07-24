// ═══════════════════════════════════════════════════════════════════════════════
// RAWRZ INTERCONNECTION LAYER - Module-to-Module Communication System
// Provides seamless integration between all platform components
// ═══════════════════════════════════════════════════════════════════════════════

class RawrZInterconnectionLayer {
  constructor(bridge) {
    this.bridge = bridge;
    this.connections = new Map();
    this.dataFlows = new Map();
    this.activeStreams = new Map();
    this.syncPoints = new Map();
    
    // Define interconnection topology
    this.topology = {
      'engine-core': {
        connectsTo: ['stub-generator', 'bot-protection', 'file-operations'],
        dataTypes: ['engine-config', 'execution-result', 'status-update'],
        syncMode: 'async'
      },
      'file-operations': {
        connectsTo: ['encryption', 'stub-generator', 'engine-core'],
        dataTypes: ['file-selected', 'file-processed', 'hash-computed'],
        syncMode: 'async'
      },
      'encryption': {
        connectsTo: ['file-operations', 'stub-generator', 'bot-protection'],
        dataTypes: ['encrypted-data', 'decrypted-data', 'key-material'],
        syncMode: 'async'
      },
      'stub-generator': {
        connectsTo: ['engine-core', 'file-operations', 'encryption'],
        dataTypes: ['stub-generated', 'stub-burned', 'payload-ready'],
        syncMode: 'async'
      },
      'bot-protection': {
        connectsTo: ['encryption', 'engine-core'],
        dataTypes: ['bot-protected', 'obfuscation-complete'],
        syncMode: 'async'
      }
    };
    
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('[InterconnectionLayer] Initializing...');
    
    // Establish connections based on topology
    await this.establishConnections();
    
    // Setup data flow handlers
    this.setupDataFlows();
    
    // Create synchronization points
    this.createSyncPoints();
    
    // Start stream monitoring
    this.startStreamMonitoring();
    
    this.initialized = true;
    console.log('[InterconnectionLayer] ✅ Initialized');
    
    // Emit initialization event
    this.bridge.emit('interconnection:ready', {
      connections: Array.from(this.connections.keys()),
      topology: this.topology
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // CONNECTION MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════════

  async establishConnections() {
    for (const [moduleName, config] of Object.entries(this.topology)) {
      const connection = {
        module: moduleName,
        targets: config.connectsTo,
        status: 'connecting',
        channels: new Map(),
        stats: { messagesSent: 0, messagesReceived: 0, errors: 0 }
      };
      
      // Create channels to each target
      for (const target of config.connectsTo) {
        const channel = this.createChannel(moduleName, target);
        connection.channels.set(target, channel);
      }
      
      connection.status = 'connected';
      this.connections.set(moduleName, connection);
      
      console.log(`[InterconnectionLayer] Connected ${moduleName} → ${config.connectsTo.join(', ')}`);
    }
  }

  createChannel(source, target) {
    return {
      source,
      target,
      queue: [],
      processing: false,
      
      send: (data) => {
        this.routeData(source, target, data);
      },
      
      receive: (handler) => {
        this.bridge.on(`channel:${source}:${target}`, (e) => {
          handler(e.detail);
        });
      }
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // DATA ROUTING
  // ═════════════════════════════════════════════════════════════════════════════

  routeData(source, target, data) {
    const routeKey = `${source}:${target}`;
    
    // Validate route exists
    if (!this.isValidRoute(source, target)) {
      console.warn(`[InterconnectionLayer] Invalid route: ${routeKey}`);
      return false;
    }
    
    // Create data packet
    const packet = {
      id: this.generateId(),
      source,
      target,
      data,
      timestamp: Date.now(),
      type: data.type || 'generic',
      priority: data.priority || 'normal'
    };
    
    // Emit routing event
    this.bridge.emit(`channel:${source}:${target}`, packet);
    this.bridge.emit('data:routed', packet);
    
    // Update stats
    const connection = this.connections.get(source);
    if (connection) {
      connection.stats.messagesSent++;
    }
    
    return true;
  }

  isValidRoute(source, target) {
    const sourceConfig = this.topology[source];
    return sourceConfig && sourceConfig.connectsTo.includes(target);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // DATA FLOW HANDLERS
  // ═════════════════════════════════════════════════════════════════════════════

  setupDataFlows() {
    // Engine Core → Stub Generator
    this.bridge.on('channel:engine-core:stub-generator', (e) => {
      const packet = e.detail;
      console.log(`[DataFlow] Engine → Stub Generator: ${packet.type}`);
      
      if (packet.type === 'execution-result') {
        // Process execution result for stub generation
        this.processEngineResultForStub(packet.data);
      }
    });
    
    // File Operations → Encryption
    this.bridge.on('channel:file-operations:encryption', (e) => {
      const packet = e.detail;
      console.log(`[DataFlow] File Ops → Encryption: ${packet.type}`);
      
      if (packet.type === 'file-selected') {
        // Auto-trigger encryption options
        this.bridge.emit('file:ready-for-encryption', packet.data);
      }
    });
    
    // Encryption → Stub Generator
    this.bridge.on('channel:encryption:stub-generator', (e) => {
      const packet = e.detail;
      console.log(`[DataFlow] Encryption → Stub Generator: ${packet.type}`);
      
      if (packet.type === 'encrypted-data') {
        // Pass encrypted data to stub generator
        this.bridge.emit('stub:encrypted-payload-ready', packet.data);
      }
    });
    
    // Stub Generator → Engine Core
    this.bridge.on('channel:stub-generator:engine-core', (e) => {
      const packet = e.detail;
      console.log(`[DataFlow] Stub Generator → Engine: ${packet.type}`);
      
      if (packet.type === 'stub-generated') {
        // Update engine with new stub status
        this.bridge.emit('engine:stub-status-update', packet.data);
      }
    });
    
    // Bot Protection → Encryption
    this.bridge.on('channel:bot-protection:encryption', (e) => {
      const packet = e.detail;
      console.log(`[DataFlow] Bot Protection → Encryption: ${packet.type}`);
      
      if (packet.type === 'bot-protected') {
        // Trigger encryption for protected bot
        this.bridge.emit('encryption:bot-ready', packet.data);
      }
    });
  }

  processEngineResultForStub(data) {
    // Transform engine result into stub-compatible format
    const stubInput = {
      engineResult: data,
      timestamp: Date.now(),
      processed: true
    };
    
    this.bridge.emit('stub:process-engine-result', stubInput);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SYNCHRONIZATION POINTS
  // ═════════════════════════════════════════════════════════════════════════════

  createSyncPoints() {
    // Define synchronization checkpoints
    this.syncPoints.set('file-encryption', {
      name: 'File Encryption Pipeline',
      stages: ['file-selected', 'encryption-started', 'encryption-complete', 'stub-ready'],
      currentStage: null,
      data: {}
    });
    
    this.syncPoints.set('stub-generation', {
      name: 'Stub Generation Pipeline',
      stages: ['payload-received', 'encryption-applied', 'stub-built', 'verification-complete'],
      currentStage: null,
      data: {}
    });
    
    this.syncPoints.set('bot-deployment', {
      name: 'Bot Deployment Pipeline',
      stages: ['bot-configured', 'protection-applied', 'encryption-complete', 'deployment-ready'],
      currentStage: null,
      data: {}
    });
  }

  async synchronize(syncPointId, stage, data) {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (!syncPoint) {
      throw new Error(`Sync point '${syncPointId}' not found`);
    }
    
    const stageIndex = syncPoint.stages.indexOf(stage);
    if (stageIndex === -1) {
      throw new Error(`Stage '${stage}' not found in sync point '${syncPointId}'`);
    }
    
    // Update sync point
    syncPoint.currentStage = stage;
    syncPoint.data[stage] = data;
    
    console.log(`[SyncPoint] ${syncPointId}: ${stage} (${stageIndex + 1}/${syncPoint.stages.length})`);
    
    // Emit sync event
    this.bridge.emit('sync:update', {
      syncPoint: syncPointId,
      stage,
      progress: (stageIndex + 1) / syncPoint.stages.length,
      data
    });
    
    // Check if pipeline is complete
    if (stageIndex === syncPoint.stages.length - 1) {
      this.bridge.emit('sync:complete', {
        syncPoint: syncPointId,
        data: syncPoint.data
      });
      
      // Reset sync point
      syncPoint.currentStage = null;
      syncPoint.data = {};
    }
    
    return syncPoint;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STREAM MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════════

  startStreamMonitoring() {
    // Monitor active data streams
    setInterval(() => {
      this.activeStreams.forEach((stream, id) => {
        if (stream.lastActivity < Date.now() - 30000) {
          // Stream inactive for 30 seconds, close it
          this.closeStream(id);
        }
      });
    }, 10000);
  }

  createStream(source, target, options = {}) {
    const streamId = this.generateId();
    const stream = {
      id: streamId,
      source,
      target,
      created: Date.now(),
      lastActivity: Date.now(),
      chunks: [],
      options,
      status: 'active'
    };
    
    this.activeStreams.set(streamId, stream);
    
    console.log(`[Stream] Created ${streamId}: ${source} → ${target}`);
    
    return {
      id: streamId,
      write: (data) => this.writeToStream(streamId, data),
      close: () => this.closeStream(streamId),
      onData: (handler) => {
        this.bridge.on(`stream:${streamId}:data`, (e) => handler(e.detail));
      },
      onClose: (handler) => {
        this.bridge.on(`stream:${streamId}:close`, () => handler());
      }
    };
  }

  writeToStream(streamId, data) {
    const stream = this.activeStreams.get(streamId);
    if (!stream || stream.status !== 'active') {
      return false;
    }
    
    stream.chunks.push(data);
    stream.lastActivity = Date.now();
    
    this.bridge.emit(`stream:${streamId}:data`, data);
    
    return true;
  }

  closeStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;
    
    stream.status = 'closed';
    this.bridge.emit(`stream:${streamId}:close`, { streamId });
    this.activeStreams.delete(streamId);
    
    console.log(`[Stream] Closed ${streamId}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // UNIFIED ACCESS METHODS
  // ═════════════════════════════════════════════════════════════════════════════

  // Send data from any module to any other module
  send(source, target, data) {
    return this.routeData(source, target, data);
  }

  // Broadcast to all connected modules
  broadcast(source, data) {
    const connection = this.connections.get(source);
    if (!connection) return;
    
    for (const target of connection.targets) {
      this.routeData(source, target, data);
    }
  }

  // Request-response pattern
  async request(source, target, requestData, timeout = 5000) {
    const requestId = this.generateId();
    
    return new Promise((resolve, reject) => {
      // Setup response handler
      const responseHandler = (e) => {
        const response = e.detail;
        if (response.requestId === requestId) {
          this.bridge.off(`channel:${target}:${source}`, responseHandler);
          clearTimeout(timeoutId);
          resolve(response.data);
        }
      };
      
      // Setup timeout
      const timeoutId = setTimeout(() => {
        this.bridge.off(`channel:${target}:${source}`, responseHandler);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);
      
      // Listen for response
      this.bridge.on(`channel:${target}:${source}`, responseHandler);
      
      // Send request
      this.routeData(source, target, {
        ...requestData,
        requestId,
        type: 'request'
      });
    });
  }

  // Get connection status
  getConnectionStatus(moduleName) {
    const connection = this.connections.get(moduleName);
    return connection ? {
      status: connection.status,
      targets: connection.targets,
      stats: connection.stats
    } : null;
  }

  // Get all connection statuses
  getAllConnectionStatuses() {
    const statuses = {};
    this.connections.forEach((conn, name) => {
      statuses[name] = {
        status: conn.status,
        targets: conn.targets,
        stats: conn.stats
      };
    });
    return statuses;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═════════════════════════════════════════════════════════════════════════════

  generateId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  getStats() {
    const stats = {
      connections: this.connections.size,
      activeStreams: this.activeStreams.size,
      syncPoints: this.syncPoints.size,
      connectionDetails: {}
    };
    
    this.connections.forEach((conn, name) => {
      stats.connectionDetails[name] = { ...conn.stats };
    });
    
    return stats;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRATION WITH UNIFIED BRIDGE
// ═════════════════════════════════════════════════════════════════════════════

// Auto-initialize when bridge is ready
if (typeof window !== 'undefined') {
  window.addEventListener('bridge:initialized', (e) => {
    const bridge = e.detail.bridge || window.RawrZBridge;
    if (bridge) {
      const interconnection = new RawrZInterconnectionLayer(bridge);
      interconnection.initialize();
      
      // Expose globally
      window.RawrZInterconnection = interconnection;
      
      // Add to bridge
      bridge.interconnection = interconnection;
    }
  });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RawrZInterconnectionLayer };
}
