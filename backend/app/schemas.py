from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


def mask_phone(phone: Optional[str]) -> str:
    """Mask personal phone number to enforce LandConnect privacy protection."""
    if not phone or len(phone) < 4:
        return "Protected by LandConnect"
    return f"+91 ••••• ••{phone[-3:]} (Hidden)"


class UserPublicSchema(BaseModel):
    id: str
    name: str
    role: str
    in_app_handle: str
    avatar_color: str
    bio: str
    is_verified: bool
    allow_direct_calls: bool = True
    hide_contact_details: bool = True
    can_manage_listings: bool = False
    masked_contact: str = "Protected by LandConnect"
    presence: str = "offline"  # "online" | "in_call" | "offline"

    model_config = ConfigDict(from_attributes=True)


class AuthRegisterSchema(BaseModel):
    name: str = Field(..., min_length=2)
    email: str = Field(..., min_length=4)
    phone: str = Field(default="+919800000000")
    password: str = Field(..., min_length=4)
    role: str = Field(..., pattern="^(buyer|seller|broker)$")
    bio: str = ""


class AuthLoginSchema(BaseModel):
    email_or_handle: str
    password: str


class AuthResponseSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublicSchema


class PrivacyUpdateSchema(BaseModel):
    allow_direct_calls: Optional[bool] = None
    hide_contact_details: Optional[bool] = None
    bio: Optional[str] = None


class LandListingCreateSchema(BaseModel):
    title: str = Field(..., min_length=3)
    description: str = Field(..., min_length=5)
    category: str = Field(default="agricultural")
    price_display: str = Field(..., min_length=2)
    price_numeric: float = Field(default=0.0)
    area_display: str = Field(..., min_length=2)
    location_name: str = Field(..., min_length=2)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    image_urls: List[str] = []
    features: List[str] = []
    status: str = "available"


class LandListingUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price_display: Optional[str] = None
    price_numeric: Optional[float] = None
    area_display: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    image_urls: Optional[List[str]] = None
    features: Optional[List[str]] = None
    status: Optional[str] = None


class LandListingSchema(BaseModel):
    id: str
    title: str
    description: str
    category: str
    price_display: str
    price_numeric: float
    area_display: str
    location_name: str
    latitude: float
    longitude: float
    image_urls: List[str]
    features: List[str]
    status: str
    owner_id: str
    owner: UserPublicSchema
    created_at: datetime
    updated_at: datetime


class MessageCreateSchema(BaseModel):
    sender_id: str
    content: str = Field(..., min_length=1)
    message_type: str = "text"


class MessageSchema(BaseModel):
    id: str
    conversation_id: Optional[str] = None
    room_id: Optional[str] = None
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    message_type: str
    is_read: bool = False
    created_at: datetime


class ConversationCreateSchema(BaseModel):
    participant_1_id: str
    participant_2_id: str
    property_id: Optional[str] = None
    property_title: str = "General Land Inquiry"
    property_price: str = ""
    property_location: str = ""


class ConversationSchema(BaseModel):
    id: str
    participant_1: UserPublicSchema
    participant_2: UserPublicSchema
    property_id: Optional[str] = None
    property_title: str
    property_price: str
    property_location: str
    unread_count: int = 0
    last_message: Optional[MessageSchema] = None
    updated_at: datetime


class MeetingRoomCreateSchema(BaseModel):
    name: str = Field(..., min_length=2)
    description: str = ""
    property_title: str = ""
    property_location: str = ""
    created_by_id: str
    member_ids: List[str] = []


class MeetingRoomJoinSchema(BaseModel):
    user_id: str


class MeetingRoomSchema(BaseModel):
    id: str
    name: str
    description: str
    property_title: str
    property_location: str
    created_by_id: str
    is_active: bool
    members: List[UserPublicSchema] = []
    active_call_participants: List[str] = []
    last_message: Optional[MessageSchema] = None
    created_at: datetime


class CallLogSchema(BaseModel):
    id: str
    caller: UserPublicSchema
    callee: Optional[UserPublicSchema] = None
    room_id: Optional[str] = None
    call_type: str
    status: str
    property_title: str
    duration_seconds: int
    started_at: datetime
    answered_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
