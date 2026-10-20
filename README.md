# IPv6 Website & Dependency Readiness Auditor (AIORI-3 PS-027)

This repository contains the source code and resources for our AIORI-3 hackathon project, **IPv6 Website & Dependency Readiness Auditor**.

The project loads a page in a real browser using Playwright/Chromium and CDP, discovers the resources it requests, and checks IPv4/IPv6 readiness to help identify potential IPv6 compatibility issues.

## Team Introduction Video

YouTube: https://www.youtube.com/watch?v=Cu4Z-mVtGUE

---

## Table of Contents

- [Overview & Objectives](#overview--objectives)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
  - [Architecture Overview](#architecture-overview)
  - [Scanning & Probing Lifecycle](#scanning--probing-lifecycle)
- [Tech Stack](#tech-stack)
- [Project Directory Structure](#project-directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Configuration & Environment Variables](#configuration--environment-variables)
- [API Reference](#api-reference)
- [Controlled Test Environment](#controlled-test-environment)
- [Security & SSRF Mitigation](#security--ssrf-mitigation)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Deployment](#deployment)
- [License & Acknowledgments](#license--acknowledgments)

---

## Overview & Objectives

As the internet transitions to IPv6, many organizations advertise IPv6 for their apex domain while remaining heavily dependent on third-party assets (CDNs, analytics, scripts, fonts, APIs, tag managers) that remain IPv4-only or fail silently over IPv6. When IPv6-only or IPv6-preferring clients access these websites, they experience broken styling, hanging API calls, missing functionality, or degraded performance.

**IPv6 Website & Dependency Readiness Auditor (PS-027)** is an automated diagnostic and auditing platform designed to:
1. **Instrument Real Browsing**: Load targets in a headless Chromium instance via Chrome DevTools Protocol (CDP) to uncover dynamically loaded sub-resources and initiator chains (parent-child dependencies).
2. **Conduct Multi-Stage Dual-Stack Probing**: Test every unique host at each networking phase (DNS resolution, TCP connection, TLS handshake, and HTTP exchange) separately over both IPv4 and IPv6.
3. **Pinpoint Failure Root Causes**: Disambiguate whether an asset fails due to missing AAAA DNS records, TCP handshake drops/resets, TLS negotiation errors, or HTTP-layer errors.
4. **Visualize Dependency Trees**: Render an interactive dependency graph highlighting exactly which parent nodes trigger broken IPv6 dependencies.
5. **Ensure Environmental Integrity**: Track and expose measurement context (resolver IPs, egress routes, stub resolver detection, Geo-IP) so audits are reproducible and transparent.

---

## Key Features

- **Real-Browser Traffic Capture (CDP & Playwright)**: Captures network events (`Network.requestWillBeSent`, `Network.responseReceived`, `Network.loadingFailed`) to discover every stylesheet, font, script, media item, and API payload.
- **Hierarchical Dependency Tree Reconstruction**: Tracks initiator call stacks to establish true causality—identifying the exact root or inline script responsible for requesting a failing host.
- **Granular 4-Phase Protocol Probing**:
  - **DNS**: Query `A` and `AAAA` records using `dnspython`, resolving CNAME chains and logging resolution latencies.
  - **TCP**: Measure dual-stack SYN/ACK connection times and distinguish connection refused vs. timeout.
  - **TLS**: Validate certificate chains, ALPN, and negotiated TLS versions across both address families.
  - **HTTP**: Compare status codes, response headers, and stage latencies between IPv4 and IPv6 paths.
- **Interactive Visual Dashboard**:
  - **ReactFlow Dependency Graph**: Color-coded dependency graph showing node readiness (IPv6-ready, dual-stack, IPv4-only, or broken IPv6).
  - **IPv4 vs IPv6 Comparison Matrix**: Side-by-side latency and protocol breakdown.
  - **IPv6 Broken Highlights**: Filterable table calling out high-risk assets with actionable remediation advice.
  - **Measurement Context Strip**: Egress IP, DNS resolver classification, and scanner vantage point transparency.
- **Batch Scanning Engine**: Automated queueing and execution for multi-site suites (including pre-configured 30-site benchmark benchmarks), with concurrent execution and race-free database state.
- **Exportable Audit Reports**: Downloadable audit reports in **JSON** and **CSV** formats, featuring configurable redaction for tokens, authorization headers, and sensitive parameters.
- **Strict SSRF Guard**: Defense-in-depth protection blocking private/internal subnets (RFC 1918, RFC 4193, CGNAT, loopbacks, link-local) and preventing DNS rebinding attacks.

---

## System Architecture

### Architecture Overview

```
                          ┌───────────────────────────────────────┐
                          │   Frontend (React + Vite + ReactFlow)  │
                          └───────────────────┬───────────────────┘
                                              │ HTTP / REST
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ FastAPI Backend Application                                                             │
│                                                                                         │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────────┐  │
│  │   API Layer (/api)    │   │  SSRF & Policy Guard  │   │ Measurement Context Svc   │  │
│  │  - Scans & Batch      │──▶│  - RFC1918/4193 block │   │ - Public IPv4/IPv6 Egress │  │
│  │  - Reports & Context  │   │  - Port filtering     │   │ - Resolver Classification │  │
│  └──────────┬────────────┘   └───────────────────────┘   └───────────────────────────┘  │
│             │                                                                           │
│             ▼                                                                           │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Scanner Engine                                                                    │  │
│  │  ├─ Phase 1: Browser Capture (Playwright / Chromium + CDP Network Events)         │  │
│  │  ├─ Phase 2: Host Extraction & Dual-Stack DNS Resolution (dnspython)              │  │
│  │  ├─ Phase 3: Per-Family TCP, TLS & HTTP Probing (Async Sockets & HTTPX)           │  │
│  │  └─ Phase 4: Dependency Graph Builder & Classifier Verdicts                       │  │
│  └───────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                      │                                                  │
│                                      ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Database Layer (SQLAlchemy 2.0 - SQLite / PostgreSQL)                             │  │
│  │ Tables: Scan | Resource | HostProbe | MeasurementContext | Batch | BatchSite      │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Scanning & Probing Lifecycle

1. **Target Enqueueing & SSRF Validation**: The target URL is sanitized, port-checked, and resolved to ensure it does not point to restricted IP ranges.
2. **Page Navigation & CDP Monitoring**: A fresh Chromium browser context opens the URL, waiting for network idle while logging all requests, responses, and initiator metadata.
3. **Host Extraction**: All unique hostnames referenced during page load are gathered.
4. **Dual-Stack DNS Probing**: For each host, DNS A (IPv4) and AAAA (IPv6) queries are dispatched concurrently.
5. **Transport & Application Probing**: For hosts advertising IPv6 addresses, direct TCP connect, TLS handshake, and HTTP GET probes are executed against each address and compared directly against IPv4 behavior.
6. **Verdict & Graph Assembly**: Results are compiled into classified verdicts (`IPv6_REACHABLE`, `DNS_FAILURE`, `TCP_FAILURE`, `TLS_FAILURE`, `HTTP_FAILURE`), stored in the database, and formatted for the interactive UI.

---

## Tech Stack

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) with [Uvicorn](https://www.uvicorn.org/)
- **Browser Automation**: [Playwright](https://playwright.dev/python/) (Chromium) + Chrome DevTools Protocol (CDP)
- **Networking & DNS**: [dnspython](https://www.dnspython.org/), [httpx](https://www.python-httpx.org/), standard Python `socket` & `ssl`
- **ORM & Data Storage**: [SQLAlchemy 2.0](https://www.sqlalchemy.org/) with SQLite (default) and PostgreSQL support
- **Data Validation & Settings**: [Pydantic v2](https://docs.pydantic.dev/), `python-dotenv`
- **Testing**: [pytest](https://docs.pytest.org/), `pytest-asyncio`

### Frontend
- **Framework**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Graph Visualization**: [ReactFlow](https://reactflow.dev/) (custom styled nodes and edges for dependency hierarchy)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **Unit & UI Testing**: [Vitest](https://vitest.dev/), `@testing-library/react`, `jsdom`

---

## Project Directory Structure

```text
A3-PS027-TC039/
├── backend/
│   ├── app/
│   │   ├── api/                 # FastAPI routes (scans, batch, context, reports)
│   │   ├── models/              # SQLAlchemy database models & schemas (tables.py, db.py)
│   │   ├── reports/             # JSON & CSV report generators + redaction filters
│   │   ├── scanner/             # Core scanning engine
│   │   │   ├── browser.py       # Playwright CDP automation & network interception
│   │   │   ├── classifier.py    # Readiness verdict classification logic
│   │   │   ├── context.py       # Network measurement context & egress detection
│   │   │   ├── dependency_graph.py # Hierarchy & parent-child inference engine
│   │   │   ├── dns_checker.py   # Dual-stack DNS probing (A vs AAAA)
│   │   │   ├── family_probe.py  # Orchestrates TCP/TLS/HTTP family comparisons
│   │   │   ├── http_checker.py  # HTTP response stage checker
│   │   │   ├── resource_discovery.py # CDP resource processing
│   │   │   ├── ssrf_guard.py    # IP validation, private subnet blocking & rebinding guard
│   │   │   ├── tcp_checker.py   # TCP socket connect probing
│   │   │   └── tls_checker.py   # TLS handshake & certificate verification
│   │   ├── services/            # Background tasks & batch orchestration
│   │   ├── config.py            # Application settings & environment parsing
│   │   ├── main.py              # FastAPI application entrypoint
│   │   └── middleware.py        # Request size validation and CORS handling
│   ├── tests/                   # Pytest test suite (unit, integration & security tests)
│   ├── requirements.txt         # Python dependencies
│   └── sites.json               # Default 30 benchmark sites for batch auditing
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── BatchView.jsx    # Batch scanning interface and progress
│   │   │   ├── DependencyGraph.jsx # Interactive ReactFlow dependency graph
│   │   │   ├── FailuresView.jsx # Breakdown of failed and degraded resources
│   │   │   ├── IPv4Vs6View.jsx  # Side-by-side family comparison matrix
│   │   │   ├── Ipv6BrokenHighlight.jsx # High-priority IPv6 breakage highlight
│   │   │   ├── MeasurementsView.jsx # Measurement context and vantage point info
│   │   │   ├── ResourceTable.jsx # Complete tabular view of all assets
│   │   │   ├── StatusBadge.jsx  # Visual badges for verdicts and protocols
│   │   │   └── Footer.jsx       # Global footer with compliance & legal links
│   │   ├── pages/               # Main view pages (Dashboard, PrivacyPolicy, TermsOfUse)
│   │   ├── index.css            # Tailwind & global stylesheet
│   │   └── main.jsx             # React entrypoint
│   ├── package.json             # Frontend dependencies and scripts
│   └── vite.config.js           # Vite build configuration
├── controlled-site/             # Controlled test bed for deterministic validation
│   ├── content/                 # Test HTML/assets served for test runs
│   ├── server/                  # seed_server.py with configurable per-family failure modes
│   ├── tests/                   # Automated tests validating scanner accuracy against seeded faults
│   └── README.md                # Documentation of the controlled test bed
├── deploy/
│   └── DEPLOY.md                # Dual-stack VPS deployment instructions
├── docs/                        # Architecture diagrams, decisions record, and security audits
│   ├── architecture_diagram.jpg
│   ├── data_flow_diagram.jpg
│   ├── decisions.md             # Detailed engineering decision log
│   └── security-audit.md        # Comprehensive security audit report
├── start.py                     # Unified cross-platform runner (FastAPI + Vite)
├── start.sh                     # Bash launcher
├── start.ps1                    # PowerShell launcher
├── start.bat                    # Windows batch launcher
├── .env                         # Local environment configuration
└── README.md                    # Project documentation
```

---

## Getting Started

### Prerequisites

- **Python**: 3.10, 3.11, or 3.12
- **Node.js**: 18.x or later (with `npm`)
- **Git**

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/A3-PS027-TC039.git
   cd A3-PS027-TC039
   ```

2. **Set up the Backend**:
   ```bash
   cd backend
   python -m venv venv

   # Activate virtual environment
   # On Linux/macOS:
   source venv/bin/activate
   # On Windows (cmd):
   venv\Scripts\activate.bat
   # On Windows (PowerShell):
   .\venv\Scripts\Activate.ps1

   pip install -r requirements.txt
   playwright install chromium
   cd ..
   ```

3. **Set up the Frontend**:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

### Running the Application

We provide a convenient unified launcher that starts both the backend (on port 8000) and the frontend (on port 5173), verifies ports, streams logs, and shuts down cleanly on `Ctrl+C`:

```bash
# Using Python:
python start.py

# Or on Linux / macOS:
./start.sh

# Or on Windows PowerShell:
.\start.ps1

# Or on Windows Command Prompt:
start.bat
```

Once running:
- **Auditor Dashboard**: Open `http://localhost:5173`
- **Backend API Documentation**: Open `http://localhost:8000/docs` (Swagger UI) or `http://localhost:8000/redoc`

---

## Configuration & Environment Variables

Configuration is loaded from `.env` in the project root or backend directory. Key settings:

| Variable | Default Value | Description |
|---|---|---|
| `AUDITOR_DB_URL` | `sqlite:///./data/auditor.db` | Database connection string (SQLite or PostgreSQL) |
| `AUDITOR_MAX_RESOURCES` | `400` | Maximum network resources captured per scan |
| `AUDITOR_PAGE_TIMEOUT_MS` | `30000` | Browser navigation timeout in milliseconds |
| `AUDITOR_IDLE_TIMEOUT_MS` | `8000` | Network idle wait timeout in milliseconds |
| `AUDITOR_SCAN_DEADLINE_S` | `90` | Overall scan deadline in seconds before aborting |
| `AUDITOR_MAX_CONCURRENT_SCANS`| `2` | Maximum simultaneous single-URL scans |
| `AUDITOR_PROBE_CONCURRENCY` | `10` | Worker concurrency for TCP/TLS/HTTP host probes |
| `AUDITOR_BATCH_CONCURRENCY` | `3` | Concurrent site scans during batch runs |
| `AUDITOR_ALLOWED_PORTS` | `80,443,8080,8443` | Outbound ports permitted by the SSRF firewall |
| `AUDITOR_SSRF_ALLOW_HOSTS` | `""` | Comma-separated domains exempt from private IP checks (for test environments) |

---

## API Reference

### Scan Endpoints

- `POST /api/scans`
  - Enqueue a scan for a target URL.
  - **Body**: `{"url": "https://example.com"}`
  - **Response**: `{"scan_id": "...", "status": "QUEUED"}`

- `GET /api/scans/{scan_id}`
  - Retrieve detailed scan status, summary statistics, and classified resource list.

- `GET /api/scans/{scan_id}/graph`
  - Retrieve ReactFlow-compatible nodes and edges representing the dependency graph.

- `GET /api/scans/{scan_id}/report.json?redact=true`
  - Download structured JSON report (supports optional token/credential redaction).

- `GET /api/scans/{scan_id}/report.csv?redact=true`
  - Download tabular CSV report.

### Batch Endpoints

- `POST /api/batch`
  - Launch a batch scan across the default 30 benchmark sites or a custom URL list.
  - **Body (optional)**: `{"sites": [{"name": "Site A", "url": "https://site-a.com"}]}`

- `GET /api/batch/{batch_id}`
  - Retrieve progress, status breakdown, and per-site scan results.

### Measurement Context & System Health

- `GET /api/context`
  - Inspect scanner vantage point context (public IPv4/IPv6 egress, DNS resolvers, Geo-IP).

- `GET /api/health`
  - System health check and scanner version indicator.

---

## Controlled Test Environment

To rigorously test failure detection without depending on unpredictable external networks, the project includes a dedicated **Controlled Test Bed** in `controlled-site/`:

- **Purpose**: Serves pages with deliberately seeded sub-resources representing every failure stage:
  - `dual-stack`: Fully working over IPv4 and IPv6 (`IPv6_REACHABLE`).
  - `v4only-img`: Advertises `A` record only, no `AAAA` record (`DNS_FAILURE`).
  - `v6-tcp-fail`: Advertises `AAAA`, but TCP port is closed/refused (`TCP_FAILURE`).
  - `v6-tls-fail`: Advertises `AAAA`, connects TCP, but fails TLS handshake (`TLS_FAILURE`).
  - `v6-http-fail`: Advertises `AAAA`, completes TLS, but returns HTTP 500 error (`HTTP_FAILURE`).
- **Automated Verification**: Run `python -m pytest controlled-site/tests -q` to verify the classifier detects every single seeded condition with 100% precision.

---

## Security & SSRF Mitigation

Because the auditor performs real-browser navigation and socket connections to arbitrary user-supplied URLs, strict SSRF protections are implemented (`backend/app/scanner/ssrf_guard.py`):

1. **Private and Loopback Subnet Blocking**:
   - Rejects loopback addresses (`127.0.0.0/8`, `::1`).
   - Rejects RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   - Rejects RFC 4193 Unique Local Addresses (`fc00::/7`) and Link-Local subnets (`169.254.0.0/16`, `fe80::/10`).
   - Rejects Carrier-Grade NAT (RFC 6598) and broadcast addresses.
2. **DNS Rebinding Prevention**: Resolved IP addresses are checked immediately prior to connecting; sockets connect directly to verified IPs rather than re-resolving hostnames.
3. **Port Filtering**: Outbound network traffic is strictly restricted to standard web ports (`80`, `443`, `8080`, `8443`).
4. **Request & Body Size Caps**: Request payloads are limited to 1 MiB to mitigate Denial of Service (DoS) attacks.
5. **Report Sanitization**: Query parameters resembling credentials, API tokens, session IDs, and `Authorization` headers are masked before report generation.

---

## Testing & Quality Assurance

### Running Backend Tests
Includes unit tests for SSRF guards, DNS checkers, protocol probes, classifier rules, and API endpoints:
```bash
pytest backend/tests
```

### Running Frontend Tests
Includes unit and render tests for React components, graph visualizers, and state transitions:
```bash
cd frontend
npm test
```

### Running Controlled Site Test Verification
Verifies classifier accuracy against synthetic IPv6 failure scenarios:
```bash
python -m pytest controlled-site/tests -q
```

---

## Deployment

The project can be deployed on any dual-stack Linux host (Ubuntu 22.04+ recommended) or managed cloud server:

1. **System Packages**: Install Python 3.10+, Node.js, and Chromium dependencies (`playwright install --with-deps chromium`).
2. **Database**: Use the built-in SQLite database for lightweight single-node installations, or point `AUDITOR_DB_URL` to an external PostgreSQL instance for multi-worker production deployments.
3. **Reverse Proxy**: Place behind Nginx or Caddy to handle SSL termination and forward traffic to FastAPI (`http://127.0.0.1:8000`) and the static frontend build.
4. **Detailed VPS Deployment Guide**: See [deploy/DEPLOY.md](file:///d:/Full%20Stack%20Projects/A3-PS027-TC039/deploy/DEPLOY.md) for production configuration, public DNS setups, and running multiple origin probes on dedicated IPv6 interfaces.

---

## License & Acknowledgments

This project was built for the **AIORI-3 Hackathon** under Problem Statement **PS-027**.

- Built with [Playwright](https://playwright.dev/) for browser instrumentation.
- Network and graph visualizations powered by [ReactFlow](https://reactflow.dev/) and [TailwindCSS](https://tailwindcss.com/).
