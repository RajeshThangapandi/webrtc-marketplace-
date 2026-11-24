from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..schemas import UserPublicSchema
from ..ws_manager import serialize_user

router = APIRouter(prefix="/api/users", tags=["Users & Roles"])


@router.get("", response_model=List[UserPublicSchema])
def list_users(role: Optional[str] = None, db: Session = Depends(get_db)):
    """List all users with privacy-masked contact details and live online/in-call presence."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role.lower())
    users = query.order_by(User.created_at).all()
    return [serialize_user(u) for u in users]


@router.get("/{user_id}", response_model=UserPublicSchema)
def get_user(user_id: str, db: Session = Depends(get_db)):
    """Get a single user's public profile (personal phone/email strictly masked)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_user(user)
