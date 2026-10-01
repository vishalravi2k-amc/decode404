/**
 * Decode404 - Autonomous AI Incident Response & Predictive DevOps Platform
 * 
 * Architecture:
 * - Express HTTP API & Static Dashboard hosting
 * - Socket.io real-time streaming engine (1Hz tick)
 * - ChromaClient official Chroma Cloud integration ('decode404_incidents' collection)
 * - Welford's Online Algorithm for streaming Z-score anomaly detection (>2σ)
 * - Markov Chain Transition Probability Matrix with Laplace smoothing
 */

// Load local environment variables if available
try {
  if (process.loadEnvFile) {
    process.loadEnvFile();
  }
} catch (e) {
  // .env file is optional
}

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { ChromaIncidentService, HISTORICAL_INCIDENTS } = require('./server/chromaService');
const { TelemetryEngine } = require('./server/telemetryEngine');
const { WelfordTracker, TelemetryAnomalyEngine } = require('./server/welford');
const { MarkovFailurePredictor, STATES } = require('./server/markov');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Services
const chromaService = new ChromaIncidentService();
const telemetryEngine = new TelemetryEngine(chromaService);

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '2.4-enterprise',
    chroma: chromaService.getStatus(),
    telemetry: telemetryEngine.currentTelemetry,
    markovState: telemetryEngine.markov.currentState,
    chaosActive: telemetryEngine.chaosActive
  });
});

app.get('/api/incidents', (req, res) => {
  res.json({
    collection: 'decode404_incidents',
    count: HISTORICAL_INCIDENTS.length,
    incidents: HISTORICAL_INCIDENTS
  });
});

// Semantic query endpoint directly hitting Chroma Cloud
app.post('/api/query-chroma', async (req, res) => {
  try {
    const { query, nResults } = req.body;
    const results = await chromaService.findSimilarIncidents(query || "High CPU and database latency spike", nResults || 3);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chaos injection & incident trigger API
app.post('/api/trigger-incident', async (req, res) => {
  const { scenario = 'race_condition', errorRate, latency, cpuUsage } = req.body || {};
  
  if (errorRate !== undefined || latency !== undefined || cpuUsage !== undefined) {
    // Custom telemetry parameters injected
    telemetryEngine.currentTelemetry.cpu = cpuUsage !== undefined ? Number(cpuUsage) : 92.0;
    telemetryEngine.currentTelemetry.latency = latency !== undefined ? Number(latency) : 1250.0;
    telemetryEngine.currentTelemetry.errorRate = errorRate !== undefined ? Number(errorRate) : 24.5;
    telemetryEngine.setChaos(true, 'custom');
  } else {
    telemetryEngine.setChaos(true, scenario);
  }

  const immediateTick = await telemetryEngine.tick();
  io.emit('telemetry_tick', immediateTick);

  res.json({
    success: true,
    message: `Chaos scenario '${scenario}' triggered.`,
    tick: immediateTick
  });
});

// Autonomous mitigation endpoint
app.post('/api/mitigate', async (req, res) => {
  telemetryEngine.applyMitigation();
  const tick = await telemetryEngine.tick();
  io.emit('telemetry_tick', tick);
  res.json({ success: true, message: "Autonomous mitigation playbook applied.", tick });
});

// Reset baseline endpoint
app.post('/api/reset', async (req, res) => {
  telemetryEngine.resetBaseline();
  const tick = await telemetryEngine.tick();
  io.emit('telemetry_tick', tick);
  res.json({ success: true, message: "Telemetry and Markov baseline reset.", tick });
});

// -------------------------------------------------------------
// Socket.io Real-Time Streaming & Client Control
// -------------------------------------------------------------

io.on('connection', async (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  // Immediate initial snapshot for connected client
  const initialData = await telemetryEngine.tick();
  socket.emit('telemetry_tick', initialData);
  socket.emit('system_status', {
    chroma: chromaService.getStatus(),
    ready: true
  });

  // Client commands
  socket.on('trigger_chaos', async (data) => {
    const isEnabled = typeof data === 'object' ? data.enabled : Boolean(data);
    const scenario = typeof data === 'object' && data.scenario ? data.scenario : 'race_condition';
    telemetryEngine.setChaos(isEnabled, scenario);
    const tick = await telemetryEngine.tick();
    io.emit('telemetry_tick', tick);
  });

  socket.on('reset_baseline', async () => {
    telemetryEngine.resetBaseline();
    const tick = await telemetryEngine.tick();
    io.emit('telemetry_tick', tick);
  });

  socket.on('apply_mitigation', async () => {
    telemetryEngine.applyMitigation();
    const tick = await telemetryEngine.tick();
    io.emit('telemetry_tick', tick);
  });

  socket.on('query_copilot', async (queryText, callback) => {
    try {
      const results = await chromaService.findSimilarIncidents(queryText, 3);
      if (typeof callback === 'function') callback(results);
    } catch (err) {
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Stream metrics, anomaly triggers, and Chroma semantic results every second (1000ms)
const STREAM_INTERVAL_MS = 1000;
setInterval(async () => {
  try {
    const data = await telemetryEngine.tick();
    io.emit('telemetry_tick', data);
  } catch (err) {
    console.error('[Stream] Error in telemetry tick loop:', err.message);
  }
}, STREAM_INTERVAL_MS);

// -------------------------------------------------------------
// Bootstrapping
// -------------------------------------------------------------

async function bootstrap() {
  console.log('----------------------------------------------------');
  console.log(' DECODE404: Autonomous AI Incident Response Platform');
  console.log('----------------------------------------------------');
  
  // 1. Initialize Chroma Cloud Knowledge Base & Collections
  await chromaService.initializeKnowledgeBase();

  // 2. Start HTTP & WebSocket Server
  server.listen(PORT, () => {
    console.log(`[Server] Decode404 server listening at http://localhost:${PORT}`);
    console.log(`[Server] Socket.io streaming enabled at 1Hz (1 tick/sec)`);
    console.log(`[Server] Enterprise SOC Dashboard: http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
  });
}

// Export for testing or module usage
module.exports = {
  app,
  server,
  chromaService,
  telemetryEngine,
  WelfordTracker,
  TelemetryAnomalyEngine,
  MarkovFailurePredictor
};

if (require.main === module) {
  bootstrap().catch(err => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  });
}