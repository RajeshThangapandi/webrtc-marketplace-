from fastapi.testclient import TestClient
from app.main import app


def _drain_until_type(ws, expected_type: str, max_reads: int = 10):
    """Read WebSocket JSON messages until expected_type arrives."""
    for _ in range(max_reads):
        msg = ws.receive_json()
        if msg.get("type") == expected_type:
            return msg
    raise AssertionError(f"Did not receive expected WebSocket event '{expected_type}'")


def test_users_and_privacy_masking():
    with TestClient(app) as client:
        res = client.get("/api/users")
        assert res.status_code == 200
        users = res.json()
        assert len(users) >= 3

        roles = {u["role"] for u in users}
        assert {"buyer", "seller", "broker"}.issubset(roles)

        for u in users:
            # Ensure personal phone and email are never exposed
            assert "private_phone" not in u
            assert "private_email" not in u
            assert "Hidden" in u["masked_contact"] or "Protected" in u["masked_contact"]


def test_conversations_and_meeting_rooms():
    with TestClient(app) as client:
        # 1. Check seeded conversations
        convs = client.get("/api/conversations?user_id=user-buyer-1").json()
        assert len(convs) >= 2

        # 2. Send a 1:1 message from Buyer and verify Seller's unread_count increments dynamically
        conv_id = convs[0]["id"]
        other_user_id = (
            convs[0]["participant_2"]["id"]
            if convs[0]["participant_1"]["id"] == "user-buyer-1"
            else convs[0]["participant_1"]["id"]
        )
        msg_res = client.post(
            f"/api/conversations/{conv_id}/messages",
            json={
                "sender_id": "user-buyer-1",
                "content": "Can we start a video call to inspect the plot markers?",
            },
        )
        assert msg_res.status_code == 200
        assert msg_res.json()["sender_role"] == "buyer"
        assert msg_res.json()["is_read"] is False

        # Recipient checks conversations -> unread_count > 0
        other_convs = client.get(f"/api/conversations?user_id={other_user_id}").json()
        target_conv = next(c for c in other_convs if c["id"] == conv_id)
        assert target_conv["unread_count"] >= 1

        # Recipient marks conversation as read -> unread_count drops to 0
        read_res = client.post(
            f"/api/conversations/{conv_id}/read?user_id={other_user_id}"
        )
        assert read_res.status_code == 200
        other_convs_after = client.get(f"/api/conversations?user_id={other_user_id}").json()
        target_conv_after = next(c for c in other_convs_after if c["id"] == conv_id)
        assert target_conv_after["unread_count"] == 0

        # 3. Check seeded meeting rooms
        rooms = client.get("/api/meeting-rooms").json()
        assert len(rooms) >= 2
        room_id = rooms[0]["id"]

        # 4. Send a meeting room message
        rmsg_res = client.post(
            f"/api/meeting-rooms/{room_id}/messages",
            json={
                "sender_id": "user-broker-1",
                "content": "Starting the tri-party conference call now.",
            },
        )
        assert rmsg_res.status_code == 200
        assert rmsg_res.json()["room_id"] == room_id


def test_full_webrtc_call_signaling_accept_and_end():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/user-buyer-1") as ws_buyer, client.websocket_connect(
            "/ws/user-seller-1"
        ) as ws_seller:
            est_buyer = _drain_until_type(ws_buyer, "connection:established")
            assert est_buyer["user_id"] == "user-buyer-1"
            est_seller = _drain_until_type(ws_seller, "connection:established")
            assert est_seller["user_id"] == "user-seller-1"

            # Step 1: Buyer initiates a Video Call to Seller
            ws_buyer.send_json(
                {
                    "type": "call:initiate",
                    "callee_id": "user-seller-1",
                    "call_type": "video",
                    "property_title": "Green Valley 5-Acre Agricultural Land",
                    "sdp_offer": {"type": "offer", "sdp": "v=0...mock-sdp-offer"},
                }
            )

            ack = _drain_until_type(ws_buyer, "call:outgoing_ack")
            incoming = _drain_until_type(ws_seller, "call:incoming")

            call_id = ack["call_id"]
            assert incoming["call_id"] == call_id
            assert incoming["call_type"] == "video"
            assert incoming["caller"]["id"] == "user-buyer-1"
            assert incoming["sdp_offer"]["type"] == "offer"
            assert ack["callee_online"] is True

            # Step 2: Seller device sends ringing acknowledgement
            ws_seller.send_json({"type": "call:ringing", "call_id": call_id})
            ring_evt = _drain_until_type(ws_buyer, "call:ringing")
            assert ring_evt["call_id"] == call_id

            # Step 3: Seller accepts the call with an SDP answer
            ws_seller.send_json(
                {
                    "type": "call:accept",
                    "call_id": call_id,
                    "sdp_answer": {"type": "answer", "sdp": "v=0...mock-sdp-answer"},
                }
            )
            accepted = _drain_until_type(ws_buyer, "call:accepted")
            assert accepted["call_id"] == call_id
            assert accepted["sdp_answer"]["type"] == "answer"

            connected = _drain_until_type(ws_seller, "call:connected")
            assert connected["call_id"] == call_id

            # Step 4: Exchange ICE Candidates
            ws_buyer.send_json(
                {
                    "type": "call:ice-candidate",
                    "call_id": call_id,
                    "candidate": {"candidate": "candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host"},
                }
            )
            ice_evt = _drain_until_type(ws_seller, "call:ice-candidate")
            assert ice_evt["call_id"] == call_id
            assert ice_evt["from_user_id"] == "user-buyer-1"

            # Step 5: Toggle Mic / Camera state during call
            ws_seller.send_json(
                {
                    "type": "call:media-toggle",
                    "call_id": call_id,
                    "audio_enabled": False,
                    "video_enabled": True,
                }
            )
            toggle_evt = _drain_until_type(ws_buyer, "call:media-toggle")
            assert toggle_evt["audio_enabled"] is False

            # Step 6: End the ongoing call
            ws_buyer.send_json({"type": "call:end", "call_id": call_id})
            ended_buyer = _drain_until_type(ws_buyer, "call:ended")
            ended_seller = _drain_until_type(ws_seller, "call:ended")

            assert ended_buyer["status"] == "COMPLETED"
            assert ended_seller["status"] == "COMPLETED"
            assert ended_buyer["call_log"]["id"] == call_id


def test_webrtc_call_reject_flow():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/user-buyer-1") as ws_buyer, client.websocket_connect(
            "/ws/user-broker-1"
        ) as ws_broker:
            _drain_until_type(ws_buyer, "connection:established")
            _drain_until_type(ws_broker, "connection:established")

            ws_buyer.send_json(
                {
                    "type": "call:initiate",
                    "callee_id": "user-broker-1",
                    "call_type": "audio",
                    "property_title": "NH-48 Highway Commercial Corner Plot",
                    "sdp_offer": {"type": "offer", "sdp": "v=0...audio-offer"},
                }
            )
            ack = _drain_until_type(ws_buyer, "call:outgoing_ack")
            incoming = _drain_until_type(ws_broker, "call:incoming")
            call_id = ack["call_id"]
            assert incoming["call_id"] == call_id

            # Broker rejects the incoming call
            ws_broker.send_json({"type": "call:reject", "call_id": call_id})
            rejected = _drain_until_type(ws_buyer, "call:rejected")
            assert rejected["call_id"] == call_id
            assert rejected["status"] == "REJECTED"
