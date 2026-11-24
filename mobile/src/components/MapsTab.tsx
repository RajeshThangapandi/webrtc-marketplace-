import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  Phone,
  Video,
  MessageSquare,
  PlusCircle,
  ZoomIn,
  ZoomOut,
  Compass,
  ShieldCheck,
  CheckCircle2,
  Crosshair,
} from 'lucide-react';
import { UserProfile, LandListing, CallType } from '../types';

interface MapsTabProps {
  currentUser: UserProfile;
  listings: LandListing[];
  selectedListing: LandListing | null;
  onSelectListing: (listing: LandListing) => void;
  onChatWithOwner: (listing: LandListing) => Promise<void>;
  onCallOwner: (listing: LandListing, callType: CallType) => void;
  onGeotagCreateAtCoords: (lat: number, lng: number) => void;
}

// Bounding box for the regional land corridor map (Lat 12.60..13.50, Lng 77.15..77.90)
const MIN_LAT = 12.62;
const MAX_LAT = 13.48;
const MIN_LNG = 77.18;
const MAX_LNG = 77.88;

function latLngToPercent(lat: number, lng: number) {
  const x = ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 100;
  const y = ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * 100;
  return {
    x: Math.min(92, Math.max(8, x)),
    y: Math.min(90, Math.max(10, y)),
  };
}

export const MapsTab: React.FC<MapsTabProps> = ({
  currentUser,
  listings,
  selectedListing,
  onSelectListing,
  onChatWithOwner,
  onCallOwner,
  onGeotagCreateAtCoords,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'topo'>('satellite');
  const [geotagDropMode, setGeotagDropMode] = useState(false);
  const [droppedPin, setDroppedPin] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const activeListing = selectedListing || listings[0] || null;
  const canCreateListing =
    currentUser.role === 'seller' || currentUser.role === 'broker';

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!geotagDropMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const lat = Number((MAX_LAT - ry * (MAX_LAT - MIN_LAT)).toFixed(4));
    const lng = Number((MIN_LNG + rx * (MAX_LNG - MIN_LNG)).toFixed(4));
    setDroppedPin({ lat, lng });
  };

  return (
    <div className="wa-maps-layout">
      {/* Left Interactive Geospatial Map Stage */}
      <div className="wa-map-stage-wrap">
        <div className="wa-map-topbar">
          <div className="wa-map-topbar-left">
            <Compass size={16} />
            <span>
              Interactive Land Parcel Geolocation Map ({listings.length} Geotagged
              Properties)
            </span>
          </div>

          <div className="wa-map-topbar-controls">
            <button
              type="button"
              className={`wa-map-mode-btn ${
                mapStyle === 'satellite' ? 'active' : ''
              }`}
              onClick={() => setMapStyle('satellite')}
            >
              Satellite Terrain
            </button>
            <button
              type="button"
              className={`wa-map-mode-btn ${
                mapStyle === 'topo' ? 'active' : ''
              }`}
              onClick={() => setMapStyle('topo')}
            >
              Survey Grid
            </button>

            {canCreateListing && (
              <button
                type="button"
                className={`wa-geotag-mode-btn ${
                  geotagDropMode ? 'active' : ''
                }`}
                onClick={() => {
                  setGeotagDropMode((prev) => !prev);
                  setDroppedPin(null);
                }}
                data-testid="toggle-geotag-drop-btn"
              >
                <Crosshair size={14} />
                <span>
                  {geotagDropMode
                    ? 'Click Map to Drop Pin...'
                    : 'Geotag New Plot'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Interactive Geospatial Canvas with Corridors, Contours & Clickable Price Pins */}
        <div
          className={`wa-interactive-map-canvas style-${mapStyle} ${
            geotagDropMode ? 'cursor-crosshair' : ''
          }`}
          onClick={handleMapClick}
          data-testid="interactive-map-canvas"
        >
          <div
            className="wa-map-zoom-layer"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Regional Highway Corridors & Landmarks SVG Layer */}
            <svg
              viewBox="0 0 1000 700"
              className="wa-map-corridor-svg"
              preserveAspectRatio="none"
            >
              {/* Topographic contour rings */}
              <ellipse
                cx="520"
                cy="350"
                rx="420"
                ry="260"
                fill="none"
                stroke="rgba(37, 211, 102, 0.16)"
                strokeDasharray="6 6"
              />
              <ellipse
                cx="520"
                cy="350"
                rx="280"
                ry="175"
                fill="none"
                stroke="rgba(37, 211, 102, 0.22)"
                strokeDasharray="4 4"
              />

              {/* NH-48, Airport Corridor, Kanakapura Road & Mysuru Expressway lines */}
              <path
                d="M 80 120 Q 320 260 510 350 T 920 580"
                fill="none"
                stroke="rgba(250, 204, 21, 0.45)"
                strokeWidth="3.5"
              />
              <path
                d="M 140 590 Q 410 430 510 350 T 830 110"
                fill="none"
                stroke="rgba(56, 189, 248, 0.42)"
                strokeWidth="3"
              />
              <path
                d="M 510 40 L 510 660"
                fill="none"
                stroke="rgba(255, 255, 255, 0.18)"
                strokeWidth="2"
                strokeDasharray="8 6"
              />

              {/* Regional Zone Labels */}
              <text x="640" y="95" fill="rgba(209,250,229,0.75)" fontSize="14" fontWeight="bold">
                NANDI FOOTHILLS & NORTH CORRIDOR
              </text>
              <text x="690" y="215" fill="rgba(209,250,229,0.75)" fontSize="13" fontWeight="bold">
                DEVANAHALLI AIRPORT ZONE
              </text>
              <text x="140" y="230" fill="rgba(254,240,138,0.8)" fontSize="13" fontWeight="bold">
                NH-48 COMMERCIAL BELT
              </text>
              <text x="480" y="345" fill="#ffffff" fontSize="15" fontWeight="bold">
                BENGALURU CENTRAL
              </text>
              <text x="360" y="590" fill="rgba(209,250,229,0.75)" fontSize="13" fontWeight="bold">
                KANAKAPURA AGRICULTURAL GREEN BELT
              </text>
              <text x="90" y="540" fill="rgba(186,230,253,0.8)" fontSize="13" fontWeight="bold">
                CAUVERY / MYSURU EXPRESSWAY
              </text>
            </svg>

            {/* Geotagged Property Price Markers */}
            {listings.map((item) => {
              const pos = latLngToPercent(item.latitude, item.longitude);
              const isSelected = activeListing?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className={`wa-map-pin ${isSelected ? 'selected' : ''} cat-${
                    item.category
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectListing(item);
                  }}
                  data-testid={`map-pin-${item.id}`}
                >
                  <div className="wa-pin-bubble">
                    <MapPin size={13} />
                    <span>{item.price_display}</span>
                  </div>
                  <div className="wa-pin-title-sub">
                    {item.title.slice(0, 24)}...
                  </div>
                </button>
              );
            })}

            {/* Newly Dropped Geotag Pin */}
            {droppedPin && (
              <div
                className="wa-dropped-geotag-pin"
                style={{
                  left: `${latLngToPercent(droppedPin.lat, droppedPin.lng).x}%`,
                  top: `${latLngToPercent(droppedPin.lat, droppedPin.lng).y}%`,
                }}
              >
                <div className="wa-dropped-card">
                  <span>
                    📍 New Geotag: {droppedPin.lat}°N, {droppedPin.lng}°E
                  </span>
                  <button
                    type="button"
                    className="wa-dropped-create-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGeotagCreateAtCoords(droppedPin.lat, droppedPin.lng);
                    }}
                    data-testid="create-from-dropped-pin-btn"
                  >
                    <PlusCircle size={13} />
                    <span>Create Listing Here</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Floating Zoom Controls */}
          <div className="wa-map-zoom-controls">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(1.6, Number((z + 0.2).toFixed(1))))}
              title="Zoom In"
            >
              <ZoomIn size={17} />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              title="Reset Zoom"
            >
              1x
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))))}
              title="Zoom Out"
            >
              <ZoomOut size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* Right Geospatial Property Inspector Drawer */}
      <aside className="wa-map-inspector">
        {activeListing ? (
          <div className="wa-inspector-card" data-testid="map-inspector-panel">
            <div className="wa-inspector-img-wrap">
              <img
                src={activeListing.image_urls[0]}
                alt={activeListing.title}
                className="wa-inspector-img"
              />
              <span className="wa-cat-tag">
                {activeListing.category.toUpperCase()}
              </span>
            </div>

            <div className="wa-inspector-body">
              <div className="wa-inspector-price-row">
                <h3>{activeListing.price_display}</h3>
                <span>{activeListing.area_display}</span>
              </div>

              <h4>{activeListing.title}</h4>

              <div className="wa-inspector-coords-box">
                <div>
                  <MapPin size={13} />
                  <span>{activeListing.location_name}</span>
                </div>
                <code>
                  GPS: {activeListing.latitude.toFixed(4)}° N,{' '}
                  {activeListing.longitude.toFixed(4)}° E
                </code>
              </div>

              {/* Embedded OpenStreetMap Live Tile View for the Selected Parcel */}
              <div className="wa-osm-embed-box">
                <iframe
                  title="OpenStreetMap Parcel View"
                  width="100%"
                  height="155"
                  style={{ border: 0, borderRadius: '8px' }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                    activeListing.longitude - 0.02
                  }%2C${activeListing.latitude - 0.015}%2C${
                    activeListing.longitude + 0.02
                  }%2C${
                    activeListing.latitude + 0.015
                  }&layer=mapnik&marker=${activeListing.latitude}%2C${
                    activeListing.longitude
                  }`}
                />
              </div>

              <p className="wa-inspector-desc">{activeListing.description}</p>

              <div className="wa-listing-features">
                {activeListing.features.map((f) => (
                  <span key={f} className="wa-feature-chip">
                    <CheckCircle2 size={11} />
                    <span>{f}</span>
                  </span>
                ))}
              </div>

              {/* Owner Details with Privacy Protection */}
              <div className="wa-listing-owner-box">
                <div className="wa-owner-left">
                  <div
                    className="wa-avatar-sm"
                    style={{
                      backgroundColor:
                        activeListing.owner.avatar_color || '#128C7E',
                    }}
                  >
                    {activeListing.owner.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div>
                    <div className="wa-peer-title">
                      <strong>{activeListing.owner.name}</strong>
                      <span
                        className={`wa-role-tag role-${activeListing.owner.role}`}
                      >
                        {activeListing.owner.role.toUpperCase()}
                      </span>
                    </div>
                    <span className="wa-owner-masked">
                      <ShieldCheck size={11} />
                      {activeListing.owner.masked_contact}
                    </span>
                  </div>
                </div>
              </div>

              {activeListing.owner_id !== currentUser.id && (
                <div className="wa-listing-cta-row">
                  <button
                    type="button"
                    className="wa-cta-btn chat"
                    onClick={() => onChatWithOwner(activeListing)}
                  >
                    <MessageSquare size={15} />
                    <span>Chat</span>
                  </button>
                  <button
                    type="button"
                    className="wa-cta-btn audio"
                    onClick={() => onCallOwner(activeListing, 'audio')}
                  >
                    <Phone size={15} />
                    <span>Audio Call</span>
                  </button>
                  <button
                    type="button"
                    className="wa-cta-btn video"
                    onClick={() => onCallOwner(activeListing, 'video')}
                  >
                    <Video size={15} />
                    <span>Video Call</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="wa-empty-list">
            Click any price pin on the map to inspect the property.
          </div>
        )}
      </aside>
    </div>
  );
};
