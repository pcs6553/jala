# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-property water-billing web app ("Mathru Nilaya"). A Flask + SQLite backend serves a JSON API and a static single-page frontend (vanilla HTML/CSS/JS, no build step). Users enter meter readings; the app computes consumption and amount, stores bills, and generates a PDF receipt entirely in the browser.

## Commands

Docker is the primary workflow. The container listens on **5000 internally**, but `docker-compose.override.yml` maps it to host port **5001** (host 5000 was taken by another container in the dev environment).

```bash
# Build + run (detached). RE-RUN THIS AFTER ANY CHANGE — see "Static asset gotcha".
docker compose up -d --build

# Logs / stop
docker logs -f jala-main-web-1
docker compose down

# App: http://localhost:5001   (NOT 5000 — see override file)
```

Run without Docker (note `DATABASE_PATH` must be set to a writable path; the `/data/...` default only exists in the container):

```bash
DATABASE_PATH=./data/waterbills.db python run.py   # serves on :5000
```

Smoke-test the API (adjust port to 5001 for Docker):

```bash
curl -s localhost:5001/api/bills
curl -s "localhost:5001/api/last-reading?meter_number=MN-001"
```

There is **no test suite and no linter/formatter configured.** Verification is done by rebuilding and hitting the API with `curl`.

## Static asset gotcha (most common mistake)

The `Dockerfile` does `COPY . .`, so `app/static/*` is **baked into the image at build time**. Only `./data` is a live volume mount. Editing `index.html`, `app.js`, or `style.css` has **no effect until you `docker compose up -d --build`**. After rebuilding, hard-refresh the browser (Ctrl+Shift+R) to bypass cached CSS/JS.

## Architecture

**Backend (`app/`)** — Flask app-factory pattern:
- `__init__.py` — `create_app()`; reads `DATABASE_PATH`, `SECRET_KEY`, `ADMIN_USER`, `ADMIN_PASSWORD` from env; runs `init_db()`; registers the blueprint.
- `database.py` — per-request SQLite connection on Flask `g` (WAL mode). `init_db()` creates the `bills` table **and runs an additive migration**: it reads `PRAGMA table_info` and `ALTER TABLE ADD COLUMN` for any missing columns. This is how the schema evolves without dropping existing data — **add new columns here this way, never with a destructive recreate.**
- `models.py` — `BILL_FIELDS` tuple + `row_to_dict`. This tuple is the serialization contract: it **must stay in sync** with the DB columns, and column order in `BILL_FIELDS` is the canonical field list used everywhere.
- `routes.py` — all endpoints. `GET/POST /api/bills`, `GET /api/bills/<id>`, `PUT/DELETE /api/bills/<id>`, `GET /api/last-reading`, and admin auth (`/api/admin/login|logout|status`). `/` serves `static/index.html`.

**The calculation is server-authoritative.** `units_consumed = present - last` and `total_amount = units * rate` are computed in `routes.py` on both create and update (with validation: required fields, numeric, `present >= last`, `rate > 0`). The frontend mirrors this only for the live preview — never trust client-sent units/totals.

**Auth.** `update_bill` and `delete_bill` are gated by the `admin_required` decorator (Flask session `is_admin`). Login/history/stats and bill creation are open; only DB **edits/deletes** require login. Credentials default to `admin`/`pastword`, overridable via `ADMIN_USER`/`ADMIN_PASSWORD`. This is lightweight (plaintext creds, HTTP dev server) — adequate for a trusted LAN tool, not hardened.

**Frontend (`app/static/`)** — one `index.html`, one `app.js`, one `style.css`, no framework:
- **Three views** (`#view-dashboard`, `#view-history`, `#view-admin`) inside one page, toggled by the `.view-active` class via `switchView()`. The sidebar (desktop) and `.mobile-tabs` (mobile) both drive it through `[data-view]`.
- **HTML element IDs are the contract** between `index.html` and `app.js` (e.g. `bill-form`, `preview-box`, `usage-bar`, `bills-tbody`, `e_*` modal fields). Preserve IDs when restructuring markup, or the JS silently breaks.
- **Meter prefill:** leaving the Meter Number field calls `/api/last-reading`, which returns that meter's most recent bill; its `present_reading` auto-fills the new `last_reading` (plus tenant/flat/floor/mobile if blank).
- **PDF:** generated client-side with jsPDF, **vendored at `static/vendor/jspdf.umd.min.js`** (not a CDN — works offline). Uses `Rs.` rather than `₹` because jsPDF's core fonts lack the rupee glyph.
- **Responsive split:** desktop (≥1024px) shows sidebar + topbar + stat cards + two-column dashboard (form | sticky live-preview); below 1024px these are hidden and it collapses to the single-column mobile layout. The breakpoint logic lives in `style.css` media queries, gated so mobile markup is unaffected.

## Data & persistence

SQLite at `DATABASE_PATH` (container `/data/waterbills.db`, bind-mounted to `./data`, which is gitignored). The `bills` table is the only table.
