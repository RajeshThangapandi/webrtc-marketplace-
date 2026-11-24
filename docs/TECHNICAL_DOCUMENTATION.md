# LandConnect — Technical Documentation & AI Tools Usage Summary

## 1. System Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   LandConnect Mobile / Web Client (TypeScript)             │
│  ┌──────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌─────────┐  │
│  │ Community &  │ │ Geotag & │ │ 1:1 Chats │ │ Multi-Party  │ │ Calls   │  │
│  │ Listing CRUD │ │ Map View │ │ (WhatsApp)│ │ Meeting Rooms│ │ History │  │
│  └──────┬───────┘ └────┬─────┘ └─────┬─────┘ └──────┬───────┘ └────┬────┘  │
│         └──────────────┴─────────────┼──────────────┴──────────────┘       │
│                                      ▼                                     │
│         ┌────────────────────────────────────────────────────────┐         │
│         │   useCallManager Hook (WebRTC RTCPeerConnection + WS)  │         │
│         │   • Hardware getUserMedia + 30fps Plot Telemetry Cam   │         │
│         │   • SDP Offer/Answer, ICE Candidate Queue, Media Track │         │
│         └───────────────────┬────────────────────────┬───────────┘         │
└─────────────────────────────┼────────────────────────┼─────────────────────┘
                              │ REST + WebSocket       │ Direct P2P WebRTC
                              │ (/api/* & /ws/{id})    │ Media (SRTP Audio/Video)
                              ▼                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend & Signaling Engine                     │
│  • Auth & RBAC Router (/api/auth)   — JWT HS256, Buyer/Seller/Broker Guard │
│  • Listings Router (/api/listings)  — Geotagged CRUD + Real-Time Broadcast │
│  • Messaging Router (/api/...)      — 1:1 Conversations & Meeting Rooms    │
│  • Calls Router (/api/calls)        — Call Logs (COMPLETED/REJECTED/MISSED)│
│  • WebSocket Manager (/ws/{user_id})— Presence, Chat & WebRTC Signaling    │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                PostgreSQL / SQLite Database (SQLAlchemy 2.0)               │
│     Users • LandListings • Conversations • MeetingRooms • Messages • Calls │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Technical Decisions

1. **WebRTC + FastAPI WebSocket Signaling for In-App Audio & Video Calling:**
   * Rather than relying on external paid calling SDK keys that could expire or fail during evaluation, we implemented a native **WebRTC (`RTCPeerConnection`)** media pipeline coordinated by a custom **FastAPI WebSocket Signaling Server (`/ws/{user_id}`)** using Google's public STUN servers (`stun:stun.l.google.com:19302`).
   * **Why:** Zero third-party API key setup required for evaluators, sub-100ms peer-to-peer latency, and complete visibility into the signaling protocol (`call:initiate`, `call:incoming`, `call:ringing`, `call:accept`, `call:reject`, `call:ice-candidate`, `call:media-toggle`, `call:end`).

2. **Hardware Camera + 30fps Plot Telemetry Fallback Stream ([webrtcSynthesizer.ts](file:///Users/rajesh07/Downloads/landconnect/mobile/src/services/webrtcSynthesizer.ts)):**
   * **Challenge:** When demonstrating a 2-user video call across two browser tabs or simulators on the same computer, the operating system often locks the physical webcam to the first process, causing `getUserMedia` to fail on the second peer.
   * **Solution:** Our media acquisition layer attempts hardware `navigator.mediaDevices.getUserMedia` first, and if the camera is locked/unavailable—or when the Seller/Broker clicks **"Switch Cam (Plot Cam)"** during a call—it synthesizes a real-time 30fps `HTMLCanvasElement.captureStream(30)` + `AudioContext` `MediaStream` showing animated GPS plot boundaries and user telemetry. This feeds genuine media tracks into `RTCPeerConnection` so full WebRTC SDP/ICE negotiation and remote video rendering work reliably in every environment.

3. **Privacy-By-Design Contact Masking & Role-Based Access Control (RBAC):**
   * Personal phone numbers (`private_phone`) and email addresses (`private_email`) are stored in the `users` table for account authentication only and are never serialized in public schemas ([schemas.py](file:///Users/rajesh07/Downloads/landconnect/backend/app/schemas.py)). Instead, `mask_phone()` returns `+91 ••••• ••210 (Hidden)`.
   * Endpoint-level RBAC ([auth.py](file:///Users/rajesh07/Downloads/landconnect/backend/app/auth.py)) enforces `require_seller_or_broker` on `POST`, `PUT`, and `DELETE /api/listings`, returning `403 Forbidden` if a `Buyer` attempts to create or modify property listings.

4. **Dual-Mode Geospatial Maps ([MapsTab.tsx](file:///Users/rajesh07/Downloads/landconnect/mobile/src/components/MapsTab.tsx)):**
   * Combines an interactive regional geospatial canvas (supporting instant price-pin selection, zoom/pan, and 1-click **"Drop Pin to Geotag New Plot"**) with an embedded OpenStreetMap parcel tile view for street/terrain inspection—requiring zero proprietary map API keys.

---

## 3. AI Tools Usage Summary

In accordance with Section 4 & Section 6.5 of the assignment guidelines, the following AI-assisted development tools were used responsibly during the design, implementation, and verification of LandConnect:

* **Claude & ChatGPT (Architecture Planning & Protocol Design):**
  * Used to structure the 3-step implementation roadmap and formalize the full-duplex WebSocket signaling protocol (`call:initiate`, `call:incoming`, `call:ringing`, `call:accept`, `call:reject`, `call:ice-candidate`, `call:media-toggle`, `call:end`).
  * Assisted in designing the Role-Based Access Control (RBAC) permission boundaries for `Buyer`, `Seller`, and `Broker` roles and the Pydantic schema-level contact masking layer.
* **Cursor & GitHub Copilot (Code Scaffolding & TypeScript/FastAPI Implementation):**
  * Accelerated boilerplate generation for SQLAlchemy 2.0 relational models (`User`, `LandListing`, `Conversation`, `MeetingRoom`, `Message`, `CallLog`), FastAPI REST routers, and React/TypeScript WhatsApp-inspired UI components.
  * Assisted with inline type completions and CSS styling for the split-screen responsive layout and call overlays.
* **Debugging & Automated Testing Support (Claude / Cursor):**
  * Helped diagnose and resolve WebRTC media lifecycle edge cases, including early ICE-candidate queuing before `setRemoteDescription` completes, cloning `MediaStream` instances on multi-track `ontrack` events so remote video renders reliably, and building the 30-fps Canvas/WebAudio Plot Telemetry fallback stream.
  * Assisted in writing the 11-test `pytest` verification suite covering authentication, RBAC `403` enforcement, contact privacy masking, dynamic unread message counters, and concurrent WebSocket call signaling flows.
* **Developer Ownership & Independent Verification:**
  * All system architecture decisions, WebRTC peer connection flows, database schemas, and security controls were reviewed, tested end-to-end across concurrent sessions, and verified against all 7 functional requirements.
