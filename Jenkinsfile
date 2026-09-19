pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '15'))
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  environment {
    APP_NAME          = 'taskflow-api'
    IMAGE_NAME        = 'taskflow-api'
    IMAGE_TAG         = "1.0.${BUILD_NUMBER}"
    RELEASE_TAG       = "v1.0.${BUILD_NUMBER}"
    STAGING_PORT      = '3001'
    PROD_PORT         = '3002'
    PROMETHEUS_PORT   = '9090'
    ALERTMANAGER_PORT = '9093'
    STAGING_URL       = "http://localhost:3001"
    PROD_URL          = "http://localhost:3002"
    AUDIT_LEVEL       = 'high'
  }

  stages {

    stage('1. Build') {
      steps {
        echo "Building ${APP_NAME} ${IMAGE_TAG} from commit ${env.GIT_COMMIT ?: 'unknown'}"
        sh '''
          set -e
          node --version
          npm --version
          npm ci
          mkdir -p reports dist

          BUILD_NUMBER=${BUILD_NUMBER} GIT_COMMIT=${GIT_COMMIT} GIT_BRANCH=${GIT_BRANCH} \
            npm run build:artifact

          docker build \
            --build-arg APP_VERSION=1.0.0 \
            --build-arg BUILD_NUMBER=${BUILD_NUMBER} \
            --build-arg GIT_COMMIT=${GIT_COMMIT} \
            -t ${IMAGE_NAME}:${IMAGE_TAG} \
            -t ${IMAGE_NAME}:latest \
            .
          docker image inspect ${IMAGE_NAME}:${IMAGE_TAG} --format 'Built image {{.RepoTags}} size={{.Size}} bytes'
        '''
      }
      post {
        success {
          archiveArtifacts artifacts: 'dist/**', fingerprint: true
        }
      }
    }

    stage('2. Test') {
      steps {
        echo 'Running unit and integration tests with coverage gating'
        sh '''
          set -e
          mkdir -p reports coverage
          # jest exits non-zero if any test fails OR if the coverage thresholds
          # in package.json (80% lines/statements/functions, 70% branches) are
          # not met, so this single command is the pass/fail gate for the stage.
          npm run test:ci
        '''
      }
      post {
        always {
          junit testResults: 'reports/junit.xml', allowEmptyResults: true
          archiveArtifacts artifacts: 'coverage/**, reports/junit.xml', allowEmptyArchive: true
          script {
            try {
              publishHTML(target: [
                reportDir: 'coverage/lcov-report',
                reportFiles: 'index.html',
                reportName: 'Code Coverage',
                keepAll: true,
                alwaysLinkToLastBuild: true,
                allowMissing: true
              ])
            } catch (err) {
              echo "Coverage HTML report not published (HTML Publisher plugin unavailable): ${err.message}"
            }
          }
        }
      }
    }

    stage('3. Code Quality') {
      steps {
        echo 'Analysing code health with ESLint and SonarQube'
        sh '''
          set -e
          mkdir -p reports
          npx eslint . --format json --output-file reports/eslint-report.json || true
          npx eslint . --format stylish || true

          npx eslint . --max-warnings=0
        '''
        script {
          def sonarAnalysed = false
          try {
            withSonarQubeEnv('SonarQube') {
              sh '''
                set -e
                npx --yes sonarqube-scanner -Dsonar.projectVersion=1.0.${BUILD_NUMBER}
              '''
            }
            sonarAnalysed = true
          } catch (err) {
            echo "SonarQube analysis skipped or failed (no server configured?): ${err.message}"
          }
          if (sonarAnalysed) {
            timeout(time: 5, unit: 'MINUTES') {
              waitForQualityGate abortPipeline: true
            }
          }
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/eslint-report.json', allowEmptyArchive: true
        }
      }
    }

    stage('4. Security') {
      steps {
        echo 'Scanning dependencies and the container image for vulnerabilities'
        sh '''
          set -e
          mkdir -p reports

          npm audit --json > reports/npm-audit.json || true
          npm audit --audit-level=${AUDIT_LEVEL}

          npx retire --outputformat json --outputpath reports/retire-report.json --exitwith 0 || true
          npx retire --outputformat text --exitwith 1
        '''
        script {
          def trivy = sh(
            script: '''
              set -e
              docker run --rm \
                -v /var/run/docker.sock:/var/run/docker.sock \
                -v ${WORKSPACE}/reports:/reports \
                aquasec/trivy:latest image \
                  --severity HIGH,CRITICAL \
                  --ignore-unfixed \
                  --format table \
                  --output /reports/trivy-report.txt \
                  --exit-code 1 \
                  ${IMAGE_NAME}:${IMAGE_TAG}
            ''',
            returnStatus: true
          )
          sh 'cat reports/trivy-report.txt || true'
          if (trivy != 0) {
            unstable("Trivy found fixable HIGH/CRITICAL vulnerabilities — see trivy-report.txt")
          }
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/npm-audit.json, reports/retire-report.json, reports/trivy-report.txt',
                           allowEmptyArchive: true
        }
      }
    }

    stage('5. Deploy (staging)') {
      steps {
        echo "Deploying ${IMAGE_NAME}:${IMAGE_TAG} to the staging environment"
        sh '''
          set -e
          IMAGE_TAG=${IMAGE_TAG} BUILD_NUMBER=${BUILD_NUMBER} GIT_COMMIT=${GIT_COMMIT} \
            docker compose -f docker-compose.staging.yml up -d --force-recreate

          docker compose -f docker-compose.staging.yml ps
        '''
        sh '''
          set -e
          npm run smoke -- ${STAGING_URL}
        '''
      }
      post {
        failure {
          echo 'Staging deployment failed its smoke tests — rolling staging back'
          sh '''
            docker compose -f docker-compose.staging.yml logs --tail=100 || true
            if docker image inspect ${IMAGE_NAME}:rollback >/dev/null 2>&1; then
              IMAGE_TAG=rollback docker compose -f docker-compose.staging.yml up -d --force-recreate
            else
              echo "No previous image to roll back to — taking the failed staging deployment down"
              docker compose -f docker-compose.staging.yml down || true
            fi
          '''
        }
      }
    }

    stage('6. Release (production)') {
      steps {
        echo "Promoting the verified image to production as ${RELEASE_TAG}"
        sh '''
          set -e
          PREVIOUS=$(docker image inspect ${IMAGE_NAME}:production --format '{{.Id}}' 2>/dev/null || true)
          if [ -n "$PREVIOUS" ]; then
            docker tag "$PREVIOUS" ${IMAGE_NAME}:rollback
            echo "Previous production image preserved as ${IMAGE_NAME}:rollback"
          else
            echo "No previous production image found — this is the first release"
          fi

          docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:${RELEASE_TAG}
          docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:production

          IMAGE_TAG=${RELEASE_TAG} BUILD_NUMBER=${BUILD_NUMBER} GIT_COMMIT=${GIT_COMMIT} \
            docker compose -f docker-compose.prod.yml up -d --force-recreate taskflow-prod

          docker compose -f docker-compose.prod.yml ps taskflow-prod
        '''
        sh '''
          set -e
          npm run smoke -- ${PROD_URL}
        '''
        sh '''
          set -e
          printf '%s\\n' \
            "release=${RELEASE_TAG}" \
            "image=${IMAGE_NAME}:${RELEASE_TAG}" \
            "build=${BUILD_NUMBER}" \
            "commit=${GIT_COMMIT}" \
            "released_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            > dist/release.txt
          cat dist/release.txt
        '''
      }
      post {
        success {
          archiveArtifacts artifacts: 'dist/release.txt', fingerprint: true
        }
        failure {
          echo 'Production verification failed — rolling back to the previous production image'
          sh '''
            docker compose -f docker-compose.prod.yml logs --tail=100 taskflow-prod || true
            if docker image inspect ${IMAGE_NAME}:rollback >/dev/null 2>&1; then
              IMAGE_TAG=rollback docker compose -f docker-compose.prod.yml up -d --force-recreate taskflow-prod
              npm run smoke -- ${PROD_URL} || echo "WARNING: the rolled-back instance is also failing its smoke tests"
            else
              echo "No previous image to roll back to — stopping the failed production container"
              docker compose -f docker-compose.prod.yml stop taskflow-prod || true
            fi
          '''
        }
      }
    }

    stage('7. Monitoring & Alerting') {
      steps {
        echo 'Starting Prometheus and Alertmanager and verifying live monitoring'
        sh '''
          set -e
          IMAGE_TAG=${RELEASE_TAG} docker compose -f docker-compose.prod.yml up -d prometheus alertmanager

          sleep 20

          echo "--- Prometheus target health ---"
          UP=$(curl -sf "http://localhost:${PROMETHEUS_PORT}/api/v1/query?query=up%7Bjob%3D%22taskflow-prod%22%7D" \
                | grep -o '"value":\\[[^]]*\\]' | grep -o '"1"' | head -1)
          if [ "$UP" != '"1"' ]; then
            echo "ERROR: Prometheus is not successfully scraping taskflow-prod"
            curl -s "http://localhost:${PROMETHEUS_PORT}/api/v1/targets" || true
            exit 1
          fi
          echo "Prometheus is scraping taskflow-prod successfully"

          echo "--- Loaded alert rules ---"
          curl -sf "http://localhost:${PROMETHEUS_PORT}/api/v1/rules" | grep -o '"name":"TaskFlow[A-Za-z]*"' | sort -u
          curl -sf "http://localhost:${ALERTMANAGER_PORT}/-/healthy" && echo "Alertmanager is healthy"

          echo "--- Application metrics sample ---"
          curl -sf ${PROD_URL}/metrics | grep -E "^(http_requests_total|taskflow_tasks_total|taskflow_build_info)" | head -10
        '''
      }
    }
  }

  post {
    always {
      echo "Pipeline finished with status: ${currentBuild.currentResult}"
      sh '''
        echo "--- Running containers ---"
        docker ps --filter "name=taskflow" --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}" || true
      '''
      sh 'docker image prune -f --filter "until=168h" || true'
    }
    success {
      echo "SUCCESS — ${RELEASE_TAG} is live in production and under monitoring."
    }
    unstable {
      echo 'UNSTABLE — the build completed but a quality or security gate reported findings.'
    }
    failure {
      echo 'FAILURE — see the stage log above; staging and production were rolled back if affected.'
    }
  }
}
