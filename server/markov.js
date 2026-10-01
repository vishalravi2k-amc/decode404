/**
 * Decode404 - Markov Chain Transition Probability Engine with Laplace Smoothing
 * 
 * Predicts next-state failure transitions and system risk vectors across
 * operational states: NORMAL -> DEGRADED -> CRITICAL -> FAILURE -> RECOVERY.
 * 
 * Uses Laplace (add-alpha) smoothing to prevent zero-probability traps:
 * P(S_j | S_i) = (Count(S_i -> S_j) + alpha) / (Sum_k(Count(S_i -> S_k)) + K * alpha)
 */

const STATES = {
  NORMAL: 'NORMAL',
  DEGRADED: 'DEGRADED',
  CRITICAL: 'CRITICAL',
  FAILURE: 'FAILURE',
  RECOVERY: 'RECOVERY'
};

const STATE_LIST = [
  STATES.NORMAL,
  STATES.DEGRADED,
  STATES.CRITICAL,
  STATES.FAILURE,
  STATES.RECOVERY
];

class MarkovFailurePredictor {
  constructor(alpha = 1.0) {
    this.alpha = alpha; // Laplace smoothing parameter
    this.states = STATE_LIST;
    this.K = this.states.length; // Number of states
    this.currentState = STATES.NORMAL;
    this.history = [];
    this.maxHistory = 100;

    // Initialize empirical transition count matrix C[fromState][toState]
    this.transitionCounts = {};
    for (const fromState of this.states) {
      this.transitionCounts[fromState] = {};
      for (const toState of this.states) {
        this.transitionCounts[fromState][toState] = 0;
      }
    }

    // Seed realistic operational priors (DevOps baseline distribution)
    this.seedPriors();
  }

  seedPriors() {
    // NORMAL tends to stay NORMAL (80), sometimes DEGRADED (8), rarely CRITICAL (1)
    this.transitionCounts[STATES.NORMAL][STATES.NORMAL] += 40;
    this.transitionCounts[STATES.NORMAL][STATES.DEGRADED] += 5;
    this.transitionCounts[STATES.NORMAL][STATES.CRITICAL] += 1;

    // DEGRADED may return to NORMAL (10), stay DEGRADED (15), or worsen to CRITICAL (15)
    this.transitionCounts[STATES.DEGRADED][STATES.NORMAL] += 8;
    this.transitionCounts[STATES.DEGRADED][STATES.DEGRADED] += 12;
    this.transitionCounts[STATES.DEGRADED][STATES.CRITICAL] += 10;
    this.transitionCounts[STATES.DEGRADED][STATES.FAILURE] += 2;

    // CRITICAL escalates to FAILURE (20), triggers RECOVERY (15), or stays CRITICAL (8)
    this.transitionCounts[STATES.CRITICAL][STATES.CRITICAL] += 6;
    this.transitionCounts[STATES.CRITICAL][STATES.FAILURE] += 18;
    this.transitionCounts[STATES.CRITICAL][STATES.RECOVERY] += 14;

    // FAILURE moves to RECOVERY (25), stays in FAILURE (5)
    this.transitionCounts[STATES.FAILURE][STATES.FAILURE] += 4;
    this.transitionCounts[STATES.FAILURE][STATES.RECOVERY] += 20;

    // RECOVERY returns to NORMAL (20), DEGRADED (6), or re-fails to CRITICAL (2)
    this.transitionCounts[STATES.RECOVERY][STATES.NORMAL] += 18;
    this.transitionCounts[STATES.RECOVERY][STATES.DEGRADED] += 5;
    this.transitionCounts[STATES.RECOVERY][STATES.CRITICAL] += 2;
  }

  /**
   * Determine the current discrete operational state from live telemetry and Z-score
   */
  classifyState(telemetry, zScore) {
    const { cpu, errorRate } = telemetry;
    const absZ = Math.abs(zScore);

    if (errorRate >= 25 || (cpu >= 95 && absZ > 3.5)) {
      return STATES.FAILURE;
    }
    if (absZ >= 2.0 || cpu >= 85 || errorRate >= 8) {
      return STATES.CRITICAL;
    }
    if (absZ >= 1.4 || cpu >= 70 || errorRate >= 3) {
      return STATES.DEGRADED;
    }
    return STATES.NORMAL;
  }

  /**
   * Record a new observed state and update the transition matrix
   */
  observeTransition(nextState) {
    if (this.states.includes(nextState)) {
      const fromState = this.currentState;
      this.transitionCounts[fromState][nextState] += 1;
      this.currentState = nextState;
      this.history.push({ from: fromState, to: nextState, timestamp: Date.now() });
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }
    return this.predictNextState();
  }

  /**
   * Compute the transition probability row for a given state with Laplace smoothing:
   * P(S_j | S_i) = (Count(S_i -> S_j) + alpha) / (Sum_k(Count(S_i -> S_k)) + K * alpha)
   */
  getTransitionDistribution(fromState = this.currentState) {
    const counts = this.transitionCounts[fromState] || {};
    const totalTransitionsFromState = Object.values(counts).reduce((sum, c) => sum + c, 0);
    const denominator = totalTransitionsFromState + (this.K * this.alpha);

    const distribution = {};
    for (const toState of this.states) {
      const count = counts[toState] || 0;
      const prob = (count + this.alpha) / denominator;
      distribution[toState] = Number(prob.toFixed(4));
    }

    return distribution;
  }

  /**
   * Generate comprehensive next-state prediction and failure risk metrics
   */
  predictNextState(fromState = this.currentState) {
    const distribution = this.getTransitionDistribution(fromState);

    let mostLikelyState = this.states[0];
    let highestProb = -1;

    for (const [state, prob] of Object.entries(distribution)) {
      if (prob > highestProb) {
        highestProb = prob;
        mostLikelyState = state;
      }
    }

    // Compute Composite Failure Risk Probability
    // Risk = P(CRITICAL) * 0.5 + P(FAILURE) * 1.0
    const pCritical = distribution[STATES.CRITICAL] || 0;
    const pFailure = distribution[STATES.FAILURE] || 0;
    const pDegraded = distribution[STATES.DEGRADED] || 0;
    const failureRisk = Number(((pCritical * 0.6) + (pFailure * 1.0) + (pDegraded * 0.2)).toFixed(3));

    return {
      currentState: this.currentState,
      predictedNextState: mostLikelyState,
      confidence: Number(highestProb.toFixed(3)),
      failureRisk,
      probabilities: distribution,
      matrix: this.getFullTransitionMatrix()
    };
  }

  /**
   * Returns the entire normalized transition matrix
   */
  getFullTransitionMatrix() {
    const matrix = {};
    for (const state of this.states) {
      matrix[state] = this.getTransitionDistribution(state);
    }
    return matrix;
  }

  forceState(state) {
    if (this.states.includes(state)) {
      this.currentState = state;
    }
  }

  reset() {
    this.currentState = STATES.NORMAL;
    this.history = [];
    for (const fromState of this.states) {
      for (const toState of this.states) {
        this.transitionCounts[fromState][toState] = 0;
      }
    }
    this.seedPriors();
  }
}

module.exports = {
  STATES,
  STATE_LIST,
  MarkovFailurePredictor
};
