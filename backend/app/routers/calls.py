from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CallLog
from ..schemas import CallLogSchema
from ..ws_manager import ws_manager, serialize_call_log

router = APIRouter(prefix="/api/calls", tags=["In-App Audio & Video Calls"])


@router.get("", response_model=List[CallLogSchema])
def list_call_logs(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Return call history logs (completed, ongoing, rejected, missed)."""
    query = db.query(CallLog)
    if user_id:
        query = query.filter(
            or_(CallLog.caller_id == user_id, CallLog.callee_id == user_id)
        )
    logs = query.order_by(CallLog.started_at.desc()).limit(50).all()
    return [serialize_call_log(c) for c in logs]


@router.get("/active")
def get_active_calls() -> Dict[str, Any]:
    """Inspect active 1:1 calls and meeting room live calls."""
    return {
        "active_1on1_calls": list(ws_manager.active_calls.values()),
        "active_room_calls": {
            room_id: list(participants)
            for room_id, participants in ws_manager.room_call_participants.items()
            if participants
        },
    }
