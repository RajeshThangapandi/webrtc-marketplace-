from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, index=True)  # "buyer" | "seller" | "broker"
    in_app_handle = Column(String, unique=True, nullable=False, index=True)
    avatar_color = Column(String, default="#128C7E")
    bio = Column(String, default="")
    # Private fields — protected by LandConnect privacy layer (never sent in public API payloads)
    private_phone = Column(String, nullable=True)
    private_email = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=True)
    is_verified = Column(Boolean, default=True)
    allow_direct_calls = Column(Boolean, default=True)
    hide_contact_details = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    listings = relationship("LandListing", back_populates="owner")


class LandListing(Base):
    __tablename__ = "land_listings"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False, default="agricultural", index=True)
    price_display = Column(String, nullable=False)
    price_numeric = Column(Float, nullable=False, default=0.0)
    area_display = Column(String, nullable=False)
    location_name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    image_urls_json = Column(Text, nullable=False, default="[]")
    features_json = Column(Text, nullable=False, default="[]")
    status = Column(String, nullable=False, default="available")  # "available" | "under_offer" | "sold"
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow)

    owner = relationship("User", back_populates="listings")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, index=True)
    participant_1_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    participant_2_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    property_id = Column(String, nullable=True)
    property_title = Column(String, default="General Land Inquiry")
    property_price = Column(String, default="")
    property_location = Column(String, default="")
    updated_at = Column(DateTime(timezone=True), default=utcnow)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    participant_1 = relationship("User", foreign_keys=[participant_1_id])
    participant_2 = relationship("User", foreign_keys=[participant_2_id])
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class MeetingRoom(Base):
    __tablename__ = "meeting_rooms"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    property_title = Column(String, default="")
    property_location = Column(String, default="")
    created_by_id = Column(String, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id])
    members = relationship(
        "MeetingRoomMember",
        back_populates="room",
        cascade="all, delete-orphan",
    )
    messages = relationship(
        "Message",
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class MeetingRoomMember(Base):
    __tablename__ = "meeting_room_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String, ForeignKey("meeting_rooms.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    joined_at = Column(DateTime(timezone=True), default=utcnow)

    room = relationship("MeetingRoom", back_populates="members")
    user = relationship("User")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True, index=True)
    room_id = Column(String, ForeignKey("meeting_rooms.id"), nullable=True, index=True)
    sender_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    message_type = Column(String, default="text")  # "text" | "system" | "call_event"
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    conversation = relationship("Conversation", back_populates="messages")
    room = relationship("MeetingRoom", back_populates="messages")
    sender = relationship("User")


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(String, primary_key=True, index=True)
    caller_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    callee_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    room_id = Column(String, ForeignKey("meeting_rooms.id"), nullable=True, index=True)
    call_type = Column(String, nullable=False)  # "audio" | "video"
    status = Column(String, nullable=False, default="RINGING")  # RINGING | ONGOING | COMPLETED | REJECTED | MISSED
    property_title = Column(String, default="")
    duration_seconds = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    answered_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    caller = relationship("User", foreign_keys=[caller_id])
    callee = relationship("User", foreign_keys=[callee_id])
