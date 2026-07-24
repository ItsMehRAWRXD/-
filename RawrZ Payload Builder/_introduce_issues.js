const fs = require('fs');

// Introduce some issues for code dorks to find
let renderer = fs.readFileSync('src/renderer.js', 'utf8');

// Add unhandled promise
renderer = renderer.replace(
  "const result = await window.electronAPI.selectFile();",
  "const result = await window.electronAPI.selectFile().then(r => r).catch(err => console.error(err)),); // BAD: empty catch"
);

// Add setInterval without clearInterval
renderer = renderer + "\n\n// BAD CODE: setInterval without cleanup\nsetInterval(() => console.log('tick'), 1000);\n";

fs.writeFileSync('src/renderer.js', renderer);
console.log('💥 Introduced issues:');
console.log('   - Unhandled promise with empty catch');
console.log('   - setInterval without clearInterval');
console.log('   Run with D hotkey to scan and fix!');
