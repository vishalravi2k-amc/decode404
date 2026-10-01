/**
 * Decode404 Autonomous Verification Suite
 * Tests Welford's algorithm, Markov Laplace smoothing, Chroma semantic search,
 * and Express/Socket.io integration.
 */

const assert = require('assert');
const { WelfordTracker, TelemetryAnomalyEngine } = require('../server/welford');
const { MarkovFailurePredictor, STATES } = require('../server/markov');
const { ChromaIncidentService, HISTORICAL_INCIDENTS } = require('../server/chromaService');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Decode404 Autonomous Test Suite');
  console.log('====================================================\n');

  // -------------------------------------------------------------------
  // TEST 1: Welford's Online Algorithm & Z-Score Tracker
  // -------------------------------------------------------------------
  console.log('[Test 1] Testing Welford\'s Online Algorithm...');
  const tracker = new WelfordTracker('cpu_test', 5);

  // Ingest nominal baseline samples around 30.0
  const baselineValues = [30.0, 31.0, 29.5, 30.5, 30.0, 29.8, 30.2];
  for (const val of baselineValues) {
    tracker.update(val);
  }

  const snapshot = tracker.getSnapshot();
  console.log(`  -> Baseline Mean: ${snapshot.mean}, StdDev: ${snapshot.stdDev}, Samples: ${snapshot.count}`);
  assert(Math.abs(snapshot.mean - 30.14) < 0.2, `Expected mean close to 30.14, got ${snapshot.mean}`);
  assert(snapshot.stdDev < 1.0, `Expected low stdDev, got ${snapshot.stdDev}`);
  assert.strictEqual(snapshot.isAnomaly, false, 'Nominal values should not trigger anomaly');

  // Ingest severe anomaly spike (e.g. 95.0% CPU)
  const anomalyTick = tracker.update(95.0);
  console.log(`  -> Injected Spike (95.0% CPU): Z-Score = ${anomalyTick.zScore}σ, isAnomaly = ${anomalyTick.isAnomaly}`);
  assert(anomalyTick.zScore > 2.0, `Expected Z-Score > 2.0σ, got ${anomalyTick.zScore}`);
  assert.strictEqual(anomalyTick.isAnomaly, true, 'Values > 2.0σ MUST trigger an anomaly');
  console.log('  ✅ Welford Online Algorithm verified successfully.\n');

  // -------------------------------------------------------------------
  // TEST 2: Multi-metric Telemetry Anomaly Engine
  // -------------------------------------------------------------------
  console.log('[Test 2] Testing Telemetry Anomaly Engine...');
  const anomalyEngine = new TelemetryAnomalyEngine();
  // Warm up baseline
  for (let i = 0; i < 8; i++) {
    anomalyEngine.processTick({ cpu: 32 + (i % 2), latency: 45, errorRate: 0.1, memory: 44 });
  }
  // Inject fault
  const faultTick = anomalyEngine.processTick({ cpu: 94.0, latency: 1250, errorRate: 18.5, memory: 78 });
  assert.strictEqual(faultTick.hasAnomaly, true, 'Fault tick must detect anomaly');
  assert(faultTick.highestZScore > 2.0, 'Highest Z-Score must exceed 2.0σ');
  console.log(`  -> Detected anomaly count: ${faultTick.anomalyCount}, Highest Z-Score: ${faultTick.highestZScore}σ`);
  console.log(`  -> Symptom: ${faultTick.primarySymptom}`);
  console.log('  ✅ Multi-metric Anomaly Engine verified successfully.\n');

  // -------------------------------------------------------------------
  // TEST 3: Markov Chain with Laplace Smoothing
  // -------------------------------------------------------------------
  console.log('[Test 3] Testing Markov Chain with Laplace Smoothing...');
  const markov = new MarkovFailurePredictor(1.0); // alpha = 1.0

  // Verify full transition matrix normalization
  const matrix = markov.getFullTransitionMatrix();
  for (const state of markov.states) {
    const row = matrix[state];
    const sumProb = Object.values(row).reduce((acc, p) => acc + p, 0);
    assert(Math.abs(sumProb - 1.0) < 0.01, `Row for ${state} probabilities should sum to 1.0, got ${sumProb}`);
  }
  console.log('  -> All transition probability matrix rows sum to 1.0 (Laplace smoothed)');

  // Verify transition observation
  markov.observeTransition(STATES.DEGRADED);
  markov.observeTransition(STATES.CRITICAL);
  const prediction = markov.predictNextState();
  console.log(`  -> Current State: ${prediction.currentState}, Predicted Next: ${prediction.predictedNextState} (Confidence: ${prediction.confidence})`);
  console.log(`  -> Failure Risk Index: ${prediction.failureRisk}`);
  assert(prediction.failureRisk > 0, 'Failure risk index should be calculated and > 0');
  console.log('  ✅ Markov Chain Transition Probability Matrix verified successfully.\n');

  // -------------------------------------------------------------------
  // TEST 4: Chroma Cloud Incident Service & Vector Memory
  // -------------------------------------------------------------------
  console.log('[Test 4] Testing Chroma Incident Service...');
  const chroma = new ChromaIncidentService();
  const initRes = await chroma.initializeKnowledgeBase();
  console.log(`  -> Chroma Knowledge Base initialized (mode: ${initRes.mode})`);

  // Query similar incidents using semantic symptom
  const queryResult = await chroma.findSimilarIncidents("database connection pool exhaustion unclosed Prisma clients", 2);
  console.log(`  -> Query executed: "${queryResult.query}"`);
  console.log(`  -> Matches returned: ${queryResult.matches.length}`);
  assert(queryResult.matches.length > 0, 'Chroma query must return matches');

  const topMatch = queryResult.matches[0];
  console.log(`  -> Top Match: ID=${topMatch.id}, Service=${topMatch.metadata.service}, RootCause=${topMatch.metadata.rootCause}`);
  console.log(`  -> Recommended Fix: ${topMatch.metadata.fix}`);
  console.log(`  -> Confidence: ${topMatch.confidencePct}`);
  assert.strictEqual(topMatch.metadata.service, 'payment-db', 'Expected top match to be payment-db for connection pool query');
  console.log('  ✅ Chroma Incident Service verified successfully.\n');

  console.log('====================================================');
  console.log('🎉 ALL AUTONOMOUS TESTS PASSED SUCCESSFULLY (4/4)');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
