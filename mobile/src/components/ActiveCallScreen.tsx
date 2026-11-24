import React, { useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  ShieldCheck,
  MapPin,
  Camera,
  Volume2,
} from 'lucide-react';
import { ActiveCallSession, CallLifecycleState } from '../types';

interface ActiveCallScreenProps {
  call: ActiveCallSession;
  callState: CallLifecycleState;
  isRemoteRinging: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isVirtualPlotCam: boolean;
  remoteMediaState: { audioEnabled: boolean; videoEnabled: boolean };
  durationSeconds: number;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onSwitchCameraMode: () => void;
  onEndCall: () => void;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  call,
  callState,
  isRemoteRinging,
  localStream,
  remoteStream,
  isMuted,
  isVideoEnabled,
  isVirtualPlotCam,
  remoteMediaState,
  durationSeconds,
  onToggleMute,
  onToggleVideo,
  onSwitchCameraMode,
  onEndCall,
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const { remoteUser, callType, propertyTitle } = call;
  const initials = remoteUser.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isVideoCall = callType === 'video';
  const hasRemoteVideoTrack =
    !!remoteStream && remoteStream.getVideoTracks().length > 0;
  const showRemoteVideo =
    isVideoCall &&
    callState === 'CONNECTED' &&
    hasRemoteVideoTrack &&
    remoteMediaState.videoEnabled;

  // Callback ref ensures srcObject is attached immediately when <video> mounts into the DOM
  const bindRemoteVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      remoteVideoRef.current = node;
      if (node && remoteStream) {
        if (node.srcObject !== remoteStream) {
          node.srcObject = remoteStream;
        }
        node.play().catch(() => {});
      }
    },
    [remoteStream]
  );

  const bindLocalVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      localVideoRef.current = node;
      if (node && localStream) {
        if (node.srcObject !== localStream) {
          node.srcObject = localStream;
        }
        node.play().catch(() => {});
      }
    },
    [localStream]
  );

  // Re-sync streams whenever remoteStream, callState, or showRemoteVideo changes
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStream) {
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream, showRemoteVideo, callState]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, isVideoEnabled]);

  return (
    <div className="wa-active-call-screen" data-testid="active-call-screen">
      {/* Hidden audio element handles remote voice playback in both audio and video calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Encrypted Header */}
      <div className="wa-active-call-topbar">
        <div className="wa-encrypted-label">
          <ShieldCheck size={14} />
          <span>End-to-End Privacy Protected • Personal Phone Numbers Hidden</span>
        </div>

        <div className="wa-active-call-header-info">
          <div>
            <h3>
              {remoteUser.name}{' '}
              <span className={`wa-role-tag role-${remoteUser.role}`}>
                {remoteUser.role.toUpperCase()}
              </span>
            </h3>
            <p className="wa-call-handle-sub">
              {remoteUser.in_app_handle} • {remoteUser.masked_contact}
            </p>
          </div>

          <div className="wa-call-timer-pill" data-testid="call-status-timer">
            {callState === 'OUTGOING_RINGING' &&
              (isRemoteRinging ? 'Ringing...' : 'Calling...')}
            {callState === 'CONNECTING' && 'Connecting WebRTC...'}
            {callState === 'CONNECTED' && (
              <>
                <span className="wa-live-red-dot" />
                <span>{formatDuration(durationSeconds)}</span>
              </>
            )}
          </div>
        </div>

        {propertyTitle && (
          <div className="wa-active-property-banner">
            <MapPin size={13} />
            <span>{propertyTitle}</span>
          </div>
        )}
      </div>

      {/* Main Media Stage */}
      <div className="wa-call-stage">
        {showRemoteVideo ? (
          <video
            ref={bindRemoteVideo}
            className="wa-remote-video"
            autoPlay
            playsInline
            muted
            data-testid="remote-video-element"
          />
        ) : (
          <div className="wa-audio-stage">
            <div className="wa-avatar-ring-container">
              {callState !== 'CONNECTED' && (
                <>
                  <div className="wa-pulse-ring ring-1" />
                  <div className="wa-pulse-ring ring-2" />
                </>
              )}
              <div
                className="wa-call-avatar-large"
                style={{ backgroundColor: remoteUser.avatar_color || '#128C7E' }}
              >
                {initials}
              </div>
            </div>
            <h3 className="wa-stage-name">{remoteUser.name}</h3>
            <p className="wa-stage-sub">
              {callState === 'CONNECTED'
                ? isVideoCall && !remoteMediaState.videoEnabled
                  ? 'Camera turned off by peer • Audio Active'
                  : 'Connected via LandConnect Voice'
                : isRemoteRinging
                ? 'Ringing on recipient device...'
                : 'Establishing encrypted WebRTC channel...'}
            </p>
            {callState === 'CONNECTED' && (
              <div className="wa-audio-wave-pill">
                <Volume2 size={16} />
                <span>HD In-App Voice Stream Active</span>
              </div>
            )}
          </div>
        )}

        {/* Remote Peer Mute Warning Badge */}
        {callState === 'CONNECTED' && !remoteMediaState.audioEnabled && (
          <div className="wa-remote-muted-pill">
            <MicOff size={14} />
            <span>{remoteUser.name} muted their microphone</span>
          </div>
        )}

        {/* Picture-in-Picture (PiP) Local Video Preview */}
        {isVideoCall && localStream && (
          <div className="wa-pip-local-container">
            {isVideoEnabled ? (
              <video
                ref={bindLocalVideo}
                className="wa-local-video"
                autoPlay
                playsInline
                muted
                data-testid="local-video-element"
              />
            ) : (
              <div className="wa-pip-camera-off">
                <VideoOff size={20} />
                <span>Camera Off</span>
              </div>
            )}
            <div className="wa-pip-label">
              You {isVirtualPlotCam ? '(Plot Telemetry Cam)' : '(Camera)'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Call Control Bar */}
      <div className="wa-call-controls-bar">
        <button
          type="button"
          className={`wa-control-btn ${isMuted ? 'toggled-off' : ''}`}
          onClick={onToggleMute}
          data-testid="toggle-mute-btn"
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        {isVideoCall && (
          <button
            type="button"
            className={`wa-control-btn ${!isVideoEnabled ? 'toggled-off' : ''}`}
            onClick={onToggleVideo}
            data-testid="toggle-video-btn"
            title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isVideoEnabled ? <VideoIcon size={22} /> : <VideoOff size={22} />}
            <span>{isVideoEnabled ? 'Video On' : 'Video Off'}</span>
          </button>
        )}

        {isVideoCall && (
          <button
            type="button"
            className={`wa-control-btn ${isVirtualPlotCam ? 'active-mode' : ''}`}
            onClick={onSwitchCameraMode}
            data-testid="switch-cam-mode-btn"
            title="Switch between webcam and virtual plot boundary telemetry stream"
          >
            <Camera size={22} />
            <span>{isVirtualPlotCam ? 'Plot Cam' : 'Switch Cam'}</span>
          </button>
        )}

        <button
          type="button"
          className="wa-control-btn hangup"
          onClick={onEndCall}
          data-testid="end-call-btn"
          title="End Call"
        >
          <PhoneOff size={22} />
          <span>End Call</span>
        </button>
      </div>
    </div>
  );
};
