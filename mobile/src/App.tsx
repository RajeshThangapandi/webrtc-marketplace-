import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import {
  UserProfile,
  LandListing,
  Conversation,
  ChatMessage,
  MeetingRoom,
  CallLog,
  PresenceStatus,
  CallType,
} from './types';
import { api, formatUserFriendlyError } from './services/api';
import { useCallManager } from './hooks/useCallManager';
import { Header, ActiveTab } from './components/Header';
import { CommunityTab } from './components/CommunityTab';
import { MapsTab } from './components/MapsTab';
import { ChatsTab } from './components/ChatsTab';
import { MeetingRoomsTab } from './components/MeetingRoomsTab';
import { CallsTab } from './components/CallsTab';
import { AuthModal } from './components/AuthModal';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ActiveCallScreen } from './components/ActiveCallScreen';

interface AppAlert {
  type: 'success' | 'error' | 'info';
  message: string;
}

export const App: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('community');
  const [appAlert, setAppAlert] = useState<AppAlert | null>(null);
  const alertTimerRef = useRef<number | null>(null);

  // Refs to track active tab & conversation inside WebSocket callbacks
  const activeTabRef = useRef<ActiveTab>('community');
  const selectedConvIdRef = useRef<string | null>(null);
  const selectedRoomIdRef = useRef<string | null>(null);
  const currentUserRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const notify = useCallback(
    (type: 'success' | 'error' | 'info', message: string, durationMs = 4500) => {
      if (alertTimerRef.current) {
        window.clearTimeout(alertTimerRef.current);
      }
      setAppAlert({ type, message });
      alertTimerRef.current = window.setTimeout(() => {
        setAppAlert(null);
      }, durationMs);
    },
    []
  );

  // Community & Maps State (Step 1)
  const [listings, setListings] = useState<LandListing[]>([]);
  const [selectedMapListing, setSelectedMapListing] =
    useState<LandListing | null>(null);
  const [prefilledMapCoords, setPrefilledMapCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Conversations & Meeting Rooms State (Step 2)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [autoOpenMobileChatThread, setAutoOpenMobileChatThread] =
    useState(false);
  const [conversationMessages, setConversationMessages] = useState<
    Record<string, ChatMessage[]>
  >({});

  const [meetingRooms, setMeetingRooms] = useState<MeetingRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomMessages, setRoomMessages] = useState<Record<string, ChatMessage[]>>(
    {}
  );
  const [unreadRoomCounts, setUnreadRoomCounts] = useState<
    Record<string, number>
  >({});

  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [unseenCallsCount, setUnseenCallsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    selectedConvIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  const markConvAsRead = useCallback(
    async (convId: string, uid: string) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
      try {
        await api.markConversationRead(convId, uid);
      } catch {
        // ignore background read sync error
      }
    },
    []
  );

  const refreshCallLogs = useCallback(async (uid?: string) => {
    try {
      const logs = await api.getCallLogs(uid);
      setCallLogs(logs);
    } catch {
      // ignore background refresh error
    }
  }, []);

  // Real-time WebSocket event handlers
  const handleIncomingChatMessage = useCallback(
    (conversationId: string, message: ChatMessage) => {
      const me = currentUserRef.current;
      const isFromOther = me && message.sender_id !== me.id;
      const isCurrentlyViewingThisChat =
        activeTabRef.current === 'chats' &&
        selectedConvIdRef.current === conversationId;

      setConversationMessages((prev) => {
        const list = prev[conversationId] || [];
        if (list.some((m) => m.id === message.id)) return prev;
        const msgWithRead =
          isFromOther && isCurrentlyViewingThisChat
            ? { ...message, is_read: true }
            : message;
        return { ...prev, [conversationId]: [...list, msgWithRead] };
      });

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          const nextUnread =
            isFromOther && !isCurrentlyViewingThisChat
              ? (c.unread_count || 0) + 1
              : c.unread_count || 0;
          return {
            ...c,
            last_message: message,
            updated_at: message.created_at,
            unread_count: nextUnread,
          };
        })
      );

      if (isFromOther && isCurrentlyViewingThisChat && me) {
        api.markConversationRead(conversationId, me.id).catch(() => {});
      }
    },
    []
  );

  const handleChatRead = useCallback(
    (conversationId: string, readerId: string) => {
      const me = currentUserRef.current;
      if (me && readerId === me.id) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, unread_count: 0 } : c
          )
        );
      } else {
        // Other participant read our messages -> turn double checkmarks blue!
        setConversationMessages((prev) => {
          const list = prev[conversationId];
          if (!list) return prev;
          return {
            ...prev,
            [conversationId]: list.map((m) => ({ ...m, is_read: true })),
          };
        });
      }
    },
    []
  );

  const handleIncomingRoomMessage = useCallback(
    (roomId: string, message: ChatMessage) => {
      const me = currentUserRef.current;
      const isFromOther = me && message.sender_id !== me.id;
      const isViewingThisRoom =
        activeTabRef.current === 'rooms' &&
        selectedRoomIdRef.current === roomId;

      setRoomMessages((prev) => {
        const list = prev[roomId] || [];
        if (list.some((m) => m.id === message.id)) return prev;
        return { ...prev, [roomId]: [...list, message] };
      });
      setMeetingRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, last_message: message } : r
        )
      );

      if (isFromOther && !isViewingThisRoom) {
        setUnreadRoomCounts((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || 0) + 1,
        }));
      }
    },
    []
  );

  const handleRoomUpdated = useCallback((updatedRoom: MeetingRoom) => {
    setMeetingRooms((prev) => {
      const exists = prev.some((r) => r.id === updatedRoom.id);
      if (exists) {
        return prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r));
      }
      return [updatedRoom, ...prev];
    });
  }, []);

  const handleRoomParticipantsUpdated = useCallback(
    (roomId: string, participants: string[]) => {
      setMeetingRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, active_call_participants: participants } : r
        )
      );
    },
    []
  );

  const handleListingCreatedOrUpdated = useCallback((listing: LandListing) => {
    setListings((prev) => {
      const exists = prev.some((item) => item.id === listing.id);
      if (exists) {
        return prev.map((item) => (item.id === listing.id ? listing : item));
      }
      return [listing, ...prev];
    });
    setSelectedMapListing((prev) =>
      prev && prev.id === listing.id ? listing : prev
    );
  }, []);

  const handleListingDeleted = useCallback((listingId: string) => {
    setListings((prev) => prev.filter((item) => item.id !== listingId));
    setSelectedMapListing((prev) =>
      prev && prev.id === listingId ? null : prev
    );
  }, []);

  const handlePresenceUpdate = useCallback(
    (onlineUsers: Record<string, PresenceStatus>) => {
      const applyPresence = (u: UserProfile): UserProfile => ({
        ...u,
        presence: onlineUsers[u.id] || 'offline',
      });

      setUsers((prev) => prev.map(applyPresence));
      setListings((prev) =>
        prev.map((l) => ({ ...l, owner: applyPresence(l.owner) }))
      );
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          participant_1: applyPresence(c.participant_1),
          participant_2: applyPresence(c.participant_2),
        }))
      );
      setMeetingRooms((prev) =>
        prev.map((r) => ({
          ...r,
          members: r.members.map(applyPresence),
        }))
      );
    },
    []
  );

  const handleCallLogCreated = useCallback(
    (newCallLog?: CallLog) => {
      if (currentUser) {
        refreshCallLogs(currentUser.id);
      }
      if (activeTabRef.current !== 'calls') {
        if (
          !newCallLog ||
          newCallLog.status === 'MISSED' ||
          newCallLog.status === 'REJECTED' ||
          newCallLog.callee?.id === currentUserRef.current?.id
        ) {
          setUnseenCallsCount((prev) => prev + 1);
        }
      }
    },
    [currentUser, refreshCallLogs]
  );

  const {
    wsConnected,
    callState,
    activeCall,
    isRemoteRinging,
    localStream,
    remoteStream,
    isMuted,
    isVideoEnabled,
    isVirtualPlotCam,
    remoteMediaState,
    callDurationSeconds,
    callStatusBanner,
    startCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
    toggleMute,
    toggleVideo,
    switchCameraMode,
    joinMeetingRoomCall,
  } = useCallManager({
    currentUser,
    onChatMessage: handleIncomingChatMessage,
    onChatRead: handleChatRead,
    onRoomMessage: handleIncomingRoomMessage,
    onRoomUpdated: handleRoomUpdated,
    onRoomParticipantsUpdated: handleRoomParticipantsUpdated,
    onPresenceUpdate: handlePresenceUpdate,
    onCallLogCreated: handleCallLogCreated,
    onListingCreatedOrUpdated: handleListingCreatedOrUpdated,
    onListingDeleted: handleListingDeleted,
  });

  // Initial load of users, listings, and URL ?user= param
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [allUsers, allListings] = await Promise.all([
          api.getUsers(),
          api.getListings(),
        ]);
        if (!mounted) return;
        setUsers(allUsers);
        setListings(allListings);
        if (allListings.length > 0) {
          setSelectedMapListing(allListings[0]);
        }

        const params = new URLSearchParams(window.location.search);
        const requestedUserId = params.get('user');
        const requestedTab = params.get('tab') as ActiveTab | null;
        if (
          requestedTab &&
          ['community', 'maps', 'chats', 'rooms', 'calls'].includes(requestedTab)
        ) {
          setActiveTab(requestedTab);
        }

        const initialUser =
          allUsers.find((u) => u.id === requestedUserId) || allUsers[0] || null;
        setCurrentUser(initialUser);
      } catch (err) {
        if (mounted) {
          notify('error', formatUserFriendlyError(err));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [notify]);

  // Load conversations, meeting rooms, and call logs when currentUser changes
  useEffect(() => {
    if (!currentUser) return;
    let mounted = true;
    (async () => {
      try {
        const [convs, rooms, logs] = await Promise.all([
          api.getConversations(currentUser.id),
          api.getMeetingRooms(),
          api.getCallLogs(currentUser.id),
        ]);
        if (!mounted) return;
        setConversations(convs);
        if (convs.length > 0) {
          setSelectedConversationId((prev) =>
            prev && convs.some((c) => c.id === prev) ? prev : convs[0].id
          );
        } else {
          setSelectedConversationId(null);
        }

        setMeetingRooms(rooms);
        if (rooms.length > 0) {
          setSelectedRoomId((prev) =>
            prev && rooms.some((r) => r.id === prev) ? prev : rooms[0].id
          );
        }
        setUnreadRoomCounts({});
        setCallLogs(logs);
        setUnseenCallsCount(0);
      } catch (err) {
        if (mounted) {
          notify('error', formatUserFriendlyError(err));
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id, notify]);

  // Fetch messages when selectedConversationId changes
  useEffect(() => {
    if (!selectedConversationId) return;
    api
      .getConversationMessages(selectedConversationId)
      .then((msgs) => {
        setConversationMessages((prev) => ({
          ...prev,
          [selectedConversationId]: msgs,
        }));
      })
      .catch((err) => notify('error', formatUserFriendlyError(err)));
  }, [selectedConversationId, notify]);

  // Mark active conversation as read whenever user is on the CHATS tab viewing it
  useEffect(() => {
    if (
      activeTab === 'chats' &&
      selectedConversationId &&
      currentUser
    ) {
      const conv = conversations.find((c) => c.id === selectedConversationId);
      if (conv && (conv.unread_count || 0) > 0) {
        markConvAsRead(selectedConversationId, currentUser.id);
      }
    }
  }, [activeTab, selectedConversationId, currentUser, conversations, markConvAsRead]);

  // Clear unread room count when user views a room on MEETING ROOMS tab
  useEffect(() => {
    if (activeTab === 'rooms' && selectedRoomId) {
      setUnreadRoomCounts((prev) => {
        if (!prev[selectedRoomId]) return prev;
        const copy = { ...prev };
        delete copy[selectedRoomId];
        return copy;
      });
    }
  }, [activeTab, selectedRoomId]);

  // Clear unseen calls badge when user opens CALLS tab
  useEffect(() => {
    if (activeTab === 'calls' && unseenCallsCount > 0) {
      setUnseenCallsCount(0);
    }
  }, [activeTab, unseenCallsCount]);

  // Fetch messages when selectedRoomId changes
  useEffect(() => {
    if (!selectedRoomId) return;
    api
      .getMeetingRoomMessages(selectedRoomId)
      .then((msgs) => {
        setRoomMessages((prev) => ({
          ...prev,
          [selectedRoomId]: msgs,
        }));
      })
      .catch((err) => notify('error', formatUserFriendlyError(err)));
  }, [selectedRoomId, notify]);

  const handleSelectUser = (user: UserProfile) => {
    setCurrentUser(user);
    setAuthToken(null);
    const url = new URL(window.location.href);
    url.searchParams.set('user', user.id);
    window.history.replaceState({}, '', url.toString());
    notify(
      'info',
      `Switched active session to ${user.name} (${user.role.toUpperCase()})`,
      3000
    );
  };

  const handleSelectConversation = (convId: string) => {
    setSelectedConversationId(convId);
    if (currentUser) {
      markConvAsRead(convId, currentUser.id);
    }
  };

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setUnreadRoomCounts((prev) => {
      if (!prev[roomId]) return prev;
      const copy = { ...prev };
      delete copy[roomId];
      return copy;
    });
  };

  // Property Listing CRUD Handlers (Req 2, 3, 4)
  const handleCreateListing = async (payload: {
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
  }) => {
    if (!currentUser) return;
    try {
      const created = await api.createListing(
        currentUser.id,
        payload,
        authToken
      );
      handleListingCreatedOrUpdated(created);
      setSelectedMapListing(created);
      notify(
        'success',
        `Land listing "${created.title}" published to Community & Interactive Map!`
      );
    } catch (err) {
      const friendly = formatUserFriendlyError(err);
      notify('error', friendly);
      throw new Error(friendly);
    }
  };

  const handleUpdateListing = async (
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
    }>
  ) => {
    if (!currentUser) return;
    try {
      const updated = await api.updateListing(
        currentUser.id,
        listingId,
        payload,
        authToken
      );
      handleListingCreatedOrUpdated(updated);
      notify('success', `Land listing "${updated.title}" updated successfully!`);
    } catch (err) {
      const friendly = formatUserFriendlyError(err);
      notify('error', friendly);
      throw new Error(friendly);
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    if (!currentUser) return;
    try {
      await api.deleteListing(currentUser.id, listingId, authToken);
      handleListingDeleted(listingId);
      notify('info', 'Land listing removed from the marketplace.');
    } catch (err) {
      notify('error', formatUserFriendlyError(err));
    }
  };

  const handleChatWithListingOwner = async (listing: LandListing) => {
    if (!currentUser) return;
    if (listing.owner_id === currentUser.id) {
      notify('info', 'You are the owner of this property listing.');
      return;
    }
    try {
      const conv = await api.createOrGetConversation({
        participant_1_id: currentUser.id,
        participant_2_id: listing.owner_id,
        property_id: listing.id,
        property_title: listing.title,
        property_price: listing.price_display,
        property_location: listing.location_name,
      });
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        if (exists) {
          return prev.map((c) => (c.id === conv.id ? conv : c));
        }
        return [conv, ...prev];
      });
      setSelectedConversationId(conv.id);
      setAutoOpenMobileChatThread(true);
      setActiveTab('chats');
    } catch (err) {
      notify('error', formatUserFriendlyError(err));
    }
  };

  const handleCallListingOwner = (listing: LandListing, callType: CallType) => {
    if (!currentUser) return;
    if (listing.owner_id === currentUser.id) {
      notify('info', 'You cannot place a call to your own property listing.');
      return;
    }
    startCall(
      listing.owner,
      callType,
      `${listing.title} (${listing.price_display})`
    );
  };

  const handleViewListingOnMap = (listing: LandListing) => {
    setSelectedMapListing(listing);
    setActiveTab('maps');
    notify(
      'info',
      `Centered map on "${listing.title}" (${listing.latitude.toFixed(3)}°N, ${listing.longitude.toFixed(3)}°E)`,
      3000
    );
  };

  const handleGeotagCreateFromMap = (lat: number, lng: number) => {
    setPrefilledMapCoords({ lat, lng });
    setActiveTab('community');
    notify(
      'info',
      `GPS coordinates (${lat}°N, ${lng}°E) loaded into new listing form!`
    );
  };

  // Messaging & Room Handlers
  const handleSendConversationMessage = async (
    conversationId: string,
    content: string
  ) => {
    if (!currentUser) return;
    try {
      const msg = await api.sendConversationMessage(conversationId, {
        sender_id: currentUser.id,
        content,
      });
      handleIncomingChatMessage(conversationId, msg);
    } catch (err) {
      notify('error', formatUserFriendlyError(err));
    }
  };

  const handleStartNewConversation = async (
    targetUserId: string,
    propertyTitle: string,
    propertyPrice: string,
    propertyLocation: string
  ) => {
    if (!currentUser) return;
    try {
      const conv = await api.createOrGetConversation({
        participant_1_id: currentUser.id,
        participant_2_id: targetUserId,
        property_title: propertyTitle,
        property_price: propertyPrice,
        property_location: propertyLocation,
      });
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        if (exists) {
          return prev.map((c) => (c.id === conv.id ? conv : c));
        }
        return [conv, ...prev];
      });
      setSelectedConversationId(conv.id);
      notify('success', `Opened property inquiry chat for "${propertyTitle}"`);
    } catch (err) {
      const friendly = formatUserFriendlyError(err);
      notify('error', friendly);
      throw new Error(friendly);
    }
  };

  const handleSendRoomMessage = async (roomId: string, content: string) => {
    if (!currentUser) return;
    try {
      const msg = await api.sendMeetingRoomMessage(roomId, {
        sender_id: currentUser.id,
        content,
      });
      handleIncomingRoomMessage(roomId, msg);
    } catch (err) {
      notify('error', formatUserFriendlyError(err));
    }
  };

  const handleCreateRoom = async (payload: {
    name: string;
    description: string;
    property_title: string;
    property_location: string;
    member_ids: string[];
  }) => {
    if (!currentUser) return;
    try {
      const created = await api.createMeetingRoom({
        ...payload,
        created_by_id: currentUser.id,
      });
      handleRoomUpdated(created);
      setSelectedRoomId(created.id);
      notify('success', `Deal Meeting Room "${created.name}" created!`);
    } catch (err) {
      const friendly = formatUserFriendlyError(err);
      notify('error', friendly);
      throw new Error(friendly);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!currentUser) return;
    try {
      const updated = await api.joinMeetingRoom(roomId, currentUser.id);
      handleRoomUpdated(updated);
      notify('success', `You joined "${updated.name}"!`);
    } catch (err) {
      notify('error', formatUserFriendlyError(err));
    }
  };

  // Auth & Privacy Handlers
  const handleAuthSuccess = (user: UserProfile, token: string) => {
    setAuthToken(token);
    setCurrentUser(user);
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      return exists ? prev.map((u) => (u.id === user.id ? user : u)) : [...prev, user];
    });
    const url = new URL(window.location.href);
    url.searchParams.set('user', user.id);
    window.history.replaceState({}, '', url.toString());
    notify(
      'success',
      `Authenticated as ${user.name} (${user.role.toUpperCase()}) with JWT protection!`
    );
  };

  const handleUpdatePrivacy = async (payload: {
    allow_direct_calls?: boolean;
    hide_contact_details?: boolean;
    bio?: string;
  }) => {
    if (!currentUser) return;
    try {
      const updated = await api.updatePrivacy(currentUser.id, payload, authToken);
      setCurrentUser(updated);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      notify('success', 'Privacy and communication settings saved!');
    } catch (err) {
      const friendly = formatUserFriendlyError(err);
      notify('error', friendly);
      throw new Error(friendly);
    }
  };

  // Dynamic Tab Badge Counts
  const activeListingsCount = listings.filter((l) => l.status !== 'sold').length;
  const totalUnreadChatsCount = conversations.reduce(
    (sum, conv) => sum + (conv.unread_count || 0),
    0
  );
  const totalUnreadRoomsCount = Object.values(unreadRoomCounts).reduce(
    (sum, n) => sum + n,
    0
  );

  if (loading || !currentUser) {
    return (
      <div className="wa-loading-screen">
        <div className="wa-spinner" />
        <p>Loading LandConnect Real-Time Signaling & Marketplace...</p>
      </div>
    );
  }

  return (
    <div className="wa-app-shell">
      <Header
        currentUser={currentUser}
        users={users}
        onSelectUser={handleSelectUser}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        wsConnected={wsConnected}
        listingsCount={activeListingsCount}
        unreadChatsCount={totalUnreadChatsCount}
        unreadRoomsCount={totalUnreadRoomsCount}
        unseenCallsCount={unseenCallsCount}
        onOpenAuthModal={() => setShowAuthModal(true)}
      />

      {/* Global User-Friendly Notification Alert Banner */}
      {appAlert && (
        <div
          className={`wa-global-alert alert-${appAlert.type}`}
          role="alert"
          data-testid="global-user-alert"
        >
          <div className="wa-alert-left">
            {appAlert.type === 'success' && <CheckCircle2 size={16} />}
            {appAlert.type === 'error' && <AlertCircle size={16} />}
            {appAlert.type === 'info' && <Info size={16} />}
            <span>{appAlert.message}</span>
          </div>
          <button
            type="button"
            className="wa-alert-close"
            onClick={() => setAppAlert(null)}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {callStatusBanner && (
        <div className="wa-toast-banner" data-testid="call-status-banner">
          {callStatusBanner}
        </div>
      )}

      <main className="wa-main-content">
        {activeTab === 'community' && (
          <CommunityTab
            currentUser={currentUser}
            listings={listings}
            onCreateListing={handleCreateListing}
            onUpdateListing={handleUpdateListing}
            onDeleteListing={handleDeleteListing}
            onChatWithOwner={handleChatWithListingOwner}
            onCallOwner={handleCallListingOwner}
            onViewOnMap={handleViewListingOnMap}
            prefilledCoords={prefilledMapCoords}
            onClearPrefilledCoords={() => setPrefilledMapCoords(null)}
          />
        )}

        {activeTab === 'maps' && (
          <MapsTab
            currentUser={currentUser}
            listings={listings}
            selectedListing={selectedMapListing}
            onSelectListing={setSelectedMapListing}
            onChatWithOwner={handleChatWithListingOwner}
            onCallOwner={handleCallListingOwner}
            onGeotagCreateAtCoords={handleGeotagCreateFromMap}
          />
        )}

        {activeTab === 'chats' && (
          <ChatsTab
            currentUser={currentUser}
            users={users}
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            messages={
              selectedConversationId
                ? conversationMessages[selectedConversationId] || []
                : []
            }
            onSendMessage={handleSendConversationMessage}
            onStartNewConversation={handleStartNewConversation}
            onInitiateCall={(callee, callType, propTitle) =>
              startCall(callee, callType, propTitle)
            }
            autoOpenMobileThread={autoOpenMobileChatThread}
            onMobileThreadOpened={() => setAutoOpenMobileChatThread(false)}
          />
        )}

        {activeTab === 'rooms' && (
          <MeetingRoomsTab
            currentUser={currentUser}
            users={users}
            rooms={meetingRooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={handleSelectRoom}
            unreadRoomCounts={unreadRoomCounts}
            roomMessages={
              selectedRoomId ? roomMessages[selectedRoomId] || [] : []
            }
            onSendRoomMessage={handleSendRoomMessage}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onJoinRoomCall={(room, callType) =>
              joinMeetingRoomCall(room, callType)
            }
            onDirectCallMember={(member, callType, propTitle) =>
              startCall(member, callType, propTitle)
            }
          />
        )}

        {activeTab === 'calls' && (
          <CallsTab
            currentUser={currentUser}
            users={users}
            callLogs={callLogs}
            onInitiateCall={(callee, callType, propTitle) =>
              startCall(callee, callType, propTitle)
            }
          />
        )}
      </main>

      {/* Auth, Role Access & Privacy Modal */}
      {showAuthModal && (
        <AuthModal
          currentUser={currentUser}
          onClose={() => setShowAuthModal(false)}
          onLoginSuccess={handleAuthSuccess}
          onRegisterSuccess={handleAuthSuccess}
          onUpdatePrivacy={handleUpdatePrivacy}
          onLoginRequest={api.login}
          onRegisterRequest={api.register}
        />
      )}

      {/* Full-Screen Incoming Call Modal */}
      {callState === 'INCOMING_RINGING' && activeCall && (
        <IncomingCallModal
          call={activeCall}
          onAccept={acceptIncomingCall}
          onReject={rejectIncomingCall}
        />
      )}

      {/* Full-Screen Active or Outgoing Call Overlay */}
      {(callState === 'OUTGOING_RINGING' ||
        callState === 'CONNECTING' ||
        callState === 'CONNECTED') &&
        activeCall && (
          <ActiveCallScreen
            call={activeCall}
            callState={callState}
            isRemoteRinging={isRemoteRinging}
            localStream={localStream}
            remoteStream={remoteStream}
            isMuted={isMuted}
            isVideoEnabled={isVideoEnabled}
            isVirtualPlotCam={isVirtualPlotCam}
            remoteMediaState={remoteMediaState}
            durationSeconds={callDurationSeconds}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onSwitchCameraMode={switchCameraMode}
            onEndCall={endCall}
          />
        )}
    </div>
  );
};
