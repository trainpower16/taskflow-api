# TaskFlow API

A project and task management REST API, built as the subject of a seven-stage
Jenkins DevOps pipeline for SIT223.

**Stack:** Node.js 22, Express, SQLite (better-sqlite3), JWT authentication,
Jest + Supertest, ESLint, SonarQube, Trivy, Docker, Prometheus and Alertmanager.

## What it does

A REST API where users register, log in, and manage projects and the tasks
inside them. Authorisation is enforced in the service layer, so a user can only
reach projects they own, and admins see everything.

- JWT authentication, bcrypt password hashing, role-based access control
- CRUD for projects and their nested tasks, with Zod request validation
- `/health`, `/ready` and `/metrics` endpoints for probes and monitoring
- Structured JSON logging carrying the build number and commit
- Graceful shutdown, and a startup guard that refuses to run in production
  without a strong `JWT_SECRET`

## The pipeline

`Jenkinsfile` defines all seven stages. The agent needs Node.js 22, Docker and
Docker Compose.

| # | Stage | What it does | Gate |
| --- | --- | --- | --- |
| 1 | Build | `npm ci`, versioned artefact, tagged Docker image | Build or image failure |
| 2 | Test | Unit + integration tests (Jest, Supertest) | Any failure, or coverage below 80% lines / 70% branches |
| 3 | Code Quality | ESLint + SonarQube analysis | `--max-warnings=0`, Sonar quality gate |
| 4 | Security | `npm audit`, Retire.js, Trivy image scan | High/critical vulnerabilities |
| 5 | Deploy | Staging via Docker Compose | Smoke tests must pass, else rollback |
| 6 | Release | Promotes the *same* image to production, tagged `v1.0.N` | Smoke tests must pass, else rollback |
| 7 | Monitoring | Prometheus + Alertmanager | Prometheus must be scraping production |

Staging runs on port 3001, production on 3002, Prometheus on 9090 and
Alertmanager on 9093.

The pipeline job in Jenkins is a Pipeline job with its definition set to
*Pipeline script from SCM*, pointed at this repository with a script path of
`Jenkinsfile`, so the pipeline is versioned alongside the application.

## Monitoring

Alert rules in `monitoring/alert.rules.yml`:

| Alert | Fires when | Severity |
| --- | --- | --- |
| `TaskFlowInstanceDown` | Production unscrapeable for 1 minute | critical |
| `TaskFlowHighErrorRate` | 5xx responses above 5% for 2 minutes | critical |
| `TaskFlowAuthFailureSpike` | Sustained failed logins | warning |
| `TaskFlowHighLatency` | p95 latency above 1s for 3 minutes | warning |

## Running locally

```bash
npm ci
npm test            # 57 tests
npm start           # http://localhost:3000
```

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and integration tests |
| `npm run test:ci` | Tests with coverage gating and a JUnit report |
| `npm run lint` | ESLint, failing on any warning |
| `npm run smoke -- <url>` | Post-deployment smoke test |

## API

All routes below `/api` other than register and login require
`Authorization: Bearer <token>`.

- `/api/auth` — `register`, `login`, `me`, and an admin-only `users` list
- `/api/projects` — full CRUD, scoped to the projects you own
- `/api/projects/:id/tasks` — full CRUD, filterable by `?status=`
