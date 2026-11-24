from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from .database import Base, engine, SessionLocal
from .seed import seed_initial_data
from .ws_manager import ws_manager
from .routers import auth, users, listings, messaging, calls, ws

FIELD_LABELS = {
    "title": "Property Title",
    "description": "Property Description",
    "category": "Land Category",
    "price_display": "Formatted Price",
    "price_numeric": "Numeric Price",
    "area_display": "Total Land Area",
    "location_name": "Location / Address",
    "latitude": "Latitude",
    "longitude": "Longitude",
    "name": "Full Name",
    "email": "Email Address",
    "phone": "Phone Number",
    "password": "Password",
    "role": "User Role",
    "content": "Message Content",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="LandConnect Real-Time Signaling & Marketplace API",
    description="WhatsApp-inspired Land Marketplace Backend with Role-Based Auth, Land Listings, Maps/Geolocation, WebRTC Audio/Video Calling, 1:1 Messaging, Meeting Rooms, and Privacy Controls.",
    version="2.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def normalize_api_json_and_cache_headers(request: Request, call_next):
    """
    1. If a browser tab sends JSON to /api/* with text/plain or missing Content-Type,
       normalize the header to application/json so FastAPI parses the JSON body cleanly.
    2. Prevent stale browser caching of index.html.
    """
    if request.url.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH"):
        ct = (request.headers.get("content-type") or "").lower()
        if not ct or "text/plain" in ct:
            new_headers = [
                (k, v)
                for k, v in request.scope.get("headers", [])
                if k.lower() != b"content-type"
            ]
            new_headers.append((b"content-type", b"application/json"))
            request.scope["headers"] = new_headers
            if hasattr(request, "_headers"):
                delattr(request, "_headers")

    response = await call_next(request)
    if request.url.path in ("/", "/index.html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Format Pydantic 422 validation errors into a human-friendly message string."""
    friendly_messages = []
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", []) if part != "body"]
        field_key = loc[-1] if loc else "input"
        label = FIELD_LABELS.get(field_key, field_key.replace("_", " ").title())
        msg = err.get("msg", "Invalid value")
        friendly_messages.append(f"{label}: {msg}")

    summary = (
        "Please check your input — " + "; ".join(friendly_messages)
        if friendly_messages
        else "Please check the form fields and ensure all required information is filled in."
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": summary,
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Ensure unexpected server errors always return a clean JSON message."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": f"Server error while processing your request: {str(exc)}"
        },
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(listings.router)
app.include_router(messaging.router)
app.include_router(calls.router)
app.include_router(ws.router)


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "LandConnect Full Marketplace & Real-Time Signaling Engine",
        "online_users": ws_manager.get_online_users(),
        "active_calls_count": len(ws_manager.active_calls),
    }


MOBILE_DIST_DIR = Path(__file__).resolve().parents[2] / "mobile" / "dist"
if MOBILE_DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(MOBILE_DIST_DIR), html=True), name="mobile_ui")
else:
    @app.get("/")
    def root_fallback():
        return {
            "service": "LandConnect Marketplace & WebRTC Signaling API",
            "docs": "/docs",
            "health": "/api/health",
        }
