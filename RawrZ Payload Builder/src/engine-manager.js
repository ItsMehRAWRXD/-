// Dynamic Engine Manager - Auto-generates UI for all engines
class EngineManager {
  constructor() {
    this.engines = {};
    this.activeEngine = null;
  }

  // Initialize all engines and generate UI
  async initialize() {
    await this.loadEngineConfigs();
    this.generateEngineToggles();
    this.generateEngineMenus();
    this.setupEventListeners();
    this.log('🔧 Engine Manager initialized with auto-generated menus');
  }

  // Load engine configurations
  async loadEngineConfigs() {
    // Import engine configs (would be loaded from engine-config.js)
    this.engines = window.engineConfigs || {};
  }

  // Generate toggle switches for each engine
  generateEngineToggles() {
    const container = document.getElementById('engineToggles');
    if (!container) return;

    let togglesHTML = '<div class="engine-toggles-grid">';
    
    Object.entries(this.engines).forEach(([engineId, config]) => {
      togglesHTML += `
        <div class="engine-toggle-card">
          <div class="toggle-header">
            <span class="engine-icon">${config.icon}</span>
            <span class="engine-name">${config.name}</span>
            <span class="engine-category">${config.category}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="${engineId}-toggle" 
                   ${config.enabled ? 'checked' : ''} 
                   onchange="engineManager.toggleEngine('${engineId}')">
            <span class="slider"></span>
          </label>
        </div>
      `;
    });

    togglesHTML += '</div>';
    container.innerHTML = togglesHTML;
  }

  // Generate dynamic menus for each engine
  generateEngineMenus() {
    const container = document.getElementById('engineMenus');
    if (!container) return;

    let menusHTML = '';
    Object.keys(this.engines).forEach(engineId => {
      if (typeof window.generateEngineMenu === 'function') {
        menusHTML += window.generateEngineMenu(engineId);
      } else {
        // Fallback: generate a basic menu from config
        const config = this.engines[engineId];
        if (config && config.menu) {
          menusHTML += this.generateBasicMenu(engineId, config);
        }
      }
    });

    container.innerHTML = menusHTML;
  }

  // Fallback menu generator when generateEngineMenu is not available
  generateBasicMenu(engineId, config) {
    let html = `
      <div class="engine-menu" id="${engineId}-menu" style="display: ${config.enabled ? 'block' : 'none'};">
        <div class="engine-header">
          <h3>${config.icon} ${config.name}</h3>
          <span class="engine-category">${config.category}</span>
        </div>
        <div class="engine-controls">
    `;
    Object.entries(config.menu || {}).forEach(([key, field]) => {
      const fieldId = `${engineId}-${key}`;
      html += `<div class="form-group"><label for="${fieldId}">${field.label}:</label>`;
      switch (field.type) {
        case 'text':
          html += `<input type="text" id="${fieldId}" placeholder="${field.placeholder || ''}" value="${field.default || ''}">`;
          break;
        case 'number':
          html += `<input type="number" id="${fieldId}" value="${field.default || ''}">`;
          break;
        case 'select':
          const opts = config.features?.[field.options] || [];
          html += `<select id="${fieldId}">${opts.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
          break;
        case 'checkbox':
          html += `<label><input type="checkbox" id="${fieldId}"> ${field.label}</label>`;
          break;
        case 'file':
          html += `<input type="text" id="${fieldId}" readonly><button onclick="browseFile('${fieldId}')">Browse</button>`;
          break;
        default:
          html += `<input type="text" id="${fieldId}">`;
      }
      html += `</div>`;
    });
    html += `
        </div>
        <div class="engine-actions">
          <button class="btn-primary" onclick="executeEngine('${engineId}')">${config.icon} Execute ${config.name}</button>
          <button class="btn-secondary" onclick="clearEngineConfig('${engineId}')">🧹 Clear</button>
        </div>
      </div>
    `;
    return html;
  }

  // Toggle engine on/off
  toggleEngine(engineId) {
    const toggle = document.getElementById(`${engineId}-toggle`);
    const menu = document.getElementById(`${engineId}-menu`);
    
    this.engines[engineId].enabled = toggle.checked;
    
    if (toggle.checked) {
      this.log(`✅ ${this.engines[engineId].name} enabled`);
      if (menu) menu.style.display = 'block';
    } else {
      this.log(`❌ ${this.engines[engineId].name} disabled`);
      if (menu) menu.style.display = 'none';
    }

    this.updateEngineStats();
  }

  // Execute specific engine with its configuration
  async executeEngine(engineId) {
    if (!this.engines[engineId]?.enabled) {
      this.log(`❌ ${engineId} is disabled`);
      return;
    }

    const config = this.engines[engineId];
    const params = this.collectEngineParams(engineId);
    
    this.log(`🚀 Executing ${config.icon} ${config.name}...`);
    
    try {
      // Call the actual engine execution via rawrz API (works in browser + Electron)
      const api = window.rawrz || window.electronAPI;
      if (!api || !api.executeEngine) {
        throw new Error('No engine execution API available');
      }
      const result = await api.executeEngine(engineId, params);
      this.log(`✅ ${config.name} completed successfully`);
      
      // Display detailed results
      if (result.success && result.data) {
        if (result.data.botPath) {
          this.log(`📁 Generated: ${result.data.botPath}`);
          this.log(`📊 Format: ${result.data.format || 'exe'}`);
          this.log(`📏 Size: ${result.data.size} bytes`);
          
          if (result.data.encrypted) {
            this.log(`🔐 Encrypted with RAWRZ1`);
            this.log(`🔑 Key: ${result.data.key}`);
            this.log(`🧪 Ready for Jotti testing!`);
          }
        } else if (result.data.status) {
          this.log(`📋 Status: ${result.data.status}`);
        }
        
        // Show any additional data
        Object.entries(result.data).forEach(([key, value]) => {
          if (!['botPath', 'format', 'size', 'encrypted', 'key', 'status'].includes(key)) {
            this.log(`🔧 ${key}: ${value}`);
          }
        });
      } else {
        this.log(`📋 Result: ${JSON.stringify(result, null, 2)}`);
      }
      
      this.updateStats('generatedPayloads', 1);
    } catch (error) {
      this.log(`❌ ${config.name} failed: ${error.message}`);
    }
  }

  // Collect parameters from engine menu
  collectEngineParams(engineId) {
    const config = this.engines[engineId];
    const params = {};

    Object.entries(config.menu).forEach(([key, field]) => {
      const fieldId = `${engineId}-${key}`;
      
      switch (field.type) {
        case 'text':
        case 'number':
        case 'file':
          const input = document.getElementById(fieldId);
          if (input) params[key] = input.value;
          break;

        case 'select':
          const select = document.getElementById(fieldId);
          if (select) params[key] = select.value;
          break;

        case 'checkbox':
          const checkbox = document.getElementById(fieldId);
          if (checkbox) params[key] = checkbox.checked;
          break;

        case 'checkboxes':
          const checkboxes = document.querySelectorAll(`[id^="${fieldId}-"]:checked`);
          params[key] = Array.from(checkboxes).map(cb => cb.value);
          break;
      }
    });

    return params;
  }

  // Clear engine configuration
  clearEngineConfig(engineId) {
    const config = this.engines[engineId];
    
    Object.keys(config.menu).forEach(key => {
      const fieldId = `${engineId}-${key}`;
      const element = document.getElementById(fieldId);
      
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = false;
        } else {
          element.value = '';
        }
      }
    });

    this.log(`🧹 ${config.name} configuration cleared`);
  }

  // Browse for files
  async browseFile(fieldId, mode = 'open') {
    try {
      const api = window.rawrz || window.electronAPI;
      if (!api) throw new Error('No file API available');
      
      let filePath;
      if (mode === 'save') {
        filePath = api.saveFile ? await api.saveFile() : await api.selectFile();
      } else {
        filePath = await api.selectFile();
      }
      
      if (filePath) {
        document.getElementById(fieldId).value = filePath;
        this.log(`📁 Selected: ${filePath}`);
      }
    } catch (error) {
      this.log(`❌ File selection failed: ${error.message}`);
    }
  }

  // Update engine statistics
  updateEngineStats() {
    const enabled = Object.values(this.engines).filter(e => e.enabled).length;
    const total = Object.keys(this.engines).length;
    
    const statsElement = document.getElementById('engineStats');
    if (statsElement) {
      statsElement.textContent = `${enabled}/${total} engines active`;
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // Global functions for onclick handlers
    window.engineManager = this;
    window.browseFile = (fieldId, mode) => this.browseFile(fieldId, mode);
    window.executeEngine = (engineId) => this.executeEngine(engineId);
    window.clearEngineConfig = (engineId) => this.clearEngineConfig(engineId);
  }

  // Logging function
  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logElement = document.getElementById('output');
    if (logElement) {
      logElement.innerHTML += `<div>[${timestamp}] ${message}</div>`;
      logElement.scrollTop = logElement.scrollHeight;
    }
    console.log(`[${timestamp}] ${message}`);
  }

  // Update statistics
  updateStats(statId, increment = 1) {
    const element = document.getElementById(statId);
    if (element) {
      const current = parseInt(element.textContent, 10) || 0;
      element.textContent = current + increment;
    }
  }
}

// Initialize engine manager when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  window.engineManager = new EngineManager();
  await window.engineManager.initialize();
});