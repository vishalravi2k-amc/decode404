/**
 * Decode404 - Real-Time Telemetry & Chaos Simulation Engine
 * 
 * Orchestrates Welford Z-score tracking, Markov state transitions,
 * chaos injection scenarios, and real-time Chroma semantic remediation lookups.
 */

const { TelemetryAnomalyEngine } = require('./welford');
const { MarkovFailurePredictor, STATES } = require('./markov');

class TelemetryEngine {
  constructor(chromaService) {
    this.chroma = chromaService;
    this.anomalyEngine = new TelemetryAnomalyEngine();
    this.markov = new MarkovFailurePredictor(1.0); // Laplace alpha = 1.0

    this.chaosActive = false;
    this.chaosScenario = null; // 'db_leak' | 'race_condition' | 'cache_stampede'
    this.mitigationApplied = false;

    // Baseline telemetry initial values
    this.currentTelemetry = {
      cpu: 32.5,
      latency: 48.0,
      errorRate: 0.2,
      memory: 45.0,
      activeConnections: 120
    };

    this.tickCount = 0;
    this.lastChromaResult = null;
    this.lastAnomalyTimestamp = null;
  }

  setChaos(enabled, scenario = 'race_condition') {
    this.chaosActive = Boolean(enabled);
    this.chaosScenario = this.chaosActive ? scenario : null;
    this.mitigationApplied = false;

    if (!this.chaosActive) {
      this.resetBaseline();
    }
  }

  applyMitigation() {
    this.mitigationApplied = true;
    this.chaosActive = false;
    this.markov.observeTransition(STATES.RECOVERY);
  }

  resetBaseline() {
    this.chaosActive = false;
    this.chaosScenario = null;
    this.mitigationApplied = false;
    this.anomalyEngine.resetAll();
    this.currentTelemetry = {
      cpu: 34.0,
      latency: 45.0,
      errorRate: 0.1,
      memory: 44.0,
      activeConnections: 110
    };
    this.markov.observeTransition(STATES.NORMAL);
  }

  /**
   * Generates next telemetry tick with realistic statistical distribution & noise
   */
  generateTickMetrics() {
    this.tickCount++;

    if (this.mitigationApplied) {
      // System cooling down to nominal
      this.currentTelemetry.cpu = Math.max(30, this.currentTelemetry.cpu - 8.5);
      this.currentTelemetry.latency = Math.max(45, this.currentTelemetry.latency - 60);
      this.currentTelemetry.errorRate = Math.max(0.1, this.currentTelemetry.errorRate - 3.5);
      this.currentTelemetry.memory = Math.max(42, this.currentTelemetry.memory - 4.0);

      if (this.currentTelemetry.cpu <= 42 && this.currentTelemetry.errorRate <= 1.0) {
        this.mitigationApplied = false;
        this.markov.observeTransition(STATES.NORMAL);
      }
      return this.currentTelemetry;
    }

    if (this.chaosActive) {
      // Synthesize specific incident failure patterns
      if (this.chaosScenario === 'db_leak') {
        this.currentTelemetry.cpu = Math.min(98, this.currentTelemetry.cpu + (Math.random() * 8 + 4));
        this.currentTelemetry.latency = Math.min(1850, this.currentTelemetry.latency + (Math.random() * 220 + 80));
        this.currentTelemetry.errorRate = Math.min(32.0, this.currentTelemetry.errorRate + (Math.random() * 3 + 1));
        this.currentTelemetry.activeConnections = Math.min(950, this.currentTelemetry.activeConnections + 75);
      } else if (this.chaosScenario === 'cache_stampede') {
        this.currentTelemetry.cpu = Math.min(96, this.currentTelemetry.cpu + (Math.random() * 12 + 6));
        this.currentTelemetry.latency = Math.min(1200, this.currentTelemetry.latency + (Math.random() * 150 + 50));
        this.currentTelemetry.errorRate = Math.min(18.0, this.currentTelemetry.errorRate + (Math.random() * 2.5 + 0.5));
      } else {
        // Default: deployment race condition
        this.currentTelemetry.cpu = Math.min(94, this.currentTelemetry.cpu + (Math.random() * 9 + 3));
        this.currentTelemetry.latency = Math.min(1450, this.currentTelemetry.latency + (Math.random() * 180 + 60));
        this.currentTelemetry.errorRate = Math.min(28.0, this.currentTelemetry.errorRate + (Math.random() * 4 + 1.5));
      }
    } else {
      // Normal Brownian motion jitter around healthy baseline
      const jitter = () => (Math.random() - 0.5) * 2;
      this.currentTelemetry.cpu = Math.min(58, Math.max(24, 35 + jitter() * 4));
      this.currentTelemetry.latency = Math.min(95, Math.max(35, 50 + jitter() * 7));
      this.currentTelemetry.errorRate = Math.min(1.2, Math.max(0.05, 0.25 + Math.abs(jitter()) * 0.15));
      this.currentTelemetry.memory = Math.min(62, Math.max(40, 46 + jitter() * 2));
      this.currentTelemetry.activeConnections = Math.round(120 + jitter() * 15);
    }

    return {
      cpu: Number(this.currentTelemetry.cpu.toFixed(1)),
      latency: Number(this.currentTelemetry.latency.toFixed(1)),
      errorRate: Number(this.currentTelemetry.errorRate.toFixed(2)),
      memory: Number(this.currentTelemetry.memory.toFixed(1)),
      activeConnections: this.currentTelemetry.activeConnections
    };
  }

  /**
   * Main simulation tick: updates Welford, updates Markov, performs Chroma lookups on anomalies
   */
  async tick() {
    const rawMetrics = this.generateTickMetrics();

    // 1. Process metrics through Welford's Online Algorithm
    const welfordResult = this.anomalyEngine.processTick(rawMetrics);
    const cpuStats = welfordResult.metrics.cpu;
    const latencyStats = welfordResult.metrics.latency;
    const errorStats = welfordResult.metrics.errorRate;

    // 2. Classify state and feed Markov Chain
    const observedState = this.mitigationApplied
      ? STATES.RECOVERY
      : this.markov.classifyState(rawMetrics, welfordResult.highestZScore);
    
    const markovPrediction = this.markov.observeTransition(observedState);

    // 3. Determine status
    let status = "NOMINAL";
    let alertLevel = "info";

    if (welfordResult.hasAnomaly || observedState === STATES.CRITICAL || observedState === STATES.FAILURE) {
      status = "ANOMALY_DETECTED";
      alertLevel = "critical";
    } else if (observedState === STATES.DEGRADED) {
      status = "DEGRADED_PERFORMANCE";
      alertLevel = "warning";
    } else if (observedState === STATES.RECOVERY) {
      status = "RECOVERY_IN_PROGRESS";
      alertLevel = "notice";
    }

    // 4. Chroma Cloud Semantic Query on Anomaly
    let chromaMatches = [];
    if (status === "ANOMALY_DETECTED") {
      let queryPrompt = "";
      if (this.chaosScenario === 'db_leak') {
        queryPrompt = `Database connection pool exhaustion unclosed Prisma connections latency ${rawMetrics.latency}ms`;
      } else if (this.chaosScenario === 'cache_stampede') {
        queryPrompt = `Redis token cache stampede auth gateway CPU spike ${rawMetrics.cpu}% latency ${rawMetrics.latency}ms`;
      } else {
        queryPrompt = `Deployment race condition leading to 500 internal server errors on checkout route CPU ${rawMetrics.cpu}%`;
      }

      try {
        const queryRes = await this.chroma.findSimilarIncidents(queryPrompt, 2);
        this.lastChromaResult = queryRes;
        chromaMatches = queryRes.matches || [];
        this.lastAnomalyTimestamp = new Date().toISOString();
      } catch (e) {
        console.error('[TelemetryEngine] Chroma search error:', e.message);
      }
    } else if (this.lastChromaResult && this.lastChromaResult.matches) {
      // Keep last matched reference visible for context
      chromaMatches = this.lastChromaResult.matches;
    }

    const payload = {
      timestamp: new Date().toLocaleTimeString(),
      status,
      alertLevel,
      chaosActive: this.chaosActive,
      chaosScenario: this.chaosScenario,
      mitigationApplied: this.mitigationApplied,
      metrics: {
        cpu: rawMetrics.cpu,
        latency: rawMetrics.latency,
        errorRate: rawMetrics.errorRate,
        memory: rawMetrics.memory,
        activeConnections: rawMetrics.activeConnections,
        zScore: welfordResult.highestZScore,
        cpuZScore: cpuStats ? cpuStats.zScore : 0,
        latencyZScore: latencyStats ? latencyStats.zScore : 0,
        errorZScore: errorStats ? errorStats.zScore : 0
      },
      welford: {
        cpuMean: cpuStats ? cpuStats.mean : 0,
        cpuStdDev: cpuStats ? cpuStats.stdDev : 0,
        sampleCount: cpuStats ? cpuStats.count : 0,
        symptom: welfordResult.primarySymptom
      },
      markov: {
        currentState: markovPrediction.currentState,
        predictedNextState: markovPrediction.predictedNextState,
        confidence: markovPrediction.confidence,
        failureRisk: markovPrediction.failureRisk,
        probabilities: markovPrediction.probabilities,
        matrix: markovPrediction.matrix
      },
      markovProbability: markovPrediction.confidence,
      chroma: {
        matches: chromaMatches,
        lastSearchQuery: this.lastChromaResult ? this.lastChromaResult.query : null,
        source: this.chroma.isCloudActive ? "Chroma Cloud (Live)" : "Chroma Vector Memory",
        lastAnomalyTimestamp: this.lastAnomalyTimestamp
      }
    };

    return payload;
  }
}

module.exports = { TelemetryEngine };
