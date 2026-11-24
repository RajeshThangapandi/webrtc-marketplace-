import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..schemas import (
    AuthRegisterSchema,
    AuthLoginSchema,
    AuthResponseSchema,
    PrivacyUpdateSchema,
    UserPublicSchema,
)
from ..auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from ..ws_manager import serialize_user

router = APIRouter(prefix="/api/auth", tags=["Authentication & Role Access Control"])

ROLE_COLORS = {
    "buyer": "#075E54",
    "seller": "#128C7E",
    "broker": "#25D366",
}


@router.post("/register", response_model=AuthResponseSchema, status_code=status.HTTP_201_CREATED)
def register_user(payload: AuthRegisterSchema, db: Session = Depends(get_db)):
    """Register a new Buyer, Seller, or Broker account with JWT authentication."""
    email_clean = payload.email.strip().lower()
    existing_email = db.query(User).filter(User.private_email == email_clean).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email is already registered.",
        )

    slug = re.sub(r"[^a-z0-9]+", "", payload.name.lower())[:12] or "user"
    role_clean = payload.role.lower()
    handle = f"@{slug}.{role_clean}.{uuid.uuid4().hex[:4]}"

    user = User(
        id=f"user-{role_clean}-{uuid.uuid4().hex[:8]}",
        name=payload.name.strip(),
        role=role_clean,
        in_app_handle=handle,
        avatar_color=ROLE_COLORS.get(role_clean, "#128C7E"),
        bio=payload.bio.strip() or f"Verified LandConnect {role_clean.capitalize()}",
        private_phone=payload.phone.strip(),
        private_email=email_clean,
        password_hash=hash_password(payload.password),
        is_verified=True,
        allow_direct_calls=True,
        hide_contact_details=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.role)
    return AuthResponseSchema(
        access_token=token,
        user=serialize_user(user),
    )


@router.post("/login", response_model=AuthResponseSchema)
def login_user(payload: AuthLoginSchema, db: Session = Depends(get_db)):
    """Authenticate a user by email or in-app handle and password."""
    identifier = payload.email_or_handle.strip().lower()
    user = (
        db.query(User)
        .filter(
            or_(
                User.private_email == identifier,
                User.in_app_handle == identifier,
                User.id == payload.email_or_handle.strip(),
            )
        )
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/handle or password.",
        )

    # Support seeded password or fallback demo password "landconnect123"
    if user.password_hash:
        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/handle or password.",
            )
    elif payload.password != "landconnect123":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/handle or password.",
        )

    token = create_access_token(user.id, user.role)
    return AuthResponseSchema(
        access_token=token,
        user=serialize_user(user),
    )


@router.get("/me", response_model=UserPublicSchema)
def get_authenticated_profile(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user profile and RBAC capabilities."""
    return serialize_user(current_user)


@router.patch("/privacy", response_model=UserPublicSchema)
def update_privacy_settings(
    payload: PrivacyUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update privacy and in-app communication preferences."""
    if payload.allow_direct_calls is not None:
        current_user.allow_direct_calls = payload.allow_direct_calls
    if payload.hide_contact_details is not None:
        current_user.hide_contact_details = payload.hide_contact_details
    if payload.bio is not None:
        current_user.bio = payload.bio.strip()
    db.commit()
    db.refresh(current_user)
    return serialize_user(current_user)
