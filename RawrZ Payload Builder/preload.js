const { contextBridge, ipcRenderer } = require('electron');

// ═════════════════════════════════════════════════════════════════════════════
// ELECTRON API - Primary API surface
// ═════════════════════════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  selectFile: () => ipcRenderer.invoke('select-file').catch(err => console.error("IPC error:", err)),
  selectFiles: () => ipcRenderer.invoke('select-files').catch(err => console.error("IPC error:", err)),
  selectDirectory: () => ipcRenderer.invoke('select-directory').catch(err => console.error("IPC error:", err)),
  hashFile: (filePath) => ipcRenderer.invoke('hash-file', filePath).catch(err => console.error("IPC error:", err)),
  compressFile: (filePath) => ipcRenderer.invoke('compress-file', filePath).catch(err => console.error("IPC error:", err)),
  decompressFile: (filePath) => ipcRenderer.invoke('decompress-file', filePath).catch(err => console.error("IPC error:", err)),
  
  // Engine operations
  getEngines: () => ipcRenderer.invoke('get-engines').catch(err => console.error("IPC error:", err)),
  executeEngine: (engineId, params) => ipcRenderer.invoke('execute-engine', engineId, params).catch(err => console.error("IPC error:", err)),
  getEngineConfig: (engineId) => ipcRenderer.invoke('get-engine-config', engineId).catch(err => console.error("IPC error:", err)),
  
  // Stub operations
  generateStub: (params) => ipcRenderer.invoke('generate-stub', params).catch(err => console.error("IPC error:", err)),
  getStubStatus: (stubId) => ipcRenderer.invoke('get-stub-status', stubId).catch(err => console.error("IPC error:", err)),
  burnStub: (stubId) => ipcRenderer.invoke('burn-stub', stubId).catch(err => console.error("IPC error:", err)),
  useNextStub: () => ipcRenderer.invoke('use-next-stub').catch(err => console.error("IPC error:", err)),
  getAllStubStatus: () => ipcRenderer.invoke('get-all-stub-status').catch(err => console.error("IPC error:", err)),
  
  // Bot operations
  protectBot: (botId) => ipcRenderer.invoke('protect-bot', botId).catch(err => console.error("IPC error:", err)),
  obfuscateBot: (botId) => ipcRenderer.invoke('obfuscate-bot', botId).catch(err => console.error("IPC error:", err)),
  
  // Encryption operations
  encryptFile: (filePath, key) => ipcRenderer.invoke('encrypt-file', filePath, key).catch(err => console.error("IPC error:", err)),
  decryptFile: (filePath, key) => ipcRenderer.invoke('decrypt-file', filePath, key).catch(err => console.error("IPC error:", err)),
  encryptText: (text, key) => ipcRenderer.invoke('encrypt-text', text, key).catch(err => console.error("IPC error:", err)),
  decryptText: (encrypted, key) => ipcRenderer.invoke('decrypt-text', encrypted, key).catch(err => console.error("IPC error:", err)),
  
  // Win32 operations
  executeWin32Operation: (operation, params) => ipcRenderer.invoke('execute-win32-operation', operation, params).catch(err => console.error("IPC error:", err)),
  
  // Event listeners
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Missing handlers - added for 100% validation
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options).catch(err => console.error("IPC error:", err)),
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options).catch(err => console.error("IPC error:", err)),
  openExternal: (url) => ipcRenderer.invoke('open-external', url).catch(err => console.error("IPC error:", err)),
  getVersion: () => ipcRenderer.invoke('get-version').catch(err => console.error("IPC error:", err)),
  openPanel: (panelName) => ipcRenderer.invoke('open-panel', panelName).catch(err => console.error("IPC error:", err)),

  // RawrZ specific - added for validation
  getHealth: () => ipcRenderer.invoke('rawrz:get-health').catch(err => console.error("IPC error:", err)),
  encryptPayload: (data, key) => ipcRenderer.invoke('rawrz:encrypt-payload', data, key).catch(err => console.error("IPC error:", err)),
  decryptPayload: (data, key) => ipcRenderer.invoke('rawrz:decrypt-payload', data, key).catch(err => console.error("IPC error:", err)),
  generateBot: (config) => ipcRenderer.invoke('rawrz:generate-bot', config).catch(err => console.error("IPC error:", err)),
  analyzeMalware: (filePath) => ipcRenderer.invoke('rawrz:analyze-malware', filePath).catch(err => console.error("IPC error:", err)),
  scanCVE: (target) => ipcRenderer.invoke('rawrz:scan-cve', target).catch(err => console.error("IPC error:", err)),
  beaconDeploy: (config) => ipcRenderer.invoke('rawrz:beacon-deploy', config).catch(err => console.error("IPC error:", err)),
  deployAgent: (config) => ipcRenderer.invoke('rawrz:deploy-agent', config).catch(err => console.error("IPC error:", err)),
  mutateAgent: (agentId) => ipcRenderer.invoke('rawrz:mutate-agent', agentId).catch(err => console.error("IPC error:", err)),
  getSystemStatus: () => ipcRenderer.invoke('rawrz:get-system-status').catch(err => console.error("IPC error:", err)),
  getEngineHealth: () => ipcRenderer.invoke('rawrz:get-engine-health').catch(err => console.error("IPC error:", err)),
  applyHotPatch: (target, patch) => ipcRenderer.invoke('rawrz:apply-hotpatch', target, patch).catch(err => console.error("IPC error:", err)),
  generateOmega: (config) => ipcRenderer.invoke('rawrz:generate-omega', config).catch(err => console.error("IPC error:", err)),

  // Event: engine-status
  engineStatus: (callback) => ipcRenderer.on('engine-status', (event, ...args) => callback(...args)),
  removeonEngineStatus: () => ipcRenderer.removeAllListeners('engine-status'),
  // Event: health-update
  healthUpdate: (callback) => ipcRenderer.on('health-update', (event, ...args) => callback(...args)),
  removeonHealthUpdate: () => ipcRenderer.removeAllListeners('health-update'),
  // Event: stub-burned
  stubBurned: (callback) => ipcRenderer.on('stub-burned', (event, ...args) => callback(...args)),
  removeonStubBurned: () => ipcRenderer.removeAllListeners('stub-burned'),
  // Event: bot-protected
  botProtected: (callback) => ipcRenderer.on('bot-protected', (event, ...args) => callback(...args)),
  removeonBotProtected: () => ipcRenderer.removeAllListeners('bot-protected'),
  // Event: encryption-complete
  encryptionComplete: (callback) => ipcRenderer.on('encryption-complete', (event, ...args) => callback(...args)),
  removeonEncryptionComplete: () => ipcRenderer.removeAllListeners('encryption-complete'),
  // Event: agent-deployed
  agentDeployed: (callback) => ipcRenderer.on('agent-deployed', (event, ...args) => callback(...args)),
  removeonAgentDeployed: () => ipcRenderer.removeAllListeners('agent-deployed'),
  // Event: mutation-complete
  mutationComplete: (callback) => ipcRenderer.on('mutation-complete', (event, ...args) => callback(...args)),
  removeonMutationComplete: () => ipcRenderer.removeAllListeners('mutation-complete'),
  // Event: hotpatch-applied
  hotpatchApplied: (callback) => ipcRenderer.on('hotpatch-applied', (event, ...args) => callback(...args)),
  removeonHotpatchApplied: () => ipcRenderer.removeAllListeners('hotpatch-applied'),
  // Event: win32-result
  win32Result: (callback) => ipcRenderer.on('win32-result', (event, ...args) => callback(...args)),
  removeonWin32Result: () => ipcRenderer.removeAllListeners('win32-result'),
  // Event: omega-generated
  omegaGenerated: (callback) => ipcRenderer.on('omega-generated', (event, ...args) => callback(...args)),
  removeonOmegaGenerated: () => ipcRenderer.removeAllListeners('omega-generated'),
  extractArchive: (...args) => ipcRenderer.invoke('extract-archive', ...args).catch(err => console.error("IPC error:", err)),
  generatePassword: (...args) => ipcRenderer.invoke('generate-password', ...args).catch(err => console.error("IPC error:", err)),
  runSecurityCLI: (...args) => ipcRenderer.invoke('run-security-cli', ...args).catch(err => console.error("IPC error:", err)),
  createArchive: (...args) => ipcRenderer.invoke('create-archive', ...args).catch(err => console.error("IPC error:", err)),});

// ═════════════════════════════════════════════════════════════════════════════
// RAWRZ API - Legacy/Alias API for backward compatibility
// ═════════════════════════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld('rawrz', {
  // File operations
  selectFile: () => ipcRenderer.invoke('select-file').catch(err => console.error("IPC error:", err)),
  selectFiles: () => ipcRenderer.invoke('select-files').catch(err => console.error("IPC error:", err)),
  selectDirectory: () => ipcRenderer.invoke('select-directory').catch(err => console.error("IPC error:", err)),
  hashFile: (filePath) => ipcRenderer.invoke('hash-file', filePath).catch(err => console.error("IPC error:", err)),
  compressFile: (filePath) => ipcRenderer.invoke('compress-file', filePath).catch(err => console.error("IPC error:", err)),
  decompressFile: (filePath) => ipcRenderer.invoke('decompress-file', filePath).catch(err => console.error("IPC error:", err)),
  
  // Engine operations
  getEngines: () => ipcRenderer.invoke('get-engines').catch(err => console.error("IPC error:", err)),
  executeEngine: (engineId, params) => ipcRenderer.invoke('execute-engine', engineId, params).catch(err => console.error("IPC error:", err)),
  getEngineConfig: (engineId) => ipcRenderer.invoke('get-engine-config', engineId).catch(err => console.error("IPC error:", err)),
  
  // Stub operations
  generateStub: (params) => ipcRenderer.invoke('generate-stub', params).catch(err => console.error("IPC error:", err)),
  getStubStatus: (stubId) => ipcRenderer.invoke('get-stub-status', stubId).catch(err => console.error("IPC error:", err)),
  burnStub: (stubId) => ipcRenderer.invoke('burn-stub', stubId).catch(err => console.error("IPC error:", err)),
  
  // Bot operations
  protectBot: (botId) => ipcRenderer.invoke('protect-bot', botId).catch(err => console.error("IPC error:", err)),
  obfuscateBot: (botId) => ipcRenderer.invoke('obfuscate-bot', botId).catch(err => console.error("IPC error:", err)),
  
  // Encryption operations
  encryptFile: (filePath, key) => ipcRenderer.invoke('encrypt-file', filePath, key).catch(err => console.error("IPC error:", err)),
  decryptFile: (filePath, key) => ipcRenderer.invoke('decrypt-file', filePath, key).catch(err => console.error("IPC error:", err)),
  encryptText: (text, key) => ipcRenderer.invoke('encrypt-text', text, key).catch(err => console.error("IPC error:", err)),
  decryptText: (encrypted, key) => ipcRenderer.invoke('decrypt-text', encrypted, key).catch(err => console.error("IPC error:", err)),
  
  // Win32 operations
  executeWin32Operation: (operation, params) => ipcRenderer.invoke('execute-win32-operation', operation, params).catch(err => console.error("IPC error:", err)),

  encryptTextDemo: (...args) => ipcRenderer.invoke('encrypt-text-demo', ...args).catch(err => console.error("IPC error:", err)),
  decryptTextDemo: (...args) => ipcRenderer.invoke('decrypt-text-demo', ...args).catch(err => console.error("IPC error:", err)),
  generateEngineMenu: (...args) => ipcRenderer.invoke('generate-engine-menu', ...args).catch(err => console.error("IPC error:", err)),
  parseJotti: (...args) => ipcRenderer.invoke('parse-jotti', ...args).catch(err => console.error("IPC error:", err)),});

// ═════════════════════════════════════════════════════════════════════════════
// UNIFIED BRIDGE API - For the new unified interconnection system
// ═════════════════════════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld('RawrZBridgeNative', {
  // All operations in one unified interface
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch(err => console.error("IPC error:", err)),
  
  // File operations
  file: {
    select: () => ipcRenderer.invoke('select-file').catch(err => console.error("IPC error:", err)),
    selectMultiple: () => ipcRenderer.invoke('select-files').catch(err => console.error("IPC error:", err)),
    selectDirectory: () => ipcRenderer.invoke('select-directory').catch(err => console.error("IPC error:", err)),
    hash: (filePath) => ipcRenderer.invoke('hash-file', filePath).catch(err => console.error("IPC error:", err)),
    compress: (filePath) => ipcRenderer.invoke('compress-file', filePath).catch(err => console.error("IPC error:", err)),
    decompress: (filePath) => ipcRenderer.invoke('decompress-file', filePath).catch(err => console.error("IPC error:", err))
  },
  
  // Engine operations
  engines: {
    list: () => ipcRenderer.invoke('get-engines').catch(err => console.error("IPC error:", err)),
    execute: (engineId, params) => ipcRenderer.invoke('execute-engine', engineId, params).catch(err => console.error("IPC error:", err)),
    config: (engineId) => ipcRenderer.invoke('get-engine-config', engineId).catch(err => console.error("IPC error:", err))
  },
  
  // Stub operations
  stubs: {
    generate: (params) => ipcRenderer.invoke('generate-stub', params).catch(err => console.error("IPC error:", err)),
    status: (stubId) => ipcRenderer.invoke('get-stub-status', stubId).catch(err => console.error("IPC error:", err)),
    burn: (stubId) => ipcRenderer.invoke('burn-stub', stubId).catch(err => console.error("IPC error:", err))
  },
  
  // Bot operations
  bots: {
    protect: (botId) => ipcRenderer.invoke('protect-bot', botId).catch(err => console.error("IPC error:", err)),
    obfuscate: (botId) => ipcRenderer.invoke('obfuscate-bot', botId).catch(err => console.error("IPC error:", err))
  },
  
  // Encryption operations
  crypto: {
    encryptFile: (filePath, key) => ipcRenderer.invoke('encrypt-file', filePath, key).catch(err => console.error("IPC error:", err)),
    decryptFile: (filePath, key) => ipcRenderer.invoke('decrypt-file', filePath, key).catch(err => console.error("IPC error:", err)),
    encryptText: (text, key) => ipcRenderer.invoke('encrypt-text', text, key).catch(err => console.error("IPC error:", err)),
    decryptText: (encrypted, key) => ipcRenderer.invoke('decrypt-text', encrypted, key).catch(err => console.error("IPC error:", err))
  },
  
  // Win32 operations
  win32: {
    execute: (operation, params) => ipcRenderer.invoke('execute-win32-operation', operation, params).catch(err => console.error("IPC error:", err))
  }
});