import {
  UserProfile,
  AuthResponse,
  LandListing,
  Conversation,
  ChatMessage,
  MeetingRoom,
  CallLog,
} from '../types';

const API_BASE = '/api';

const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input and try again.',
  401: 'Authentication required. Please sign in or switch to an active demo role.',
  403: 'Permission denied: Your current role does not have access to perform this action.',
  404: 'The requested record could not be found. It may have been removed.',
  422: 'Please review the form fields and ensure all required values are valid.',
  500: 'A server error occurred while processing your request. Please try again.',
};

const FIELD_FRIENDLY_NAMES: Record<string, string> = {
  title: 'Property Title',
  description: 'Property Description',
  category: 'Land Category',
  price_display: 'Formatted Price',
  price_numeric: 'Numeric Price',
  area_display: 'Total Land Area',
  location_name: 'Geographical Location',
  latitude: 'Latitude',
  longitude: 'Longitude',
  name: 'Full Name',
  email: 'Email Address',
  phone: 'Phone Number',
  password: 'Password',
  role: 'Role',
  content: 'Message Content',
};

export function formatUserFriendlyError(err: unknown, status?: number): string {
  if (!err) {
    return (
      (status && STATUS_FALLBACK_MESSAGES[status]) ||
      'Something went wrong. Please try again.'
    );
  }

  if (typeof err === 'string') {
    if (err === '[object Object]') {
      return (
        (status && STATUS_FALLBACK_MESSAGES[status]) ||
        'Please check your input fields and try again.'
      );
    }
    return err;
  }

  if (err instanceof Error) {
    if (
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError')
    ) {
      return 'Unable to reach the LandConnect server. Please check that the server is running.';
    }
    if (err.message && err.message !== '[object Object]') {
      return err.message;
    }
  }

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.detail === 'string') {
      return obj.detail;
    }
    if (Array.isArray(obj.detail)) {
      const parts = obj.detail
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            const e = item as { loc?: unknown[]; msg?: string };
            const rawField = Array.isArray(e.loc)
              ? String(e.loc[e.loc.length - 1] || '')
              : '';
            const fieldLabel =
              FIELD_FRIENDLY_NAMES[rawField] ||
              rawField.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const msg = e.msg || 'Invalid value';
            return fieldLabel && rawField !== 'body'
              ? `${fieldLabel}: ${msg}`
              : msg;
          }
          return null;
        })
        .filter(Boolean);
      if (parts.length > 0) {
        return `Please check your input — ${parts.join('; ')}`;
      }
    }
    if (obj.detail && typeof obj.detail === 'object') {
      const nested = obj.detail as Record<string, unknown>;
      if (typeof nested.message === 'string') return nested.message;
      if (typeof nested.msg === 'string') return nested.msg;
    }
    if (typeof obj.message === 'string' && obj.message !== '[object Object]') {
      return obj.message;
    }
  }

  return (
    (status && STATUS_FALLBACK_MESSAGES[status]) ||
    'An unexpected error occurred. Please check your input and try again.'
  );
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // IMPORTANT: Spread ...options BEFORE headers so custom headers (like X-User-Id / Authorization)
    // merge cleanly with 'Content-Type': 'application/json' instead of overwriting it!
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
  } catch (networkErr) {
    throw new Error(formatUserFriendlyError(networkErr));
  }

  if (!res.ok) {
    let errMsg =
      STATUS_FALLBACK_MESSAGES[res.status] ||
      `Request could not be completed (HTTP ${res.status}).`;
    try {
      const errJson = await res.json();
      errMsg = formatUserFriendlyError(errJson, res.status);
    } catch {
      try {
        const errText = await res.text();
        if (errText && !errText.startsWith('<')) {
          errMsg = formatUserFriendlyError(errText, res.status);
        }
      } catch {
        // use fallback message
      }
    }
    throw new Error(errMsg);
  }
  return res.json();
}

function authHeaders(
  userId: string,
  token?: string | null
): Record<string, string> {
  const headers: Record<string, string> = { 'X-User-Id': userId };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Authentication & Privacy (Reqs 1 & 7)
  register: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: string;
    bio: string;
  }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email_or_handle: string; password: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePrivacy: (
    userId: string,
    payload: {
      allow_direct_calls?: boolean;
      hide_contact_details?: boolean;
      bio?: string;
    },
    token?: string | null
  ) =>
    request<UserProfile>('/auth/privacy', {
      method: 'PATCH',
      headers: authHeaders(userId, token),
      body: JSON.stringify(payload),
    }),

  // Users
  getUsers: () => request<UserProfile[]>('/users'),
  getUser: (userId: string) => request<UserProfile>(`/users/${userId}`),

  // Community & Land Listings (Reqs 2, 3 & 4)
  getListings: (params?: { category?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category && params.category !== 'all') {
      qs.set('category', params.category);
    }
    if (params?.search) {
      qs.set('search', params.search);
    }
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request<LandListing[]>(`/listings${queryStr}`);
  },

  createListing: (
    userId: string,
    payload: {
      title: string;
      description: string;
      category: string;
      price_display: string;
      price_numeric: number;
      area_display: string;
      location_name: string;
      latitude: number;
      longitude: number;
      image_urls: string[];
      features: string[];
      status?: string;
    },
    token?: string | null
  ) =>
    request<LandListing>('/listings', {
      method: 'POST',
      headers: authHeaders(userId, token),
      body: JSON.stringify(payload),
    }),

  updateListing: (
    userId: string,
    listingId: string,
    payload: Partial<{
      title: string;
      description: string;
      category: string;
      price_display: string;
      price_numeric: number;
      area_display: string;
      location_name: string;
      latitude: number;
      longitude: number;
      image_urls: string[];
      features: string[];
      status: string;
    }>,
    token?: string | null
  ) =>
    request<LandListing>(`/listings/${listingId}`, {
      method: 'PUT',
      headers: authHeaders(userId, token),
      body: JSON.stringify(payload),
    }),

  deleteListing: (userId: string, listingId: string, token?: string | null) =>
    request<{ status: string; listing_id: string }>(`/listings/${listingId}`, {
      method: 'DELETE',
      headers: authHeaders(userId, token),
    }),

  // Conversations & Meeting Rooms (Req 5)
  getConversations: (userId: string) =>
    request<Conversation[]>(
      `/conversations?user_id=${encodeURIComponent(userId)}`
    ),

  createOrGetConversation: (payload: {
    participant_1_id: string;
    participant_2_id: string;
    property_id?: string;
    property_title?: string;
    property_price?: string;
    property_location?: string;
  }) =>
    request<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getConversationMessages: (conversationId: string) =>
    request<ChatMessage[]>(`/conversations/${conversationId}/messages`),

  markConversationRead: (conversationId: string, userId: string) =>
    request<{ conversation_id: string; reader_id: string; marked_read: number }>(
      `/conversations/${conversationId}/read?user_id=${encodeURIComponent(
        userId
      )}`,
      { method: 'POST' }
    ),

  sendConversationMessage: (
    conversationId: string,
    payload: { sender_id: string; content: string; message_type?: string }
  ) =>
    request<ChatMessage>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMeetingRooms: () => request<MeetingRoom[]>('/meeting-rooms'),

  createMeetingRoom: (payload: {
    name: string;
    description: string;
    property_title: string;
    property_location: string;
    created_by_id: string;
    member_ids: string[];
  }) =>
    request<MeetingRoom>('/meeting-rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  joinMeetingRoom: (roomId: string, userId: string) =>
    request<MeetingRoom>(`/meeting-rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  getMeetingRoomMessages: (roomId: string) =>
    request<ChatMessage[]>(`/meeting-rooms/${roomId}/messages`),

  sendMeetingRoomMessage: (
    roomId: string,
    payload: { sender_id: string; content: string; message_type?: string }
  ) =>
    request<ChatMessage>(`/meeting-rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Calls (Req 6)
  getCallLogs: (userId?: string) =>
    request<CallLog[]>(
      userId ? `/calls?user_id=${encodeURIComponent(userId)}` : '/calls'
    ),
};
