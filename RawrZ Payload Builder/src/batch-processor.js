/**
 * RawrZ Batch Processor
 * Processes endpoints in batches of 20 with live monitoring
 */

const EventEmitter = require('events');

class BatchProcessor extends EventEmitter {
  constructor(batchSize = 20) {
    super();
    this.batchSize = batchSize;
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.results = [];
    this.isRunning = false;
    this.stats = {
      processed: 0,
      clean: 0,
      degraded: 0,
      broken: 0,
      healed: 0
    };
  }

  /**
   * Process items in batches
   */
  async processBatches(items, processorFn) {
    this.isRunning = true;
    this.totalBatches = Math.ceil(items.length / this.batchSize);
    this.results = [];
    
    this.emit('start', {
      total: items.length,
      batches: this.totalBatches,
      batchSize: this.batchSize
    });

    for (let i = 0; i < this.totalBatches; i++) {
      if (!this.isRunning) {
        this.emit('stopped', { batch: i });
        break;
      }

      this.currentBatch = i;
      const start = i * this.batchSize;
      const end = Math.min(start + this.batchSize, items.length);
      const batch = items.slice(start, end);

      this.emit('batchStart', {
        batch: i + 1,
        total: this.totalBatches,
        start,
        end,
        items: batch.length
      });

      // Process batch items in parallel
      const batchResults = await Promise.all(
        batch.map(async (item, index) => {
          const globalIndex = start + index;
          const result = await this.processItem(item, globalIndex, processorFn);
          this.emit('itemComplete', { index: globalIndex, result });
          return result;
        })
      );

      this.results.push(...batchResults);
      this.updateStats(batchResults);

      this.emit('batchComplete', {
        batch: i + 1,
        total: this.totalBatches,
        results: batchResults,
        stats: { ...this.stats }
      });

      // Check if we should continue
      const shouldContinue = await this.shouldContinue(batchResults);
      if (!shouldContinue) {
        this.emit('paused', { batch: i + 1, reason: 'threshold_reached' });
        break;
      }

      // Small delay between batches
      await this.sleep(100);
    }

    this.isRunning = false;
    this.emit('complete', {
      total: items.length,
      processed: this.results.length,
      stats: { ...this.stats },
      results: this.results
    });

    return this.results;
  }

  /**
   * Process a single item
   */
  async processItem(item, index, processorFn) {
    const startTime = Date.now();
    
    try {
      const result = await processorFn(item, index);
      
      return {
        item,
        index,
        status: result.status || 'UNKNOWN',
        voltage: result.voltage || 0,
        errors: result.errors || [],
        duration: Date.now() - startTime,
        success: true
      };
    } catch (error) {
      return {
        item,
        index,
        status: 'ERROR',
        voltage: 0,
        errors: [error.message],
        duration: Date.now() - startTime,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update statistics
   */
  updateStats(batchResults) {
    for (const result of batchResults) {
      this.stats.processed++;
      
      if (result.status === '' || result.status === 'CLEAN') {
        this.stats.clean++;
      } else if (result.status === 'DEGRADED') {
        this.stats.degraded++;
      } else if (result.status === 'BROKEN' || result.status === 'ERROR') {
        this.stats.broken++;
      }
      
      if (result.healed) {
        this.stats.healed++;
      }
    }
  }

  /**
   * Determine if processing should continue
   */
  async shouldContinue(batchResults) {
    // Continue if there are broken items that might be healable
    const brokenCount = batchResults.filter(r => 
      r.status === 'BROKEN' || r.status === 'ERROR'
    ).length;
    
    // Always continue if we haven't processed all batches
    return this.currentBatch < this.totalBatches - 1;
  }

  /**
   * Get current progress
   */
  getProgress() {
    return {
      currentBatch: this.currentBatch + 1,
      totalBatches: this.totalBatches,
      percent: Math.round(((this.currentBatch + 1) / this.totalBatches) * 100),
      stats: { ...this.stats },
      isRunning: this.isRunning
    };
  }

  /**
   * Stop processing
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate batch report
   */
  generateReport() {
    const byStatus = this.results.reduce((acc, r) => {
      const status = r.status || 'UNKNOWN';
      acc[status] = acc[status] || [];
      acc[status].push(r);
      return acc;
    }, {});

    const avgVoltage = this.results.length > 0
      ? this.results.reduce((sum, r) => sum + (r.voltage || 0), 0) / this.results.length
      : 0;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        ...this.stats,
        healthPercentage: Math.round((this.stats.clean / this.stats.processed) * 100) || 0,
        averageVoltage: Math.round(avgVoltage)
      },
      byStatus,
      batches: this.totalBatches,
      currentBatch: this.currentBatch
    };
  }
}

module.exports = BatchProcessor;
