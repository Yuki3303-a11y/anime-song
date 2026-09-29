import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcherPath = path.join(root, '一键启动.bat');

test('one-click launcher coordinates both local services before opening the site', () => {
  assert.equal(fs.existsSync(launcherPath), true, '一键启动.bat should exist in the project root');
  const source = fs.readFileSync(launcherPath, 'utf8');

  assert.match(source, /cd \/d "%~dp0"/i);
  assert.match(source, /call :port_open 8765/i);
  assert.match(source, /call :port_open 8080/i);
  assert.match(source, /call :http_ready/i);
  assert.match(source, /where node/i);
  assert.match(source, /where python/i);
  assert.match(source, /node bili-proxy\.mjs/i);
  assert.match(source, /python -m http\.server 8080 --bind 127\.0\.0\.1/i);
  assert.match(source, /call :wait_for_services/i);
  assert.match(source, /start "" "http:\/\/127\.0\.0\.1:8080\/"/i);

  const waitAt = source.search(/call :wait_for_services/i);
  const browserAt = source.search(/start "" "http:\/\/127\.0\.0\.1:8080\/"/i);
  assert.ok(waitAt >= 0 && browserAt > waitAt, 'browser must open only after readiness checks');
});

test('one-click launcher has bounded waiting and actionable failures', () => {
  const source = fs.readFileSync(launcherPath, 'utf8');
  assert.match(source, /if %WAIT_COUNT% GEQ 30/i);
  assert.match(source, /Node\.js was not found/i);
  assert.match(source, /Python was not found/i);
  assert.match(source, /Startup timed out/i);
  assert.match(source, /pause/i);
});

test('one-click launcher is code-page independent for cmd.exe', () => {
  const bytes = fs.readFileSync(launcherPath);
  assert.equal([...bytes].every(byte => byte < 128), true, 'BAT content must stay ASCII-only');
});

test('one-click launcher does not use timeout, which fails with redirected input', () => {
  const source = fs.readFileSync(launcherPath, 'utf8');
  assert.doesNotMatch(source, /\btimeout\b/i);
  assert.match(source, /Start-Sleep -Seconds 1/i);
});

test('one-click launcher rejects an unhealthy process occupying port 8080', () => {
  const source = fs.readFileSync(launcherPath, 'utf8');
  assert.match(source, /goto :port_8080_unhealthy/i);
  assert.match(source, /Port 8080 is occupied, but the website is not responding/i);
  assert.match(source, /Invoke-WebRequest[^\r\n]+127\.0\.0\.1:8080/i);
});
