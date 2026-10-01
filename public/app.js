const triggerIncidentButton = document.getElementById('trigger-incident');
const output = document.getElementById('output');

triggerIncidentButton.addEventListener('click', async () => {
  const errorRate = Number.parseFloat(document.getElementById('errorRate').value);
  const latency = Number.parseFloat(document.getElementById('latency').value);
  const cpuUsage = Number.parseFloat(document.getElementById('cpuUsage').value);

  triggerIncidentButton.disabled = true;
  output.innerText = 'Analyzing telemetry...';

  try {
    const response = await fetch('/api/trigger-incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorRate, latency, cpuUsage })
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    output.innerText = JSON.stringify(data, null, 2);
  } catch (error) {
    output.innerText = `Unable to analyze telemetry: ${error.message}`;
  } finally {
    triggerIncidentButton.disabled = false;
  }
});