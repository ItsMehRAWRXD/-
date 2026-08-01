// ═══════════════════════════════════════════════════════════════════════════════
// RAWRZ UNIFIED BRIDGE - Complete Interconnection System
// Bridges all individualized modules into a cohesive, unified platform
// ═══════════════════════════════════════════════════════════════════════════════

class RawrZUnifiedBridge {
  constructor() {
    this.version = '3.0.0-Unified';
    this.modules = new Map();
    this.eventBus = new EventTarget();
    this.state = new Map();
    this.connections = new Map();
    this.initialized = false;
    this.logLevel = 'verbose';
    
    // API Registry - Maps all available APIs
    this.apiRegistry = {
      electronAPI: null,
      rawrz: null,
      engineManager: null,
      agenticBeaconManager: null,
      agenticAuditor: null,
      windowAPI: null
    };
    
    // Module manifest - defines all interconnectable modules
    this.moduleManifest = {
      'engine-core': {
        required: true,
        apis: ['getEngines', 'executeEngine', 'getEngineConfig'],
        fallback: this.createMockEngineCore.bind(this)
      },
      'file-operations': {
        required: true,
        apis: ['selectFile', 'selectFiles', 'selectDirectory', 'hashFile'],
        fallback: this.createMockFileOps.bind(this)
      },
      'encryption': {
        required: false,
        apis: ['encryptFile', 'decryptFile', 'encryptText', 'decryptText'],
        fallback: this.createMockEncryption.bind(this)
      },
      'stub-generator': {
        required: false,
        apis: ['generateStub', 'getStubStatus', 'burnStub'],
        fallback: this.createMockStubGenerator.bind(this)
      },
      'bot-protection': {
        required: false,
        apis: ['protectBot', 'obfuscateBot'],
        fallback: this.createMockBotProtection.bind(this)
      }
    };
    
    this.messageQueue = [];
    this.subscribers = new Map();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═════════════════════════════════════════════════════════════════════════════
  
  async initialize() {
    if (this.initialized) {
      this.log('warn', 'Bridge already initialized');
      return this;
    }
    
    this.log('info', '🔌 Initializing RawrZ Unified Bridge v' + this.version);
    
    // Phase 1: Discover available APIs
    await this.discoverAPIs();
    
    // Phase 2: Validate and connect modules
    await this.connectModules();
    
    // Phase 3: Create unified API surface
    this.createUnifiedAPI();
    
    // Phase 4: Setup event bus
    this.setupEventBus();
    
    // Phase 5: Start message router
    this.startMessageRouter();
    
    // Phase 6: Expose to global scope
    this.exposeGlobally();
    
    this.initialized = true;
    this.log('success', '✅ Unified Bridge initialized successfully');
    this.emit('bridge:initialized', { version: this.version, modules: Array.from(this.modules.keys()) });
    
    return this;
  }

  async discoverAPIs() {
    this.log('info', '🔍 Discovering available APIs...');
    
    // Check for electronAPI
    if (typeof window !== 'undefined' && window.electronAPI) {
      this.apiRegistry.electronAPI = window.electronAPI;
      this.log('success', '✅ Found electronAPI');
    }
    
    // Check for rawrz API
    if (typeof window !== 'undefined' && window.rawrz) {
      this.apiRegistry.rawrz = window.rawrz;
      this.log('success', '✅ Found rawrz API');
    }
    
    // Check for engineManager
    if (typeof window !== 'undefined' && window.engineManager) {
      this.apiRegistry.engineManager = window.engineManager;
      this.log('success', '✅ Found engineManager');
    }
    
    // Check for agenticBeaconManager
    if (typeof window !== 'undefined' && window.agenticBeaconManager) {
      this.apiRegistry.agenticBeaconManager = window.agenticBeaconManager;
      this.log('success', '✅ Found agenticBeaconManager');
    }
    
    // Check for agenticAuditor
    if (typeof window !== 'undefined' && window.agenticAuditor) {
      this.apiRegistry.agenticAuditor = window.agenticAuditor;
      this.log('success', '✅ Found agenticAuditor');
    }
    
    // Build window API collection
    this.apiRegistry.windowAPI = {
      localStorage: typeof localStorage !== 'undefined' ? localStorage : null,
      sessionStorage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
      indexedDB: typeof indexedDB !== 'undefined' ? indexedDB : null,
      fetch: typeof fetch !== 'undefined' ? fetch : null,
      crypto: typeof crypto !== 'undefined' ? crypto : null
    };
    
    this.log('info', `📊 Discovered ${Object.values(this.apiRegistry).filter(v => v !== null).length} APIs`);
  }

  async connectModules() {
    this.log('info', '🔗 Connecting modules...');
    
    for (const [moduleName, config] of Object.entries(this.moduleManifest)) {
      try {
        const module = await this.loadModule(moduleName, config);
        this.modules.set(moduleName, module);
        this.log('success', `✅ Connected module: ${moduleName}`);
      } catch (error) {
        if (config.required) {
          this.log('error', `❌ Required module ${moduleName} failed to load: ${error.message}`);
          // Use fallback
          const fallback = config.fallback();
          this.modules.set(moduleName, fallback);
          this.log('warn', `⚠️ Using fallback for ${moduleName}`);
        } else {
          this.log('warn', `⚠️ Optional module ${moduleName} not available`);
        }
      }
    }
  }

  async loadModule(moduleName, config) {
    const module = {
      name: moduleName,
      apis: {},
      status: 'loading',
      dependencies: config.dependencies || []
    };
    
    // Try to find APIs in all registered sources
    for (const apiName of config.apis) {
      const api = this.findAPI(apiName);
      if (api) {
        module.apis[apiName] = api;
      }
    }
    
    // Check if all required APIs are present
    const missing = config.apis.filter(api => !module.apis[api]);
    if (missing.length > 0 && config.required) {
      throw new Error(`Missing required APIs: ${missing.join(', ')}`);
    }
    
    module.status = 'connected';
    return module;
  }

  findAPI(apiName) {
    // Search through all registered APIs
    for (const [source, api] of Object.entries(this.apiRegistry)) {
      if (api && typeof api === 'object' && apiName in api) {
        return api[apiName].bind(api);
      }
    }
    
    // Check global scope
    if (typeof window !== 'undefined' && apiName in window) {
      return window[apiName];
    }
    
    return null;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // UNIFIED API CREATION
  // ═════════════════════════════════════════════════════════════════════════════

  createUnifiedAPI() {
    this.log('info', '🏗️ Creating unified API surface...');
    
    // Core unified API
    this.unified = {
      // File Operations
      file: {
        select: this.createUnifiedMethod('selectFile'),
        selectMultiple: this.createUnifiedMethod('selectFiles'),
        selectDirectory: this.createUnifiedMethod('selectDirectory'),
        hash: this.createUnifiedMethod('hashFile'),
        compress: this.createUnifiedMethod('compressFile'),
        decompress: this.createUnifiedMethod('decompressFile'),
        encrypt: this.createUnifiedMethod('encryptFile'),
        decrypt: this.createUnifiedMethod('decryptFile')
      },
      
      // Engine Operations
      engines: {
        list: this.createUnifiedMethod('getEngines'),
        execute: this.createUnifiedMethod('executeEngine'),
        config: this.createUnifiedMethod('getEngineConfig'),
        generateMenu: this.createUnifiedMethod('generateEngineMenu'),
        get status() {
          return window.RawrZBridge?.modules?.get('engine-core')?.status || 'unknown';
        }
      },
      
      // Stub Operations
      stubs: {
        generate: this.createUnifiedMethod('generateStub'),
        getStatus: this.createUnifiedMethod('getStubStatus'),
        burn: this.createUnifiedMethod('burnStub')
      },
      
      // Bot Operations
      bots: {
        protect: this.createUnifiedMethod('protectBot'),
        obfuscate: this.createUnifiedMethod('obfuscateBot')
      },
      
      // Encryption Operations
      crypto: {
        encryptText: this.createUnifiedMethod('encryptText'),
        decryptText: this.createUnifiedMethod('decryptText'),
        encryptFile: this.createUnifiedMethod('encryptFile'),
        decryptFile: this.createUnifiedMethod('decryptFile')
      },
      
      // Event System
      events: {
        on: this.on.bind(this),
        off: this.off.bind(this),
        emit: this.emit.bind(this),
        once: this.once.bind(this)
      },
      
      // State Management
      state: {
        get: this.getState.bind(this),
        set: this.setState.bind(this),
        subscribe: this.subscribeState.bind(this)
      },
      
      // Module Access
      modules: {
        get: (name) => this.modules.get(name),
        list: () => Array.from(this.modules.keys()),
        status: () => {
          const status = {};
          this.modules.forEach((mod, name) => {
            status[name] = mod.status;
          });
          return status;
        }
      },
      
      // Utility
      utils: {
        log: this.log.bind(this),
        generateId: () => Math.random().toString(36).substring(2, 15),
        timestamp: () => Date.now(),
        delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
      }
    };
    
    // Create proxy for dynamic access
    this.api = new Proxy(this.unified, {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop];
        }
        
        // Try to find in modules
        for (const [name, module] of this.modules) {
          if (prop in module.apis) {
            return module.apis[prop];
          }
        }
        
        // Return a placeholder that logs the missing API
        return (...args) => {
          this.log('warn', `API '${String(prop)}' not found, call ignored`);
          return Promise.resolve(null);
        };
      }
    });
  }

  createUnifiedMethod(apiName) {
    return async (...args) => {
      const api = this.findAPI(apiName);
      if (!api) {
        this.log('error', `API '${apiName}' not available`);
        throw new Error(`API '${apiName}' not available`);
      }
      
      try {
        this.emit('api:call', { name: apiName, args });
        const result = await api(...args);
        this.emit('api:success', { name: apiName, result });
        return result;
      } catch (error) {
        this.emit('api:error', { name: apiName, error });
        throw error;
      }
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // EVENT BUS SYSTEM
  // ═════════════════════════════════════════════════════════════════════════════

  setupEventBus() {
    this.log('info', '📡 Setting up event bus...');
    
    // Create centralized event bus
    this.events = {
      on: (event, handler) => {
        this.eventBus.addEventListener(event, handler);
        return () => this.eventBus.removeEventListener(event, handler);
      },
      
      off: (event, handler) => {
        this.eventBus.removeEventListener(event, handler);
      },
      
      emit: (event, data) => {
        this.eventBus.dispatchEvent(new CustomEvent(event, { detail: data }));
      },
      
      once: (event, handler) => {
        const onceHandler = (e) => {
          handler(e);
          this.eventBus.removeEventListener(event, onceHandler);
        };
        this.eventBus.addEventListener(event, onceHandler);
      }
    };
  }

  on(event, handler) {
    return this.events.on(event, handler);
  }

  off(event, handler) {
    this.events.off(event, handler);
  }

  emit(event, data) {
    this.events.emit(event, data);
  }

  once(event, handler) {
    this.events.once(event, handler);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════════

  getState(key) {
    return this.state.get(key);
  }

  setState(key, value) {
    const oldValue = this.state.get(key);
    this.state.set(key, value);
    this.emit('state:change', { key, oldValue, newValue: value });
  }

  subscribeState(key, handler) {
    return this.on('state:change', (e) => {
      if (e.detail.key === key) {
        handler(e.detail.newValue, e.detail.oldValue);
      }
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // MESSAGE ROUTER
  // ═════════════════════════════════════════════════════════════════════════════

  startMessageRouter() {
    this.log('info', '📨 Starting message router...');
    
    // Process message queue
    setInterval(() => {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        this.routeMessage(message);
      }
    }, 100);
  }

  routeMessage(message) {
    const { target, action, payload } = message;
    
    if (this.modules.has(target)) {
      const module = this.modules.get(target);
      if (module.apis[action]) {
        module.apis[action](payload);
      }
    }
    
    this.emit('message:routed', { target, action, payload });
  }

  sendMessage(target, action, payload) {
    this.messageQueue.push({ target, action, payload, timestamp: Date.now() });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // MOCK FALLBACKS
  // ═════════════════════════════════════════════════════════════════════════════

  createMockEngineCore() {
    return {
      name: 'engine-core',
      status: 'mock',
      apis: {
        getEngines: () => Promise.resolve({ engines: [], count: 0 }),
        executeEngine: () => Promise.resolve({ success: false, error: 'Mock mode' }),
        getEngineConfig: () => Promise.resolve({})
      }
    };
  }

  createMockFileOps() {
    return {
      name: 'file-operations',
      status: 'mock',
      apis: {
        selectFile: () => Promise.resolve(null),
        selectFiles: () => Promise.resolve([]),
        selectDirectory: () => Promise.resolve(null),
        hashFile: () => Promise.resolve('mock-hash')
      }
    };
  }

  createMockEncryption() {
    return {
      name: 'encryption',
      status: 'mock',
      apis: {
        encryptFile: () => Promise.resolve({ success: false, error: 'Mock mode' }),
        decryptFile: () => Promise.resolve({ success: false, error: 'Mock mode' }),
        encryptText: () => Promise.resolve('mock-encrypted'),
        decryptText: () => Promise.resolve('mock-decrypted')
      }
    };
  }

  createMockStubGenerator() {
    return {
      name: 'stub-generator',
      status: 'mock',
      apis: {
        generateStub: () => Promise.resolve({ success: false, error: 'Mock mode' }),
        getStubStatus: () => Promise.resolve({ stubs: 0, burned: 0 }),
        burnStub: () => Promise.resolve({ success: false })
      }
    };
  }

  createMockBotProtection() {
    return {
      name: 'bot-protection',
      status: 'mock',
      apis: {
        protectBot: () => Promise.resolve({ success: false, error: 'Mock mode' }),
        obfuscateBot: () => Promise.resolve({ success: false, error: 'Mock mode' })
      }
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // GLOBAL EXPOSURE
  // ═════════════════════════════════════════════════════════════════════════════

  exposeGlobally() {
    if (typeof window !== 'undefined') {
      window.RawrZBridge = this;
      window.RawrZ = this.api;

      // Also expose unified API directly
      window.rawrz = window.rawrz || {};
      Object.assign(window.rawrz, this.api);

      // Fire on window so interconnection-layer (and any other listener) receives it
      window.dispatchEvent(new CustomEvent('bridge:initialized', {
        detail: { bridge: this, version: this.version }
      }));

      this.log('success', '✅ Bridge exposed globally as window.RawrZBridge and window.RawrZ');
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // LOGGING
  // ═════════════════════════════════════════════════════════════════════════════

  log(level, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[RawrZBridge ${timestamp}]`;
    
    const logEntry = { level, message, data, timestamp };
    
    switch(level) {
      case 'error':
        console.error(`${prefix} ❌ ${message}`, data || '');
        break;
      case 'warn':
        console.warn(`${prefix} ⚠️ ${message}`, data || '');
        break;
      case 'success':
        console.log(`${prefix} ✅ ${message}`, data || '');
        break;
      case 'info':
        console.log(`${prefix} ℹ️ ${message}`, data || '');
        break;
      default:
        console.log(`${prefix} ${message}`, data || '');
    }
    
    this.emit('log', logEntry);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═════════════════════════════════════════════════════════════════════════════

  async healthCheck() {
    const report = {
      timestamp: Date.now(),
      version: this.version,
      initialized: this.initialized,
      modules: {},
      apis: {}
    };
    
    // Check modules
    this.modules.forEach((module, name) => {
      report.modules[name] = {
        status: module.status,
        apiCount: Object.keys(module.apis).length
      };
    });
    
    // Check API availability
    for (const [apiName] of Object.entries(this.moduleManifest)) {
      const module = this.modules.get(apiName);
      report.apis[apiName] = module ? module.status : 'missing';
    }
    
    return report;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTO-INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════

// Create singleton instance
const bridge = new RawrZUnifiedBridge();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bridge.initialize());
} else {
  bridge.initialize();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RawrZUnifiedBridge, bridge };
}
