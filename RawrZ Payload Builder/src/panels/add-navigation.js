// RawrZ Panel Navigation Injector
// This script adds the shared navigation to all panels
// Run this in the browser console on each panel or use a build process

(function() {
    'use strict';

    // Configuration
    const NAV_CONTAINER_ID = 'rawrz-nav-container';
    const NAV_URL = 'shared-navigation.html';

    // Function to inject navigation
    async function injectNavigation() {
        // Check if navigation already exists
        if (document.getElementById(NAV_CONTAINER_ID)) {
            console.log('[RawrZ Nav] Navigation already exists');
            return;
        }

        try {
            // Fetch the navigation component
            const response = await fetch(NAV_URL);
            if (!response.ok) {
                throw new Error(`Failed to load navigation: ${response.status}`);
            }

            const navHTML = await response.text();

            // Create container
            const container = document.createElement('div');
            container.id = NAV_CONTAINER_ID;
            container.innerHTML = navHTML;

            // Insert at the beginning of body
            document.body.insertBefore(container, document.body.firstChild);

            // Adjust body padding to account for fixed nav
            document.body.style.paddingTop = '120px';

            console.log('[RawrZ Nav] Navigation injected successfully');

        } catch (error) {
            console.error('[RawrZ Nav] Failed to inject navigation:', error);

            // Fallback: Create minimal navigation
            createFallbackNavigation();
        }
    }

    // Fallback navigation if fetch fails
    function createFallbackNavigation() {
        const fallbackNav = document.createElement('div');
        fallbackNav.id = NAV_CONTAINER_ID;
        fallbackNav.innerHTML = `
            <style>
                .rawrz-fallback-nav {
                    background: #0b1020;
                    border-bottom: 2px solid #4a9eff;
                    padding: 1rem;
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    z-index: 1000;
                }
                .rawrz-fallback-nav a {
                    color: #4a9eff;
                    text-decoration: none;
                    margin-right: 15px;
                    font-family: sans-serif;
                }
                .rawrz-fallback-nav a:hover {
                    color: #6ab8ff;
                }
            </style>
            <nav class="rawrz-fallback-nav">
                <a href="index.html">🏠 Dashboard</a>
                <a href="encryption-panel.html">🔐 Encryption</a>
                <a href="payload-panel.html">🚀 Payloads</a>
                <a href="bot-manager.html">🤖 Bots</a>
                <a href="health-dashboard.html">🏥 Health</a>
            </nav>
        `;
        document.body.insertBefore(fallbackNav, document.body.firstChild);
        document.body.style.paddingTop = '60px';
    }

    // Auto-inject on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectNavigation);
    } else {
        injectNavigation();
    }

    // Expose function globally for manual injection
    window.injectRawrzNavigation = injectNavigation;
})();
