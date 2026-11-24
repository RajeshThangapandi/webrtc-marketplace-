import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Conversation, MeetingRoom, MeetingRoomMember, Message
from ..schemas import (
    ConversationCreateSchema,
    ConversationSchema,
    MessageCreateSchema,
    MessageSchema,
    MeetingRoomCreateSchema,
    MeetingRoomJoinSchema,
    MeetingRoomSchema,
)
from ..ws_manager import (
    ws_manager,
    serialize_conversation,
    serialize_message,
    serialize_meeting_room,
)

router = APIRouter(prefix="/api", tags=["Messaging & Meeting Rooms"])


@router.get("/conversations", response_model=List[ConversationSchema])
def list_conversations(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """List 1:1 conversations, optionally filtered by participant user_id, with dynamic unread message counts."""
    query = db.query(Conversation)
    if user_id:
        query = query.filter(
            or_(
                Conversation.participant_1_id == user_id,
                Conversation.participant_2_id == user_id,
            )
        )
    convs = query.order_by(Conversation.updated_at.desc()).all()
    return [serialize_conversation(c, viewer_user_id=user_id) for c in convs]


@router.post("/conversations", response_model=ConversationSchema)
def create_or_get_conversation(
    payload: ConversationCreateSchema, db: Session = Depends(get_db)
):
    """Get existing 1:1 conversation between two users or create a new one."""
    if payload.participant_1_id == payload.participant_2_id:
        raise HTTPException(status_code=400, detail="Cannot start a conversation with yourself")

    u1 = db.query(User).filter(User.id == payload.participant_1_id).first()
    u2 = db.query(User).filter(User.id == payload.participant_2_id).first()
    if not u1 or not u2:
        raise HTTPException(status_code=404, detail="One or both participants not found")

    existing = (
        db.query(Conversation)
        .filter(
            or_(
                and_(
                    Conversation.participant_1_id == payload.participant_1_id,
                    Conversation.participant_2_id == payload.participant_2_id,
                ),
                and_(
                    Conversation.participant_1_id == payload.participant_2_id,
                    Conversation.participant_2_id == payload.participant_1_id,
                ),
            )
        )
        .first()
    )
    if existing:
        if payload.property_title and payload.property_title != "General Land Inquiry":
            existing.property_title = payload.property_title
            existing.property_id = payload.property_id or existing.property_id
            existing.property_price = payload.property_price or existing.property_price
            existing.property_location = payload.property_location or existing.property_location
            db.commit()
            db.refresh(existing)
        return serialize_conversation(existing)

    now = datetime.now(timezone.utc)
    conv = Conversation(
        id=f"conv-{uuid.uuid4().hex[:10]}",
        participant_1_id=payload.participant_1_id,
        participant_2_id=payload.participant_2_id,
        property_id=payload.property_id,
        property_title=payload.property_title,
        property_price=payload.property_price,
        property_location=payload.property_location,
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return serialize_conversation(conv)


@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageSchema])
def get_conversation_messages(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return [serialize_message(m) for m in conv.messages]


@router.post("/conversations/{conversation_id}/read")
async def mark_conversation_read(
    conversation_id: str,
    user_id: str,
    db: Session = Depends(get_db),
):
    """Mark all messages sent by the other participant in this conversation as read."""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    updated_count = 0
    for msg in conv.messages:
        if msg.sender_id != user_id and not getattr(msg, "is_read", False):
            msg.is_read = True
            updated_count += 1

    if updated_count > 0:
        db.commit()
        await ws_manager.send_to_users(
            [conv.participant_1_id, conv.participant_2_id],
            {
                "type": "chat:read",
                "conversation_id": conversation_id,
                "reader_id": user_id,
            },
        )

    return {
        "conversation_id": conversation_id,
        "reader_id": user_id,
        "marked_read": updated_count,
    }


@router.post("/conversations/{conversation_id}/messages", response_model=MessageSchema)
async def send_conversation_message(
    conversation_id: str,
    payload: MessageCreateSchema,
    db: Session = Depends(get_db),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    sender = db.query(User).filter(User.id == payload.sender_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")

    now = datetime.now(timezone.utc)
    msg = Message(
        id=f"msg-{uuid.uuid4().hex[:10]}",
        conversation_id=conversation_id,
        sender_id=payload.sender_id,
        content=payload.content,
        message_type=payload.message_type,
        created_at=now,
    )
    conv.updated_at = now
    db.add(msg)
    db.commit()
    db.refresh(msg)

    serialized = serialize_message(msg)
    await ws_manager.send_to_users(
        [conv.participant_1_id, conv.participant_2_id],
        {
            "type": "chat:message",
            "conversation_id": conversation_id,
            "message": serialized.model_dump(mode="json"),
        },
    )
    return serialized


@router.get("/meeting-rooms", response_model=List[MeetingRoomSchema])
def list_meeting_rooms(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """List multi-party Meeting Rooms."""
    rooms = db.query(MeetingRoom).order_by(MeetingRoom.created_at.desc()).all()
    if user_id:
        filtered = []
        for r in rooms:
            member_ids = {m.user_id for m in r.members}
            if user_id in member_ids or r.created_by_id == user_id:
                filtered.append(r)
        return [serialize_meeting_room(r) for r in filtered]
    return [serialize_meeting_room(r) for r in rooms]


@router.post("/meeting-rooms", response_model=MeetingRoomSchema)
async def create_meeting_room(
    payload: MeetingRoomCreateSchema, db: Session = Depends(get_db)
):
    creator = db.query(User).filter(User.id == payload.created_by_id).first()
    if not creator:
        raise HTTPException(status_code=404, detail="Creator user not found")

    now = datetime.now(timezone.utc)
    room_id = f"room-{uuid.uuid4().hex[:10]}"
    room = MeetingRoom(
        id=room_id,
        name=payload.name,
        description=payload.description,
        property_title=payload.property_title,
        property_location=payload.property_location,
        created_by_id=payload.created_by_id,
        is_active=True,
        created_at=now,
    )
    db.add(room)
    db.flush()

    unique_member_ids = set(payload.member_ids) | {payload.created_by_id}
    for uid in unique_member_ids:
        if db.query(User).filter(User.id == uid).first():
            db.add(MeetingRoomMember(room_id=room_id, user_id=uid, joined_at=now))

    sys_msg = Message(
        id=f"rmsg-{uuid.uuid4().hex[:10]}",
        room_id=room_id,
        sender_id=payload.created_by_id,
        content=f"{creator.name} ({creator.role.capitalize()}) created meeting room '{payload.name}'.",
        message_type="system",
        created_at=now,
    )
    db.add(sys_msg)
    db.commit()
    db.refresh(room)

    serialized = serialize_meeting_room(room)
    await ws_manager.broadcast(
        {
            "type": "room:created",
            "room": serialized.model_dump(mode="json"),
        }
    )
    return serialized


@router.post("/meeting-rooms/{room_id}/join", response_model=MeetingRoomSchema)
async def join_meeting_room(
    room_id: str, payload: MeetingRoomJoinSchema, db: Session = Depends(get_db)
):
    room = db.query(MeetingRoom).filter(MeetingRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Meeting room not found")

    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(MeetingRoomMember)
        .filter(
            MeetingRoomMember.room_id == room_id,
            MeetingRoomMember.user_id == payload.user_id,
        )
        .first()
    )
    if not existing:
        db.add(MeetingRoomMember(room_id=room_id, user_id=payload.user_id))
        db.commit()
        db.refresh(room)

    serialized = serialize_meeting_room(room)
    await ws_manager.broadcast(
        {
            "type": "room:updated",
            "room": serialized.model_dump(mode="json"),
        }
    )
    return serialized


@router.get("/meeting-rooms/{room_id}/messages", response_model=List[MessageSchema])
def get_meeting_room_messages(room_id: str, db: Session = Depends(get_db)):
    room = db.query(MeetingRoom).filter(MeetingRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Meeting room not found")
    return [serialize_message(m) for m in room.messages]


@router.post("/meeting-rooms/{room_id}/messages", response_model=MessageSchema)
async def send_meeting_room_message(
    room_id: str, payload: MessageCreateSchema, db: Session = Depends(get_db)
):
    room = db.query(MeetingRoom).filter(MeetingRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Meeting room not found")

    sender = db.query(User).filter(User.id == payload.sender_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")

    msg = Message(
        id=f"rmsg-{uuid.uuid4().hex[:10]}",
        room_id=room_id,
        sender_id=payload.sender_id,
        content=payload.content,
        message_type=payload.message_type,
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    serialized = serialize_message(msg)
    member_ids = [m.user_id for m in room.members]
    await ws_manager.send_to_users(
        member_ids,
        {
            "type": "room:message",
            "room_id": room_id,
            "message": serialized.model_dump(mode="json"),
        },
    )
    return serialized
