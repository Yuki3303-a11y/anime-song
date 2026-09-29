# One-click Local Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root-level Windows BAT file that safely starts the site on port 8080 and the Bilibili proxy on port 8765, then opens the site.

**Architecture:** One BAT file owns process coordination and readiness checks while reusing the existing Node proxy and Python static-server command. A Node test reads the BAT as text to lock down its required commands and ordering; a live smoke test verifies both ports and HTTP responses.

**Tech Stack:** Windows Batch, PowerShell/.NET TCP probe, Node.js test runner, Python `http.server`

---

### Task 1: Define launcher behavior with a failing test

**Files:**
- Create: `tests/launcher.test.mjs`
- Test: `tests/launcher.test.mjs`

- [ ] **Step 1: Write a test that requires `一键启动.bat`**

The test reads the launcher and asserts that it changes to its own directory, checks both ports, launches the existing Node proxy and Python server, waits before opening the browser, and reports missing runtimes.

- [ ] **Step 2: Run the launcher test and verify RED**

Run: `node --test tests/launcher.test.mjs`

Expected: FAIL because `一键启动.bat` does not exist.

### Task 2: Implement the launcher

**Files:**
- Create: `一键启动.bat`

- [ ] **Step 1: Add dependency and existing-port checks**

Use `where node` and `where python` only when the respective port is not already open. Probe ports through a bounded PowerShell `TcpClient` connection.

- [ ] **Step 2: Start both services in independent minimized windows**

Run `node bili-proxy.mjs` and `python -m http.server 8080 --bind 127.0.0.1` from the project directory.

- [ ] **Step 3: Wait up to 30 seconds and open the browser**

Only execute `start "" "http://127.0.0.1:8080/"` after both port probes succeed. On timeout, print which services failed and pause.

- [ ] **Step 4: Run the launcher test and verify GREEN**

Run: `node --test tests/launcher.test.mjs`

Expected: PASS.

### Task 3: Verify the real startup flow

**Files:**
- Test: `一键启动.bat`

- [ ] **Step 1: Run the BAT with both ports initially free**

Run: `cmd /c "一键启动.bat"`

Expected: it starts both service processes and exits after opening the browser.

- [ ] **Step 2: Verify endpoints**

Check TCP ports 8080 and 8765, request `http://127.0.0.1:8080/`, and request the proxy health endpoint documented in `bili-proxy.mjs`.

- [ ] **Step 3: Run the BAT a second time**

Expected: it reports both services already running and does not create conflicting listeners.

- [ ] **Step 4: Run the full project tests**

Run: `npm test`

Expected: all project tests pass.

