'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const pkg = require(path.join(root, 'package.json'));

const buildNumber = process.env.BUILD_NUMBER || 'local';
const version = `${pkg.version}-${buildNumber}`;

function gitCommit() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const buildInfo = {
  name: pkg.name,
  version,
  baseVersion: pkg.version,
  buildNumber,
  gitCommit: gitCommit(),
  gitBranch: process.env.GIT_BRANCH || 'unknown',
  builtAt: new Date().toISOString(),
  nodeVersion: process.version,
};

fs.writeFileSync(path.join(dist, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

const tarball = path.join(dist, `${pkg.name}-${version}.tar.gz`);
execFileSync(
  'tar',
  ['-czf', tarball, '-C', root, 'src', 'scripts', 'package.json', 'package-lock.json'],
  { stdio: 'inherit' }
);

const sizeKb = (fs.statSync(tarball).size / 1024).toFixed(1);
console.log(`Build artefact created: ${path.relative(root, tarball)} (${sizeKb} KB)`);
console.log(JSON.stringify(buildInfo, null, 2));
