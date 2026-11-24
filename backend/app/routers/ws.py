import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import User, Conversation, MeetingRoom, Message, CallLog
from ..ws_manager import (
    ws_manager,
    serialize_user,
    serialize_message,
    serialize_call_log,
)

router = APIRouter(tags=["WebSocket Signaling & Real-Time Chat"])


def _append_call_event_message(
    db: Session,
    caller_id: str,
    callee_id: str,
    text: str,
) -> Optional[ Conversation ]:
    """If a 1:1 conversation exists between caller and callee, log a call_event message."""
    conv = (
        db.query(Conversation)
        .filter(
            or_(
                and_(
                    Conversation.participant_1_id == caller_id,
                    Conversation.participant_2_id == callee_id,
                ),
                and_(
                    Conversation.participant_1_id == callee_id,
                    Conversation.participant_2_id == caller_id,
                ),
            )
        )
        .first()
    )
    if not conv:
        return None
    now = datetime.now(timezone.utc)
    msg = Message(
        id=f"msg-{uuid.uuid4().hex[:10]}",
        conversation_id=conv.id,
        sender_id=caller_id,
        content=text,
        message_type="call_event",
        created_at=now,
    )
    conv.updated_at = now
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return conv


async def _terminate_call(
    db: Session,
    call_id: str,
    ended_by_user_id: str,
    reason: str = "ended",
):
    """Cleanly terminate an active or ringing call, persist CallLog, and notify both peers."""
    call_info = ws_manager.active_calls.pop(call_id, None)
    call_log = db.query(CallLog).filter(CallLog.id == call_id).first()

    now = datetime.now(timezone.utc)
    caller_id = call_info["caller_id"] if call_info else (call_log.caller_id if call_log else None)
    callee_id = call_info["callee_id"] if call_info else (call_log.callee_id if call_log else None)
    call_type = call_info["call_type"] if call_info else (call_log.call_type if call_log else "audio")

    duration_seconds = 0
    final_status = "COMPLETED"

    if call_log:
        if reason == "rejected":
            final_status = "REJECTED"
        elif call_log.status == "RINGING":
            final_status = "MISSED"
        else:
            final_status = "COMPLETED"
            if call_log.answered_at:
                answered = call_log.answered_at
                if answered.tzinfo is None:
                    answered = answered.replace(tzinfo=timezone.utc)
                duration_seconds = max(1, int((now - answered).total_seconds()))

        call_log.status = final_status
        call_log.duration_seconds = duration_seconds
        call_log.ended_at = now
        db.commit()
        db.refresh(call_log)

    # Restore presence for caller and callee
    for uid in [caller_id, callee_id]:
        if uid:
            ws_manager.set_presence(uid, "online")

    await ws_manager.broadcast(
        {
            "type": "presence:update",
            "online_users": ws_manager.get_online_users(),
        }
    )

    serialized_log = serialize_call_log(call_log).model_dump(mode="json") if call_log else None

    # Log call summary into their 1:1 chat thread if one exists
    if caller_id and callee_id:
        label = "Video call" if call_type == "video" else "Audio call"
        if final_status == "COMPLETED":
            mins, secs = divmod(duration_seconds, 60)
            dur_str = f"{mins}m {secs}s" if mins else f"{secs}s"
            summary_text = f"📞 {label} ended • Duration {dur_str}"
        elif final_status == "REJECTED":
            summary_text = f"📵 {label} declined"
        else:
            summary_text = f"📲 Missed {label.lower()}"

        conv = _append_call_event_message(db, caller_id, callee_id, summary_text)
        if conv and conv.messages:
            latest_msg = serialize_message(conv.messages[-1]).model_dump(mode="json")
            await ws_manager.send_to_users(
                [caller_id, callee_id],
                {
                    "type": "chat:message",
                    "conversation_id": conv.id,
                    "message": latest_msg,
                },
            )

    event_type = "call:rejected" if reason == "rejected" else "call:ended"
    targets = [uid for uid in [caller_id, callee_id] if uid]
    await ws_manager.send_to_users(
        targets,
        {
            "type": event_type,
            "call_id": call_id,
            "ended_by": ended_by_user_id,
            "reason": reason,
            "status": final_status,
            "duration_seconds": duration_seconds,
            "call_log": serialized_log,
        },
    )


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await ws_manager.connect(user_id, websocket)

    # Check if there is any pending incoming call for this user
    pending_incoming = [
        call_data
        for call_data in ws_manager.active_calls.values()
        if call_data.get("callee_id") == user_id and call_data.get("status") == "RINGING"
    ]

    await websocket.send_json(
        {
            "type": "connection:established",
            "user_id": user_id,
            "online_users": ws_manager.get_online_users(),
            "pending_incoming_calls": pending_incoming,
        }
    )

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "")

            db = SessionLocal()
            try:
                # 1. Real-time 1:1 Chat Message via WebSocket
                if event_type == "chat:message":
                    conversation_id = data.get("conversation_id")
                    content = (data.get("content") or "").strip()
                    if not conversation_id or not content:
                        continue
                    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
                    sender = db.query(User).filter(User.id == user_id).first()
                    if not conv or not sender:
                        continue

                    now = datetime.now(timezone.utc)
                    msg = Message(
                        id=f"msg-{uuid.uuid4().hex[:10]}",
                        conversation_id=conversation_id,
                        sender_id=user_id,
                        content=content,
                        message_type=data.get("message_type", "text"),
                        created_at=now,
                    )
                    conv.updated_at = now
                    db.add(msg)
                    db.commit()
                    db.refresh(msg)

                    serialized = serialize_message(msg).model_dump(mode="json")
                    await ws_manager.send_to_users(
                        [conv.participant_1_id, conv.participant_2_id],
                        {
                            "type": "chat:message",
                            "conversation_id": conversation_id,
                            "message": serialized,
                        },
                    )

                # 2. Real-time Meeting Room Message via WebSocket
                elif event_type == "room:message":
                    room_id = data.get("room_id")
                    content = (data.get("content") or "").strip()
                    if not room_id or not content:
                        continue
                    room = db.query(MeetingRoom).filter(MeetingRoom.id == room_id).first()
                    sender = db.query(User).filter(User.id == user_id).first()
                    if not room or not sender:
                        continue

                    msg = Message(
                        id=f"rmsg-{uuid.uuid4().hex[:10]}",
                        room_id=room_id,
                        sender_id=user_id,
                        content=content,
                        message_type=data.get("message_type", "text"),
                        created_at=datetime.now(timezone.utc),
                    )
                    db.add(msg)
                    db.commit()
                    db.refresh(msg)

                    serialized = serialize_message(msg).model_dump(mode="json")
                    member_ids = [m.user_id for m in room.members]
                    await ws_manager.send_to_users(
                        member_ids,
                        {
                            "type": "room:message",
                            "room_id": room_id,
                            "message": serialized,
                        },
                    )

                # 3. Call Signaling: Initiate Audio/Video Call
                elif event_type == "call:initiate":
                    callee_id = data.get("callee_id")
                    call_type = data.get("call_type", "audio")
                    property_title = data.get("property_title", "LandConnect Property Inquiry")
                    sdp_offer = data.get("sdp_offer")
                    room_id = data.get("room_id")

                    caller = db.query(User).filter(User.id == user_id).first()
                    callee = db.query(User).filter(User.id == callee_id).first()
                    if not caller or not callee:
                        await websocket.send_json(
                            {
                                "type": "call:error",
                                "message": "Caller or recipient user profile not found.",
                            }
                        )
                        continue

                    call_id = data.get("call_id") or f"call-{uuid.uuid4().hex[:10]}"
                    now = datetime.now(timezone.utc)

                    call_log = CallLog(
                        id=call_id,
                        caller_id=user_id,
                        callee_id=callee_id,
                        room_id=room_id,
                        call_type=call_type,
                        status="RINGING",
                        property_title=property_title,
                        duration_seconds=0,
                        started_at=now,
                    )
                    db.add(call_log)
                    db.commit()
                    db.refresh(call_log)

                    caller_public = serialize_user(caller).model_dump(mode="json")
                    callee_public = serialize_user(callee).model_dump(mode="json")

                    call_state = {
                        "call_id": call_id,
                        "caller_id": user_id,
                        "callee_id": callee_id,
                        "caller": caller_public,
                        "callee": callee_public,
                        "call_type": call_type,
                        "property_title": property_title,
                        "room_id": room_id,
                        "status": "RINGING",
                        "sdp_offer": sdp_offer,
                        "started_at": now.isoformat(),
                    }
                    ws_manager.active_calls[call_id] = call_state

                    callee_online = await ws_manager.send_to_user(
                        callee_id,
                        {
                            "type": "call:incoming",
                            "call_id": call_id,
                            "caller": caller_public,
                            "callee": callee_public,
                            "call_type": call_type,
                            "property_title": property_title,
                            "room_id": room_id,
                            "sdp_offer": sdp_offer,
                            "started_at": now.isoformat(),
                        },
                    )

                    await ws_manager.send_to_user(
                        user_id,
                        {
                            "type": "call:outgoing_ack",
                            "call_id": call_id,
                            "caller": caller_public,
                            "callee": callee_public,
                            "call_type": call_type,
                            "property_title": property_title,
                            "callee_online": callee_online,
                            "started_at": now.isoformat(),
                        },
                    )

                # 4. Call Signaling: Callee device notifies ringing
                elif event_type == "call:ringing":
                    call_id = data.get("call_id")
                    call_info = ws_manager.active_calls.get(call_id)
                    if call_info:
                        await ws_manager.send_to_user(
                            call_info["caller_id"],
                            {
                                "type": "call:ringing",
                                "call_id": call_id,
                                "callee_id": user_id,
                            },
                        )

                # 5. Call Signaling: Accept Incoming Call
                elif event_type == "call:accept":
                    call_id = data.get("call_id")
                    sdp_answer = data.get("sdp_answer")
                    call_info = ws_manager.active_calls.get(call_id)
                    call_log = db.query(CallLog).filter(CallLog.id == call_id).first()

                    if not call_info and not call_log:
                        await websocket.send_json(
                            {"type": "call:error", "message": "Call no longer active."}
                        )
                        continue

                    now = datetime.now(timezone.utc)
                    caller_id = call_info["caller_id"] if call_info else call_log.caller_id
                    callee_id = call_info["callee_id"] if call_info else call_log.callee_id

                    if call_info:
                        call_info["status"] = "ONGOING"
                        call_info["answered_at"] = now.isoformat()
                        call_info["sdp_answer"] = sdp_answer

                    if call_log:
                        call_log.status = "ONGOING"
                        call_log.answered_at = now
                        db.commit()
                        db.refresh(call_log)

                    ws_manager.set_presence(caller_id, "in_call")
                    ws_manager.set_presence(callee_id, "in_call")
                    await ws_manager.broadcast(
                        {
                            "type": "presence:update",
                            "online_users": ws_manager.get_online_users(),
                        }
                    )

                    await ws_manager.send_to_user(
                        caller_id,
                        {
                            "type": "call:accepted",
                            "call_id": call_id,
                            "callee_id": callee_id,
                            "sdp_answer": sdp_answer,
                            "answered_at": now.isoformat(),
                        },
                    )
                    await ws_manager.send_to_user(
                        callee_id,
                        {
                            "type": "call:connected",
                            "call_id": call_id,
                            "caller_id": caller_id,
                            "answered_at": now.isoformat(),
                        },
                    )

                # 6. Call Signaling: Reject Incoming Call
                elif event_type == "call:reject":
                    call_id = data.get("call_id")
                    if call_id:
                        await _terminate_call(
                            db,
                            call_id=call_id,
                            ended_by_user_id=user_id,
                            reason="rejected",
                        )

                # 7. Call Signaling: Exchange WebRTC ICE Candidates
                elif event_type == "call:ice-candidate":
                    call_id = data.get("call_id")
                    candidate = data.get("candidate")
                    target_user_id = data.get("target_user_id")

                    if not target_user_id and call_id in ws_manager.active_calls:
                        cinfo = ws_manager.active_calls[call_id]
                        target_user_id = (
                            cinfo["callee_id"]
                            if cinfo["caller_id"] == user_id
                            else cinfo["caller_id"]
                        )

                    if target_user_id:
                        await ws_manager.send_to_user(
                            target_user_id,
                            {
                                "type": "call:ice-candidate",
                                "call_id": call_id,
                                "from_user_id": user_id,
                                "candidate": candidate,
                            },
                        )

                # 8. Call Signaling: Toggle Mute / Camera On-Off During Active Call
                elif event_type == "call:media-toggle":
                    call_id = data.get("call_id")
                    target_user_id = data.get("target_user_id")
                    if not target_user_id and call_id in ws_manager.active_calls:
                        cinfo = ws_manager.active_calls[call_id]
                        target_user_id = (
                            cinfo["callee_id"]
                            if cinfo["caller_id"] == user_id
                            else cinfo["caller_id"]
                        )
                    if target_user_id:
                        await ws_manager.send_to_user(
                            target_user_id,
                            {
                                "type": "call:media-toggle",
                                "call_id": call_id,
                                "from_user_id": user_id,
                                "audio_enabled": data.get("audio_enabled", True),
                                "video_enabled": data.get("video_enabled", True),
                            },
                        )

                # 9. Call Signaling: End Ongoing Call
                elif event_type == "call:end":
                    call_id = data.get("call_id")
                    if call_id:
                        await _terminate_call(
                            db,
                            call_id=call_id,
                            ended_by_user_id=user_id,
                            reason="ended",
                        )

                # 10. Multi-Party Meeting Room Call Signaling
                elif event_type == "room:call:join":
                    room_id = data.get("room_id")
                    call_type = data.get("call_type", "video")
                    if not room_id:
                        continue
                    if room_id not in ws_manager.room_call_participants:
                        ws_manager.room_call_participants[room_id] = set()

                    existing_participants = list(ws_manager.room_call_participants[room_id])
                    ws_manager.room_call_participants[room_id].add(user_id)
                    ws_manager.set_presence(user_id, "in_call")

                    user_obj = db.query(User).filter(User.id == user_id).first()
                    user_public = serialize_user(user_obj).model_dump(mode="json") if user_obj else {"id": user_id}

                    # Notify existing participants that a new peer joined the room call
                    await ws_manager.send_to_users(
                        existing_participants,
                        {
                            "type": "room:call:peer_joined",
                            "room_id": room_id,
                            "peer": user_public,
                            "call_type": call_type,
                            "participants": list(ws_manager.room_call_participants[room_id]),
                        },
                    )
                    # Confirm to joining user with the list of existing participants to connect to
                    await ws_manager.send_to_user(
                        user_id,
                        {
                            "type": "room:call:joined",
                            "room_id": room_id,
                            "existing_participants": existing_participants,
                            "participants": list(ws_manager.room_call_participants[room_id]),
                        },
                    )
                    await ws_manager.broadcast(
                        {
                            "type": "room:call:participants",
                            "room_id": room_id,
                            "participants": list(ws_manager.room_call_participants[room_id]),
                        }
                    )

                elif event_type == "room:call:signal":
                    # Relay offer / answer / ice-candidate between two peers in a meeting room call
                    room_id = data.get("room_id")
                    target_user_id = data.get("target_user_id")
                    signal_data = data.get("signal")
                    if room_id and target_user_id and signal_data:
                        await ws_manager.send_to_user(
                            target_user_id,
                            {
                                "type": "room:call:signal",
                                "room_id": room_id,
                                "from_user_id": user_id,
                                "signal": signal_data,
                            },
                        )

                elif event_type == "room:call:leave":
                    room_id = data.get("room_id")
                    if room_id and room_id in ws_manager.room_call_participants:
                        ws_manager.room_call_participants[room_id].discard(user_id)
                        ws_manager.set_presence(user_id, "online")
                        remaining = list(ws_manager.room_call_participants[room_id])
                        await ws_manager.broadcast(
                            {
                                "type": "room:call:participants",
                                "room_id": room_id,
                                "participants": remaining,
                                "left_user_id": user_id,
                            }
                        )

            finally:
                db.close()

    except WebSocketDisconnect:
        interrupted_calls = await ws_manager.disconnect(user_id, websocket)
        if interrupted_calls:
            db = SessionLocal()
            try:
                for cid in interrupted_calls:
                    await _terminate_call(
                        db,
                        call_id=cid,
                        ended_by_user_id=user_id,
                        reason="disconnected",
                    )
            finally:
                db.close()
