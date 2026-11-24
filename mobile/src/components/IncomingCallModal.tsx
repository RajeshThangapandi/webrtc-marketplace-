import React from 'react';
import { Phone, PhoneOff, Video, Shield, MapPin } from 'lucide-react';
import { ActiveCallSession } from '../types';

interface IncomingCallModalProps {
  call: ActiveCallSession;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  call,
  onAccept,
  onReject,
}) => {
  const { remoteUser, callType, propertyTitle } = call;
  const initials = remoteUser.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="wa-call-modal-backdrop" data-testid="incoming-call-modal">
      <div className="wa-incoming-card">
        <div className="wa-incoming-top-tag">
          <Shield size={14} />
          <span>
            LandConnect Encrypted {callType === 'video' ? 'Video' : 'Audio'} Call
          </span>
        </div>

        <div className="wa-avatar-ring-container">
          <div className="wa-pulse-ring ring-1" />
          <div className="wa-pulse-ring ring-2" />
          <div
            className="wa-call-avatar-large"
            style={{ backgroundColor: remoteUser.avatar_color || '#128C7E' }}
          >
            {initials}
          </div>
        </div>

        <h2 className="wa-caller-name">{remoteUser.name}</h2>

        <div className="wa-caller-meta">
          <span className={`wa-role-tag role-${remoteUser.role}`}>
            {remoteUser.role.toUpperCase()}
          </span>
          <span className="wa-caller-handle">{remoteUser.in_app_handle}</span>
        </div>

        <div className="wa-caller-privacy-note">
          🔒 Personal phone number hidden ({remoteUser.masked_contact})
        </div>

        {propertyTitle && (
          <div className="wa-call-property-pill">
            <MapPin size={14} />
            <span>{propertyTitle}</span>
          </div>
        )}

        <p className="wa-ringing-text">
          Incoming {callType === 'video' ? 'Video' : 'Voice'} Call...
        </p>

        <div className="wa-incoming-actions">
          <button
            type="button"
            className="wa-call-action-btn reject"
            onClick={onReject}
            data-testid="reject-call-btn"
          >
            <div className="wa-btn-circle reject">
              <PhoneOff size={24} />
            </div>
            <span>Decline</span>
          </button>

          <button
            type="button"
            className="wa-call-action-btn accept"
            onClick={onAccept}
            data-testid="accept-call-btn"
          >
            <div className="wa-btn-circle accept">
              {callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
            </div>
            <span>Accept {callType === 'video' ? 'Video' : 'Audio'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
