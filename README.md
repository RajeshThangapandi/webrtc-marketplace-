# LandConnect — WhatsApp-Inspired Land Marketplace Mobile & Web Application

LandConnect is a full-stack real estate land marketplace prototype featuring a clean, intuitive, **WhatsApp-inspired interface (`#075E54` / `#128C7E` / `#25D366`)** that connects **Buyers**, **Sellers**, and **Brokers** to discover geotagged land parcels, manage property listings, collaborate in multi-party deal meeting rooms, and conduct **encrypted in-app WebRTC audio and video calls** without sharing personal phone numbers.

---

## Core Functional Requirements Implemented

| # | Requirement | Implementation Highlights |
|---|---|---|
| **1** | **User Authentication & Role Management** | JWT-authenticated Registration (`POST /api/auth/register`) & Login (`POST /api/auth/login`), supporting **`Buyer`**, **`Seller`**, and **`Broker`** roles, plus an instant 1-click Demo Role Switcher in the top bar for multi-user evaluation. |
| **2** | **Community & Land Listings** | Dedicated **COMMUNITY** tab displaying verified land listings with high-res imagery, category badges (`Agricultural`, `Commercial`, `Residential`, `Orchard`, `Industrial`), pricing, acreage, GPS coordinates, and 1-tap **Message**, **Audio Call**, and **Video Call** buttons. |
| **3** | **Property Listing Management (CRUD)** | Role-guarded creation (`POST /api/listings`), editing (`PUT /api/listings/{id}`), and deletion (`DELETE /api/listings/{id}`) restricted strictly to **`Seller`** and **`Broker`** roles (`403 Forbidden` for Buyers). Supports local photo upload, preset imagery, and interactive GPS pin dropping. |
| **4** | **Maps & Geolocation** | Interactive **MAPS** tab with clickable price markers plotted by `latitude` & `longitude`, satellite/survey terrain toggle, embedded OpenStreetMap parcel tile view, property inspector drawer, and **"Click Map to Geotag New Plot"** mode for Sellers and Brokers. |
| **5** | **Messaging & Meeting Rooms** | Real-time WebSocket 1:1 WhatsApp-style chat threads (**CHATS** tab) linked to specific land listings, plus multi-party **Deal Meeting Rooms** (**MEETING ROOMS** tab) where Buyers, Sellers, and Brokers negotiate together and launch room calls. |
| **6** | **In-App Audio & Video Calling *(Key Requirement)*** | End-to-end **WebRTC** (`RTCPeerConnection`) + **FastAPI WebSocket Signaling** supporting outgoing ring, full-screen **Incoming Call Modal** (**Accept** / **Decline**), **Active Call Screen** with Picture-in-Picture (PiP) local camera, live `MM:SS` duration timer, **Mic Mute/Unmute**, **Video On/Off**, **Webcam $\leftrightarrow$ Plot Telemetry Camera Switch**, and automatic call history logging (**CALLS** tab). |
| **7** | **Privacy & Access Control** | All API and WebSocket payloads strip `private_phone` and `private_email`, displaying masked contact badges (`+91 ••••• ••210 (Hidden)`) so users communicate strictly in-app. |

---

## Technology Stack

* **Frontend / Mobile UI:** React 18, TypeScript, Vite, Expo/Mobile config ([mobile/app.json](file:///Users/rajesh07/Downloads/landconnect/mobile/app.json)), Lucide Icons, native WebRTC (`RTCPeerConnection`, `MediaStream`, `getUserMedia` + 30fps Canvas/WebAudio fallback telemetry synthesizer), OpenStreetMap geospatial integration.
* **Backend & Real-Time Signaling:** Python 3.13, **FastAPI**, **WebSockets** (`/ws/{user_id}`), **SQLAlchemy 2.0** (compatible with **PostgreSQL** via `DATABASE_URL` and zero-config local SQLite out of the box), custom HS256 **JWT Authentication** & **PBKDF2-SHA256** password hashing.
* **Testing:** `pytest` + Starlette/FastAPI `TestClient` covering REST APIs, RBAC permissions, privacy masking, and concurrent multi-peer WebSocket call signaling.

---

## Quick Start & Execution Instructions

### 1. Start the Backend & Unified Web/Mobile Server
```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# Run automated test suite (11 tests)
./.venv/bin/pytest -v

# Start the FastAPI + WebSocket server on port 8000
./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open **http://localhost:8000** in your browser. FastAPI serves both the REST/WebSocket APIs and the compiled mobile/web frontend.

### 2. (Optional) Run Frontend in Vite Hot-Reload Dev Mode
```bash
cd mobile
npm install
npm run dev
```
This launches the dev server at **http://localhost:5173** with `/api` and `/ws` proxied to `http://127.0.0.1:8000`.

---

## Demo Accounts & Testing In-App Audio/Video Calls

| Role | Name | Email / Login ID | Password | Capabilities |
|---|---|---|---|---|
| **Buyer** | Rajesh T | `buyer@landconnect.si` | `landconnect123` | Browse Community & Maps, Chat, Join Meeting Rooms, Make Audio/Video Calls |
| **Seller** | Anita Sharma | `seller@landconnect.si` | `landconnect123` | Create/Edit/Delete Land Listings, Geotag on Map, Chat, Audio/Video Calls |
| **Broker** | Vikram Patel | `broker@landconnect.si` | `landconnect123` | Create/Manage Listings, Create Multi-Party Deal Rooms, Audio/Video Calls |
| **Buyer 2** | Meera Nair | `meera@landconnect.si` | `landconnect123` | Browse, Inquire, Join Inspection Rooms, Audio/Video Calls |

### How to Demo Live 2-Way Audio & Video Calling on One Machine:
1. Open **http://localhost:8000** in **Window 1** (logged in as **Rajesh T — `BUYER`**).
2. Click **"Open 2nd Device"** in the top-right header bar to open **Window 2** (logged in as **Anita Sharma — `SELLER`**).
3. From any land listing card on the **COMMUNITY** tab (or from the **MAPS**, **CHATS**, or **CALLS** tab), click **Video Call** or **Audio Call**.
4. In **Window 2**, the full-screen **Incoming Call Modal** rings immediately—click **Accept Video** (or **Decline** to test rejection).
5. During the active call, test **Mute**, **Video On/Off**, **Switch Cam (Plot Telemetry Cam)**, and **End Call**.

---

## AI Tools Usage Summary

In accordance with Section 4 & Section 6.5 of the assignment guidelines, the following AI tools were used responsibly during development:

| AI Tool | How It Contributed |
|---|---|
| **Claude & ChatGPT** | System architecture planning, designing the WebRTC + FastAPI WebSocket signaling protocol (`call:initiate`, `call:ringing`, `call:accept`, `call:reject`, `call:ice-candidate`, `call:end`), RBAC permission modeling, and debugging WebRTC media track lifecycle edge cases. |
| **Cursor & GitHub Copilot** | FastAPI router & SQLAlchemy 2.0 model scaffolding, React + TypeScript component implementation, WhatsApp-inspired UI styling, and generating the 11-test `pytest` verification suite. |

*(Full technical breakdown and AI usage details are documented in [docs/TECHNICAL_DOCUMENTATION.md](file:///Users/rajesh07/Downloads/landconnect/docs/TECHNICAL_DOCUMENTATION.md).)*
