import React, { useState, useEffect } from 'react';
import {
  MapPin,
  MessageSquare,
  Phone,
  Video,
  PlusCircle,
  Edit3,
  Trash2,
  Search,
  ShieldCheck,
  Upload,
  CheckCircle2,
  Navigation,
  Layers,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { UserProfile, LandListing, CallType } from '../types';
import { formatUserFriendlyError } from '../services/api';

interface CommunityTabProps {
  currentUser: UserProfile;
  listings: LandListing[];
  onCreateListing: (payload: {
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
  }) => Promise<void>;
  onUpdateListing: (
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
  ) => Promise<void>;
  onDeleteListing: (listingId: string) => Promise<void>;
  onChatWithOwner: (listing: LandListing) => Promise<void>;
  onCallOwner: (listing: LandListing, callType: CallType) => void;
  onViewOnMap: (listing: LandListing) => void;
  prefilledCoords?: { lat: number; lng: number } | null;
  onClearPrefilledCoords?: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All Parcels' },
  { id: 'agricultural', label: 'Agricultural' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'residential', label: 'Residential' },
  { id: 'orchard', label: 'Orchard / Farm' },
  { id: 'industrial', label: 'Industrial' },
];

const PRESET_LAND_PHOTOS = [
  {
    label: 'Green Valley Farmland',
    url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80',
  },
  {
    label: 'Highway Corner Plot',
    url: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1000&q=80',
  },
  {
    label: 'Hillside Mango Orchard',
    url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1000&q=80',
  },
  {
    label: 'Gated Villa Plot Corridor',
    url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1000&q=80',
  },
];

export const CommunityTab: React.FC<CommunityTabProps> = ({
  currentUser,
  listings,
  onCreateListing,
  onUpdateListing,
  onDeleteListing,
  onChatWithOwner,
  onCallOwner,
  onViewOnMap,
  prefilledCoords,
  onClearPrefilledCoords,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMyListings, setOnlyMyListings] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingListing, setEditingListing] = useState<LandListing | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Listing Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('agricultural');
  const [priceDisplay, setPriceDisplay] = useState('₹64,00,000');
  const [priceNumeric, setPriceNumeric] = useState(6400000);
  const [areaDisplay, setAreaDisplay] = useState('3.2 Acres');
  const [locationName, setLocationName] = useState(
    'Sarjapur - Bagalur Highway Belt, Bengaluru'
  );
  const [latitude, setLatitude] = useState(12.9121);
  const [longitude, setLongitude] = useState(77.6446);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState(PRESET_LAND_PHOTOS[0].url);
  const [featuresInput, setFeaturesInput] = useState(
    '40ft Road Access, Clear Title Deed, Borewell Water, Boundary Fenced'
  );
  const [status, setStatus] = useState('available');

  const canManageListings =
    currentUser.role === 'seller' || currentUser.role === 'broker';

  // If navigated from Map with prefilled coordinates, open Create modal automatically
  useEffect(() => {
    if (prefilledCoords && canManageListings) {
      openCreateModal(prefilledCoords.lat, prefilledCoords.lng);
      if (onClearPrefilledCoords) onClearPrefilledCoords();
    }
  }, [prefilledCoords, canManageListings]);

  const openCreateModal = (lat = 12.9121, lng = 77.6446) => {
    setEditingListing(null);
    setFormError(null);
    setTitle('');
    setCategory('agricultural');
    setPriceDisplay('₹64,00,000');
    setPriceNumeric(6400000);
    setAreaDisplay('3.2 Acres');
    setLocationName('Sarjapur - Bagalur Road, Bengaluru');
    setLatitude(Number(lat.toFixed(4)));
    setLongitude(Number(lng.toFixed(4)));
    setDescription(
      'Prime land parcel with direct tar road frontage, verified survey sketch, and immediate registration readiness.'
    );
    setImageUrl(PRESET_LAND_PHOTOS[0].url);
    setFeaturesInput(
      '40ft Road Access, Clear Title Deed, Borewell Water, Boundary Fenced'
    );
    setStatus('available');
    setShowFormModal(true);
  };

  const openEditModal = (listing: LandListing) => {
    setEditingListing(listing);
    setFormError(null);
    setTitle(listing.title);
    setCategory(listing.category);
    setPriceDisplay(listing.price_display);
    setPriceNumeric(listing.price_numeric);
    setAreaDisplay(listing.area_display);
    setLocationName(listing.location_name);
    setLatitude(listing.latitude);
    setLongitude(listing.longitude);
    setDescription(listing.description);
    setImageUrl(listing.image_urls[0] || PRESET_LAND_PHOTOS[0].url);
    setFeaturesInput(listing.features.join(', '));
    setStatus(listing.status);
    setShowFormModal(true);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUseDeviceGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(Number(pos.coords.latitude.toFixed(4)));
          setLongitude(Number(pos.coords.longitude.toFixed(4)));
        },
        () => {
          // Fallback to Bengaluru North Airport Corridor coordinates
          setLatitude(13.1986);
          setLongitude(77.7066);
        }
      );
    } else {
      setLatitude(13.1986);
      setLongitude(77.7066);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (title.trim().length < 3) {
      setFormError('Please enter a Property Title with at least 3 characters.');
      return;
    }
    if (description.trim().length < 5) {
      setFormError('Please enter a Property Description with at least 5 characters.');
      return;
    }
    if (Number.isNaN(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90) {
      setFormError('Latitude must be a valid coordinate between -90 and 90.');
      return;
    }
    if (Number.isNaN(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180) {
      setFormError('Longitude must be a valid coordinate between -180 and 180.');
      return;
    }

    const features = featuresInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      if (editingListing) {
        await onUpdateListing(editingListing.id, {
          title: title.trim(),
          description: description.trim(),
          category,
          price_display: priceDisplay.trim(),
          price_numeric: Number(priceNumeric) || 0,
          area_display: areaDisplay.trim(),
          location_name: locationName.trim(),
          latitude: Number(latitude),
          longitude: Number(longitude),
          image_urls: [imageUrl.trim()],
          features,
          status,
        });
      } else {
        await onCreateListing({
          title: title.trim(),
          description: description.trim(),
          category,
          price_display: priceDisplay.trim(),
          price_numeric: Number(priceNumeric) || 0,
          area_display: areaDisplay.trim(),
          location_name: locationName.trim(),
          latitude: Number(latitude),
          longitude: Number(longitude),
          image_urls: [imageUrl.trim()],
          features,
          status,
        });
      }
      setShowFormModal(false);
    } catch (err: unknown) {
      setFormError(formatUserFriendlyError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredListings = listings.filter((item) => {
    if (
      selectedCategory !== 'all' &&
      item.category.toLowerCase() !== selectedCategory
    ) {
      return false;
    }
    if (onlyMyListings && item.owner_id !== currentUser.id) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.location_name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.owner.name.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="wa-community-page">
      {/* Top Toolbar: Search, Category Filters & Role-Based Create Button */}
      <div className="wa-community-toolbar">
        <div className="wa-community-top-row">
          <div className="wa-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search land listings by location, title, zoning, or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="community-search-input"
            />
          </div>

          <div className="wa-community-actions">
            {canManageListings && (
              <label className="wa-my-listings-toggle">
                <input
                  type="checkbox"
                  checked={onlyMyListings}
                  onChange={(e) => setOnlyMyListings(e.target.checked)}
                />
                <span>My Listings Only</span>
              </label>
            )}

            {canManageListings ? (
              <button
                type="button"
                className="wa-create-listing-btn"
                onClick={() => openCreateModal()}
                data-testid="open-create-listing-btn"
              >
                <PlusCircle size={16} />
                <span>+ Post Land Listing ({currentUser.role.toUpperCase()})</span>
              </button>
            ) : (
              <div
                className="wa-buyer-rbac-badge"
                data-testid="buyer-rbac-notice"
                title="Switch to Seller or Broker role in the top bar to create or edit listings"
              >
                <Lock size={14} />
                <span>
                  Buyer Mode: Browse, Map, Chat & Call (Sellers/Brokers post
                  listings)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="wa-category-pills">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`wa-cat-pill ${
                selectedCategory === cat.id ? 'active' : ''
              }`}
            >
              <Layers size={13} />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Land Listings Grid */}
      <div className="wa-listings-grid">
        {filteredListings.length === 0 ? (
          <div className="wa-empty-list">
            No land listings match your filter criteria.
          </div>
        ) : (
          filteredListings.map((listing) => {
            const isOwnerOrBroker =
              currentUser.id === listing.owner_id ||
              currentUser.role === 'broker';
            const canEditThis = canManageListings && isOwnerOrBroker;
            const isOwnListing = currentUser.id === listing.owner_id;

            return (
              <article
                key={listing.id}
                className="wa-listing-card"
                data-testid={`listing-card-${listing.id}`}
              >
                {/* Property Image & Overlay Badges */}
                <div className="wa-listing-img-wrap">
                  <img
                    src={
                      listing.image_urls[0] || PRESET_LAND_PHOTOS[0].url
                    }
                    alt={listing.title}
                    className="wa-listing-img"
                  />
                  <div className="wa-listing-top-badges">
                    <span className="wa-cat-tag">
                      {listing.category.toUpperCase()}
                    </span>
                    <span
                      className={`wa-status-tag status-${listing.status}`}
                    >
                      {listing.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <div className="wa-listing-price-bar">
                    <span className="wa-listing-price">
                      {listing.price_display}
                    </span>
                    <span className="wa-listing-area">
                      {listing.area_display}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="wa-listing-body">
                  <h3 className="wa-listing-title">{listing.title}</h3>

                  <div className="wa-listing-location-row">
                    <div className="wa-loc-text">
                      <MapPin size={14} />
                      <span>{listing.location_name}</span>
                    </div>
                    <button
                      type="button"
                      className="wa-view-map-link"
                      onClick={() => onViewOnMap(listing)}
                      title="View this land parcel on the Interactive Map"
                    >
                      <Navigation size={12} />
                      <span>
                        {listing.latitude.toFixed(3)}°N,{' '}
                        {listing.longitude.toFixed(3)}°E • Map
                      </span>
                    </button>
                  </div>

                  <p className="wa-listing-desc">{listing.description}</p>

                  {/* Feature Highlights */}
                  {listing.features.length > 0 && (
                    <div className="wa-listing-features">
                      {listing.features.map((feat) => (
                        <span key={feat} className="wa-feature-chip">
                          <CheckCircle2 size={11} />
                          <span>{feat}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Privacy-Protected Seller / Broker Owner Card */}
                  <div className="wa-listing-owner-box">
                    <div className="wa-owner-left">
                      <div
                        className="wa-avatar-sm"
                        style={{
                          backgroundColor:
                            listing.owner.avatar_color || '#128C7E',
                        }}
                      >
                        {listing.owner.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div className="wa-peer-title">
                          <strong>{listing.owner.name}</strong>
                          <span
                            className={`wa-role-tag role-${listing.owner.role}`}
                          >
                            {listing.owner.role.toUpperCase()}
                          </span>
                          <span
                            className={`wa-dot ${listing.owner.presence}`}
                          />
                        </div>
                        <span className="wa-owner-masked">
                          <ShieldCheck size={11} />
                          {listing.owner.in_app_handle} •{' '}
                          {listing.owner.masked_contact}
                        </span>
                      </div>
                    </div>

                    {canEditThis && (
                      <div className="wa-owner-crud-btns">
                        <button
                          type="button"
                          className="wa-crud-btn edit"
                          onClick={() => openEditModal(listing)}
                          title="Edit Listing"
                          data-testid={`edit-listing-${listing.id}`}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="wa-crud-btn delete"
                          onClick={() => onDeleteListing(listing.id)}
                          title="Delete Listing"
                          data-testid={`delete-listing-${listing.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Direct WhatsApp Communication & In-App Calling Action Bar */}
                  <div className="wa-listing-cta-row">
                    {!isOwnListing ? (
                      <>
                        <button
                          type="button"
                          className="wa-cta-btn chat"
                          onClick={() => onChatWithOwner(listing)}
                          data-testid={`listing-chat-${listing.id}`}
                        >
                          <MessageSquare size={15} />
                          <span>Message</span>
                        </button>

                        <button
                          type="button"
                          className="wa-cta-btn audio"
                          onClick={() => onCallOwner(listing, 'audio')}
                          data-testid={`listing-audio-${listing.id}`}
                        >
                          <Phone size={15} />
                          <span>Audio Call</span>
                        </button>

                        <button
                          type="button"
                          className="wa-cta-btn video"
                          onClick={() => onCallOwner(listing, 'video')}
                          data-testid={`listing-video-${listing.id}`}
                        >
                          <Video size={15} />
                          <span>Video Call</span>
                        </button>
                      </>
                    ) : (
                      <div className="wa-own-listing-banner">
                        <span>
                          You manage this listing ({currentUser.role.toUpperCase()}
                          )
                        </span>
                        <button
                          type="button"
                          className="wa-btn-inline-edit"
                          onClick={() => openEditModal(listing)}
                        >
                          <Edit3 size={13} /> Edit Details
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Create / Edit Property Listing Modal (Sellers & Brokers) */}
      {showFormModal && (
        <div className="wa-modal-overlay">
          <div className="wa-modal-card wa-listing-modal">
            <h3>
              {editingListing
                ? `Edit Land Listing: ${editingListing.title}`
                : `Create New Land Listing (${currentUser.name} • ${currentUser.role.toUpperCase()})`}
            </h3>

            {formError && (
              <div className="wa-form-error" role="alert">
                <AlertCircle size={15} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="wa-modal-form">
              <div className="wa-form-grid-2">
                <label>
                  Property Title *
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Emerald Valley 4-Acre Farm Plot"
                    required
                    data-testid="listing-title-input"
                  />
                </label>

                <label>
                  Land Category *
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="agricultural">Agricultural Land</option>
                    <option value="commercial">Commercial Plot</option>
                    <option value="residential">Residential Villa Plot</option>
                    <option value="orchard">Orchard / Farm Estate</option>
                    <option value="industrial">Industrial / Warehousing</option>
                  </select>
                </label>
              </div>

              <div className="wa-form-grid-3">
                <label>
                  Formatted Price *
                  <input
                    type="text"
                    value={priceDisplay}
                    onChange={(e) => setPriceDisplay(e.target.value)}
                    placeholder="₹64,00,000"
                    required
                    data-testid="listing-price-input"
                  />
                </label>

                <label>
                  Total Land Area *
                  <input
                    type="text"
                    value={areaDisplay}
                    onChange={(e) => setAreaDisplay(e.target.value)}
                    placeholder="3.2 Acres / 12,000 Sq.Ft"
                    required
                  />
                </label>

                <label>
                  Listing Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="available">Available</option>
                    <option value="under_offer">Under Offer</option>
                    <option value="sold">Sold</option>
                  </select>
                </label>
              </div>

              <label>
                Geographical Location / Corridor Address *
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  required
                />
              </label>

              {/* Geotagging & Map Coordinate Picker */}
              <div className="wa-geotag-box">
                <div className="wa-geotag-header">
                  <span>
                    <MapPin size={13} /> Geotag Coordinates (Click map pad or enter
                    Lat/Lng)
                  </span>
                  <button
                    type="button"
                    className="wa-gps-btn"
                    onClick={handleUseDeviceGPS}
                  >
                    <Navigation size={12} /> Use GPS / Auto-Locate
                  </button>
                </div>

                <div className="wa-geotag-split">
                  <div className="wa-form-grid-2">
                    <label>
                      Latitude (°N)
                      <input
                        type="number"
                        step="0.0001"
                        value={latitude}
                        onChange={(e) => setLatitude(Number(e.target.value))}
                        required
                      />
                    </label>
                    <label>
                      Longitude (°E)
                      <input
                        type="number"
                        step="0.0001"
                        value={longitude}
                        onChange={(e) => setLongitude(Number(e.target.value))}
                        required
                      />
                    </label>
                  </div>

                  {/* Interactive Mini Geotag Pad */}
                  <div
                    className="wa-mini-geotag-pad"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const rx = (e.clientX - rect.left) / rect.width;
                      const ry = (e.clientY - rect.top) / rect.height;
                      // Map click across Bengaluru metropolitan region (Lat 12.65..13.45, Lng 77.20..77.85)
                      const pickedLat = 13.45 - ry * (13.45 - 12.65);
                      const pickedLng = 77.2 + rx * (77.85 - 77.2);
                      setLatitude(Number(pickedLat.toFixed(4)));
                      setLongitude(Number(pickedLng.toFixed(4)));
                    }}
                    title="Click anywhere to drop geotag pin"
                  >
                    <div
                      className="wa-mini-pin"
                      style={{
                        left: `${Math.min(
                          92,
                          Math.max(8, ((longitude - 77.2) / 0.65) * 100)
                        )}%`,
                        top: `${Math.min(
                          88,
                          Math.max(10, ((13.45 - latitude) / 0.8) * 100)
                        )}%`,
                      }}
                    >
                      📍
                    </div>
                    <span className="wa-mini-pad-hint">
                      Click to drop GPS pin ({latitude.toFixed(3)}°N,{' '}
                      {longitude.toFixed(3)}°E)
                    </span>
                  </div>
                </div>
              </div>

              {/* Property Image Upload or Preset Selection */}
              <div className="wa-image-upload-section">
                <label>
                  Property Photo (Upload Image File or Enter URL)
                  <div className="wa-upload-row">
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <label className="wa-file-upload-btn">
                      <Upload size={14} />
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </label>

                <div className="wa-preset-photos-row">
                  {PRESET_LAND_PHOTOS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={`wa-preset-chip ${
                        imageUrl === preset.url ? 'active' : ''
                      }`}
                      onClick={() => setImageUrl(preset.url)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                Property Description & Zoning Details *
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </label>

              <label>
                Key Highlights (comma-separated)
                <input
                  type="text"
                  value={featuresInput}
                  onChange={(e) => setFeaturesInput(e.target.value)}
                  placeholder="30ft Tar Road, Borewell, Clear Title, Fenced"
                />
              </label>

              <div className="wa-modal-actions">
                <button
                  type="button"
                  className="wa-btn-secondary"
                  onClick={() => setShowFormModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wa-btn-primary"
                  disabled={isSubmitting}
                  data-testid="submit-listing-btn"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : editingListing
                    ? 'Save Changes'
                    : 'Publish Land Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
