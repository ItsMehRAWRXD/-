// ═══════════════════════════════════════════════════════════════════════════
// RAWRZ PANEL COMMON — shared bootstrap for all panels
// Include AFTER agentic-beacon-framework.js
// Provides: initializeAgenticControls, updateBeaconStatus, displayAgenticResult,
//           displayError, getBeaconIcon, startAutonomousMonitoring,
//           performAutonomousActions, executeWin32Operation, applyHotPatch,
//           reconnectBeacon, getSystemStatus, emergencyLockdown,
//           toggleAutonomousMode, exportSessionData
// ═══════════════════════════════════════════════════════════════════════════

(function (global) {
    'use strict';

    // ── Bootstrap agenticBeaconManager if missing ─────────────────────────
    if (!global.agenticBeaconManager) {
        global.agenticBeaconManager = {
            getBeaconStatus: () => ({
                encryption: { connected: false, lastSeen: null },
                native: { connected: false, lastSeen: null },
                java: { connected: false, lastSeen: null },
                dotnet: { connected: false, lastSeen: null },
                web: { connected: false, lastSeen: null }
            }),
            getSystemStatus: async () => ({
                beacons: global.agenticBeaconManager.getBeaconStatus(),
                performance: { cpu: 0, memory: 0 }
            }),
            checkBeaconHealth: async () => ({}),
            reconnectBeacon: async (type) => ({ success: true, type }),
            optimizePerformance: async (target) => ({ success: true, target }),
            executeWin32Operation: async (operation, params) => {
                if (typeof window !== 'undefined' && window.electronAPI?.executeWin32Operation) {
                    return await window.electronAPI.executeWin32Operation(operation, params);
                }
                return { success: true, operation, params, result: 'Simulated' };
            },
            applyHotPatch: async (target, patch) => ({ success: true, target, patch }),
            emergencyLockdown: async () => ({ success: true, locked: true }),
            toggleAutonomousMode: (enabled) => ({ enabled }),
            exportSessionData: () => ({ exported: true })
        };
        console.log('[Panel Common] Created fallback agenticBeaconManager');
    }

    // ── displayError ──────────────────────────────────────────────────────
    global.displayError = function (msg) {
        console.error('[Panel]', msg);
        const out = document.getElementById('agentic-output');
        if (!out) return;
        const div = document.createElement('div');
        div.className = 'agentic-result';
        div.style.borderColor = '#dc3545';
        div.innerHTML = '<span style="color:#dc3545">ERROR: ' + msg + '</span>';
        out.prepend(div);
    };

    // ── displayAgenticResult ──────────────────────────────────────────────
    global.displayAgenticResult = function (operation, details, result) {
        const out = document.getElementById('agentic-output');
        if (!out) return;
        const ts = new Date().toLocaleTimeString();
        const div = document.createElement('div');
        div.className = 'agentic-result';
        div.innerHTML =
            '<div class="agentic-header">' +
            '<span class="agentic-timestamp">' + ts + '</span>' +
            '<span class="agentic-operation">' + operation + '</span>' +
            '</div>' +
            '<div class="agentic-details">' + details + '</div>' +
            '<div class="agentic-data"><pre>' +
            JSON.stringify(result, null, 2) +
            '</pre></div>';
        out.prepend(div);
    };

    // ── getBeaconIcon ─────────────────────────────────────────────────────
    global.getBeaconIcon = function (type) {
        return { encryption: '🔐', native: '⚙️', java: '☕', dotnet: '🔷', web: '🌐' }[type] || '📡';
    };

    // ── updateBeaconStatus ────────────────────────────────────────────────
    global.updateBeaconStatus = function () {
        const grid = document.getElementById('beacon-grid');
        if (!grid || !global.agenticBeaconManager) return;
        const beacons = global.agenticBeaconManager.getBeaconStatus();
        grid.innerHTML = Object.entries(beacons).map(function (entry) {
            const type = entry[0], status = entry[1];
            const cls = status.connected ? 'beacon-connected' : 'beacon-disconnected';
            const txt = status.connected ? 'Connected' : 'Disconnected';
            return '<div class="beacon-item ' + cls + '">' +
                '<div class="beacon-icon">' + global.getBeaconIcon(type) + '</div>' +
                '<div class="beacon-info">' +
                '<div class="beacon-type">' + type.toUpperCase() + '</div>' +
                '<div class="beacon-status">' + txt + '</div>' +
                '</div></div>';
        }).join('');
    };

    // ── performAutonomousActions ──────────────────────────────────────────
    global.performAutonomousActions = async function () {
        const mgr = global.agenticBeaconManager;
        if (!mgr) return;
        const sys = await mgr.getSystemStatus();
        for (const [type, status] of Object.entries(sys.beacons)) {
            if (!status.connected) await mgr.reconnectBeacon(type);
        }
        if (sys.performance.cpu > 80) await mgr.optimizePerformance('cpu');
        if (sys.performance.memory > 85) await mgr.optimizePerformance('memory');
    };

    // ── startAutonomousMonitoring ─────────────────────────────────────────
    global.startAutonomousMonitoring = function () {
        if (global._autoMonitorInterval) return;
        global._autoMonitorInterval = setInterval(async function () {
            const mgr = global.agenticBeaconManager;
            if (!mgr) return;
            try {
                await mgr.checkBeaconHealth();
                global.updateBeaconStatus();
                const cb = document.getElementById('autonomous-mode');
                if (cb && cb.checked) await global.performAutonomousActions();
            } catch (e) { console.error('Autonomous monitoring:', e); }
        }, 5000);
    };

    global.stopAutonomousMonitoring = function () {
        if (global._autoMonitorInterval) {
            clearInterval(global._autoMonitorInterval);
            global._autoMonitorInterval = null;
        }
    };

    // ── executeWin32Operation ─────────────────────────────────────────────
    global.executeWin32Operation = async function (operation, params) {
        params = params || {};
        const mgr = global.agenticBeaconManager;
        if (!mgr) { global.displayError('agenticBeaconManager not ready'); return; }
        try {
            const result = await mgr.executeWin32Operation(operation, params);
            global.displayAgenticResult('Win32 Operation', operation, result);
            global.updateBeaconStatus();
            return result;
        } catch (e) { global.displayError('Win32 operation failed: ' + e.message); throw e; }
    };

    // ── applyHotPatch ─────────────────────────────────────────────────────
    global.applyHotPatch = async function (targetType, targetId, patchData) {
        const mgr = global.agenticBeaconManager;
        if (!mgr) { global.displayError('agenticBeaconManager not ready'); return; }
        try {
            const result = await mgr.applyHotPatch(targetType, targetId, patchData);
            global.displayAgenticResult('Hot Patch Applied', targetType + ':' + targetId, result);
            global.updateBeaconStatus();
            return result;
        } catch (e) { global.displayError('Hot patch failed: ' + e.message); throw e; }
    };

    // ── reconnectBeacon ───────────────────────────────────────────────────
    global.reconnectBeacon = async function (beaconType) {
        const mgr = global.agenticBeaconManager;
        if (!mgr) return;
        try {
            const result = await mgr.reconnectBeacon(beaconType);
            global.displayAgenticResult('Beacon Reconnected', beaconType, result);
            global.updateBeaconStatus();
        } catch (e) { global.displayError('Beacon reconnection failed: ' + e.message); }
    };

    // ── getSystemStatus ───────────────────────────────────────────────────
    global.getSystemStatus = async function () {
        const mgr = global.agenticBeaconManager;
        if (!mgr) { global.displayError('agenticBeaconManager not ready'); return; }
        try {
            const status = await mgr.getSystemStatus();
            global.displayAgenticResult('System Status', 'Full Report', status);
            return status;
        } catch (e) { global.displayError('System status check failed: ' + e.message); throw e; }
    };

    // ── emergencyLockdown ─────────────────────────────────────────────────
    global.emergencyLockdown = async function () {
        if (!confirm('Initiate emergency lockdown? All beacons will disconnect.')) return;
        const mgr = global.agenticBeaconManager;
        if (!mgr) return;
        try {
            const result = await mgr.emergencyLockdown();
            global.displayAgenticResult('Emergency Lockdown', 'Executed', result);
            const cb = document.getElementById('autonomous-mode');
            if (cb) cb.checked = false;
            global.updateBeaconStatus();
            alert('Emergency lockdown completed.');
        } catch (e) { global.displayError('Emergency lockdown failed: ' + e.message); }
    };

    // ── toggleAutonomousMode ──────────────────────────────────────────────
    global.toggleAutonomousMode = function () {
        const cb = document.getElementById('autonomous-mode');
        if (!cb) return;
        global.displayAgenticResult('Mode Change',
            cb.checked ? 'Autonomous Mode Enabled' : 'Autonomous Mode Disabled',
            { autonomous: cb.checked });
    };

    // ── exportSessionData ─────────────────────────────────────────────────
    global.exportSessionData = async function () {
        const mgr = global.agenticBeaconManager;
        if (!mgr) return;
        try {
            const data = await mgr.exportSessionData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'agentic-session-' + Date.now() + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            global.displayAgenticResult('Session Export', 'Exported', { file: a.download });
        } catch (e) { global.displayError('Session export failed: ' + e.message); }
    };

    // ── initializeAgenticControls ─────────────────────────────────────────
    global.initializeAgenticControls = async function () {
        const mgr = global.agenticBeaconManager;
        const indicator = document.getElementById('agentic-status-indicator');
        const text = document.getElementById('agentic-status-text');

        if (!mgr) {
            if (indicator) indicator.classList.add('offline');
            if (text) text.textContent = 'Error';
            global.displayError('agenticBeaconManager not loaded');
            return;
        }

        try {
            await mgr.initialize();
            await mgr.establishCircularConnectivity();
            global.updateBeaconStatus();
            global.startAutonomousMonitoring();
            if (indicator) indicator.classList.remove('offline');
            if (text) text.textContent = 'Active';
        } catch (e) {
            if (indicator) indicator.classList.add('offline');
            if (text) text.textContent = 'Error';
            global.displayError('Agentic init failed: ' + e.message);
        }
    };

    // ── Auto-bootstrap on DOMContentLoaded ───────────────────────────────
    function boot() {
        // Wire tab buttons (data-tab pattern used across all panels)
        document.querySelectorAll('.nav-tab[data-tab]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                const id = btn.getAttribute('data-tab');
                document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
                document.querySelectorAll('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
                const target = document.getElementById(id);
                if (target) target.classList.add('active');
                btn.classList.add('active');
            });
        });

        // Init agentic controls
        global.initializeAgenticControls();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})(typeof window !== 'undefined' ? window : globalThis);
