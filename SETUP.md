# Step-by-step setup guide

How to get this project running on your own machine, push it to GitHub, set up
Jenkins, and run the seven-stage pipeline end to end.

Allow about 60–90 minutes the first time. Most of it is installing Jenkins.

---

## Step 0 — Prerequisites

Install these first:

| Tool | Check it works |
| --- | --- |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running) | `docker run hello-world` |
| [Node.js 22](https://nodejs.org/) | `node -v` → `v22.x` |
| [Git](https://git-scm.com/) | `git --version` |
| Java 17 or 21 (for Jenkins) | `java -version` |

Make sure Docker Desktop is actually **running** before you start — the pipeline
builds images and starts containers.

---

## Step 1 — Get the code onto your machine

Unzip `taskflow-api.zip` somewhere sensible, then:

```bash
cd taskflow-api
npm ci
```

Check it works before involving Jenkins:

```bash
npm test          # 57 tests should pass
npm run lint      # should print nothing
npm start         # then open http://localhost:3000/health
```

Press `Ctrl+C` to stop it.

> The zip already contains a `.git` folder with two commits, so you don't need
> to run `git init`.

---

## Step 2 — Push to GitHub

1. Create a new **empty** repository on GitHub called `taskflow-api`.
   Do **not** tick "Add a README" — the repo already has one.

2. Point your local copy at it and push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/taskflow-api.git
git branch -M main
git push -u origin main
```

3. **Grant access to your marker and unit chair** (the task sheet requires this):
   repo → **Settings** → **Collaborators** → **Add people**.
   If the repo is public, they can already read it, but add them anyway so it's
   unambiguous.

---

## Step 3 — Install and start Jenkins

**Run Jenkins directly on your machine, not inside a Docker container.**

This matters. The pipeline mounts files from the Jenkins workspace into
containers (`./monitoring/prometheus.yml`). If Jenkins itself runs in a
container sharing the host's Docker socket, those paths resolve against the
*host* filesystem and the mounts silently come up empty. Running Jenkins
natively avoids the whole problem.

**macOS**

```bash
brew install jenkins-lts
brew services start jenkins-lts
```

**Windows** — download and run the installer from
<https://www.jenkins.io/download/> (choose the Windows installer, LTS).

**Linux (Debian/Ubuntu)**

```bash
sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt-get update && sudo apt-get install -y jenkins
sudo systemctl start jenkins
```

On Linux, let the Jenkins user drive Docker:

```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

Then open <http://localhost:8080>, unlock Jenkins with the password it prints
(the page tells you the file path), and choose **Install suggested plugins**.

---

## Step 4 — Install the plugins the pipeline uses

**Manage Jenkins** → **Plugins** → **Available plugins**. Install:

- **JUnit** — publishes the test results (usually already installed)
- **HTML Publisher** — publishes the coverage report
- **Pipeline** and **Git** (installed by "suggested plugins")
- **SonarQube Scanner** — only if you're doing the SonarQube part

Restart Jenkins when prompted.

> The pipeline is written so that missing optional plugins don't break the
> build — SonarQube and HTML Publisher are both wrapped in try/catch. Installing
> them just gives you nicer output to screenshot.

---

## Step 5 — Check Jenkins can see Node and Docker

The pipeline shells out to `node`, `npm` and `docker`. Confirm Jenkins can
reach them: **Manage Jenkins** → **Tools** → there's a "Shell" section, but the
quickest check is to run the pipeline and read Stage 1's log, which prints
`node --version` and `npm --version`.

If Stage 1 fails with `docker: command not found` or `node: command not found`,
Jenkins isn't picking up your `PATH`. Fix it at **Manage Jenkins** →
**System** → **Global properties** → tick **Environment variables** → add:

- Name: `PATH`
- Value: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`

(Adjust for where `which docker` and `which node` report them.)

---

## Step 6 — Create the pipeline job

1. Jenkins dashboard → **New Item**
2. Name it `taskflow-api-pipeline`, choose **Pipeline**, click **OK**
3. Scroll to the **Pipeline** section and set:
   - **Definition**: `Pipeline script from SCM`
   - **SCM**: `Git`
   - **Repository URL**: `https://github.com/YOUR-USERNAME/taskflow-api.git`
   - **Credentials**: add your GitHub username + a
     [personal access token](https://github.com/settings/tokens) if the repo is private
   - **Branch Specifier**: `*/main`
   - **Script Path**: `Jenkinsfile`
4. **Save**

---

## Step 7 — Run it

Click **Build Now**. Open the build → **Console Output** and watch.

First run takes 5–10 minutes (it pulls the Node, Prometheus, Alertmanager and
Trivy images). Later runs are much quicker.

You should see all seven stages go green:

| Stage | What to expect in the log |
| --- | --- |
| 1. Build | `Build artefact created: dist/taskflow-api-1.0.0-1.tar.gz` |
| 2. Test | `Tests: 57 passed, 57 total` + a coverage table |
| 3. Code Quality | ESLint finishes silently (0 problems) |
| 4. Security | `found 0 vulnerabilities`, then a Trivy table |
| 5. Deploy | `9/9 smoke tests passed` against port 3001 |
| 6. Release | `9/9 smoke tests passed` against port 3002 |
| 7. Monitoring | `Prometheus is scraping taskflow-prod successfully` |

---

## Step 8 — Look at what it deployed

| What | URL |
| --- | --- |
| Staging API | <http://localhost:3001/health> |
| Production API | <http://localhost:3002/health> |
| Production metrics | <http://localhost:3002/metrics> |
| Prometheus targets | <http://localhost:9090/targets> |
| Prometheus alerts | <http://localhost:9090/alerts> |
| Alertmanager | <http://localhost:9093> |

Try the API by hand:

```bash
curl -X POST http://localhost:3002/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com","name":"Me","password":"password123"}'

curl -X POST http://localhost:3002/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"password123"}'
# copy the token from the response, then:

curl http://localhost:3002/api/projects -H "Authorization: Bearer PASTE_TOKEN"
```

---

## Step 9 (optional) — SonarQube

Only needed if you want the Code Quality stage to do more than ESLint.

```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:lts-community
```

1. Open <http://localhost:9000>, log in with `admin` / `admin`, set a new password.
2. **My Account** → **Security** → generate a token, copy it.
3. In Jenkins: **Manage Jenkins** → **Credentials** → add a **Secret text**
   credential holding that token, ID `sonar-token`.
4. **Manage Jenkins** → **System** → **SonarQube servers** → **Add**:
   - Name: `SonarQube` ← must be exactly this, the Jenkinsfile refers to it by name
   - Server URL: `http://localhost:9000`
   - Server authentication token: pick `sonar-token`
5. Re-run the pipeline. Stage 3 now analyses the code and waits on the quality gate.

If you skip this, Stage 3 still passes on the ESLint gate and logs that Sonar
was skipped.

---

## Step 10 — Prove monitoring and alerting actually work

This is worth a minute of the demo video, and the rubric asks for "incident
simulation". Kill production and watch the alert fire:

```bash
docker stop taskflow-prod
```

Open <http://localhost:9090/alerts>. Within about a minute
`TaskFlowInstanceDown` goes from green (Inactive) → yellow (Pending) → red
(Firing). Check <http://localhost:9093> to see it arrive in Alertmanager.

Bring it back:

```bash
docker start taskflow-prod
```

The alert resolves on its own.

---

## Step 11 — Screenshots and the demo video

**Screenshots for the report:**
- Jenkins **Stage View** showing all seven stages green ← the main one
- Console output of the Test stage (57 passing)
- Console output of the Security stage
- Prometheus **Targets** page showing `taskflow-prod` as UP
- Prometheus **Alerts** page with `TaskFlowInstanceDown` firing

**Demo video — 10 minutes maximum.** A structure that fits:

| Time | Show |
| --- | --- |
| 0:00–1:00 | The GitHub repo and a quick tour of the Jenkinsfile |
| 1:00–2:00 | How the pipeline job is configured in Jenkins |
| 2:00–6:00 | Hit **Build Now** and narrate each stage as it runs |
| 6:00–8:00 | The deployed app: staging, production, a couple of API calls |
| 8:00–9:30 | Prometheus targets + alerts, then `docker stop taskflow-prod` and the alert firing |
| 9:30–10:00 | Wrap up |

Start the recording with the pipeline already having run once, so image pulls
are cached and the build finishes inside the window.

---

## Cleaning up

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.staging.yml down
```

---

## Troubleshooting

**`docker: command not found` / `node: command not found` in Stage 1**
Jenkins isn't inheriting your `PATH`. See Step 5.

**`permission denied` on `/var/run/docker.sock` (Linux)**
`sudo usermod -aG docker jenkins && sudo systemctl restart jenkins`

**Port already in use (3001, 3002, 9090, 9093)**
Something else is on that port. Either stop it, or edit the `environment` block
at the top of the `Jenkinsfile` to use different ports.

**Stage 5 or 6 fails on smoke tests**
Read the container logs the pipeline prints. Most often the container is still
starting — the smoke test retries for 60 seconds, so a genuine failure here is
usually a real error. `docker logs taskflow-staging` will show it.

**Stage 7 fails with "Prometheus is not successfully scraping taskflow-prod"**
Check <http://localhost:9090/targets>. If the target shows a connection error,
the production container probably isn't healthy: `docker ps` and
`docker logs taskflow-prod`.

**Trivy marks the build UNSTABLE**
That's the pipeline doing its job — it found a fixable HIGH/CRITICAL
vulnerability in the base image. Rebuild with a fresher base image
(`docker pull node:22-alpine`) and re-run. Note what it found in your report's
Security section; that's exactly what the task asks you to document.

**`npm ci` fails with a lockfile error**
Delete `node_modules` and run `npm ci` again. Don't run `npm install` — it can
change the lockfile and make the build non-reproducible.
