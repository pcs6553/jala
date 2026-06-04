<div align="center">

# 💧 Water Bill Calculator

A self-contained web app to calculate monthly water-consumption bills from meter readings, store them in a lightweight database, and generate professional PDF receipts — built with Flask + SQLite and a zero-build vanilla frontend, packaged to run anywhere with Docker.

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [How Billing Works](#how-billing-works)
- [Quick Start (Docker)](#quick-start-docker)
- [Running Without Docker](#running-without-docker)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [Admin Panel](#admin-panel)
- [PDF Receipts](#pdf-receipts)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Data & Persistence](#data--persistence)
- [Development Notes](#development-notes)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Water Bill Calculator helps a housing society / landlord generate monthly water bills for individual tenants based on meter readings. It supports a configurable rate per litre, automatically computes consumption and the total amount, stores every bill, recalls the previous reading for a meter, and produces a downloadable A4 PDF receipt — all from the browser.

It runs as a small Flask service backed by a single SQLite file, served together with a static single-page frontend (no JavaScript build step required).

## Features

- **Dashboard with live preview** — a two-column desktop layout: an entry form beside a sticky panel that shows consumption, total amount, a usage meter, and a reading breakdown as you type.
- **Tabbed navigation** — *Dashboard*, *Bill History*, and *Admin*, via a sidebar (desktop) or a tab bar (mobile).
- **Summary stat cards** — total bills, units billed, total billed (₹), and meters tracked.
- **Tenant & property details** — tenant name, mobile number, flat/unit, floor, meter number, society name (fixed to "Mathru Nilaya").
- **Dropdowns** — Flat/Unit (`GND`, `F-1`…`F-4`) and Floor (`Gnd Flr`…`4th Flr`).
- **Dynamic rate per litre** — type any rate, or use quick presets (50p, 70p, ₹1, ₹1.50, ₹2). Defaults to ₹0.70.
- **Previous-reading recall** — entering a meter number auto-fills the last reading from that meter's most recent bill (and prefills tenant/flat/floor/mobile if blank).
- **Auto calculation** — consumption and total computed and validated on the server.
- **Visual usage meter** — animated bar (scaled to 5,000 L) with green/amber/red tiers.
- **Optional remarks** — free-text notes saved with the bill and printed on the PDF.
- **Professional PDF receipts** — generated in-browser, works offline.
- **Password-protected Admin** — view, edit, and delete any saved entry; edits recalculate totals automatically.
- **Toast notifications** for save / update / delete / login actions.
- **Responsive** — adapts cleanly between desktop and mobile.

## Tech Stack

| Layer | Technology |
|------|------------|
| Backend | Python 3.11, Flask 3.0 |
| Database | SQLite (WAL mode) |
| Frontend | Vanilla HTML / CSS / JavaScript (no framework, no build) |
| PDF | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 (bundled locally) |
| Packaging | Docker + Docker Compose |

## How Billing Works

```
Units Consumed (L) = Present Reading − Last Reading
Total Amount (₹)   = Units Consumed × Rate per Litre
```

**Example**

| Field | Value |
|---|---|
| Last Reading | 1,200 L |
| Present Reading | 1,850 L |
| Units Consumed | 650 L |
| Rate per Litre | ₹0.70 |
| **Total Amount** | **₹455.00** |

Validation enforced server-side: all required fields present, readings/rate numeric, `present ≥ last`, and `rate > 0`.

## Quick Start (Docker)

> Requires Docker Desktop / Docker Engine with Compose.

```bash
docker compose up -d --build
```

Then open **http://localhost:5001**.

> **Why 5001?** The container listens on port `5000` internally. `docker-compose.override.yml` maps it to host port **5001**. Remove or edit that override file to use `5000` (or any other host port).

Common operations:

```bash
docker logs -f jala-main-web-1     # view logs
docker compose down                # stop and remove the container
docker compose up -d --build       # rebuild after code changes
```

## Running Without Docker

```bash
pip install -r requirements.txt

# DATABASE_PATH must point to a writable location
# (the default /data/... path only exists inside the container)
DATABASE_PATH=./data/waterbills.db python run.py
```

The dev server starts on **http://localhost:5000**.

## Configuration

All configuration is via environment variables (with sensible defaults):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_PATH` | `/data/waterbills.db` | SQLite file location |
| `SECRET_KEY` | `mathru-nilaya-dev-secret` | Flask session signing key |
| `ADMIN_USER` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `pastword` | Admin login password |

In `docker-compose.yml`, `DATABASE_PATH` is set to `/data/waterbills.db` and `./data` is bind-mounted to `/data`. To change the admin credentials, add them under the `environment:` key and rebuild.

## Usage Guide

1. Open the app and stay on the **Dashboard** tab.
2. Fill in **Tenant Name**, **Mobile** (optional), **Flat/Unit**, **Floor**, **Meter Number**, and **Billing Month** (defaults to the current month).
3. Enter the **Last Reading** and **Present Reading** (litres). If the meter has prior bills, the last reading auto-fills — an "auto-filled" badge shows the recalled value.
4. Set the **Rate per Litre** — type it or tap a preset.
5. The **Live Preview** panel updates instantly with consumption, total, the usage meter, and a breakdown.
6. Optionally add **Remarks**.
7. Click **⚡ Save Bill** — the bill is stored and a PDF receipt downloads automatically.
8. Switch to **Bill History** to see all saved bills; download a PDF for any row.

## Admin Panel

The **Admin** tab is gated by a login (default `admin` / `pastword`).

- Lists every entry in the database with full detail (incl. floor & mobile).
- **✎ Edit** opens a modal to change any field; saving **recalculates units & total** on the server.
- **Delete** removes an entry (with confirmation).
- **Logout** ends the admin session.

Protection is server-side: the `PUT` and `DELETE` endpoints reject unauthenticated requests with `401`, so the database cannot be modified without logging in. Bill creation, history, and stats remain open.

## PDF Receipts

Receipts are generated entirely in the browser with a locally-bundled copy of jsPDF (no internet required). Each A4 receipt includes:

- Header band with the save-water logo, society name, and bill number
- *Billed To* (tenant, flat/floor, meter, mobile) and *Bill Details* (month, issue date, bill no.)
- Readings & charges table (previous/present readings, units, rate)
- Highlighted **Total Amount Due** with amount in words
- Remarks (if provided) and a footer band

> Amounts in the PDF are prefixed `Rs.` rather than `₹`, because jsPDF's core fonts do not include the rupee glyph. The web UI uses `₹`.

## API Reference

Base URL: `http://localhost:5001` (Docker) or `:5000` (local).

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | — | Serves the single-page app |
| `GET` | `/api/bills` | — | List all bills (newest first) |
| `POST` | `/api/bills` | — | Create a bill (computes units/total) |
| `GET` | `/api/bills/<id>` | — | Fetch a single bill |
| `PUT` | `/api/bills/<id>` | **admin** | Update a bill (recomputes units/total) |
| `DELETE` | `/api/bills/<id>` | **admin** | Delete a bill |
| `GET` | `/api/last-reading?meter_number=...` | — | Most recent bill for a meter (for prefill) |
| `POST` | `/api/admin/login` | — | `{username, password}` → starts admin session |
| `POST` | `/api/admin/logout` | — | Ends admin session |
| `GET` | `/api/admin/status` | — | `{authenticated: bool}` |

**Create example**

```bash
curl -X POST http://localhost:5001/api/bills \
  -H "Content-Type: application/json" \
  -d '{
    "society_name": "Mathru Nilaya",
    "tenant_name": "Asha",
    "flat_number": "GND",
    "floor": "Gnd Flr",
    "mobile": "9876543210",
    "meter_number": "MN-001",
    "billing_month": "2026-06",
    "last_reading": "1000",
    "present_reading": "1280",
    "rate_per_unit": "0.09",
    "remarks": ""
  }'
```

Required fields: `society_name`, `tenant_name`, `flat_number`, `floor`, `meter_number`, `billing_month`, `last_reading`, `present_reading`, `rate_per_unit`. `mobile` and `remarks` are optional. The server returns the stored bill including computed `units_consumed` and `total_amount`.

## Project Structure

```
.
├── app/
│   ├── __init__.py          # Flask app factory, config, init
│   ├── database.py          # SQLite connection + schema + additive migration
│   ├── models.py            # BILL_FIELDS + row_to_dict serializer
│   ├── routes.py            # API endpoints + admin auth
│   └── static/
│       ├── index.html       # Single-page UI (3 views)
│       ├── app.js           # All frontend logic
│       ├── style.css        # All styling (responsive)
│       └── vendor/
│           └── jspdf.umd.min.js   # Bundled PDF library
├── Dockerfile
├── docker-compose.yml       # Base service (port 5000, ./data volume)
├── docker-compose.override.yml  # Maps host port 5001
├── requirements.txt
├── run.py                   # Entry point (app.run on :5000)
└── CLAUDE.md                # Guidance for AI coding assistants
```

## Architecture

- **App factory** (`app/__init__.py`) — `create_app()` reads env config, initializes the database, and registers the routes blueprint.
- **Database layer** (`app/database.py`) — one SQLite connection per request stored on Flask's `g` (WAL journaling). `init_db()` creates the `bills` table and runs an **additive migration**: it inspects `PRAGMA table_info` and issues `ALTER TABLE ADD COLUMN` for any missing columns, so the schema can evolve without dropping data.
- **Serialization** (`app/models.py`) — `BILL_FIELDS` defines the canonical field list; `row_to_dict` maps DB rows to JSON. It is kept in sync with the table columns.
- **Server-authoritative math** (`app/routes.py`) — `units = present − last` and `total = units × rate` are computed and validated on create and update. The frontend mirrors this only for the live preview.
- **Frontend** (`app/static/`) — a single page with three views (`#view-dashboard`, `#view-history`, `#view-admin`) toggled by a `.view-active` class. Element IDs are the contract between `index.html` and `app.js`. PDF generation and meter prefill run client-side.

## Data & Persistence

- Storage is a single SQLite file at `DATABASE_PATH` (container: `/data/waterbills.db`).
- With Docker, `./data` on the host is bind-mounted to `/data`, so bills **persist across container restarts and rebuilds**.
- The `data/` directory and `*.db` files are gitignored.

## Development Notes

- **No build step** for the frontend — it's plain HTML/CSS/JS.
- **Static assets are baked into the image** (`Dockerfile` does `COPY . .`). After editing `index.html`, `app.js`, or `style.css`, you must **rebuild** (`docker compose up -d --build`) and hard-refresh the browser (`Ctrl+Shift+R`) to bypass cached assets.
- There is no automated test suite or linter; verify changes by rebuilding and exercising the API/UI.
- Adding a new bill field: add the column in `database.py` (both the `CREATE TABLE` and the migration loop), add it to `BILL_FIELDS` in `models.py`, handle it in `routes.py` create/update, and wire the input + display in the frontend.

## Security Notes

This app is designed as a lightweight tool for a trusted environment (e.g. a home/society LAN):

- Admin auth uses a plaintext credential pair and Flask session cookies over the **development server** (HTTP).
- It is **not hardened** for public internet exposure. For that you would want HTTPS, hashed credentials, a production WSGI server (e.g. gunicorn/uWSGI behind a reverse proxy), and a strong `SECRET_KEY`.
- Always override `ADMIN_PASSWORD` and `SECRET_KEY` via environment variables before any non-local deployment.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Edits to HTML/CSS/JS don't show up | Rebuild: `docker compose up -d --build`, then hard-refresh (`Ctrl+Shift+R`). |
| Port 5000 already allocated | Another service holds 5000; this project uses host **5001** via the override file. |
| PDF doesn't download | Hard-refresh so the bundled jsPDF loads; the app shows an alert if the engine is missing. |
| Admin edits return 401 | Session expired or not logged in — sign in again on the Admin tab. |
| `gh`/git auth | Not part of this app; manage credentials outside the project. |

---

<div align="center">
Mathru Nilaya — Water Billing System
</div>
