# TaskFlow API

A project and task management REST API, built as the subject of a seven-stage
Jenkins DevOps pipeline for SIT223/SIT753.

**Stack:** Node.js 22, Express, SQLite (better-sqlite3), JWT authentication,
Jest + Supertest, ESLint, Docker, Prometheus and Alertmanager.

## Features

- JWT authentication with bcrypt password hashing and role-based access control
- CRUD for projects and their tasks, scoped so a user can only reach their own data
- Zod request validation and a single typed-error funnel
- `/health`, `/ready` and `/metrics` endpoints for probes and monitoring
- Structured JSON logging carrying the build number and commit
- Graceful shutdown and a production configuration guard that refuses to start
  with a missing or weak `JWT_SECRET`

## Running locally

```bash
npm ci
npm run seed        # optional demo data
npm start           # http://localhost:3000
```

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and integration tests |
| `npm run test:ci` | Tests with coverage gating and a JUnit report |
| `npm run lint` | ESLint, failing on any warning |
| `npm run build:artifact` | Versioned tarball + `build-info.json` in `dist/` |
| `npm run smoke -- <url>` | Post-deployment smoke test |

## The pipeline

`Jenkinsfile` defines all seven stages. The agent needs Node.js 22, Docker and
Docker Compose.

| # | Stage | What it does | Gate |
| --- | --- | --- | --- |
| 1 | Build | `npm ci`, versioned artefact, tagged Docker image | Build or image failure |
| 2 | Test | Unit + integration tests | Any failure, or coverage below 80% lines / 70% branches |
| 3 | Code Quality | ESLint report + SonarQube analysis | `--max-warnings=0`, Sonar quality gate |
| 4 | Security | `npm audit`, Retire.js, Trivy image scan | High/critical dependency issues |
| 5 | Deploy | Staging via Docker Compose | Smoke tests must pass, else rollback |
| 6 | Release | Promotes the *same* image to production, tagged `v1.0.N` | Smoke tests must pass, else rollback |
| 7 | Monitoring | Prometheus + Alertmanager | Prometheus must be scraping production |

Staging runs on port 3001, production on 3002, Prometheus on 9090 and
Alertmanager on 9093.

### Deploying by hand

```bash
docker build -t taskflow-api:latest .
IMAGE_TAG=latest docker compose -f docker-compose.staging.yml up -d
npm run smoke -- http://localhost:3001
IMAGE_TAG=latest docker compose -f docker-compose.prod.yml up -d
```

## Monitoring

The application exports `http_requests_total`, `http_request_duration_seconds`,
`taskflow_tasks_total` and `taskflow_build_info`. Route labels collapse
identifiers to `:id` to keep the number of time series bounded.

Alert rules in `monitoring/alert.rules.yml`:

| Alert | Fires when | Severity |
| --- | --- | --- |
| `TaskFlowInstanceDown` | Production unscrapeable for 1 minute | critical |
| `TaskFlowHighErrorRate` | 5xx responses above 5% for 2 minutes | critical |
| `TaskFlowAuthFailureSpike` | Sustained failed logins | warning |
| `TaskFlowHighLatency` | p95 latency above 1s for 3 minutes | warning |

To deliver alerts to a real channel, replace the webhook URL in
`monitoring/alertmanager.yml`.

## API

All routes below `/api` other than register and login require
`Authorization: Bearer <token>`.

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/auth/users                       (admin only)

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/tasks               (?status=todo|in_progress|done)
POST   /api/projects/:id/tasks
GET    /api/projects/:id/tasks/:taskId
PATCH  /api/projects/:id/tasks/:taskId
DELETE /api/projects/:id/tasks/:taskId
```

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `NODE_ENV` | `development` | |
| `JWT_SECRET` | dev-only default | Required, min 32 chars, in production |
| `DATABASE_FILE` | `./data/taskflow.db` | `:memory:` under test |
| `LOG_LEVEL` | `info` | |
| `BUILD_NUMBER`, `GIT_COMMIT` | `local` / `unknown` | Injected by Jenkins |
