import uuid
from fastapi.testclient import TestClient
from app.main import app


def test_auth_register_login_and_me():
    with TestClient(app) as client:
        unique_email = f"broker.{uuid.uuid4().hex[:6]}@landconnect.si"
        reg_res = client.post(
            "/api/auth/register",
            json={
                "name": "Suresh Gowda",
                "email": unique_email,
                "phone": "+919845012345",
                "password": "securepassword",
                "role": "broker",
                "bio": "North Bengaluru Commercial & Industrial Land Specialist",
            },
        )
        assert reg_res.status_code == 201
        data = reg_res.json()
        assert "access_token" in data
        assert data["user"]["role"] == "broker"
        assert data["user"]["can_manage_listings"] is True
        assert "private_phone" not in data["user"]
        assert "Hidden" in data["user"]["masked_contact"]

        token = data["access_token"]
        me_res = client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me_res.status_code == 200
        assert me_res.json()["id"] == data["user"]["id"]

        # Test Login with seeded demo account
        login_res = client.post(
            "/api/auth/login",
            json={
                "email_or_handle": "seller@landconnect.si",
                "password": "landconnect123",
            },
        )
        assert login_res.status_code == 200
        assert login_res.json()["user"]["id"] == "user-seller-1"


def test_community_listings_and_geolocation():
    with TestClient(app) as client:
        res = client.get("/api/listings")
        assert res.status_code == 200
        listings = res.json()
        assert len(listings) >= 6

        first = listings[0]
        assert "latitude" in first and "longitude" in first
        assert isinstance(first["image_urls"], list) and len(first["image_urls"]) >= 1
        assert "private_phone" not in first["owner"]

        # Category filter
        comm_res = client.get("/api/listings?category=commercial")
        assert comm_res.status_code == 200
        assert all(item["category"] == "commercial" for item in comm_res.json())

        # Keyword search filter
        search_res = client.get("/api/listings?search=Orchard")
        assert search_res.status_code == 200
        assert len(search_res.json()) >= 1


def test_rbac_buyer_cannot_create_listing_but_seller_and_broker_can():
    with TestClient(app) as client:
        sample_payload = {
            "title": "Sarjapur 3-Acre Villa Development Land",
            "description": "Prime residential zone land with 40ft road access and clear title.",
            "category": "residential",
            "price_display": "₹95,00,000",
            "price_numeric": 9500000,
            "area_display": "3.0 Acres",
            "location_name": "Sarjapur Road, East Bengaluru",
            "latitude": 12.8615,
            "longitude": 77.7854,
            "image_urls": [
                "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80"
            ],
            "features": ["40ft Road", "Clear Title", "East Facing"],
        }

        # 1. Buyer attempt MUST be rejected with 403 Forbidden
        buyer_res = client.post(
            "/api/listings",
            json=sample_payload,
            headers={"X-User-Id": "user-buyer-1"},
        )
        assert buyer_res.status_code == 403
        assert "Only Sellers and Brokers" in buyer_res.json()["detail"]

        # 2. Seller attempt MUST succeed with 201 Created
        seller_res = client.post(
            "/api/listings",
            json=sample_payload,
            headers={"X-User-Id": "user-seller-1"},
        )
        assert seller_res.status_code == 201
        created = seller_res.json()
        listing_id = created["id"]
        assert created["owner_id"] == "user-seller-1"
        assert created["latitude"] == 12.8615

        # 3. Buyer attempt to edit MUST be rejected with 403 Forbidden
        buyer_edit = client.put(
            f"/api/listings/{listing_id}",
            json={"price_display": "₹90,00,000"},
            headers={"X-User-Id": "user-buyer-1"},
        )
        assert buyer_edit.status_code == 403

        # 4. Seller owner edit MUST succeed
        seller_edit = client.put(
            f"/api/listings/{listing_id}",
            json={"price_display": "₹92,00,000", "status": "under_offer"},
            headers={"X-User-Id": "user-seller-1"},
        )
        assert seller_edit.status_code == 200
        assert seller_edit.json()["price_display"] == "₹92,00,000"
        assert seller_edit.json()["status"] == "under_offer"

        # 5. Seller owner delete MUST succeed
        seller_del = client.delete(
            f"/api/listings/{listing_id}",
            headers={"X-User-Id": "user-seller-1"},
        )
        assert seller_del.status_code == 200

        # 6. Validation errors (422) MUST return a human-friendly string in "detail"
        bad_res = client.post(
            "/api/listings",
            json={"title": "A"},
            headers={"X-User-Id": "user-broker-1"},
        )
        assert bad_res.status_code == 422
        assert isinstance(bad_res.json()["detail"], str)
        assert "Please check your input" in bad_res.json()["detail"]

        # 7. Even if a browser sends text/plain Content-Type with JSON body, middleware normalizes it and succeeds (201)
        import json as _json
        text_plain_res = client.post(
            "/api/listings",
            content=_json.dumps(sample_payload),
            headers={"X-User-Id": "user-broker-1", "Content-Type": "text/plain;charset=UTF-8"},
        )
        assert text_plain_res.status_code == 201
        client.delete(
            f"/api/listings/{text_plain_res.json()['id']}",
            headers={"X-User-Id": "user-broker-1"},
        )
