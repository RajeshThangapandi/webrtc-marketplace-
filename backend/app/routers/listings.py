import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, LandListing
from ..schemas import (
    LandListingCreateSchema,
    LandListingUpdateSchema,
    LandListingSchema,
)
from ..auth import require_seller_or_broker
from ..ws_manager import ws_manager, serialize_listing

router = APIRouter(prefix="/api/listings", tags=["Community & Property Listings"])

DEFAULT_LAND_IMAGE = (
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80"
)


@router.get("", response_model=List[LandListingSchema])
def list_land_listings(
    category: Optional[str] = None,
    search: Optional[str] = None,
    owner_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Browse available land listings for the Community feed and Interactive Map."""
    query = db.query(LandListing)
    if category and category.lower() != "all":
        query = query.filter(LandListing.category == category.lower())
    if owner_id:
        query = query.filter(LandListing.owner_id == owner_id)
    if status_filter:
        query = query.filter(LandListing.status == status_filter.lower())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                LandListing.title.ilike(term),
                LandListing.description.ilike(term),
                LandListing.location_name.ilike(term),
                LandListing.category.ilike(term),
            )
        )
    listings = query.order_by(LandListing.created_at.desc()).all()
    return [serialize_listing(item) for item in listings]


@router.get("/{listing_id}", response_model=LandListingSchema)
def get_land_listing(listing_id: str, db: Session = Depends(get_db)):
    listing = db.query(LandListing).filter(LandListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Land listing not found")
    return serialize_listing(listing)


@router.post("", response_model=LandListingSchema, status_code=status.HTTP_201_CREATED)
async def create_land_listing(
    payload: LandListingCreateSchema,
    current_user: User = Depends(require_seller_or_broker),
    db: Session = Depends(get_db),
):
    """Create a new geotagged land listing. Strictly restricted to Seller and Broker roles."""
    now = datetime.now(timezone.utc)
    images = [u.strip() for u in payload.image_urls if u.strip()]
    if not images:
        images = [DEFAULT_LAND_IMAGE]

    listing = LandListing(
        id=f"prop-{uuid.uuid4().hex[:10]}",
        title=payload.title.strip(),
        description=payload.description.strip(),
        category=payload.category.lower().strip(),
        price_display=payload.price_display.strip(),
        price_numeric=payload.price_numeric,
        area_display=payload.area_display.strip(),
        location_name=payload.location_name.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        image_urls_json=json.dumps(images),
        features_json=json.dumps([f.strip() for f in payload.features if f.strip()]),
        status=payload.status.lower(),
        owner_id=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)

    serialized = serialize_listing(listing)
    await ws_manager.broadcast(
        {
            "type": "listing:created",
            "listing": serialized.model_dump(mode="json"),
        }
    )
    return serialized


@router.put("/{listing_id}", response_model=LandListingSchema)
async def update_land_listing(
    listing_id: str,
    payload: LandListingUpdateSchema,
    current_user: User = Depends(require_seller_or_broker),
    db: Session = Depends(get_db),
):
    """Edit an existing land listing. Restricted to the listing owner (or Broker/Seller)."""
    listing = db.query(LandListing).filter(LandListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Land listing not found")

    if listing.owner_id != current_user.id and current_user.role != "broker":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own property listings.",
        )

    if payload.title is not None:
        listing.title = payload.title.strip()
    if payload.description is not None:
        listing.description = payload.description.strip()
    if payload.category is not None:
        listing.category = payload.category.lower().strip()
    if payload.price_display is not None:
        listing.price_display = payload.price_display.strip()
    if payload.price_numeric is not None:
        listing.price_numeric = payload.price_numeric
    if payload.area_display is not None:
        listing.area_display = payload.area_display.strip()
    if payload.location_name is not None:
        listing.location_name = payload.location_name.strip()
    if payload.latitude is not None:
        listing.latitude = payload.latitude
    if payload.longitude is not None:
        listing.longitude = payload.longitude
    if payload.image_urls is not None:
        imgs = [u.strip() for u in payload.image_urls if u.strip()]
        listing.image_urls_json = json.dumps(imgs or [DEFAULT_LAND_IMAGE])
    if payload.features is not None:
        listing.features_json = json.dumps(
            [f.strip() for f in payload.features if f.strip()]
        )
    if payload.status is not None:
        listing.status = payload.status.lower()

    listing.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(listing)

    serialized = serialize_listing(listing)
    await ws_manager.broadcast(
        {
            "type": "listing:updated",
            "listing": serialized.model_dump(mode="json"),
        }
    )
    return serialized


@router.delete("/{listing_id}")
async def delete_land_listing(
    listing_id: str,
    current_user: User = Depends(require_seller_or_broker),
    db: Session = Depends(get_db),
):
    """Delete a land listing. Restricted to the listing owner (Seller/Broker)."""
    listing = db.query(LandListing).filter(LandListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Land listing not found")

    if listing.owner_id != current_user.id and current_user.role != "broker":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own property listings.",
        )

    db.delete(listing)
    db.commit()

    await ws_manager.broadcast(
        {
            "type": "listing:deleted",
            "listing_id": listing_id,
        }
    )
    return {"status": "deleted", "listing_id": listing_id}
