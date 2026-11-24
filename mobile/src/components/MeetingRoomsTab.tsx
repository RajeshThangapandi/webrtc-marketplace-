import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Video,
  Phone,
  Send,
  PlusCircle,
  MapPin,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import {
  UserProfile,
  MeetingRoom,
  ChatMessage,
  CallType,
} from '../types';
import { formatUserFriendlyError } from '../services/api';

interface MeetingRoomsTabProps {
  currentUser: UserProfile;
  users: UserProfile[];
  rooms: MeetingRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  unreadRoomCounts?: Record<string, number>;
  roomMessages: ChatMessage[];
  onSendRoomMessage: (roomId: string, content: string) => Promise<void>;
  onCreateRoom: (payload: {
    name: string;
    description: string;
    property_title: string;
    property_location: string;
    member_ids: string[];
  }) => Promise<void>;
  onJoinRoom: (roomId: string) => Promise<void>;
  onJoinRoomCall: (room: MeetingRoom, callType: CallType) => void;
  onDirectCallMember: (
    member: UserProfile,
    callType: CallType,
    propertyTitle: string
  ) => void;
}

export const MeetingRoomsTab: React.FC<MeetingRoomsTabProps> = ({
  currentUser,
  users,
  rooms,
  selectedRoomId,
  onSelectRoom,
  unreadRoomCounts = {},
  roomMessages,
  onSendRoomMessage,
  onCreateRoom,
  onJoinRoom,
  onJoinRoomCall,
  onDirectCallMember,
}) => {
  const [inputText, setInputText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState('Sunrise Orchard Tri-Party Closing Room');
  const [roomDesc, setRoomDesc] = useState(
    'Buyer, Seller & Broker title verification and boundary review.'
  );
  const [propTitle, setPropTitle] = useState(
    'Sunrise Hills 2.5-Acre Orchard Plot • ₹68,00,000'
  );
  const [propLoc, setPropLoc] = useState('Nandi Foothills, Chikkaballapur');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    users.map((u) => u.id)
  );
  const [modalError, setModalError] = useState<string | null>(null);
  const [mobileViewThread, setMobileViewThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages.length, selectedRoomId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    await onSendRoomMessage(selectedRoom.id, text);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (roomName.trim().length < 2) {
      setModalError('Please enter a Meeting Room Title (at least 2 characters).');
      return;
    }
    try {
      await onCreateRoom({
        name: roomName.trim(),
        description: roomDesc.trim(),
        property_title: propTitle.trim(),
        property_location: propLoc.trim(),
        member_ids: selectedMemberIds,
      });
      setShowCreateModal(false);
      setMobileViewThread(true);
    } catch (err: unknown) {
      setModalError(formatUserFriendlyError(err));
    }
  };

  const toggleMemberSelection = (uid: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  return (
    <div
      className={`wa-split-layout ${
        mobileViewThread && selectedRoom
          ? 'mobile-thread-active'
          : 'mobile-list-active'
      }`}
    >
      {/* Left Sidebar: Meeting Rooms List */}
      <aside className="wa-sidebar">
        <div className="wa-sidebar-header">
          <div>
            <h3>Deal Meeting Rooms</h3>
            <p className="wa-sidebar-sub">Multi-party Buyer + Seller + Broker rooms</p>
          </div>
          <button
            type="button"
            className="wa-new-btn"
            onClick={() => {
              setSelectedMemberIds(users.map((u) => u.id));
              setShowCreateModal(true);
            }}
            data-testid="create-room-btn"
          >
            <PlusCircle size={15} />
            <span>New Room</span>
          </button>
        </div>

        <div className="wa-conv-list">
          {rooms.map((room) => {
            const isSelected = room.id === selectedRoomId;
            return (
              <div
                key={room.id}
                onClick={() => {
                  onSelectRoom(room.id);
                  setMobileViewThread(true);
                }}
                className={`wa-conv-item ${isSelected ? 'active' : ''}`}
                data-testid={`room-item-${room.id}`}
              >
                <div className="wa-avatar-wrap">
                  <div
                    className="wa-avatar"
                    style={{ backgroundColor: '#075E54' }}
                  >
                    <Users size={18} />
                  </div>
                </div>

                <div className="wa-conv-body">
                  <div className="wa-conv-top">
                    <span className="wa-peer-name">{room.name}</span>
                    <div className="wa-room-top-badges">
                      {(unreadRoomCounts[room.id] || 0) > 0 && (
                        <span className="wa-unread-pill">
                          {unreadRoomCounts[room.id]}
                        </span>
                      )}
                      <span className="wa-member-count-pill">
                        {room.members.length} members
                      </span>
                    </div>
                  </div>

                  <div className="wa-conv-prop-tag">
                    <MapPin size={11} />
                    <span>{room.property_title}</span>
                  </div>

                  <div className="wa-room-roles-row">
                    {room.members.map((m) => (
                      <span
                        key={m.id}
                        className={`wa-role-tag role-${m.role}`}
                        title={`${m.name} (${m.role})`}
                      >
                        {m.name.split(' ')[0]} ({m.role[0].toUpperCase()})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Pane: Active Meeting Room */}
      <section className="wa-chat-pane">
        {selectedRoom ? (
          <>
            <div className="wa-chat-header">
              <div className="wa-chat-peer-info">
                <button
                  type="button"
                  className="wa-mobile-back-btn"
                  onClick={() => setMobileViewThread(false)}
                  aria-label="Back to meeting rooms list"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="wa-avatar" style={{ backgroundColor: '#075E54' }}>
                  <Users size={20} />
                </div>
                <div>
                  <div className="wa-peer-title">
                    <h4>{selectedRoom.name}</h4>
                    <span className="wa-member-count-pill">
                      {selectedRoom.members.length} Participants
                    </span>
                  </div>
                  <p className="wa-peer-privacy-line">
                    {selectedRoom.description || selectedRoom.property_title}
                  </p>
                </div>
              </div>

              <div className="wa-chat-call-actions">
                {!selectedRoom.members.some((m) => m.id === currentUser.id) && (
                  <button
                    type="button"
                    className="wa-call-trigger-btn audio"
                    onClick={() => onJoinRoom(selectedRoom.id)}
                  >
                    <UserPlus size={15} />
                    <span>Join Room</span>
                  </button>
                )}

                <button
                  type="button"
                  className="wa-call-trigger-btn audio"
                  onClick={() => onJoinRoomCall(selectedRoom, 'audio')}
                  data-testid="room-audio-call-btn"
                >
                  <Phone size={15} />
                  <span>Room Audio</span>
                </button>

                <button
                  type="button"
                  className="wa-call-trigger-btn video"
                  onClick={() => onJoinRoomCall(selectedRoom, 'video')}
                  data-testid="room-video-call-btn"
                >
                  <Video size={15} />
                  <span>Room Video Call</span>
                </button>
              </div>
            </div>

            {/* Room Members Bar with Direct 1:1 Call shortcuts */}
            <div className="wa-room-participants-bar">
              <span className="wa-room-bar-label">Room Members:</span>
              <div className="wa-room-member-chips">
                {selectedRoom.members.map((m) => (
                  <div key={m.id} className="wa-room-member-chip">
                    <span className={`wa-dot ${m.presence}`} />
                    <span className="wa-member-chip-name">{m.name}</span>
                    <span className={`wa-role-tag role-${m.role}`}>
                      {m.role.toUpperCase()}
                    </span>
                    {m.id !== currentUser.id && (
                      <button
                        type="button"
                        className="wa-mini-call-btn"
                        onClick={() =>
                          onDirectCallMember(
                            m,
                            'video',
                            `${selectedRoom.name} • ${selectedRoom.property_title}`
                          )
                        }
                        title={`Call ${m.name} directly`}
                      >
                        <Video size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Room Messages */}
            <div className="wa-messages-container">
              <div className="wa-encryption-notice">
                <ShieldCheck size={13} />
                <span>
                  Multi-Party Deal Room • Buyers, Sellers & Brokers collaborate
                  here without exposing personal phone numbers.
                </span>
              </div>

              {roomMessages.map((msg) => {
                const isMine = msg.sender_id === currentUser.id;
                if (msg.message_type === 'system') {
                  return (
                    <div key={msg.id} className="wa-system-event-pill">
                      <span>{msg.content}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`wa-msg-row ${isMine ? 'outgoing' : 'incoming'}`}
                  >
                    <div
                      className={`wa-msg-bubble ${
                        isMine ? 'outgoing' : 'incoming'
                      }`}
                    >
                      <div className="wa-msg-sender">
                        {msg.sender_name}{' '}
                        <span className={`wa-role-tag role-${msg.sender_role}`}>
                          {msg.sender_role.toUpperCase()}
                        </span>
                      </div>
                      <p className="wa-msg-text">{msg.content}</p>
                      <div className="wa-msg-meta">
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form className="wa-chat-input-bar" onSubmit={handleSend}>
              <input
                type="text"
                placeholder={`Post message to ${selectedRoom.name}...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                data-testid="room-message-input"
              />
              <button
                type="submit"
                className="wa-send-btn"
                data-testid="room-send-btn"
              >
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="wa-empty-chat-pane">
            <h3>Select a Deal Meeting Room to join the discussion</h3>
          </div>
        )}
      </section>

      {/* Modal to Create a New Deal Meeting Room */}
      {showCreateModal && (
        <div className="wa-modal-overlay">
          <div className="wa-modal-card">
            <h3>Create Multi-Party Deal Meeting Room</h3>
            {modalError && (
              <div className="wa-form-error" role="alert">
                <AlertCircle size={15} />
                <span>{modalError}</span>
              </div>
            )}
            <form onSubmit={handleCreate} className="wa-modal-form">
              <label>
                Meeting Room Title
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  required
                />
              </label>

              <label>
                Property / Plot Details
                <input
                  type="text"
                  value={propTitle}
                  onChange={(e) => setPropTitle(e.target.value)}
                  required
                />
              </label>

              <label>
                Location
                <input
                  type="text"
                  value={propLoc}
                  onChange={(e) => setPropLoc(e.target.value)}
                />
              </label>

              <label>
                Room Agenda / Description
                <input
                  type="text"
                  value={roomDesc}
                  onChange={(e) => setRoomDesc(e.target.value)}
                />
              </label>

              <div className="wa-checkbox-group">
                <span>Include Participants (Buyer / Seller / Broker):</span>
                {users.map((u) => (
                  <label key={u.id} className="wa-checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(u.id)}
                      onChange={() => toggleMemberSelection(u.id)}
                    />
                    <span>
                      {u.name} ({u.role.toUpperCase()})
                    </span>
                  </label>
                ))}
              </div>

              <div className="wa-modal-actions">
                <button
                  type="button"
                  className="wa-btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="wa-btn-primary">
                  Create Meeting Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
