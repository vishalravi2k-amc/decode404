/**
 * Decode404 - Welford's Online Algorithm Engine
 * 
 * Computes numerically stable streaming mean, variance, standard deviation,
 * and real-time Z-scores in O(1) time and O(1) memory space.
 * Alerts are triggered whenever |Z| > 2.0 sigma.
 */

class WelfordTracker {
  constructor(name = 'metric', minSamples = 5) {
    this.name = name;
    this.minSamples = minSamples;
    this.reset();
  }

  reset() {
    this.count = 0;
    this.mean = 0.0;
    this.M2 = 0.0; // Sum of squares of differences from current mean
    this.lastValue = 0.0;
    this.lastZScore = 0.0;
  }

  /**
   * Ingest a new metric sample and update running statistics.
   * @param {number} x - Incoming value
   * @returns {Object} Updated statistical snapshot { mean, variance, stdDev, zScore, isAnomaly }
   */
  update(x) {
    this.count += 1;
    this.lastValue = x;

    const delta = x - this.mean;
    this.mean += delta / this.count;
    const delta2 = x - this.mean;
    this.M2 += delta * delta2;

    const variance = this.count > 1 ? this.M2 / (this.count - 1) : 0.0;
    const stdDev = Math.sqrt(Math.max(variance, 0.0));

    // Calculate Z-Score
    let zScore = 0.0;
    if (this.count >= this.minSamples && stdDev > 1e-6) {
      zScore = (x - this.mean) / stdDev;
    }

    this.lastZScore = Number(zScore.toFixed(2));
    const isAnomaly = this.count >= this.minSamples && Math.abs(zScore) > 2.0;

    return {
      name: this.name,
      count: this.count,
      value: Number(x.toFixed(2)),
      mean: Number(this.mean.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      stdDev: Number(stdDev.toFixed(2)),
      zScore: this.lastZScore,
      isAnomaly
    };
  }

  getSnapshot() {
    const variance = this.count > 1 ? this.M2 / (this.count - 1) : 0.0;
    const stdDev = Math.sqrt(Math.max(variance, 0.0));
    return {
      name: this.name,
      count: this.count,
      lastValue: Number(this.lastValue.toFixed(2)),
      mean: Number(this.mean.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      stdDev: Number(stdDev.toFixed(2)),
      zScore: this.lastZScore,
      isAnomaly: this.count >= this.minSamples && Math.abs(this.lastZScore) > 2.0
    };
  }
}

/**
 * Multi-metric Welford Engine for comprehensive telemetry monitoring
 */
class TelemetryAnomalyEngine {
  constructor() {
    this.trackers = {
      cpu: new WelfordTracker('cpu_utilization', 6),
      latency: new WelfordTracker('http_latency_ms', 6),
      errorRate: new WelfordTracker('error_rate_pct', 6),
      memory: new WelfordTracker('memory_utilization', 6)
    };
  }

  /**
   * Ingest all telemetry metrics for a tick.
   * @param {Object} metrics - { cpu, latency, errorRate, memory }
   */
  processTick(metrics) {
    const results = {};
    let anomalyCount = 0;
    let highestZScore = 0.0;
    let primarySymptom = null;

    for (const [key, tracker] of Object.entries(this.trackers)) {
      if (typeof metrics[key] === 'number') {
        const stats = tracker.update(metrics[key]);
        results[key] = stats;
        if (stats.isAnomaly) {
          anomalyCount++;
          if (Math.abs(stats.zScore) > Math.abs(highestZScore)) {
            highestZScore = stats.zScore;
            primarySymptom = `${key.toUpperCase()} spike (${stats.value} vs mean ${stats.mean}, Z=${stats.zScore}σ)`;
          }
        }
      }
    }

    const hasAnomaly = anomalyCount > 0;

    return {
      metrics: results,
      hasAnomaly,
      anomalyCount,
      highestZScore: Number(highestZScore.toFixed(2)),
      primarySymptom: primarySymptom || 'Nominal telemetry operating within baseline'
    };
  }

  resetAll() {
    for (const tracker of Object.values(this.trackers)) {
      tracker.reset();
    }
  }
}

module.exports = {
  WelfordTracker,
  TelemetryAnomalyEngine
};
