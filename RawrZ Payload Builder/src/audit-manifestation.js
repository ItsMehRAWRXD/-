// RawrZ Payload Builder - Audit Manifestation Tool
// Scans HTML/JS files and identifies undefined elements, missing dependencies, and errors

class RawrZAuditManifestation {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.info = [];
    this.stats = {
      filesScanned: 0,
      errorsFound: 0,
      warningsFound: 0,
      undefinedElements: 0
    };
  }

  // Initialize the audit
  async initialize() {
    console.log('🔍 RawrZ Audit Manifestation initializing...');
    this.log('info', 'Audit Manifestation Tool v1.0');
    this.log('info', 'Scanning for undefined elements, missing dependencies, and errors...');
    
    // Run all audits
    await this.auditDOMElements();
    await this.auditJavaScriptGlobals();
    await this.auditEventListeners();
    await this.auditRequiredScripts();
    await this.auditElectronAPI();
    
    // Generate report
    this.generateReport();
  }

  // Audit DOM elements that JS tries to access
  async auditDOMElements() {
    this.log('info', '🔍 Auditing DOM Elements...');
    
    const elementsToCheck = [
      // File operations
      { id: 'selectFile', usage: 'File selection', critical: true },
      { id: 'selectFiles', usage: 'Multiple file selection', critical: true },
      { id: 'selectDir', usage: 'Directory selection', critical: true },
      { id: 'hashBtn', usage: 'File hashing', critical: false },
      { id: 'compressBtn', usage: 'File compression', critical: false },
      { id: 'decompressBtn', usage: 'File decompression', critical: false },
      { id: 'createArchiveBtn', usage: 'Archive creation', critical: false },
      { id: 'extractArchiveBtn', usage: 'Archive extraction', critical: false },
      { id: 'encryptBtn', usage: 'File encryption', critical: true },
      { id: 'decryptBtn', usage: 'File decryption', critical: true },
      
      // Engine operations
      { id: 'loadEngines', usage: 'Engine loading', critical: true },
      { id: 'ircBotGen', usage: 'IRC Bot generation', critical: false },
      { id: 'httpBotGen', usage: 'HTTP Bot generation', critical: false },
      { id: 'tcpBotGen', usage: 'TCP Bot generation', critical: false },
      { id: 'udpBotGen', usage: 'UDP Bot generation', critical: false },
      
      // Advanced operations
      { id: 'binaryAnalysis', usage: 'Binary analysis', critical: false },
      { id: 'networkScan', usage: 'Network scanning', critical: false },
      { id: 'stegoHide', usage: 'Steganography', critical: false },
      { id: 'obfuscateCode', usage: 'Code obfuscation', critical: false },
      
      // Stub generator
      { id: 'browsePayload', usage: 'Payload browsing', critical: true },
      { id: 'browseOutput', usage: 'Output path selection', critical: true },
      { id: 'generateStub', usage: 'Stub generation', critical: true },
      { id: 'stubPayloadPath', usage: 'Payload path input', critical: true },
      { id: 'stubOutputPath', usage: 'Output path input', critical: true },
      { id: 'stubType', usage: 'Stub type selection', critical: true },
      { id: 'stubEncryption', usage: 'Encryption selection', critical: true },
      
      // Input elements
      { id: 'textInput', usage: 'Text input for encryption', critical: false },
      { id: 'password', usage: 'Password input', critical: false },
      { id: 'outputFormat', usage: 'Output format selection', critical: true },
      { id: 'useFileSSL', usage: 'SSL toggle', critical: false },
      
      // Tabs
      { id: 'files', usage: 'Files tab', critical: true },
      { id: 'engines', usage: 'Engines tab', critical: true },
      { id: 'payloads', usage: 'Payloads tab', critical: true },
      { id: 'security', usage: 'Security tab', critical: true },
      
      // Output
      { id: 'output', usage: 'Output console', critical: true },
      { id: 'jottiInput', usage: 'Jotti scan input', critical: false },
      { id: 'jottiResults', usage: 'Jotti results display', critical: false }
    ];
    
    let missingCount = 0;
    let criticalMissing = 0;
    
    elementsToCheck.forEach(elem => {
      const element = document.getElementById(elem.id);
      if (!element) {
        missingCount++;
        if (elem.critical) {
          criticalMissing++;
          this.log('error', `❌ CRITICAL: Missing DOM element '#${elem.id}' (${elem.usage})`);
        } else {
          this.log('warning', `⚠️ Missing DOM element '#${elem.id}' (${elem.usage})`);
        }
      } else {
        this.log('info', `✅ Found: #${elem.id}`);
      }
    });
    
    this.stats.undefinedElements = missingCount;
    this.log('info', `📊 DOM Audit: ${missingCount} missing elements (${criticalMissing} critical)`);
  }

  // Audit JavaScript global variables and APIs
  async auditJavaScriptGlobals() {
    this.log('info', '🔍 Auditing JavaScript Globals...');
    
    const requiredGlobals = [
      { name: 'window.electronAPI', usage: 'Electron API bridge', critical: true },
      { name: 'window.rawrz', usage: 'RawrZ encryption API', critical: true },
      { name: 'window.engineManager', usage: 'Engine management', critical: false },
      { name: 'window.agenticBeaconManager', usage: 'Agentic beacon system', critical: false },
      { name: 'require', usage: 'Node.js require', critical: false },
      { name: 'process', usage: 'Node.js process', critical: false },
      { name: 'Buffer', usage: 'Node.js Buffer', critical: false }
    ];
    
    requiredGlobals.forEach(global => {
      const parts = global.name.split('.');
      let current = window;
      let exists = true;
      
      for (const part of parts) {
        if (current && current[part] !== undefined) {
          current = current[part];
        } else {
          exists = false;
          break;
        }
      }
      
      if (!exists) {
        if (global.critical) {
          this.log('error', `❌ CRITICAL: Missing global '${global.name}' (${global.usage})`);
        } else {
          this.log('warning', `⚠️ Missing global '${global.name}' (${global.usage})`);
        }
      } else {
        this.log('info', `✅ Global available: ${global.name}`);
      }
    });
  }

  // Audit event listeners
  async auditEventListeners() {
    this.log('info', '🔍 Auditing Event Listeners...');
    
    // Check for common event listener patterns that might fail
    const eventAudit = [
      { selector: '.tab', event: 'click', usage: 'Tab switching' },
      { selector: '.file-button', event: 'click', usage: 'File buttons' },
      { selector: '.btn', event: 'click', usage: 'Generic buttons' },
      { selector: '#fileDrop', event: 'dragover/drop', usage: 'File drag & drop' }
    ];
    
    eventAudit.forEach(audit => {
      const elements = document.querySelectorAll(audit.selector);
      if (elements.length === 0) {
        this.log('warning', `⚠️ No elements found for '${audit.selector}' (${audit.usage})`);
      } else {
        this.log('info', `✅ Found ${elements.length} elements for '${audit.selector}'`);
      }
    });
  }

  // Audit required scripts
  async auditRequiredScripts() {
    this.log('info', '🔍 Auditing Required Scripts...');
    
    const requiredScripts = [
      { src: 'renderer.js', usage: 'Main renderer', critical: true },
      { src: 'engine-manager.js', usage: 'Engine management', critical: true },
      { src: 'agentic-beacon-framework.js', usage: 'Agentic beacon system', critical: false },
      { src: 'server-helper.js', usage: 'Server helper utilities', critical: false },
      { src: 'add-navigation.js', usage: 'Navigation injector', critical: false }
    ];
    
    const scripts = document.querySelectorAll('script[src]');
    const loadedScripts = Array.from(scripts).map(s => s.src.split('/').pop());
    
    requiredScripts.forEach(script => {
      const isLoaded = loadedScripts.some(src => src.includes(script.src));
      if (!isLoaded) {
        if (script.critical) {
          this.log('error', `❌ CRITICAL: Script not loaded: ${script.src} (${script.usage})`);
        } else {
          this.log('warning', `⚠️ Script not loaded: ${script.src} (${script.usage})`);
        }
      } else {
        this.log('info', `✅ Script loaded: ${script.src}`);
      }
    });
  }

  // Audit Electron API availability
  async auditElectronAPI() {
    this.log('info', '🔍 Auditing Electron API...');
    
    if (typeof window.electronAPI === 'undefined') {
      this.log('error', '❌ CRITICAL: window.electronAPI is not defined');
      this.log('info', '💡 This usually means:');
      this.log('info', '   1. Not running in Electron context');
      this.log('info', '   2. preload.js not loaded');
      this.log('info', '   3. contextIsolation preventing access');
      return;
    }
    
    const requiredMethods = [
      { method: 'selectFile', usage: 'File selection dialog', critical: true },
      { method: 'selectFiles', usage: 'Multiple file selection', critical: true },
      { method: 'selectDirectory', usage: 'Directory selection', critical: true },
      { method: 'hashFile', usage: 'File hashing', critical: false },
      { method: 'compressFile', usage: 'File compression', critical: false },
      { method: 'decompressFile', usage: 'File decompression', critical: false },
      { method: 'createArchive', usage: 'Archive creation', critical: false },
      { method: 'extractArchive', usage: 'Archive extraction', critical: false },
      { method: 'generateStub', usage: 'Stub generation', critical: true },
      { method: 'executeEngine', usage: 'Engine execution', critical: true }
    ];
    
    requiredMethods.forEach(api => {
      if (typeof window.electronAPI[api.method] !== 'function') {
        if (api.critical) {
          this.log('error', `❌ CRITICAL: electronAPI.${api.method} is not a function (${api.usage})`);
        } else {
          this.log('warning', `⚠️ electronAPI.${api.method} is not a function (${api.usage})`);
        }
      } else {
        this.log('info', `✅ electronAPI.${api.method} available`);
      }
    });
  }

  // Log helper
  log(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, level, message };
    
    switch(level) {
      case 'error':
        this.issues.push(entry);
        this.stats.errorsFound++;
        console.error(`[Audit] ${message}`);
        break;
      case 'warning':
        this.warnings.push(entry);
        this.stats.warningsFound++;
        console.warn(`[Audit] ${message}`);
        break;
      case 'info':
        this.info.push(entry);
        console.log(`[Audit] ${message}`);
        break;
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('RAWRZ AUDIT MANIFESTATION REPORT');
    console.log('='.repeat(60));
    console.log(`Generated: ${new Date().toLocaleString()}`);
    console.log(`Current Page: ${window.location.pathname}`);
    console.log('-'.repeat(60));
    
    console.log('\n📊 STATISTICS:');
    console.log(`  Errors: ${this.stats.errorsFound}`);
    console.log(`  Warnings: ${this.stats.warningsFound}`);
    console.log(`  Undefined Elements: ${this.stats.undefinedElements}`);
    
    if (this.issues.length > 0) {
      console.log('\n❌ CRITICAL ISSUES:');
      this.issues.forEach(issue => {
        console.log(`  [${issue.timestamp}] ${issue.message}`);
      });
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      this.warnings.forEach(warning => {
        console.log(`  [${warning.timestamp}] ${warning.message}`);
      });
    }
    
    console.log('\n✅ RECOMMENDATIONS:');
    if (this.issues.length > 0) {
      console.log('  1. Fix all CRITICAL issues before proceeding');
      console.log('  2. Ensure all required DOM elements exist in HTML');
      console.log('  3. Verify Electron preload script is loading correctly');
    }
    if (this.warnings.length > 0) {
      console.log('  4. Address warnings for optimal functionality');
    }
    console.log('  5. Run this audit after making changes to HTML/JS');
    
    console.log('\n' + '='.repeat(60));
    
    // Create visual report in DOM if output element exists
    this.displayVisualReport();
  }

  // Display visual report in the page
  displayVisualReport() {
    const outputElement = document.getElementById('output');
    if (!outputElement) return;
    
    const reportHTML = `
🔍 RAWRZ AUDIT MANIFESTATION REPORT
${'='.repeat(50)}
Generated: ${new Date().toLocaleString()}
Page: ${window.location.pathname}

📊 STATISTICS:
  Errors: ${this.stats.errorsFound}
  Warnings: ${this.stats.warningsFound}
  Undefined Elements: ${this.stats.undefinedElements}

${this.issues.length > 0 ? `❌ CRITICAL ISSUES (${this.issues.length}):\n` + this.issues.map(i => `  - ${i.message}`).join('\n') + '\n' : ''}
${this.warnings.length > 0 ? `⚠️ WARNINGS (${this.warnings.length}):\n` + this.warnings.map(w => `  - ${w.message}`).join('\n') + '\n' : ''}
${this.issues.length === 0 && this.warnings.length === 0 ? '✅ All checks passed! No issues found.\n' : ''}
${'='.repeat(50)}
    `;
    
    outputElement.textContent = reportHTML;
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.rawrzAudit = new RawrZAuditManifestation();
    window.rawrzAudit.initialize();
  });
} else {
  window.rawrzAudit = new RawrZAuditManifestation();
  window.rawrzAudit.initialize();
}

// Expose globally for manual triggering
window.runRawrZAudit = () => {
  if (window.rawrzAudit) {
    window.rawrzAudit.initialize();
  } else {
    window.rawrzAudit = new RawrZAuditManifestation();
    window.rawrzAudit.initialize();
  }
};

console.log('✅ RawrZ Audit Manifestation loaded. Run window.runRawrZAudit() to scan again.');
