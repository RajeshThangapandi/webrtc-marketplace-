import React from 'react';
import {
  ShieldCheck,
  Wifi,
  WifiOff,
  ExternalLink,
  MessageSquare,
  Users,
  PhoneCall,
  Compass,
  Map,
  UserCheck,
} from 'lucide-react';
import { UserProfile } from '../types';

export type ActiveTab = 'community' | 'maps' | 'chats' | 'rooms' | 'calls';

interface HeaderProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  onSelectUser: (user: UserProfile) => void;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  wsConnected: boolean;
  listingsCount: number;
  unreadChatsCount: number;
  unreadRoomsCount: number;
  unseenCallsCount: number;
  onOpenAuthModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  users,
  onSelectUser,
  activeTab,
  onTabChange,
  wsConnected,
  listingsCount,
  unreadChatsCount,
  unreadRoomsCount,
  unseenCallsCount,
  onOpenAuthModal,
}) => {
  const openSecondPeerWindow = () => {
    const counterpart =
      users.find(
        (u) => u.id !== currentUser?.id && u.role !== currentUser?.role
      ) || users.find((u) => u.id !== currentUser?.id);
    const targetId = counterpart ? counterpart.id : 'user-seller-1';
    const url = `${window.location.origin}${
      window.location.pathname
    }?user=${encodeURIComponent(targetId)}`;
    window.open(url, '_blank', 'width=440,height=840');
  };

  return (
    <header className="wa-header">
      {/* Top Role Switcher Bar for Multi-User Call & RBAC Testing */}
      <div className="wa-role-bar">
        <div className="wa-role-selector-group">
          <span className="wa-role-label">Quick Role Switch:</span>
          <div className="wa-role-pills">
            {users.map((u) => {
              const isSelected = currentUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onSelectUser(u)}
                  className={`wa-role-pill ${isSelected ? 'active' : ''}`}
                  title={`Switch session to ${u.name} (${u.role.toUpperCase()})`}
                  data-testid={`switch-user-${u.id}`}
                >
                  <span className={`wa-dot ${u.presence}`} />
                  <span>{u.name.split(' ')[0]}</span>
                  <span className={`wa-role-tag role-${u.role}`}>
                    {u.role.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="wa-role-bar-right">
          <button
            type="button"
            className="wa-auth-open-btn"
            onClick={onOpenAuthModal}
            data-testid="open-auth-privacy-btn"
          >
            <UserCheck size={13} />
            <span>Auth, Roles & Privacy</span>
          </button>

          <button
            type="button"
            className="wa-open-peer-btn"
            onClick={openSecondPeerWindow}
            title="Open a second independent device window to test live 2-way audio & video calling"
          >
            <ExternalLink size={13} />
            <span>Open 2nd Device</span>
          </button>
        </div>
      </div>

      {/* Main WhatsApp App Bar */}
      <div className="wa-brand-row">
        <div className="wa-brand-left">
          <div className="wa-logo-badge">LC</div>
          <div>
            <div className="wa-title-line">
              <h1>LandConnect</h1>
              <span className="wa-privacy-pill">
                <ShieldCheck size={12} />
                Number Hidden
              </span>
            </div>
            {currentUser && (
              <p className="wa-subtitle">
                Logged in as <strong>{currentUser.name}</strong> (
                {currentUser.in_app_handle}) •{' '}
                <span className="wa-masked-phone">
                  {currentUser.masked_contact}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="wa-connection-badge">
          {wsConnected ? (
            <span className="wa-ws-status online">
              <Wifi size={14} />
              Live Signaling
            </span>
          ) : (
            <span className="wa-ws-status offline">
              <WifiOff size={14} />
              Reconnecting
            </span>
          )}
        </div>
      </div>

      {/* WhatsApp 5-Tab Navigation Bar with Dynamic Unread & Live Badges */}
      <nav className="wa-tabs">
        <button
          type="button"
          className={`wa-tab ${activeTab === 'community' ? 'active' : ''}`}
          onClick={() => onTabChange('community')}
          data-testid="tab-community"
        >
          <Compass size={16} />
          <span>COMMUNITY</span>
          <span className="wa-tab-badge">{listingsCount}</span>
        </button>

        <button
          type="button"
          className={`wa-tab ${activeTab === 'maps' ? 'active' : ''}`}
          onClick={() => onTabChange('maps')}
          data-testid="tab-maps"
        >
          <Map size={16} />
          <span>MAPS</span>
          <span className="wa-tab-badge">{listingsCount}</span>
        </button>

        <button
          type="button"
          className={`wa-tab ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => onTabChange('chats')}
          data-testid="tab-chats"
          title={
            unreadChatsCount > 0
              ? `${unreadChatsCount} unread chat message(s)`
              : 'All chat messages read'
          }
        >
          <MessageSquare size={16} />
          <span>CHATS</span>
          <span
            className={`wa-tab-badge ${
              unreadChatsCount > 0 ? 'unread-green' : 'zero-read'
            }`}
            data-testid="chats-unread-badge"
          >
            {unreadChatsCount}
          </span>
        </button>

        <button
          type="button"
          className={`wa-tab ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => onTabChange('rooms')}
          data-testid="tab-rooms"
          title={
            unreadRoomsCount > 0
              ? `${unreadRoomsCount} unread room message(s)`
              : 'All meeting room messages read'
          }
        >
          <Users size={16} />
          <span>MEETING ROOMS</span>
          <span
            className={`wa-tab-badge ${
              unreadRoomsCount > 0 ? 'unread-green' : 'zero-read'
            }`}
            data-testid="rooms-unread-badge"
          >
            {unreadRoomsCount}
          </span>
        </button>

        <button
          type="button"
          className={`wa-tab ${activeTab === 'calls' ? 'active' : ''}`}
          onClick={() => onTabChange('calls')}
          data-testid="tab-calls"
          title={
            unseenCallsCount > 0
              ? `${unseenCallsCount} new/missed call alert(s)`
              : 'No new missed calls'
          }
        >
          <PhoneCall size={16} />
          <span>CALLS</span>
          <span
            className={`wa-tab-badge ${
              unseenCallsCount > 0 ? 'unread-alert' : 'zero-read'
            }`}
            data-testid="calls-unseen-badge"
          >
            {unseenCallsCount}
          </span>
        </button>
      </nav>
    </header>
  );
};
