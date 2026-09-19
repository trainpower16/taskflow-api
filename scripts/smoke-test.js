'use strict';

const baseUrl = (process.argv[2] || process.env.SMOKE_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);
const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 30;

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function http(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function waitForReady() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { status, body } = await http('/ready');
      if (status === 200 && body.status === 'ready') {
        record('service becomes ready', true, `after ${attempt} attempt(s)`);
        return true;
      }
    } catch {
      // Container may still be starting; keep retrying until attempts run out.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  record('service becomes ready', false, `no ready response after ${MAX_ATTEMPTS} attempts`);
  return false;
}

async function checkPlatform() {
  const health = await http('/health');
  record(
    'GET /health returns the running build',
    health.status === 200 && health.body.status === 'ok',
    `version=${health.body.version} build=${health.body.build}`
  );

  const metrics = await http('/metrics');
  record(
    'GET /metrics exposes Prometheus metrics',
    metrics.status === 200 && String(metrics.body).includes('http_requests_total')
  );
}

async function checkUserJourney() {
  const email = `smoke-${Date.now()}@example.com`;
  const password = 'smoke-test-password';

  const registered = await http('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name: 'Smoke Test', password }),
  });
  record('POST /api/auth/register creates a user', registered.status === 201);

  const loggedIn = await http('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = loggedIn.body?.data?.token;
  record('POST /api/auth/login returns a token', loggedIn.status === 200 && Boolean(token));

  const authHeaders = { authorization: `Bearer ${token}` };

  const project = await http('/api/projects', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Smoke Test Project' }),
  });
  const projectId = project.body?.data?.id;
  record('POST /api/projects creates a project', project.status === 201 && Boolean(projectId));

  const task = await http(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ title: 'Smoke test task', priority: 'high' }),
  });
  record('POST /api/projects/:id/tasks creates a task', task.status === 201);

  const list = await http(`/api/projects/${projectId}/tasks`, { headers: authHeaders });
  record(
    'GET /api/projects/:id/tasks returns the task',
    list.status === 200 && Array.isArray(list.body?.data) && list.body.data.length === 1
  );

  const unauthorised = await http('/api/projects');
  record('protected routes reject an anonymous request', unauthorised.status === 401);

  await http(`/api/projects/${projectId}`, { method: 'DELETE', headers: authHeaders });
}

async function main() {
  console.log(`Running smoke tests against ${baseUrl}\n`);

  if (!(await waitForReady())) {
    process.exit(1);
  }

  await checkPlatform();
  await checkUserJourney();

  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length}/${results.length} smoke tests passed`);

  if (failed.length > 0) {
    console.error(`Smoke tests FAILED: ${failed.map((f) => f.name).join(', ')}`);
    process.exit(1);
  }
  console.log('Smoke tests PASSED');
}

main().catch((err) => {
  console.error(`Smoke tests errored: ${err.message}`);
  process.exit(1);
});
