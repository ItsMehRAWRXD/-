// ═══════════════════════════════════════════════════════════════════════════════
// RAWRZ UNIFIED RENDERER - Complete UI Integration Layer
// Replaces fragmented API calls with unified bridge integration
// ═══════════════════════════════════════════════════════════════════════════════

class RawrZUnifiedRenderer {
  constructor() {
    this.bridge = null;
    this.interconnection = null;
    this.initialized = false;
    this.uiState = new Map();
    this.components = new Map();
    this.eventHandlers = new Map();
  }

  async initialize() {
    if (this.initialized) return;

    console.log('[UnifiedRenderer] Initializing...');

    // Wait for bridge to be ready
    await this.waitForBridge();

    // Initialize UI components
    await this.initializeComponents();

    // Setup event listeners
    this.setupEventListeners();

    // Connect to interconnection layer
    if (window.RawrZInterconnection) {
      this.interconnection = window.RawrZInterconnection;
    }

    this.initialized = true;
    console.log('[UnifiedRenderer] ✅ Initialized');

    // Emit ready event
    if (this.bridge) {
      this.bridge.emit('renderer:ready', { timestamp: Date.now() });
    }
  }

  async waitForBridge() {
    return new Promise((resolve) => {
      if (window.RawrZBridge) {
        this.bridge = window.RawrZBridge;
        resolve();
      } else {
        window.addEventListener('bridge:initialized', (e) => {
          this.bridge = window.RawrZBridge;
          resolve();
        }, { once: true });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.bridge) {
            console.warn('[UnifiedRenderer] Bridge timeout, using fallback');
            this.createFallbackBridge();
            resolve();
          }
        }, 5000);
      }
    });
  }

  createFallbackBridge() {
    // Create minimal fallback bridge
    this.bridge = {
      api: window.rawrz || window.electronAPI || {},
      emit: (event, data) => {
        window.dispatchEvent(new CustomEvent(event, { detail: data }));
      },
      on: (event, handler) => {
        window.addEventListener(event, handler);
        return () => window.removeEventListener(event, handler);
      }
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // COMPONENT INITIALIZATION
  // ═════════════════════════════════════════════════════════════════════════════

  async initializeComponents() {
    // File Operations Component
    this.components.set('file-ops', {
      element: document.getElementById('files'),
      handlers: {
        selectFile: this.handleSelectFile.bind(this),
        selectFiles: this.handleSelectFiles.bind(this),
        selectDirectory: this.handleSelectDirectory.bind(this),
        hashFile: this.handleHashFile.bind(this),
        compressFile: this.handleCompressFile.bind(this),
        decompressFile: this.handleDecompressFile.bind(this),
        encryptFile: this.handleEncryptFile.bind(this),
        decryptFile: this.handleDecryptFile.bind(this)
      }
    });

    // Engine Control Component
    this.components.set('engine-control', {
      element: document.getElementById('engines'),
      handlers: {
        getEngines: this.handleGetEngines.bind(this),
        executeEngine: this.handleExecuteEngine.bind(this),
        toggleEngine: this.handleToggleEngine.bind(this)
      }
    });

    // Payload Builder Component
    this.components.set('payload-builder', {
      element: document.getElementById('payloads'),
      handlers: {
        generateStub: this.handleGenerateStub.bind(this),
        getStubStatus: this.handleGetStubStatus.bind(this),
        burnStub: this.handleBurnStub.bind(this)
      }
    });

    // Security Tools Component
    this.components.set('security-tools', {
      element: document.getElementById('security'),
      handlers: {
        protectBot: this.handleProtectBot.bind(this),
        obfuscateBot: this.handleObfuscateBot.bind(this)
      }
    });

    // Attach handlers to DOM elements
    this.attachDOMHandlers();
  }

  attachDOMHandlers() {
    // File Operations
    this.attachHandler('selectFile', 'click', 'file-ops', 'selectFile');
    this.attachHandler('selectFiles', 'click', 'file-ops', 'selectFiles');
    this.attachHandler('selectDir', 'click', 'file-ops', 'selectDirectory');
    this.attachHandler('hashBtn', 'click', 'file-ops', 'hashFile');
    this.attachHandler('compressBtn', 'click', 'file-ops', 'compressFile');
    this.attachHandler('decompressBtn', 'click', 'file-ops', 'decompressFile');
    this.attachHandler('encryptFileBtn', 'click', 'file-ops', 'encryptFile');
    this.attachHandler('decryptFileBtn', 'click', 'file-ops', 'decryptFile');

    // Engine Control
    this.attachHandler('engineToggles', 'change', 'engine-control', 'toggleEngine');

    // Payload Builder
    this.attachHandler('generateStub', 'click', 'payload-builder', 'generateStub');
    this.attachHandler('checkStubStatus', 'click', 'payload-builder', 'getStubStatus');
    this.attachHandler('burnCurrentStub', 'click', 'payload-builder', 'burnStub');

    // Security Tools
    this.attachHandler('protectBotBtn', 'click', 'security-tools', 'protectBot');
    this.attachHandler('obfuscateBotBtn', 'click', 'security-tools', 'obfuscateBot');

    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => this.handleTabSwitch(e));
    });
  }

  attachHandler(elementId, eventType, component, handlerName) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`[UnifiedRenderer] Element '${elementId}' not found`);
      return;
    }

    const componentObj = this.components.get(component);
    if (!componentObj || !componentObj.handlers[handlerName]) {
      console.warn(`[UnifiedRenderer] Handler '${handlerName}' not found in component '${component}'`);
      return;
    }

    const handler = componentObj.handlers[handlerName];
    element.addEventListener(eventType, handler);

    // Store for cleanup
    if (!this.eventHandlers.has(elementId)) {
      this.eventHandlers.set(elementId, []);
    }
    this.eventHandlers.get(elementId).push({ eventType, handler });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═════════════════════════════════════════════════════════════════════════════

  async handleSelectFile() {
    try {
      this.log('info', 'Selecting file...');
      const result = await this.bridge.api.file.select();
      if (result) {
        this.log('success', `Selected: ${result}`);
        this.updateUI('selectedFile', result);
      }
    } catch (error) {
      this.log('error', `File selection failed: ${error.message}`);
    }
  }

  async handleSelectFiles() {
    try {
      this.log('info', 'Selecting multiple files...');
      const results = await this.bridge.api.file.selectMultiple();
      if (results && results.length > 0) {
        this.log('success', `Selected ${results.length} files`);
        this.updateUI('selectedFiles', results);
      }
    } catch (error) {
      this.log('error', `Files selection failed: ${error.message}`);
    }
  }

  async handleSelectDirectory() {
    try {
      this.log('info', 'Selecting directory...');
      const result = await this.bridge.api.file.selectDirectory();
      if (result) {
        this.log('success', `Selected directory: ${result}`);
        this.updateUI('selectedDirectory', result);
      }
    } catch (error) {
      this.log('error', `Directory selection failed: ${error.message}`);
    }
  }

  async handleHashFile() {
    const file = this.uiState.get('selectedFile');
    if (!file) {
      this.log('warn', 'Please select a file first');
      return;
    }

    try {
      this.log('info', `Hashing file: ${file}`);
      const hash = await this.bridge.api.file.hash(file);
      this.log('success', `Hash: ${hash}`);
      this.updateUI('fileHash', hash);
    } catch (error) {
      this.log('error', `Hashing failed: ${error.message}`);
    }
  }

  async handleCompressFile() {
    const file = this.uiState.get('selectedFile');
    if (!file) {
      this.log('warn', 'Please select a file first');
      return;
    }

    try {
      this.log('info', `Compressing file: ${file}`);
      const result = await this.bridge.api.file.compress(file);
      this.log('success', `Compressed to: ${result}`);
    } catch (error) {
      this.log('error', `Compression failed: ${error.message}`);
    }
  }

  async handleDecompressFile() {
    const file = this.uiState.get('selectedFile');
    if (!file) {
      this.log('warn', 'Please select a file first');
      return;
    }

    try {
      this.log('info', `Decompressing file: ${file}`);
      const result = await this.bridge.api.file.decompress(file);
      this.log('success', `Decompressed to: ${result}`);
    } catch (error) {
      this.log('error', `Decompression failed: ${error.message}`);
    }
  }

  async handleEncryptFile() {
    const file = this.uiState.get('selectedFile');
    if (!file) {
      this.log('warn', 'Please select a file first');
      return;
    }

    try {
      this.log('info', `Encrypting file: ${file}`);
      const result = await this.bridge.api.file.encrypt(file);
      this.log('success', `Encrypted to: ${result.outputPath}`);
    } catch (error) {
      this.log('error', `Encryption failed: ${error.message}`);
    }
  }

  async handleDecryptFile() {
    const file = this.uiState.get('selectedFile');
    if (!file) {
      this.log('warn', 'Please select a file first');
      return;
    }

    try {
      this.log('info', `Decrypting file: ${file}`);
      const result = await this.bridge.api.file.decrypt(file);
      this.log('success', `Decrypted to: ${result.outputPath}`);
    } catch (error) {
      this.log('error', `Decryption failed: ${error.message}`);
    }
  }

  async handleGetEngines() {
    try {
      this.log('info', 'Fetching engines...');
      const result = await this.bridge.api.engines.list();
      this.log('success', `Found ${result.count} engines`);
      this.updateUI('engines', result.engines);
      this.updateEngineDisplay(result.engines);
    } catch (error) {
      this.log('error', `Failed to get engines: ${error.message}`);
    }
  }

  async handleExecuteEngine(engineId, params = {}) {
    try {
      this.log('info', `Executing engine: ${engineId}`);
      const result = await this.bridge.api.engines.execute(engineId, params);
      this.log('success', `Engine ${engineId} completed`);
      return result;
    } catch (error) {
      this.log('error', `Engine execution failed: ${error.message}`);
      throw error;
    }
  }

  async handleToggleEngine(event) {
    const engineId = event.target.dataset.engineId;
    const enabled = event.target.checked;

    try {
      this.log('info', `${enabled ? 'Enabling' : 'Disabling'} engine: ${engineId}`);
      // Update engine state through bridge
      this.bridge.emit('engine:toggle', { engineId, enabled });
    } catch (error) {
      this.log('error', `Failed to toggle engine: ${error.message}`);
    }
  }

  async handleGenerateStub() {
    const payloadPath = document.getElementById('stubPayloadPath')?.value;
    if (!payloadPath) {
      this.log('warn', 'Please select a payload file');
      return;
    }

    const options = {
      stubType: document.getElementById('stubType')?.value || 'cpp',
      encryptionMethod: document.getElementById('stubEncryption')?.value || 'aes-256-gcm',
      includeAntiDebug: document.getElementById('antiDebug')?.checked || false,
      includeAntiVM: document.getElementById('antiVM')?.checked || false,
      includeAntiSandbox: document.getElementById('antiSandbox')?.checked || false
    };

    try {
      this.log('info', 'Generating stub...');
      const result = await this.bridge.api.stubs.generate(payloadPath, options);
      this.log('success', `Stub generated: ${result.outputPath}`);
      this.updateStats('generatedPayloads', 1);
    } catch (error) {
      this.log('error', `Stub generation failed: ${error.message}`);
    }
  }

  async handleGetStubStatus() {
    try {
      this.log('info', 'Checking stub status...');
      const status = await this.bridge.api.stubs.getStatus();
      this.log('info', `Stubs: ${status.stubs} | Burned: ${status.burned}`);
      this.updateUI('stubStatus', status);
    } catch (error) {
      this.log('error', `Failed to get stub status: ${error.message}`);
    }
  }

  async handleBurnStub() {
    try {
      this.log('info', 'Burning current stub...');
      const result = await this.bridge.api.stubs.burn('current');
      this.log('success', 'Stub burned successfully');
    } catch (error) {
      this.log('error', `Failed to burn stub: ${error.message}`);
    }
  }

  async handleProtectBot() {
    const file = this.uiState.get('selectedFile');
    if (!file) {
      this.log('warn', 'Please select a bot file first');
      return;
    }

    try {
      this.log('info', `Protecting bot: ${file}`);
      const result = await this.bridge.api.bots.protect(file);
      this.log('success', 'Bot protected successfully');
    } catch (error) {
      this.log('error', `Bot protection failed: ${error.message}`);
    }
  }

  async handleObfuscateBot() {
    const file = this.uiState.get('selectedFile');
    if (!file) {
      this.log('warn', 'Please select a bot file first');
      return;
    }

    try {
      this.log('info', `Obfuscating bot: ${file}`);
      const result = await this.bridge.api.bots.obfuscate(file);
      this.log('success', 'Bot obfuscated successfully');
    } catch (error) {
      this.log('error', `Bot obfuscation failed: ${error.message}`);
    }
  }

  handleTabSwitch(event) {
    const tabId = event.target.dataset.tab;
    if (!tabId) return;

    // Update active tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    // Update active content
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    const content = document.getElementById(tabId);
    if (content) {
      content.classList.add('active');
    }

    // Emit tab change event
    this.bridge.emit('ui:tab-changed', { tab: tabId });

    // Load tab-specific data
    if (tabId === 'engines') {
      this.handleGetEngines();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // UI UPDATES
  // ═════════════════════════════════════════════════════════════════════════════

  updateUI(key, value) {
    this.uiState.set(key, value);

    // Update DOM elements
    switch (key) {
      case 'selectedFile':
        this.updateElement('filePath', value);
        break;
      case 'selectedFiles':
        this.updateElement('filesList', value.join('\n'));
        break;
      case 'fileHash':
        this.updateElement('hashResult', value);
        break;
      case 'engines':
        this.updateEngineDisplay(value);
        break;
      case 'stubStatus':
        this.updateElement('stubStatus', `Stubs: ${value.stubs} | Burned: ${value.burned}`);
        break;
    }

    // Emit state change
    this.bridge.emit('ui:state-changed', { key, value });
  }

  updateElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = value;
      } else {
        element.textContent = value;
      }
    }
  }

  updateEngineDisplay(engines) {
    const container = document.getElementById('engineList');
    if (!container) return;

    container.innerHTML = engines.map(engine => `
      <div class="engine-card" data-engine-id="${engine.id}">
        <h4>${engine.icon} ${engine.name}</h4>
        <p>${engine.description}</p>
        <div class="engine-meta">
          <span class="version">v${engine.version}</span>
          <span class="category">${engine.category}</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-engine-id="${engine.id}" ${engine.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    `).join('');
  }

  updateStats(statName, increment) {
    const element = document.getElementById(statName);
    if (element) {
      const current = parseInt(element.textContent) || 0;
      element.textContent = current + increment;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // LOGGING
  // ═════════════════════════════════════════════════════════════════════════════

  log(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;

    // Add to log display
    const logContainer = document.getElementById('logContainer');
    if (logContainer) {
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry log-${level}`;
      logEntry.textContent = `${prefix} ${message}`;
      logContainer.appendChild(logEntry);
      logContainer.scrollTop = logContainer.scrollHeight;
    }

    // Console output
    switch (level) {
      case 'error':
        console.error(`${prefix} ❌ ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      case 'success':
        console.log(`${prefix} ✅ ${message}`);
        break;
      default:
        console.log(`${prefix} ℹ️ ${message}`);
    }

    // Emit log event
    if (this.bridge) {
      this.bridge.emit('ui:log', { level, message, timestamp });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═════════════════════════════════════════════════════════════════════════════

  setupEventListeners() {
    if (!this.bridge) return;

    // Listen for bridge events
    this.bridge.on('bridge:initialized', () => {
      this.log('success', 'Bridge connected');
    });

    this.bridge.on('api:error', (e) => {
      this.log('error', `API Error: ${e.detail.error}`);
    });

    this.bridge.on('engine:status-changed', (e) => {
      this.log('info', `Engine ${e.detail.engineId} is now ${e.detail.status}`);
    });

    // Interconnection events
    if (this.interconnection) {
      this.bridge.on('data:routed', (e) => {
        const { source, target, type } = e.detail;
        this.log('verbose', `Data routed: ${source} → ${target} (${type})`);
      });
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTO-INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════

const unifiedRenderer = new RawrZUnifiedRenderer();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => unifiedRenderer.initialize());
} else {
  unifiedRenderer.initialize();
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RawrZUnifiedRenderer, unifiedRenderer };
}
