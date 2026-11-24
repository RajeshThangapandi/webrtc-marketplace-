export type UserRole = 'buyer' | 'seller' | 'broker';

export type PresenceStatus = 'online' | 'in_call' | 'offline';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  in_app_handle: string;
  avatar_color: string;
  bio: string;
  is_verified: boolean;
  allow_direct_calls?: boolean;
  hide_contact_details?: boolean;
  can_manage_listings?: boolean;
  masked_contact: string;
  presence: PresenceStatus;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export type LandCategory =
  | 'agricultural'
  | 'commercial'
  | 'residential'
  | 'orchard'
  | 'industrial';

export interface LandListing {
  id: string;
  title: string;
  description: string;
  category: LandCategory | string;
  price_display: string;
  price_numeric: number;
  area_display: string;
  location_name: string;
  latitude: number;
  longitude: number;
  image_urls: string[];
  features: string[];
  status: 'available' | 'under_offer' | 'sold' | string;
  owner_id: string;
  owner: UserProfile;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id?: string | null;
  room_id?: string | null;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  content: string;
  message_type: 'text' | 'system' | 'call_event';
  is_read?: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  participant_1: UserProfile;
  participant_2: UserProfile;
  property_id?: string | null;
  property_title: string;
  property_price: string;
  property_location: string;
  unread_count?: number;
  last_message?: ChatMessage | null;
  updated_at: string;
}

export interface MeetingRoom {
  id: string;
  name: string;
  description: string;
  property_title: string;
  property_location: string;
  created_by_id: string;
  is_active: boolean;
  members: UserProfile[];
  active_call_participants: string[];
  last_message?: ChatMessage | null;
  created_at: string;
}

export type CallType = 'audio' | 'video';

export type CallStatus =
  | 'RINGING'
  | 'ONGOING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'MISSED';

export interface CallLog {
  id: string;
  caller: UserProfile;
  callee?: UserProfile | null;
  room_id?: string | null;
  call_type: CallType;
  status: CallStatus;
  property_title: string;
  duration_seconds: number;
  started_at: string;
  answered_at?: string | null;
  ended_at?: string | null;
}

export type CallLifecycleState =
  | 'IDLE'
  | 'OUTGOING_RINGING'
  | 'INCOMING_RINGING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ENDED';

export interface ActiveCallSession {
  callId: string;
  callType: CallType;
  direction: 'outgoing' | 'incoming';
  remoteUser: UserProfile;
  propertyTitle: string;
  roomId?: string | null;
  sdpOffer?: RTCSessionDescriptionInit | null;
  startedAt: string;
  answeredAt?: string | null;
}
