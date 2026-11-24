import os
import json
import hmac
import base64
import hashlib
import time
from typing import Optional, Dict, Any
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from .database import get_db
from .models import User

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "landconnect-jwt-secret-key-2026-secure")
TOKEN_EXPIRE_SECONDS = 60 * 60 * 24 * 7  # 7 days


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str) -> str:
    salt = b"landconnect_salt_v1"
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return _b64url_encode(dk)


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    if not stored_hash:
        return False
    expected = hash_password(password)
    return hmac.compare_digest(expected, stored_hash)


def create_access_token(user_id: str, role: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_EXPIRE_SECONDS,
    }
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    sig = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(sig)}"


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed JWT")
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = hmac.new(
            SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256
        ).digest()
        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError("Invalid token signature")
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if payload.get("exp", 0) < int(time.time()):
            raise ValueError("Token expired")
        return payload
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {exc}",
        ) from exc


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Resolve authenticated user from Bearer JWT token or active demo X-User-Id header."""
    user_id: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    elif x_user_id:
        user_id = x_user_id.strip()

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide Bearer token or X-User-Id.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user profile not found.",
        )
    return user


def require_seller_or_broker(current_user: User = Depends(get_current_user)) -> User:
    """Enforce Role-Based Access Control: Only Sellers and Brokers can create/edit/delete listings."""
    if current_user.role not in ("seller", "broker"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Role permission denied: Only Sellers and Brokers can create or manage land listings.",
        )
    return current_user
