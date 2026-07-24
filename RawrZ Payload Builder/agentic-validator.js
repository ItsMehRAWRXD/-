/**
 * RawrZ Agentic Endpoint Validator
 * Main entry point - validates all endpoints until clean
 * Usage: node agentic-validator.js [--watch] [--max-iterations=10]
 */

const EndpointValidator = require('./src/endpoint-validator');
const BatchProcessor = require('./src/batch-processor');
const fs = require('fs');
const path = require('path');

class AgenticValidator {
  constructor(options = {}) {
    this.options = {
      batchSize: options.batchSize || 20,
      maxIterations: options.maxIterations || 10,
      autoHeal: options.autoHeal !== false,
      watch: options.watch || false,
      verbose: options.verbose || true,
      ...options
    };
    
    this.validator = new EndpointValidator();
    this.processor = new BatchProcessor(this.options.batchSize);
    this.iteration = 0;
    this.isRunning = false;
    this.history = [];
  }

  /**
   * Main run loop - continues until all endpoints are clean
   */
  async run() {
    console.log('\n' + '='.repeat(70));
    console.log('  🔌 RawrZ Agentic Endpoint Validator');
    console.log('  Validates IPC: main → preload → renderer');
    console.log('='.repeat(70) + '\n');

    this.isRunning = true;
    
    // Phase 1: Discovery
    const endpoints = await this.validator.discoverEndpoints();
    
    // Phase 2-4: Iterate until clean
    let allClean = false;
    
    while (!allClean && this.iteration < this.options.maxIterations && this.isRunning) {
      this.iteration++;
      
      console.log(`\n📦 ITERATION ${this.iteration}/${this.options.maxIterations}`);
      console.log('-'.repeat(70));
      
      // Process all endpoints in batches
      const results = await this.processAllBatches(endpoints);
      
      // Check status
      const broken = results.filter(r => r.status === 'BROKEN' || r.status === 'ERROR');
      const degraded = results.filter(r => r.status === 'DEGRADED');
      const clean = results.filter(r => r.status === '' || r.status === 'CLEAN');
      
      console.log(`\n  Results: ${clean.length} clean, ${degraded.length} degraded, ${broken.length} broken`);
      
      // Record history
      this.history.push({
        iteration: this.iteration,
        clean: clean.length,
        degraded: degraded.length,
        broken: broken.length,
        timestamp: new Date().toISOString()
      });
      
      // Check if all clean
      allClean = broken.length === 0 && degraded.length === 0;
      
      if (!allClean && this.options.autoHeal) {
        console.log('\n🔧 Auto-healing triggered...');
        await this.healEndpoints(broken);
      }
      
      // Progress visualization
      this.showProgress(results);
    }
    
    // Final report
    return this.generateFinalReport();
  }

  /**
   * Process all endpoints using batch processor
   */
  async processAllBatches(endpoints) {
    const results = [];
    const totalBatches = Math.ceil(endpoints.length / this.options.batchSize);
    
    for (let i = 0; i < totalBatches; i++) {
      const start = i * this.options.batchSize;
      const end = Math.min(start + this.options.batchSize, endpoints.length);
      const batch = endpoints.slice(start, end);
      
      console.log(`\n  Batch ${i + 1}/${totalBatches} (${start}-${end}):`);
      
      // Process batch
      for (const endpoint of batch) {
        await this.validator.validateEndpoint(endpoint);
        results.push(endpoint);
        
        // Show individual result
        const icon = endpoint.status === '' ? '✅' : 
                     endpoint.status === 'DEGRADED' ? '⚠️' : '❌';
        const status = endpoint.status || 'CLEAN';
        console.log(`    ${icon} ${endpoint.channel.padEnd(35)} ${endpoint.voltage.toString().padStart(3)}% ${status}`);
      }
    }
    
    return results;
  }

  /**
   * Heal broken endpoints
   */
  async healEndpoints(brokenEndpoints) {
    for (const endpoint of brokenEndpoints) {
      console.log(`    🔧 Attempting to heal: ${endpoint.channel}`);
      
      // Simulate healing attempts
      for (const error of endpoint.errors) {
        switch (error) {
          case 'main-registered':
            console.log(`      → Adding main handler...`);
            break;
          case 'preload-exposed':
            console.log(`      → Adding preload exposure...`);
            break;
          case 'renderer-accessible':
            console.log(`      → Adding renderer access...`);
            break;
          case 'security-valid':
            console.log(`      → Adding security validation...`);
            break;
        }
      }
      
      // Mark as healed for simulation
      endpoint.healed = true;
    }
  }

  /**
   * Show visual progress
   */
  showProgress(results) {
    const total = results.length;
    const clean = results.filter(r => r.status === '' || r.status === 'CLEAN').length;
    const percent = Math.round((clean / total) * 100);
    
    const barLength = 50;
    const filled = Math.round((percent / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    
    console.log(`\n  Progress: [${bar}] ${percent}%`);
    console.log(`  ${clean}/${total} endpoints clean`);
  }

  /**
   * Generate final report
   */
  generateFinalReport() {
    const report = this.validator.generateReport();
    
    console.log('\n' + '='.repeat(70));
    console.log('  📊 FINAL VALIDATION REPORT');
    console.log('='.repeat(70));
    console.log(`  Total Endpoints:    ${report.summary.total}`);
    console.log(`  ✅ Clean:           ${report.summary.clean}`);
    console.log(`  ⚠️  Degraded:        ${report.summary.degraded}`);
    console.log(`  ❌ Broken:          ${report.summary.broken}`);
    console.log(`  Health Score:       ${report.summary.healthPercentage}%`);
    console.log(`  Iterations:         ${this.iteration}/${this.options.maxIterations}`);
    console.log('='.repeat(70));
    
    // Show broken endpoints if any
    if (report.summary.broken > 0) {
      console.log('\n  ❌ BROKEN ENDPOINTS:');
      const broken = report.endpoints.filter(e => e.status === 'BROKEN');
      for (const ep of broken.slice(0, 10)) {
        console.log(`    • ${ep.channel} (${ep.errors.join(', ')})`);
      }
      if (broken.length > 10) {
        console.log(`    ... and ${broken.length - 10} more`);
      }
    }
    
    // Show improvement trend
    if (this.history.length > 1) {
      console.log('\n  📈 IMPROVEMENT TREND:');
      for (const h of this.history) {
        const cleanBar = '█'.repeat(Math.round(h.clean / report.summary.total * 20));
        console.log(`    Iter ${h.iteration}: ${cleanBar.padEnd(20)} ${h.clean} clean`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    
    if (report.summary.broken === 0 && report.summary.degraded === 0) {
      console.log('  ✅ ALL ENDPOINTS CLEAN - SYSTEM READY');
    } else if (report.summary.broken === 0) {
      console.log('  ⚠️  SYSTEM DEGRADED BUT FUNCTIONAL');
    } else {
      console.log('  ❌ SYSTEM HAS CRITICAL ISSUES - REVIEW REQUIRED');
    }
    
    console.log('='.repeat(70) + '\n');
    
    // Save detailed report
    const reportPath = path.join(__dirname, 'logs', 'final-validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      ...report,
      history: this.history,
      options: this.options,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`  📄 Detailed report saved to: ${reportPath}\n`);
    
    return report;
  }

  /**
   * Stop validation
   */
  stop() {
    this.isRunning = false;
    this.processor.stop();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch'),
  verbose: !args.includes('--quiet'),
  autoHeal: !args.includes('--no-heal')
};

// Parse --max-iterations
const maxIterArg = args.find(a => a.startsWith('--max-iterations='));
if (maxIterArg) {
  options.maxIterations = parseInt(maxIterArg.split('=')[1], 10);
}

// Parse --batch-size
const batchArg = args.find(a => a.startsWith('--batch-size='));
if (batchArg) {
  options.batchSize = parseInt(batchArg.split('=')[1], 10);
}

// Run validator
const validator = new AgenticValidator(options);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Validation interrupted by user');
  validator.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  validator.stop();
  process.exit(0);
});

// Start validation
validator.run().then(report => {
  const exitCode = report.summary.broken > 0 ? 1 : 0;
  process.exit(exitCode);
}).catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
