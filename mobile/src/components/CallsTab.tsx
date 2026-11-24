import React from 'react';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  ShieldCheck,
  Clock,
  MapPin,
} from 'lucide-react';
import { UserProfile, CallLog, CallType } from '../types';

interface CallsTabProps {
  currentUser: UserProfile;
  users: UserProfile[];
  callLogs: CallLog[];
  onInitiateCall: (
    callee: UserProfile,
    callType: CallType,
    propertyTitle: string
  ) => void;
}

function formatCallDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export const CallsTab: React.FC<CallsTabProps> = ({
  currentUser,
  users,
  callLogs,
  onInitiateCall,
}) => {
  const otherUsers = users.filter((u) => u.id !== currentUser.id);

  return (
    <div className="wa-calls-page">
      {/* Top Quick Dial Directory (Zero Phone Numbers Exposed) */}
      <section className="wa-calls-directory-card">
        <div className="wa-directory-header">
          <div>
            <h3>Instant In-App Call Directory</h3>
            <p>
              Call verified Buyers, Sellers & Brokers directly in-app without
              sharing phone numbers.
            </p>
          </div>
          <span className="wa-privacy-pill-dark">
            <ShieldCheck size={14} />
            100% Number Privacy
          </span>
        </div>

        <div className="wa-directory-grid">
          {otherUsers.map((peer) => {
            const initials = peer.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={peer.id}
                className="wa-directory-user-card"
                data-testid={`directory-card-${peer.id}`}
              >
                <div className="wa-dir-user-top">
                  <div className="wa-avatar-wrap">
                    <div
                      className="wa-avatar"
                      style={{ backgroundColor: peer.avatar_color || '#128C7E' }}
                    >
                      {initials}
                    </div>
                    <span className={`wa-presence-badge ${peer.presence}`} />
                  </div>
                  <div className="wa-dir-user-info">
                    <div className="wa-peer-title">
                      <strong>{peer.name}</strong>
                      <span className={`wa-role-tag role-${peer.role}`}>
                        {peer.role.toUpperCase()}
                      </span>
                    </div>
                    <span className="wa-dir-handle">{peer.in_app_handle}</span>
                    <span className="wa-dir-masked">🔒 {peer.masked_contact}</span>
                  </div>
                </div>

                <p className="wa-dir-bio">{peer.bio}</p>

                <div className="wa-dir-actions">
                  <button
                    type="button"
                    className="wa-call-trigger-btn audio"
                    onClick={() =>
                      onInitiateCall(
                        peer,
                        'audio',
                        `Direct Land Inquiry with ${peer.name}`
                      )
                    }
                    data-testid={`dir-audio-call-${peer.id}`}
                  >
                    <Phone size={15} />
                    <span>Audio Call</span>
                  </button>

                  <button
                    type="button"
                    className="wa-call-trigger-btn video"
                    onClick={() =>
                      onInitiateCall(
                        peer,
                        'video',
                        `Live Land Video Walkthrough with ${peer.name}`
                      )
                    }
                    data-testid={`dir-video-call-${peer.id}`}
                  >
                    <Video size={15} />
                    <span>Video Call</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Call History Logs */}
      <section className="wa-call-history-card">
        <h3>Recent In-App Call History</h3>
        <div className="wa-call-logs-list">
          {callLogs.length === 0 ? (
            <div className="wa-empty-list">No call history recorded yet.</div>
          ) : (
            callLogs.map((log) => {
              const isOutgoing = log.caller.id === currentUser.id;
              const peer = isOutgoing
                ? log.callee || log.caller
                : log.caller;
              const initials = peer.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              const isMissedOrRejected =
                log.status === 'REJECTED' || log.status === 'MISSED';

              return (
                <div
                  key={log.id}
                  className="wa-call-log-row"
                  data-testid={`call-log-${log.id}`}
                >
                  <div className="wa-call-log-left">
                    <div
                      className="wa-avatar"
                      style={{ backgroundColor: peer.avatar_color || '#128C7E' }}
                    >
                      {initials}
                    </div>
                    <div>
                      <div className="wa-peer-title">
                        <strong>{peer.name}</strong>
                        <span className={`wa-role-tag role-${peer.role}`}>
                          {peer.role.toUpperCase()}
                        </span>
                        <span
                          className={`wa-call-status-chip status-${log.status.toLowerCase()}`}
                        >
                          {log.status}
                        </span>
                      </div>

                      <div className="wa-call-log-meta">
                        {isMissedOrRejected ? (
                          <PhoneMissed size={13} className="icon-missed" />
                        ) : isOutgoing ? (
                          <PhoneOutgoing size={13} className="icon-outgoing" />
                        ) : (
                          <PhoneIncoming size={13} className="icon-incoming" />
                        )}
                        <span>
                          {isOutgoing ? 'Outgoing' : 'Incoming'}{' '}
                          {log.call_type === 'video' ? 'Video' : 'Audio'} Call
                        </span>
                        {log.duration_seconds > 0 && (
                          <>
                            <span>•</span>
                            <Clock size={12} />
                            <span>
                              {formatCallDuration(log.duration_seconds)}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span>
                          {new Date(log.started_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {log.property_title && (
                        <div className="wa-conv-prop-tag">
                          <MapPin size={11} />
                          <span>{log.property_title}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="wa-call-log-actions">
                    <button
                      type="button"
                      className="wa-icon-redial-btn"
                      onClick={() =>
                        onInitiateCall(
                          peer,
                          'audio',
                          log.property_title || 'LandConnect Callback'
                        )
                      }
                      title={`Audio callback ${peer.name}`}
                    >
                      <Phone size={17} />
                    </button>

                    <button
                      type="button"
                      className="wa-icon-redial-btn video"
                      onClick={() =>
                        onInitiateCall(
                          peer,
                          'video',
                          log.property_title || 'LandConnect Video Callback'
                        )
                      }
                      title={`Video callback ${peer.name}`}
                    >
                      <Video size={17} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
