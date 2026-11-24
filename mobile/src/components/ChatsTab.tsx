import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Video,
  Send,
  MapPin,
  ShieldCheck,
  PlusCircle,
  CheckCheck,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import {
  UserProfile,
  Conversation,
  ChatMessage,
  CallType,
} from '../types';
import { formatUserFriendlyError } from '../services/api';

interface ChatsTabProps {
  currentUser: UserProfile;
  users: UserProfile[];
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (convId: string) => void;
  messages: ChatMessage[];
  onSendMessage: (conversationId: string, content: string) => Promise<void>;
  onStartNewConversation: (
    targetUserId: string,
    propertyTitle: string,
    propertyPrice: string,
    propertyLocation: string
  ) => Promise<void>;
  onInitiateCall: (
    callee: UserProfile,
    callType: CallType,
    propertyTitle: string
  ) => void;
  autoOpenMobileThread?: boolean;
  onMobileThreadOpened?: () => void;
}

export const ChatsTab: React.FC<ChatsTabProps> = ({
  currentUser,
  users,
  conversations,
  selectedConversationId,
  onSelectConversation,
  messages,
  onSendMessage,
  onStartNewConversation,
  onInitiateCall,
  autoOpenMobileThread,
  onMobileThreadOpened,
}) => {
  const [inputText, setInputText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newPeerId, setNewPeerId] = useState('');
  const [newPropTitle, setNewPropTitle] = useState(
    'Lakeview 3-Acre Agricultural Plot'
  );
  const [newPropPrice, setNewPropPrice] = useState('₹52,00,000');
  const [newPropLocation, setNewPropLocation] = useState(
    'Ramanagara Highway, Bengaluru'
  );
  const [modalError, setModalError] = useState<string | null>(null);
  const [mobileViewThread, setMobileViewThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation =
    conversations.find((c) => c.id === selectedConversationId) || null;

  const getOtherParticipant = (conv: Conversation): UserProfile => {
    return conv.participant_1.id === currentUser.id
      ? conv.participant_2
      : conv.participant_1;
  };

  useEffect(() => {
    if (autoOpenMobileThread) {
      setMobileViewThread(true);
      if (onMobileThreadOpened) onMobileThreadOpened();
    }
  }, [autoOpenMobileThread, onMobileThreadOpened]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedConversationId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !inputText.trim()) return;
    const content = inputText.trim();
    setInputText('');
    await onSendMessage(selectedConversation.id, content);
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!newPeerId) {
      setModalError('Please select a recipient to start chatting.');
      return;
    }
    if (newPropTitle.trim().length < 2) {
      setModalError('Please enter a Land Listing / Plot Title.');
      return;
    }
    try {
      await onStartNewConversation(
        newPeerId,
        newPropTitle.trim(),
        newPropPrice.trim(),
        newPropLocation.trim()
      );
      setShowNewChatModal(false);
      setMobileViewThread(true);
    } catch (err: unknown) {
      setModalError(formatUserFriendlyError(err));
    }
  };

  const availablePeers = users.filter((u) => u.id !== currentUser.id);

  return (
    <div
      className={`wa-split-layout ${
        mobileViewThread && selectedConversation
          ? 'mobile-thread-active'
          : 'mobile-list-active'
      }`}
    >
      {/* Left Sidebar: 1:1 Conversations List */}
      <aside className="wa-sidebar">
        <div className="wa-sidebar-header">
          <div>
            <h3>Property Chats</h3>
            <p className="wa-sidebar-sub">Direct Buyer, Seller & Broker threads</p>
          </div>
          <button
            type="button"
            className="wa-new-btn"
            onClick={() => {
              if (availablePeers.length > 0 && !newPeerId) {
                setNewPeerId(availablePeers[0].id);
              }
              setShowNewChatModal(true);
            }}
          >
            <PlusCircle size={15} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="wa-conv-list">
          {conversations.length === 0 ? (
            <div className="wa-empty-list">
              No chats yet for {currentUser.name}. Click "New Chat" to message a
              Seller, Broker, or Buyer.
            </div>
          ) : (
            conversations.map((conv) => {
              const peer = getOtherParticipant(conv);
              const isSelected = conv.id === selectedConversationId;
              const unreadCount = conv.unread_count || 0;
              const initials = peer.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    setMobileViewThread(true);
                  }}
                  className={`wa-conv-item ${isSelected ? 'active' : ''} ${
                    unreadCount > 0 ? 'has-unread' : ''
                  }`}
                  data-testid={`conv-item-${conv.id}`}
                >
                  <div className="wa-avatar-wrap">
                    <div
                      className="wa-avatar"
                      style={{ backgroundColor: peer.avatar_color || '#128C7E' }}
                    >
                      {initials}
                    </div>
                    <span className={`wa-presence-badge ${peer.presence}`} />
                  </div>

                  <div className="wa-conv-body">
                    <div className="wa-conv-top">
                      <div className="wa-peer-title">
                        <span className="wa-peer-name">{peer.name}</span>
                        <span className={`wa-role-tag role-${peer.role}`}>
                          {peer.role.toUpperCase()}
                        </span>
                      </div>
                      <span
                        className={`wa-conv-time ${
                          unreadCount > 0 ? 'unread-time' : ''
                        }`}
                      >
                        {new Date(conv.updated_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="wa-conv-prop-tag">
                      <MapPin size={11} />
                      <span>
                        {conv.property_title}
                        {conv.property_price ? ` • ${conv.property_price}` : ''}
                      </span>
                    </div>

                    <div className="wa-conv-bottom-row">
                      <p
                        className={`wa-conv-preview ${
                          unreadCount > 0 ? 'unread-bold' : ''
                        }`}
                      >
                        {conv.last_message
                          ? conv.last_message.content
                          : 'Tap to start messaging or initiate an in-app call'}
                      </p>
                      {unreadCount > 0 && (
                        <span
                          className="wa-unread-pill"
                          data-testid={`conv-unread-${conv.id}`}
                        >
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Main Pane: Active WhatsApp Conversation Thread */}
      <section className="wa-chat-pane">
        {selectedConversation ? (
          (() => {
            const peer = getOtherParticipant(selectedConversation);
            const initials = peer.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <>
                {/* Top Chat Header with Mobile Back Button + Audio & Video Call Triggers */}
                <div className="wa-chat-header">
                  <div className="wa-chat-peer-info">
                    <button
                      type="button"
                      className="wa-mobile-back-btn"
                      onClick={() => setMobileViewThread(false)}
                      aria-label="Back to conversations list"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div className="wa-avatar-wrap">
                      <div
                        className="wa-avatar"
                        style={{ backgroundColor: peer.avatar_color || '#128C7E' }}
                      >
                        {initials}
                      </div>
                      <span className={`wa-presence-badge ${peer.presence}`} />
                    </div>
                    <div>
                      <div className="wa-peer-title">
                        <h4>{peer.name}</h4>
                        <span className={`wa-role-tag role-${peer.role}`}>
                          {peer.role.toUpperCase()}
                        </span>
                        <span className="wa-presence-text">
                          •{' '}
                          {peer.presence === 'in_call'
                            ? 'In a Call'
                            : peer.presence === 'online'
                            ? 'Online'
                            : 'Offline'}
                        </span>
                      </div>
                      <p className="wa-peer-privacy-line">
                        {peer.in_app_handle} • 🔒 {peer.masked_contact}
                      </p>
                    </div>
                  </div>

                  {/* In-App Audio & Video Call Action Buttons */}
                  <div className="wa-chat-call-actions">
                    <button
                      type="button"
                      className="wa-call-trigger-btn audio"
                      onClick={() =>
                        onInitiateCall(
                          peer,
                          'audio',
                          selectedConversation.property_title
                        )
                      }
                      data-testid="start-audio-call-btn"
                      title={`Start In-App Audio Call with ${peer.name}`}
                    >
                      <Phone size={16} />
                      <span>Audio Call</span>
                    </button>

                    <button
                      type="button"
                      className="wa-call-trigger-btn video"
                      onClick={() =>
                        onInitiateCall(
                          peer,
                          'video',
                          selectedConversation.property_title
                        )
                      }
                      data-testid="start-video-call-btn"
                      title={`Start In-App Video Call with ${peer.name}`}
                    >
                      <Video size={16} />
                      <span>Video Call</span>
                    </button>
                  </div>
                </div>

                {/* Linked Land Listing Context Banner */}
                <div className="wa-property-context-bar">
                  <div className="wa-prop-ctx-left">
                    <MapPin size={14} />
                    <div>
                      <strong>{selectedConversation.property_title}</strong>
                      {selectedConversation.property_location && (
                        <span> • {selectedConversation.property_location}</span>
                      )}
                    </div>
                  </div>
                  {selectedConversation.property_price && (
                    <span className="wa-prop-price-badge">
                      {selectedConversation.property_price}
                    </span>
                  )}
                </div>

                {/* WhatsApp Chat Wallpaper & Message Bubbles */}
                <div className="wa-messages-container">
                  <div className="wa-encryption-notice">
                    <ShieldCheck size={13} />
                    <span>
                      Messages and calls are secured by LandConnect. Your personal
                      phone number is never revealed to {peer.name}.
                    </span>
                  </div>

                  {messages.map((msg) => {
                    const isMine = msg.sender_id === currentUser.id;
                    if (
                      msg.message_type === 'call_event' ||
                      msg.message_type === 'system'
                    ) {
                      return (
                        <div key={msg.id} className="wa-system-event-pill">
                          <span>{msg.content}</span>
                          <small>
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
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
                          {!isMine && (
                            <div className="wa-msg-sender">
                              {msg.sender_name}{' '}
                              <span
                                className={`wa-role-tag role-${msg.sender_role}`}
                              >
                                {msg.sender_role.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <p className="wa-msg-text">{msg.content}</p>
                          <div className="wa-msg-meta">
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {isMine && (
                              <CheckCheck
                                size={14}
                                className={
                                  msg.is_read ? 'wa-ticks-read' : 'wa-ticks-sent'
                                }
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Reply Chips + Message Input Box */}
                <div className="wa-quick-chips">
                  {[
                    'Can we do a quick video call to see the plot boundaries?',
                    'Is the FSI / conversion certificate available?',
                    'Let’s invite the Broker to a Deal Meeting Room.',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="wa-chip"
                      onClick={() => setInputText(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <form className="wa-chat-input-bar" onSubmit={handleSend}>
                  <input
                    type="text"
                    placeholder={`Message ${peer.name} (${peer.role})...`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    data-testid="chat-message-input"
                  />
                  <button
                    type="submit"
                    className="wa-send-btn"
                    data-testid="chat-send-btn"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </>
            );
          })()
        ) : (
          <div className="wa-empty-chat-pane">
            <h3>Select a conversation to message or start an in-app call</h3>
          </div>
        )}
      </section>

      {/* Modal to Start a New 1:1 Property Chat */}
      {showNewChatModal && (
        <div className="wa-modal-overlay">
          <div className="wa-modal-card">
            <h3>Start New Property Inquiry Chat</h3>
            {modalError && (
              <div className="wa-form-error" role="alert">
                <AlertCircle size={15} />
                <span>{modalError}</span>
              </div>
            )}
            <form onSubmit={handleCreateConversation} className="wa-modal-form">
              <label>
                Select Recipient (Buyer / Seller / Broker)
                <select
                  value={newPeerId}
                  onChange={(e) => setNewPeerId(e.target.value)}
                >
                  {availablePeers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.role.toUpperCase()} ({u.in_app_handle})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Land Listing / Plot Title
                <input
                  type="text"
                  value={newPropTitle}
                  onChange={(e) => setNewPropTitle(e.target.value)}
                  required
                />
              </label>

              <label>
                Listed Price
                <input
                  type="text"
                  value={newPropPrice}
                  onChange={(e) => setNewPropPrice(e.target.value)}
                />
              </label>

              <label>
                Location
                <input
                  type="text"
                  value={newPropLocation}
                  onChange={(e) => setNewPropLocation(e.target.value)}
                />
              </label>

              <div className="wa-modal-actions">
                <button
                  type="button"
                  className="wa-btn-secondary"
                  onClick={() => setShowNewChatModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="wa-btn-primary">
                  Open Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
