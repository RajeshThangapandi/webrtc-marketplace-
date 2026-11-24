import json
from typing import Dict, Set, List, Any
from fastapi import WebSocket
from .models import User, LandListing, Message, Conversation, MeetingRoom, CallLog
from .schemas import (
    UserPublicSchema,
    LandListingSchema,
    MessageSchema,
    ConversationSchema,
    MeetingRoomSchema,
    CallLogSchema,
    mask_phone,
)


class ConnectionManager:
    """Manages active WebSocket connections, presence, meeting rooms, and WebRTC signaling."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.user_status: Dict[str, str] = {}
        self.active_calls: Dict[str, Dict[str, Any]] = {}
        self.room_call_participants: Dict[str, Set[str]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        if self.user_status.get(user_id) != "in_call":
            self.user_status[user_id] = "online"

        await self.broadcast(
            {
                "type": "presence:update",
                "user_id": user_id,
                "presence": self.get_presence(user_id),
                "online_users": self.get_online_users(),
            }
        )

    async def disconnect(self, user_id: str, websocket: WebSocket) -> List[str]:
        interrupted_calls: List[str] = []
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                self.user_status.pop(user_id, None)

                for call_id, call_info in list(self.active_calls.items()):
                    if user_id in (call_info.get("caller_id"), call_info.get("callee_id")):
                        interrupted_calls.append(call_id)

                for room_id, participants in list(self.room_call_participants.items()):
                    if user_id in participants:
                        participants.discard(user_id)
                        await self.broadcast(
                            {
                                "type": "room:call:participants",
                                "room_id": room_id,
                                "participants": list(participants),
                                "left_user_id": user_id,
                            }
                        )

                await self.broadcast(
                    {
                        "type": "presence:update",
                        "user_id": user_id,
                        "presence": "offline",
                        "online_users": self.get_online_users(),
                    }
                )
        return interrupted_calls

    def get_presence(self, user_id: str) -> str:
        if user_id not in self.active_connections or not self.active_connections[user_id]:
            return "offline"
        return self.user_status.get(user_id, "online")

    def set_presence(self, user_id: str, status: str):
        if user_id in self.active_connections and self.active_connections[user_id]:
            self.user_status[user_id] = status

    def get_online_users(self) -> Dict[str, str]:
        return {
            uid: self.get_presence(uid)
            for uid in self.active_connections
            if self.active_connections[uid]
        }

    def get_room_call_participants(self, room_id: str) -> List[str]:
        return list(self.room_call_participants.get(room_id, set()))

    async def send_to_user(self, user_id: str, payload: Dict[str, Any]) -> bool:
        sockets = list(self.active_connections.get(user_id, set()))
        if not sockets:
            return False
        delivered = False
        for ws in sockets:
            try:
                await ws.send_json(payload)
                delivered = True
            except Exception:
                self.active_connections.get(user_id, set()).discard(ws)
        return delivered

    async def send_to_users(self, user_ids: List[str], payload: Dict[str, Any]):
        for uid in set(user_ids):
            await self.send_to_user(uid, payload)

    async def broadcast(self, payload: Dict[str, Any]):
        for uid in list(self.active_connections.keys()):
            await self.send_to_user(uid, payload)


ws_manager = ConnectionManager()


def serialize_user(user: User) -> UserPublicSchema:
    allow_calls = getattr(user, "allow_direct_calls", True)
    hide_contact = getattr(user, "hide_contact_details", True)
    return UserPublicSchema(
        id=user.id,
        name=user.name,
        role=user.role,
        in_app_handle=user.in_app_handle,
        avatar_color=user.avatar_color,
        bio=user.bio,
        is_verified=user.is_verified,
        allow_direct_calls=True if allow_calls is None else allow_calls,
        hide_contact_details=True if hide_contact is None else hide_contact,
        can_manage_listings=user.role in ("seller", "broker"),
        masked_contact=mask_phone(user.private_phone),
        presence=ws_manager.get_presence(user.id),
    )


def serialize_listing(listing: LandListing) -> LandListingSchema:
    try:
        image_urls = json.loads(listing.image_urls_json or "[]")
    except Exception:
        image_urls = []
    try:
        features = json.loads(listing.features_json or "[]")
    except Exception:
        features = []

    return LandListingSchema(
        id=listing.id,
        title=listing.title,
        description=listing.description,
        category=listing.category,
        price_display=listing.price_display,
        price_numeric=listing.price_numeric,
        area_display=listing.area_display,
        location_name=listing.location_name,
        latitude=listing.latitude,
        longitude=listing.longitude,
        image_urls=image_urls,
        features=features,
        status=listing.status,
        owner_id=listing.owner_id,
        owner=serialize_user(listing.owner),
        created_at=listing.created_at,
        updated_at=listing.updated_at,
    )


def serialize_message(msg: Message) -> MessageSchema:
    return MessageSchema(
        id=msg.id,
        conversation_id=msg.conversation_id,
        room_id=msg.room_id,
        sender_id=msg.sender_id,
        sender_name=msg.sender.name if msg.sender else "Unknown",
        sender_role=msg.sender.role if msg.sender else "buyer",
        content=msg.content,
        message_type=msg.message_type,
        is_read=bool(getattr(msg, "is_read", False)),
        created_at=msg.created_at,
    )


def serialize_conversation(conv: Conversation, viewer_user_id: str | None = None) -> ConversationSchema:
    last_msg = serialize_message(conv.messages[-1]) if conv.messages else None
    unread_count = 0
    if viewer_user_id and conv.messages:
        unread_count = sum(
            1
            for m in conv.messages
            if m.sender_id != viewer_user_id and not bool(getattr(m, "is_read", False))
        )
    return ConversationSchema(
        id=conv.id,
        participant_1=serialize_user(conv.participant_1),
        participant_2=serialize_user(conv.participant_2),
        property_id=conv.property_id,
        property_title=conv.property_title,
        property_price=conv.property_price,
        property_location=conv.property_location,
        unread_count=unread_count,
        last_message=last_msg,
        updated_at=conv.updated_at,
    )


def serialize_meeting_room(room: MeetingRoom) -> MeetingRoomSchema:
    members = [serialize_user(m.user) for m in room.members if m.user]
    last_msg = serialize_message(room.messages[-1]) if room.messages else None
    return MeetingRoomSchema(
        id=room.id,
        name=room.name,
        description=room.description,
        property_title=room.property_title,
        property_location=room.property_location,
        created_by_id=room.created_by_id,
        is_active=room.is_active,
        members=members,
        active_call_participants=ws_manager.get_room_call_participants(room.id),
        last_message=last_msg,
        created_at=room.created_at,
    )


def serialize_call_log(call: CallLog) -> CallLogSchema:
    return CallLogSchema(
        id=call.id,
        caller=serialize_user(call.caller),
        callee=serialize_user(call.callee) if call.callee else None,
        room_id=call.room_id,
        call_type=call.call_type,
        status=call.status,
        property_title=call.property_title,
        duration_seconds=call.duration_seconds,
        started_at=call.started_at,
        answered_at=call.answered_at,
        ended_at=call.ended_at,
    )
