import { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserProfile,
  LandListing,
  CallType,
  CallLifecycleState,
  ActiveCallSession,
  ChatMessage,
  MeetingRoom,
  CallLog,
  PresenceStatus,
} from '../types';
import { acquireMediaStream } from '../services/webrtcSynthesizer';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface UseCallManagerOptions {
  currentUser: UserProfile | null;
  onChatMessage?: (conversationId: string, message: ChatMessage) => void;
  onChatRead?: (conversationId: string, readerId: string) => void;
  onRoomMessage?: (roomId: string, message: ChatMessage) => void;
  onRoomUpdated?: (room: MeetingRoom) => void;
  onRoomParticipantsUpdated?: (roomId: string, participants: string[]) => void;
  onPresenceUpdate?: (onlineUsers: Record<string, PresenceStatus>) => void;
  onCallLogCreated?: (callLog?: CallLog) => void;
  onListingCreatedOrUpdated?: (listing: LandListing) => void;
  onListingDeleted?: (listingId: string) => void;
}

export function useCallManager({
  currentUser,
  onChatMessage,
  onChatRead,
  onRoomMessage,
  onRoomUpdated,
  onRoomParticipantsUpdated,
  onPresenceUpdate,
  onCallLogCreated,
  onListingCreatedOrUpdated,
  onListingDeleted,
}: UseCallManagerOptions) {
  const [wsConnected, setWsConnected] = useState(false);
  const [callState, setCallState] = useState<CallLifecycleState>('IDLE');
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [isRemoteRinging, setIsRemoteRinging] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isVirtualPlotCam, setIsVirtualPlotCam] = useState(false);
  const [remoteMediaState, setRemoteMediaState] = useState({
    audioEnabled: true,
    videoEnabled: true,
  });
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [callStatusBanner, setCallStatusBanner] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localCleanupRef = useRef<(() => void) | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activeCallRef = useRef<ActiveCallSession | null>(null);
  const callStateRef = useRef<CallLifecycleState>('IDLE');

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const cleanupMediaAndPeer = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    if (localCleanupRef.current) {
      localCleanupRef.current();
      localCleanupRef.current = null;
    }
    pendingCandidatesRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoEnabled(true);
    setIsRemoteRinging(false);
    setRemoteMediaState({ audioEnabled: true, videoEnabled: true });
    setCallDurationSeconds(0);
  }, []);

  const sendWsEvent = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const createPeerConnection = useCallback(
    (callId: string, targetUserId: string, stream: MediaStream) => {
      if (pcRef.current) {
        pcRef.current.close();
      }
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const inboundStream = new MediaStream();
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((t) => {
            if (!inboundStream.getTracks().some((existing) => existing.id === t.id)) {
              inboundStream.addTrack(t);
            }
          });
        }
        if (
          event.track &&
          !inboundStream.getTracks().some((existing) => existing.id === event.track.id)
        ) {
          inboundStream.addTrack(event.track);
        }
        // Always create a new MediaStream instance so React re-renders when the video track arrives after the audio track
        setRemoteStream(new MediaStream(inboundStream.getTracks()));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWsEvent({
            type: 'call:ice-candidate',
            call_id: callId,
            target_user_id: targetUserId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      return pc;
    },
    [sendWsEvent]
  );

  const drainPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) return;
    while (pendingCandidatesRef.current.length > 0) {
      const candidateInit = pendingCandidatesRef.current.shift();
      if (candidateInit) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
        } catch {
          // ignore invalid candidate
        }
      }
    }
  }, []);

  // Live Call Timer when CONNECTED
  useEffect(() => {
    if (callState !== 'CONNECTED') return;
    const timer = window.setInterval(() => {
      setCallDurationSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  // Connect WebSocket for currentUser
  useEffect(() => {
    if (!currentUser) return;

    cleanupMediaAndPeer();
    setCallState('IDLE');
    setActiveCall(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${encodeURIComponent(
      currentUser.id
    )}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onmessage = async (evt) => {
      try {
        const data = JSON.parse(evt.data);
        const type = data.type as string;

        if (type === 'connection:established') {
          if (data.online_users && onPresenceUpdate) {
            onPresenceUpdate(data.online_users);
          }
          // Check if there is a pending incoming call ringing for this user
          if (
            Array.isArray(data.pending_incoming_calls) &&
            data.pending_incoming_calls.length > 0
          ) {
            const inc = data.pending_incoming_calls[0];
            setActiveCall({
              callId: inc.call_id,
              callType: inc.call_type,
              direction: 'incoming',
              remoteUser: inc.caller,
              propertyTitle: inc.property_title,
              roomId: inc.room_id,
              sdpOffer: inc.sdp_offer,
              startedAt: inc.started_at,
            });
            setCallState('INCOMING_RINGING');
            sendWsEvent({ type: 'call:ringing', call_id: inc.call_id });
          }
        } else if (type === 'presence:update') {
          if (data.online_users && onPresenceUpdate) {
            onPresenceUpdate(data.online_users);
          }
        } else if (type === 'chat:message') {
          if (onChatMessage && data.conversation_id && data.message) {
            onChatMessage(data.conversation_id, data.message);
          }
        } else if (type === 'chat:read') {
          if (onChatRead && data.conversation_id && data.reader_id) {
            onChatRead(data.conversation_id, data.reader_id);
          }
        } else if (type === 'room:message') {
          if (onRoomMessage && data.room_id && data.message) {
            onRoomMessage(data.room_id, data.message);
          }
        } else if (type === 'room:created' || type === 'room:updated') {
          if (onRoomUpdated && data.room) {
            onRoomUpdated(data.room);
          }
        } else if (type === 'room:call:participants') {
          if (onRoomParticipantsUpdated && data.room_id) {
            onRoomParticipantsUpdated(data.room_id, data.participants || []);
          }
        } else if (type === 'listing:created' || type === 'listing:updated') {
          if (onListingCreatedOrUpdated && data.listing) {
            onListingCreatedOrUpdated(data.listing);
          }
        } else if (type === 'listing:deleted') {
          if (onListingDeleted && data.listing_id) {
            onListingDeleted(data.listing_id);
          }
        } else if (type === 'call:incoming') {
          // If already in a call, auto-ignore or notify
          if (callStateRef.current !== 'IDLE') {
            return;
          }
          setActiveCall({
            callId: data.call_id,
            callType: data.call_type,
            direction: 'incoming',
            remoteUser: data.caller,
            propertyTitle: data.property_title || 'LandConnect Property Inquiry',
            roomId: data.room_id,
            sdpOffer: data.sdp_offer,
            startedAt: data.started_at || new Date().toISOString(),
          });
          setIsVideoEnabled(data.call_type === 'video');
          setCallState('INCOMING_RINGING');
          sendWsEvent({ type: 'call:ringing', call_id: data.call_id });
        } else if (type === 'call:outgoing_ack') {
          if (data.callee_online === false) {
            setCallStatusBanner(
              `Ringing ${data.callee?.name || 'recipient'} (Note: Recipient window is currently offline — click "Open 2nd Device" to answer)`
            );
          }
        } else if (type === 'call:error') {
          setCallStatusBanner(
            data.message || 'Unable to place call right now. Please try again.'
          );
          window.setTimeout(() => setCallStatusBanner(null), 4000);
          cleanupMediaAndPeer();
          setCallState('IDLE');
          setActiveCall(null);
        } else if (type === 'call:ringing') {
          setIsRemoteRinging(true);
        } else if (type === 'call:accepted') {
          const pc = pcRef.current;
          if (pc && data.sdp_answer) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(data.sdp_answer)
            );
            await drainPendingCandidates(pc);
          }
          setCallState('CONNECTED');
          setActiveCall((prev) =>
            prev ? { ...prev, answeredAt: data.answered_at } : prev
          );
        } else if (type === 'call:connected') {
          setCallState('CONNECTED');
        } else if (type === 'call:ice-candidate') {
          if (!data.candidate) return;
          const pc = pcRef.current;
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch {
              // ignore
            }
          } else {
            pendingCandidatesRef.current.push(data.candidate);
          }
        } else if (type === 'call:media-toggle') {
          setRemoteMediaState({
            audioEnabled: data.audio_enabled ?? true,
            videoEnabled: data.video_enabled ?? true,
          });
        } else if (type === 'call:rejected') {
          setCallStatusBanner('Call declined by recipient');
          window.setTimeout(() => setCallStatusBanner(null), 3500);
          cleanupMediaAndPeer();
          setCallState('IDLE');
          setActiveCall(null);
          if (onCallLogCreated) onCallLogCreated(data.call_log);
        } else if (type === 'call:ended') {
          setCallStatusBanner('Call ended');
          window.setTimeout(() => setCallStatusBanner(null), 2500);
          cleanupMediaAndPeer();
          setCallState('IDLE');
          setActiveCall(null);
          if (onCallLogCreated) onCallLogCreated(data.call_log);
        }
      } catch {
        // ignore malformed event
      }
    };

    return () => {
      ws.close();
    };
  }, [
    currentUser?.id,
    cleanupMediaAndPeer,
    drainPendingCandidates,
    sendWsEvent,
  ]);

  // 1. Initiate an Outgoing Audio or Video Call
  const startCall = useCallback(
    async (
      callee: UserProfile,
      callType: CallType,
      propertyTitle = 'LandConnect Property Inquiry',
      roomId?: string
    ) => {
      if (!currentUser) return;
      cleanupMediaAndPeer();

      const callId = `call-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      const session: ActiveCallSession = {
        callId,
        callType,
        direction: 'outgoing',
        remoteUser: callee,
        propertyTitle,
        roomId,
        startedAt: new Date().toISOString(),
      };
      setActiveCall(session);
      setIsVideoEnabled(callType === 'video');
      setCallState('OUTGOING_RINGING');

      const acquired = await acquireMediaStream(
        callType,
        currentUser.name,
        currentUser.role,
        propertyTitle,
        false
      );
      localCleanupRef.current = acquired.cleanup;
      setLocalStream(acquired.stream);
      setIsVirtualPlotCam(acquired.isVirtualStream);

      const pc = createPeerConnection(callId, callee.id, acquired.stream);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await pc.setLocalDescription(offer);

      sendWsEvent({
        type: 'call:initiate',
        call_id: callId,
        callee_id: callee.id,
        call_type: callType,
        property_title: propertyTitle,
        room_id: roomId,
        sdp_offer: offer,
      });
    },
    [currentUser, cleanupMediaAndPeer, createPeerConnection, sendWsEvent]
  );

  // 2. Accept an Incoming Call
  const acceptIncomingCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current || !currentUser) return;

    setCallState('CONNECTING');

    const acquired = await acquireMediaStream(
      current.callType,
      currentUser.name,
      currentUser.role,
      current.propertyTitle,
      false
    );
    localCleanupRef.current = acquired.cleanup;
    setLocalStream(acquired.stream);
    setIsVirtualPlotCam(acquired.isVirtualStream);
    setIsVideoEnabled(current.callType === 'video');

    const pc = createPeerConnection(
      current.callId,
      current.remoteUser.id,
      acquired.stream
    );

    if (current.sdpOffer) {
      await pc.setRemoteDescription(
        new RTCSessionDescription(current.sdpOffer)
      );
      await drainPendingCandidates(pc);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    sendWsEvent({
      type: 'call:accept',
      call_id: current.callId,
      sdp_answer: answer,
    });
    setCallState('CONNECTED');
  }, [currentUser, createPeerConnection, drainPendingCandidates, sendWsEvent]);

  // 3. Reject an Incoming Call
  const rejectIncomingCall = useCallback(() => {
    const current = activeCallRef.current;
    if (!current) return;
    sendWsEvent({
      type: 'call:reject',
      call_id: current.callId,
      reason: 'declined',
    });
    cleanupMediaAndPeer();
    setCallState('IDLE');
    setActiveCall(null);
  }, [cleanupMediaAndPeer, sendWsEvent]);

  // 4. End an Ongoing or Ringing Call
  const endCall = useCallback(() => {
    const current = activeCallRef.current;
    if (current) {
      sendWsEvent({
        type: 'call:end',
        call_id: current.callId,
      });
    }
    cleanupMediaAndPeer();
    setCallState('IDLE');
    setActiveCall(null);
  }, [cleanupMediaAndPeer, sendWsEvent]);

  // 5. Toggle Microphone Mute
  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const nextMuted = !isMuted;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);

    if (activeCallRef.current) {
      sendWsEvent({
        type: 'call:media-toggle',
        call_id: activeCallRef.current.callId,
        audio_enabled: !nextMuted,
        video_enabled: isVideoEnabled,
      });
    }
  }, [localStream, isMuted, isVideoEnabled, sendWsEvent]);

  // 6. Toggle Camera Video On/Off
  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const nextVideo = !isVideoEnabled;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = nextVideo;
    });
    setIsVideoEnabled(nextVideo);

    if (activeCallRef.current) {
      sendWsEvent({
        type: 'call:media-toggle',
        call_id: activeCallRef.current.callId,
        audio_enabled: !isMuted,
        video_enabled: nextVideo,
      });
    }
  }, [localStream, isVideoEnabled, isMuted, sendWsEvent]);

  // 7. Switch between Physical Camera and Virtual Land Boundary Telemetry Camera during a Video Call
  const switchCameraMode = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current || !currentUser || current.callType !== 'video') return;

    const nextVirtual = !isVirtualPlotCam;
    if (localCleanupRef.current) {
      localCleanupRef.current();
    }

    const acquired = await acquireMediaStream(
      'video',
      currentUser.name,
      currentUser.role,
      current.propertyTitle,
      nextVirtual
    );
    localCleanupRef.current = acquired.cleanup;
    setLocalStream(acquired.stream);
    setIsVirtualPlotCam(acquired.isVirtualStream);

    const pc = pcRef.current;
    if (pc) {
      const newVideoTrack = acquired.stream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && newVideoTrack) {
        await sender.replaceTrack(newVideoTrack);
      }
    }
  }, [currentUser, isVirtualPlotCam]);

  // 8. Join or Leave a Multi-Party Meeting Room Call
  const joinMeetingRoomCall = useCallback(
    (room: MeetingRoom, callType: CallType = 'video') => {
      if (!currentUser) return;
      sendWsEvent({
        type: 'room:call:join',
        room_id: room.id,
        call_type: callType,
      });
      // Pick another room member to establish direct WebRTC stream if available
      const peer =
        room.members.find(
          (m) =>
            m.id !== currentUser.id &&
            room.active_call_participants.includes(m.id)
        ) || room.members.find((m) => m.id !== currentUser.id);
      if (peer) {
        startCall(peer, callType, `${room.name} • ${room.property_title}`, room.id);
      }
    },
    [currentUser, sendWsEvent, startCall]
  );

  const leaveMeetingRoomCall = useCallback(
    (roomId: string) => {
      sendWsEvent({
        type: 'room:call:leave',
        room_id: roomId,
      });
      endCall();
    },
    [sendWsEvent, endCall]
  );

  return {
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
    leaveMeetingRoomCall,
    sendWsEvent,
  };
}
