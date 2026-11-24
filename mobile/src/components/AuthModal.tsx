import React, { useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  LogIn,
  Lock,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { UserProfile } from '../types';
import { formatUserFriendlyError } from '../services/api';

interface AuthModalProps {
  currentUser: UserProfile;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile, token: string) => void;
  onRegisterSuccess: (user: UserProfile, token: string) => void;
  onUpdatePrivacy: (payload: {
    allow_direct_calls?: boolean;
    hide_contact_details?: boolean;
    bio?: string;
  }) => Promise<void>;
  onLoginRequest: (payload: {
    email_or_handle: string;
    password: string;
  }) => Promise<{ user: UserProfile; access_token: string }>;
  onRegisterRequest: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: string;
    bio: string;
  }) => Promise<{ user: UserProfile; access_token: string }>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentUser,
  onClose,
  onLoginSuccess,
  onRegisterSuccess,
  onUpdatePrivacy,
  onLoginRequest,
  onRegisterRequest,
}) => {
  const [mode, setMode] = useState<'privacy' | 'login' | 'register'>('privacy');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Login Form
  const [loginId, setLoginId] = useState('seller@landconnect.si');
  const [loginPassword, setLoginPassword] = useState('landconnect123');

  // Register Form
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+919845098765');
  const [regPassword, setRegPassword] = useState('landconnect123');
  const [regRole, setRegRole] = useState<'buyer' | 'seller' | 'broker'>('broker');
  const [regBio, setRegBio] = useState(
    'Certified Land Consultant • Agricultural & Commercial Plots'
  );

  // Privacy Form
  const [allowCalls, setAllowCalls] = useState(
    currentUser.allow_direct_calls ?? true
  );
  const [bioText, setBioText] = useState(currentUser.bio);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginId.trim() || !loginPassword.trim()) {
      setError('Please enter both your email/handle and password.');
      return;
    }
    try {
      const res = await onLoginRequest({
        email_or_handle: loginId.trim(),
        password: loginPassword,
      });
      onLoginSuccess(res.user, res.access_token);
      onClose();
    } catch (err: unknown) {
      setError(formatUserFriendlyError(err));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regName.trim().length < 2) {
      setError('Please enter your Full Name (at least 2 characters).');
      return;
    }
    if (!regEmail.includes('@')) {
      setError('Please enter a valid Email Address.');
      return;
    }
    if (regPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    try {
      const res = await onRegisterRequest({
        name: regName.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim(),
        password: regPassword,
        role: regRole,
        bio: regBio.trim(),
      });
      onRegisterSuccess(res.user, res.access_token);
      onClose();
    } catch (err: unknown) {
      setError(formatUserFriendlyError(err));
    }
  };

  const handleSavePrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onUpdatePrivacy({
        allow_direct_calls: allowCalls,
        hide_contact_details: true,
        bio: bioText,
      });
      setSuccessMsg('Privacy & role preferences updated successfully!');
      window.setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: unknown) {
      setError(formatUserFriendlyError(err));
    }
  };

  return (
    <div className="wa-modal-overlay" data-testid="auth-privacy-modal">
      <div className="wa-modal-card wa-auth-modal">
        <div className="wa-auth-modal-header">
          <h3>Authentication, Role Access & Privacy Controls</h3>
          <button type="button" className="wa-close-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="wa-auth-tabs">
          <button
            type="button"
            className={`wa-auth-tab ${mode === 'privacy' ? 'active' : ''}`}
            onClick={() => {
              setMode('privacy');
              setError(null);
            }}
          >
            <ShieldCheck size={14} />
            <span>Role & Privacy</span>
          </button>

          <button
            type="button"
            className={`wa-auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            <LogIn size={14} />
            <span>JWT Login</span>
          </button>

          <button
            type="button"
            className={`wa-auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            data-testid="auth-register-tab"
          >
            <UserPlus size={14} />
            <span>Register Account</span>
          </button>
        </div>

        {error && (
          <div className="wa-form-error" role="alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="wa-form-success" role="status">
            <CheckCircle2 size={15} />
            <span>{successMsg}</span>
          </div>
        )}

        {mode === 'privacy' && (
          <div className="wa-privacy-panel">
            <div className="wa-current-role-banner">
              <div>
                <strong>{currentUser.name}</strong> ({currentUser.in_app_handle})
                <div className="wa-masked-line">
                  🔒 Personal Phone Masked: {currentUser.masked_contact}
                </div>
              </div>
              <span className={`wa-role-tag role-${currentUser.role}`}>
                {currentUser.role.toUpperCase()} ROLE
              </span>
            </div>

            {/* Role-Based Permissions Matrix */}
            <div className="wa-rbac-matrix">
              <h4>Role-Based Access Control (RBAC) Permissions</h4>
              <ul>
                <li>
                  <CheckCircle2 size={14} className="perm-yes" />
                  <span>
                    Browse Community Land Listings & Interactive Geolocation Map
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={14} className="perm-yes" />
                  <span>
                    In-App WhatsApp Messaging, Deal Meeting Rooms & Audio/Video
                    Calling
                  </span>
                </li>
                <li>
                  {currentUser.role === 'seller' ||
                  currentUser.role === 'broker' ? (
                    <CheckCircle2 size={14} className="perm-yes" />
                  ) : (
                    <Lock size={14} className="perm-no" />
                  )}
                  <span>
                    Create, Geotag, Edit & Manage Property Listings{' '}
                    <strong>
                      ({currentUser.role === 'buyer' ? 'Restricted for Buyers' : 'Enabled for your Role'})
                    </strong>
                  </span>
                </li>
              </ul>
            </div>

            <form onSubmit={handleSavePrivacy} className="wa-modal-form">
              <label className="wa-checkbox-row">
                <input
                  type="checkbox"
                  checked={allowCalls}
                  onChange={(e) => setAllowCalls(e.target.checked)}
                />
                <span>
                  Allow verified Buyers, Sellers & Brokers to initiate in-app
                  Audio/Video calls
                </span>
              </label>

              <label className="wa-checkbox-row">
                <input type="checkbox" checked readOnly />
                <span>
                  Strictly hide personal phone number & email (Mandatory
                  LandConnect Privacy Guard)
                </span>
              </label>

              <label>
                Public Profile Bio
                <input
                  type="text"
                  value={bioText}
                  onChange={(e) => setBioText(e.target.value)}
                />
              </label>

              <div className="wa-modal-actions">
                <button type="submit" className="wa-btn-primary">
                  Save Privacy Settings
                </button>
              </div>
            </form>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="wa-modal-form">
            <p className="wa-auth-hint">
              Demo Credentials: <code>buyer@landconnect.si</code>,{' '}
              <code>seller@landconnect.si</code>, or{' '}
              <code>broker@landconnect.si</code> (Password:{' '}
              <code>landconnect123</code>)
            </p>

            <label>
              Email or In-App Handle
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </label>

            <div className="wa-modal-actions">
              <button type="submit" className="wa-btn-primary">
                Sign In with JWT
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="wa-modal-form">
            <div className="wa-form-grid-2">
              <label>
                Full Name *
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Kiran Rao"
                  required
                  data-testid="register-name-input"
                />
              </label>

              <label>
                Select Marketplace Role *
                <select
                  value={regRole}
                  onChange={(e) =>
                    setRegRole(e.target.value as 'buyer' | 'seller' | 'broker')
                  }
                  data-testid="register-role-select"
                >
                  <option value="buyer">Buyer (Discover, Chat & Call)</option>
                  <option value="seller">
                    Seller (Landowner • Post & Manage Listings)
                  </option>
                  <option value="broker">
                    Broker (RERA Agent • Manage Multi-Owner Listings)
                  </option>
                </select>
              </label>
            </div>

            <div className="wa-form-grid-2">
              <label>
                Email Address (Kept Private) *
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="kiran@landconnect.si"
                  required
                  data-testid="register-email-input"
                />
              </label>

              <label>
                Phone Number (Masked in App) *
                <input
                  type="text"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              Password *
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
              />
            </label>

            <label>
              Profile Bio
              <input
                type="text"
                value={regBio}
                onChange={(e) => setRegBio(e.target.value)}
              />
            </label>

            <div className="wa-modal-actions">
              <button
                type="submit"
                className="wa-btn-primary"
                data-testid="register-submit-btn"
              >
                Create Account & Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
