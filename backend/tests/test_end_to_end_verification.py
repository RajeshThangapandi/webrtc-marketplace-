from fastapi.testclient import TestClient
from app.main import app


def _drain_until_type(ws, expected_type: str, max_reads: int = 12):
    for _ in range(max_reads):
        msg = ws.receive_json()
        if msg.get("type") == expected_type:
            return msg
    raise AssertionError(f"Expected WebSocket event '{expected_type}' was not received.")


def test_tc01_ui_and_health_check():
    """TC-01: Verify UI index.html and /api/health endpoint are served properly."""
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        ui_res = client.get("/")
        assert ui_res.status_code == 200
        assert "LandConnect" in ui_res.text


def test_tc03_realtime_websocket_1on1_chat():
    """TC-03: Verify real-time 1:1 WebSocket message delivery between Buyer and Seller."""
    with TestClient(app) as client:
        conv_id = "conv-buyer-seller-1"

        with client.websocket_connect("/ws/user-buyer-1") as ws_buyer, client.websocket_connect(
            "/ws/user-seller-1"
        ) as ws_seller:
            _drain_until_type(ws_buyer, "connection:established")
            _drain_until_type(ws_seller, "connection:established")

            ws_buyer.send_json(
                {
                    "type": "chat:message",
                    "conversation_id": conv_id,
                    "content": "Hello Anita, testing real-time WebSocket message delivery!",
                }
            )

            buyer_evt = _drain_until_type(ws_buyer, "chat:message")
            seller_evt = _drain_until_type(ws_seller, "chat:message")
            assert buyer_evt["message"]["content"] == "Hello Anita, testing real-time WebSocket message delivery!"
            assert seller_evt["message"]["sender_id"] == "user-buyer-1"


def test_tc07_missed_call_hangup_before_answer():
    """TC-07: Verify caller hanging up while ringing records a MISSED call."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws/user-buyer-1") as ws_buyer, client.websocket_connect(
            "/ws/user-seller-1"
        ) as ws_seller:
            _drain_until_type(ws_buyer, "connection:established")
            _drain_until_type(ws_seller, "connection:established")

            ws_buyer.send_json(
                {
                    "type": "call:initiate",
                    "callee_id": "user-seller-1",
                    "call_type": "audio",
                    "property_title": "Green Valley 5-Acre Agricultural Land",
                    "sdp_offer": {"type": "offer", "sdp": "v=0..."},
                }
            )
            ack = _drain_until_type(ws_buyer, "call:outgoing_ack")
            _drain_until_type(ws_seller, "call:incoming")
            call_id = ack["call_id"]

            # Caller cancels call before seller answers
            ws_buyer.send_json({"type": "call:end", "call_id": call_id})
            ended_buyer = _drain_until_type(ws_buyer, "call:ended")
            ended_seller = _drain_until_type(ws_seller, "call:ended")

            assert ended_buyer["status"] == "MISSED"
            assert ended_seller["status"] == "MISSED"
            assert ended_buyer["duration_seconds"] == 0


def test_tc08_meeting_room_group_call_signaling():
    """TC-08: Verify multi-party Meeting Room conference call join, peer signal, and leave."""
    with TestClient(app) as client:
        rooms = client.get("/api/meeting-rooms").json()
        room_id = rooms[0]["id"]

        with client.websocket_connect("/ws/user-broker-1") as ws_broker, client.websocket_connect(
            "/ws/user-buyer-1"
        ) as ws_buyer:
            _drain_until_type(ws_broker, "connection:established")
            _drain_until_type(ws_buyer, "connection:established")

            # Broker joins room call first
            ws_broker.send_json(
                {"type": "room:call:join", "room_id": room_id, "call_type": "video"}
            )
            joined_broker = _drain_until_type(ws_broker, "room:call:joined")
            assert "user-broker-1" in joined_broker["participants"]

            # Buyer joins the same room call
            ws_buyer.send_json(
                {"type": "room:call:join", "room_id": room_id, "call_type": "video"}
            )
            peer_joined = _drain_until_type(ws_broker, "room:call:peer_joined")
            assert peer_joined["peer"]["id"] == "user-buyer-1"

            # Buyer sends WebRTC signal to Broker in room
            ws_buyer.send_json(
                {
                    "type": "room:call:signal",
                    "room_id": room_id,
                    "target_user_id": "user-broker-1",
                    "signal": {"type": "offer", "sdp": "v=0...room-offer"},
                }
            )
            relayed = _drain_until_type(ws_broker, "room:call:signal")
            assert relayed["from_user_id"] == "user-buyer-1"
            assert relayed["signal"]["type"] == "offer"

            # Buyer leaves room call
            ws_buyer.send_json({"type": "room:call:leave", "room_id": room_id})
            part_evt = _drain_until_type(ws_broker, "room:call:participants")
            assert part_evt["left_user_id"] == "user-buyer-1"
