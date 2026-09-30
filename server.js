const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple In-Memory Markov Transition State Mock
let markovState = {
  currentState: "error_spike",
  predictions: [
    { state: "database_connections", probability: "85%" },
    { state: "retry_storm", probability: "78%" },
    { state: "cascading_failure", probability: "65%" }
  ]
};

app.get('/api/status', (req, res) => {
  res.json({ status: "running", team: "Decode404", markovState });
});

app.post('/api/trigger-alert', (req, res) => {
  // Simulate anomaly detection (>3σ deviation)
  res.json({
    success: true,
    message: "Synthetic alert triggered successfully!",
    anomaly: { errorRate: "45%", latency: "800ms", deviation: ">3σ" },
    prediction: markovState.predictions,
    kgRecall: "Recalled 2 past cases with 82% structural similarity. Fix: Revert deployment + restart worker processes.",
    sandboxSimulation: { status: "passed", confidence: "90%", estimatedRecoveryTime: "3 mins" }
  });
});

app.listen(PORT, () => {
  console.log(`Decode404 backend running on http://localhost:${PORT}`);
});