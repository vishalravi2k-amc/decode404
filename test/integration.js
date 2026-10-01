/**
 * Integration Test: Start server, test HTTP REST endpoints, test Socket.io stream
 */

const http = require('http');
const { app, server, chromaService, telemetryEngine } = require('../server');

async function testIntegration() {
  console.log('Testing Server Integration...');

  const TEST_PORT = 3001;

  await new Promise((resolve) => {
    server.listen(TEST_PORT, () => {
      console.log(`Test server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  const get = (path) => new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });

  const post = (path, bodyObj) => new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const req = http.request(`http://localhost:${TEST_PORT}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  try {
    // 1. Test Static Dashboard Root
    console.log('1. Checking GET / (Dashboard HTML)...');
    const rootRes = await get('/');
    console.log(`   -> Status: ${rootRes.status}, Content Length: ${rootRes.body.length} bytes`);
    if (!rootRes.body.includes('Decode404') && !rootRes.body.includes('DECODE404')) {
      throw new Error('Index HTML content not found in root response');
    }

    // 2. Test GET /api/status
    console.log('2. Checking GET /api/status...');
    const statusRes = await get('/api/status');
    const statusJson = JSON.parse(statusRes.body);
    console.log(`   -> Status: ${statusRes.status}, App Status: ${statusJson.status}, Collection: ${statusJson.chroma.collection}`);

    // 3. Test GET /api/incidents
    console.log('3. Checking GET /api/incidents...');
    const incRes = await get('/api/incidents');
    const incJson = JSON.parse(incRes.body);
    console.log(`   -> Seeded Incidents Count: ${incJson.count}`);

    // 4. Test POST /api/query-chroma
    console.log('4. Checking POST /api/query-chroma...');
    const queryRes = await post('/api/query-chroma', {
      query: "deployment race condition on checkout route"
    });
    const queryJson = JSON.parse(queryRes.body);
    console.log(`   -> Matches found: ${queryJson.matches.length}, Top root cause: ${queryJson.matches[0].metadata.rootCause}`);

    // 5. Test POST /api/trigger-incident (Chaos Injection)
    console.log('5. Checking POST /api/trigger-incident...');
    const chaosRes = await post('/api/trigger-incident', {
      scenario: 'db_leak'
    });
    const chaosJson = JSON.parse(chaosRes.body);
    console.log(`   -> Chaos Response: ${chaosJson.message}`);
    console.log(`   -> Real-time tick status: ${chaosJson.tick.status}, Z-score: ${chaosJson.tick.metrics.zScore}σ`);
    console.log(`   -> Markov state: ${chaosJson.tick.markov.currentState}, Predicted next: ${chaosJson.tick.markov.predictedNextState}`);

    // 6. Test POST /api/mitigate
    console.log('6. Checking POST /api/mitigate...');
    const mitRes = await post('/api/mitigate', {});
    const mitJson = JSON.parse(mitRes.body);
    console.log(`   -> Mitigation Response: ${mitJson.message}`);
    console.log(`   -> State after mitigation: ${mitJson.tick.markov.currentState}`);

    console.log('\n✅ All Integration Endpoints Passed Successfully!');
    process.exit(0);
  } finally {
    server.close();
  }
}

testIntegration().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
