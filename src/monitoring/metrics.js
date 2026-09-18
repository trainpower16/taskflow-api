'use strict';

const client = require('prom-client');
const { config } = require('../config');
const taskRepository = require('../repositories/taskRepository');

/**
 * Prometheus instrumentation. The registry carries build metadata as default
 * labels so a spike in errors can be attributed to the exact pipeline run and
 * commit that deployed it.
 */
const register = new client.Registry();
register.setDefaultLabels({
  app: config.appName,
  env: config.env,
  version: config.version,
  build: config.buildNumber,
});
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled, labelled by method, route and status code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const tasksByStatus = new client.Gauge({
  name: 'taskflow_tasks_total',
  help: 'Current number of tasks per status (business-level metric)',
  labelNames: ['status'],
  registers: [register],
  collect() {
    try {
      const counts = taskRepository.countByStatus();
      for (const [status, count] of Object.entries(counts)) {
        this.set({ status }, count);
      }
    } catch {
      // A scrape must never take the application down; the absence of the
      // metric is itself the signal that the database is unreachable.
    }
  },
});

const appInfo = new client.Gauge({
  name: 'taskflow_build_info',
  help: 'Build information for the running instance; always 1',
  labelNames: ['version', 'build', 'commit'],
  registers: [register],
});
appInfo.set({ version: config.version, build: config.buildNumber, commit: config.gitCommit }, 1);

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_SEGMENT = /\/\d+/g;

/**
 * Normalises a request path into a low-cardinality route label.
 *
 * The label is derived from req.originalUrl rather than req.baseUrl: when a
 * handler calls next(err), Express restores baseUrl as it unwinds to the
 * error middleware, so by the time the response finishes baseUrl is empty and
 * a failed POST /api/auth/login would otherwise be recorded as '/login'.
 *
 * Identifiers are collapsed to ':id', and requests that matched no route are
 * bucketed, so that neither real ids nor a scanner probing random paths can
 * make the number of Prometheus time series grow without bound.
 */
function routeLabel(req, res) {
  if (res && res.statusCode === 404 && !req.route) return '/unmatched';

  const path = String(req.originalUrl || req.url || '/').split('?')[0];
  const normalised = path.replace(UUID_SEGMENT, '/:id').replace(NUMERIC_SEGMENT, '/:id');
  return normalised.length > 1 ? normalised.replace(/\/$/, '') : normalised;
}

/** Records one observation per response, using the matched route as the label. */
function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: routeLabel(req, res),
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
}

module.exports = {
  register,
  routeLabel,
  metricsMiddleware,
  httpRequestsTotal,
  httpRequestDuration,
  tasksByStatus,
};
