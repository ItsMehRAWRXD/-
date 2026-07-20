// Quick Audit - Run this in browser console to check for missing elements
// Usage: Copy/paste this entire code into browser console

(function quickAudit() {
  console.log('🔍 Quick RawrZ Audit Starting...\n');
  
  const results = {
    missing: [],
    found: [],
    errors: []
  };
  
  // Check critical DOM elements
  const criticalElements = [
    'selectFile', 'selectFiles', 'selectDir',
    'encryptBtn', 'decryptBtn',
    'loadEngines',
    'browsePayload', 'browseOutput', 'generateStub',
    'output'
  ];
  
  console.log('📋 Checking Critical DOM Elements:');
  criticalElements.forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      results.found.push(id);
      console.log(`  ✅ #${id}`);
    } else {
      results.missing.push(id);
      console.log(`  ❌ #${id} - MISSING`);
    }
  });
  
  // Check global APIs
  console.log('\n🌐 Checking Global APIs:');
  
  if (window.electronAPI) {
    console.log('  ✅ window.electronAPI');
    
    const apiMethods = ['selectFile', 'selectFiles', 'selectDirectory', 'generateStub'];
    apiMethods.forEach(method => {
      if (typeof window.electronAPI[method] === 'function') {
        console.log(`    ✅ electronAPI.${method}`);
      } else {
        console.log(`    ❌ electronAPI.${method} - NOT A FUNCTION`);
        results.errors.push(`electronAPI.${method} not a function`);
      }
    });
  } else {
    console.log('  ❌ window.electronAPI - NOT DEFINED');
    results.errors.push('window.electronAPI not defined');
  }
  
  if (window.rawrz) {
    console.log('  ✅ window.rawrz');
  } else {
    console.log('  ⚠️ window.rawrz - not defined (optional)');
  }
  
  // Check for require (Node.js context)
  console.log('\n📦 Checking Node.js Context:');
  if (typeof require !== 'undefined') {
    console.log('  ✅ require() available');
  } else {
    console.log('  ❌ require() - NOT AVAILABLE (running in browser context?)');
    results.errors.push('require() not available - not in Node.js/Electron context');
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 AUDIT SUMMARY:');
  console.log(`  Elements Found: ${results.found.length}/${criticalElements.length}`);
  console.log(`  Elements Missing: ${results.missing.length}`);
  console.log(`  API Errors: ${results.errors.length}`);
  
  if (results.missing.length > 0) {
    console.log('\n❌ MISSING ELEMENTS:');
    results.missing.forEach(id => console.log(`    - #${id}`));
  }
  
  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach(err => console.log(`    - ${err}`));
  }
  
  if (results.missing.length === 0 && results.errors.length === 0) {
    console.log('\n✅ All checks passed!');
  }
  
  console.log('='.repeat(50));
  
  // Return results for programmatic use
  window.quickAuditResults = results;
  return results;
})();
