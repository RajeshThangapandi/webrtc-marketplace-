import json
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session
from .models import (
    User,
    LandListing,
    Conversation,
    MeetingRoom,
    MeetingRoomMember,
    Message,
    CallLog,
)
from .auth import hash_password


def _ensure_sqlite_columns(db: Session):
    """Ensure new columns exist if upgrading from Phase 2.1 SQLite database."""
    for col_stmt in [
        "ALTER TABLE users ADD COLUMN allow_direct_calls BOOLEAN DEFAULT 1",
        "ALTER TABLE users ADD COLUMN hide_contact_details BOOLEAN DEFAULT 1",
        "ALTER TABLE messages ADD COLUMN is_read BOOLEAN DEFAULT 0",
    ]:
        try:
            db.execute(text(col_stmt))
            db.commit()
        except Exception:
            db.rollback()


def seed_initial_data(db: Session):
    """Idempotently seed demo users (Buyer, Seller, Broker), land listings, 1:1 chats, meeting rooms, and call logs."""
    _ensure_sqlite_columns(db)
    now = datetime.now(timezone.utc)
    default_pw_hash = hash_password("landconnect123")

    if db.query(User).count() == 0:
        users = [
            User(
                id="user-buyer-1",
                name="Rajesh T",
                role="buyer",
                in_app_handle="@rajesh.buyer",
                avatar_color="#075E54",
                bio="Looking for verified agricultural & residential land parcels.",
                private_phone="+919876543210",
                private_email="buyer@landconnect.si",
                password_hash=default_pw_hash,
                is_verified=True,
                allow_direct_calls=True,
                hide_contact_details=True,
            ),
            User(
                id="user-seller-1",
                name="Anita Sharma",
                role="seller",
                in_app_handle="@anita.seller",
                avatar_color="#128C7E",
                bio="Direct landowner • Green Valley & Sunrise Hills estates.",
                private_phone="+919812345678",
                private_email="seller@landconnect.si",
                password_hash=default_pw_hash,
                is_verified=True,
                allow_direct_calls=True,
                hide_contact_details=True,
            ),
            User(
                id="user-broker-1",
                name="Vikram Patel",
                role="broker",
                in_app_handle="@vikram.broker",
                avatar_color="#25D366",
                bio="RERA Certified Land Broker • Highway & Commercial Plots.",
                private_phone="+919900112233",
                private_email="broker@landconnect.si",
                password_hash=default_pw_hash,
                is_verified=True,
                allow_direct_calls=True,
                hide_contact_details=True,
            ),
            User(
                id="user-buyer-2",
                name="Meera Nair",
                role="buyer",
                in_app_handle="@meera.investor",
                avatar_color="#008069",
                bio="Commercial land investor • South & West regions.",
                private_phone="+919744556677",
                private_email="meera@landconnect.si",
                password_hash=default_pw_hash,
                is_verified=True,
                allow_direct_calls=True,
                hide_contact_details=True,
            ),
        ]
        db.add_all(users)
        db.flush()

        # 2. Pre-Seeded 1:1 Conversations
        conv1 = Conversation(
            id="conv-buyer-seller-1",
            participant_1_id="user-buyer-1",
            participant_2_id="user-seller-1",
            property_id="prop-green-valley-01",
            property_title="Green Valley 5-Acre Agricultural Land",
            property_price="₹45,00,000",
            property_location="Kanakapura Road, Bengaluru",
            created_at=now - timedelta(hours=3),
            updated_at=now - timedelta(minutes=25),
        )
        conv2 = Conversation(
            id="conv-buyer-broker-1",
            participant_1_id="user-buyer-1",
            participant_2_id="user-broker-1",
            property_id="prop-highway-corner-02",
            property_title="NH-48 Highway Commercial Corner Plot",
            property_price="₹1,20,00,000",
            property_location="Nelamangala Junction, NH-48",
            created_at=now - timedelta(hours=5),
            updated_at=now - timedelta(minutes=10),
        )
        conv3 = Conversation(
            id="conv-seller-broker-1",
            participant_1_id="user-seller-1",
            participant_2_id="user-broker-1",
            property_id="prop-sunrise-orchard-03",
            property_title="Sunrise Hills 2.5-Acre Orchard Plot",
            property_price="₹68,00,000",
            property_location="Nandi Foothills, Chikkaballapur",
            created_at=now - timedelta(hours=6),
            updated_at=now - timedelta(minutes=45),
        )
        db.add_all([conv1, conv2, conv3])
        db.flush()

        messages = [
            Message(
                id="msg-101",
                conversation_id="conv-buyer-seller-1",
                sender_id="user-buyer-1",
                content="Hi Anita! I saw your Green Valley 5-Acre listing on LandConnect. Does it have road access and borewell water?",
                message_type="text",
                created_at=now - timedelta(hours=2, minutes=40),
            ),
            Message(
                id="msg-102",
                conversation_id="conv-buyer-seller-1",
                sender_id="user-seller-1",
                content="Hello Rajesh! Yes, it has a 30ft tar road frontage and two active borewells. Feel free to start an in-app video call anytime to see the boundary documents.",
                message_type="text",
                created_at=now - timedelta(minutes=25),
            ),
            Message(
                id="msg-201",
                conversation_id="conv-buyer-broker-1",
                sender_id="user-broker-1",
                content="Hi Rajesh, I have shared the zoning certificate for the NH-48 commercial corner plot in our Deal Meeting Room.",
                message_type="text",
                created_at=now - timedelta(hours=1, minutes=15),
            ),
            Message(
                id="msg-202",
                conversation_id="conv-buyer-broker-1",
                sender_id="user-buyer-1",
                content="Thanks Vikram! Let's hop on a quick LandConnect audio or video call to finalize the site visit timing.",
                message_type="text",
                created_at=now - timedelta(minutes=10),
            ),
            Message(
                id="msg-301",
                conversation_id="conv-seller-broker-1",
                sender_id="user-seller-1",
                content="Vikram, can we invite Rajesh to the Green Valley Meeting Room so all three of us can discuss the title deed?",
                message_type="text",
                created_at=now - timedelta(minutes=45),
            ),
        ]
        db.add_all(messages)

        # 3. Pre-Seeded Multi-Party Meeting Rooms
        room1 = MeetingRoom(
            id="room-green-valley-deal",
            name="Green Valley 5-Acre Deal Room",
            description="Tri-party closing room for Buyer (Rajesh), Seller (Anita), and Broker (Vikram).",
            property_title="Green Valley 5-Acre Agricultural Land • ₹45,00,000",
            property_location="Kanakapura Road, Bengaluru",
            created_by_id="user-broker-1",
            is_active=True,
            created_at=now - timedelta(hours=2),
        )
        room2 = MeetingRoom(
            id="room-nh48-inspection",
            name="NH-48 Commercial Plot Virtual Inspection",
            description="Live site boundary Q&A and valuation room with Broker & Buyers.",
            property_title="NH-48 Highway Commercial Corner Plot • ₹1,20,00,000",
            property_location="Nelamangala Junction, NH-48",
            created_by_id="user-broker-1",
            is_active=True,
            created_at=now - timedelta(hours=4),
        )
        db.add_all([room1, room2])
        db.flush()

        room_members = [
            MeetingRoomMember(room_id="room-green-valley-deal", user_id="user-buyer-1"),
            MeetingRoomMember(room_id="room-green-valley-deal", user_id="user-seller-1"),
            MeetingRoomMember(room_id="room-green-valley-deal", user_id="user-broker-1"),
            MeetingRoomMember(room_id="room-nh48-inspection", user_id="user-buyer-1"),
            MeetingRoomMember(room_id="room-nh48-inspection", user_id="user-buyer-2"),
            MeetingRoomMember(room_id="room-nh48-inspection", user_id="user-broker-1"),
        ]
        db.add_all(room_members)

        room_messages = [
            Message(
                id="rmsg-1",
                room_id="room-green-valley-deal",
                sender_id="user-broker-1",
                content="Welcome everyone to the Green Valley Deal Room. All communications here are end-to-end privacy protected without sharing personal phone numbers.",
                message_type="system",
                created_at=now - timedelta(hours=1, minutes=50),
            ),
            Message(
                id="rmsg-2",
                room_id="room-green-valley-deal",
                sender_id="user-seller-1",
                content="I'm ready for the virtual boundary walkthrough whenever both of you join the room call.",
                message_type="text",
                created_at=now - timedelta(minutes=30),
            ),
            Message(
                id="rmsg-3",
                room_id="room-nh48-inspection",
                sender_id="user-broker-1",
                content="Drone boundary map and FSI details uploaded. Click 'Start Room Video Call' for live Q&A.",
                message_type="text",
                created_at=now - timedelta(minutes=50),
            ),
        ]
        db.add_all(room_messages)

        # 4. Pre-Seeded Call History Logs
        call_logs = [
            CallLog(
                id="call-seed-1",
                caller_id="user-buyer-1",
                callee_id="user-seller-1",
                call_type="video",
                status="COMPLETED",
                property_title="Green Valley 5-Acre Agricultural Land",
                duration_seconds=184,
                started_at=now - timedelta(hours=2),
                answered_at=now - timedelta(hours=2) + timedelta(seconds=4),
                ended_at=now - timedelta(hours=2) + timedelta(seconds=188),
            ),
            CallLog(
                id="call-seed-2",
                caller_id="user-broker-1",
                callee_id="user-buyer-1",
                call_type="audio",
                status="COMPLETED",
                property_title="NH-48 Highway Commercial Corner Plot",
                duration_seconds=95,
                started_at=now - timedelta(hours=1),
                answered_at=now - timedelta(hours=1) + timedelta(seconds=3),
                ended_at=now - timedelta(hours=1) + timedelta(seconds=98),
            ),
            CallLog(
                id="call-seed-3",
                caller_id="user-buyer-2",
                callee_id="user-broker-1",
                call_type="audio",
                status="REJECTED",
                property_title="NH-48 Highway Commercial Corner Plot",
                duration_seconds=0,
                started_at=now - timedelta(minutes=35),
                ended_at=now - timedelta(minutes=35) + timedelta(seconds=6),
            ),
        ]
        db.add_all(call_logs)
        db.commit()
    else:
        # Ensure existing users have password_hash set
        for u in db.query(User).all():
            if not u.password_hash:
                u.password_hash = default_pw_hash
        db.commit()

    # 5. Pre-Seed Community Land Listings with Geolocation & Images (Req 2, 3, 4)
    if db.query(LandListing).count() == 0:
        listings = [
            LandListing(
                id="prop-green-valley-01",
                title="Green Valley 5-Acre Agricultural Land",
                description="Fertile red-soil agricultural estate with 30ft tar road frontage, 2 active borewells, solar pump room, and complete boundary fencing. Clear single-owner title deed ready for immediate registration.",
                category="agricultural",
                price_display="₹45,00,000",
                price_numeric=4500000,
                area_display="5.0 Acres (2,17,800 Sq.Ft)",
                location_name="Kanakapura Road, South Bengaluru",
                latitude=12.7485,
                longitude=77.4892,
                image_urls_json=json.dumps(
                    [
                        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80",
                        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=80",
                    ]
                ),
                features_json=json.dumps(
                    [
                        "30ft Tar Road Access",
                        "2 Active Borewells",
                        "Clear Title Deed",
                        "Fenced Boundary",
                    ]
                ),
                status="available",
                owner_id="user-seller-1",
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(hours=3),
            ),
            LandListing(
                id="prop-highway-corner-02",
                title="NH-48 Highway Commercial Corner Plot",
                description="Prime commercial conversion plot at Nelamangala Junction with 180ft highway frontage on NH-48. Ideal for logistics warehouse, EV charging plaza, showroom, or retail complex.",
                category="commercial",
                price_display="₹1,20,00,000",
                price_numeric=12000000,
                area_display="18,500 Sq.Ft (Corner Plot)",
                location_name="Nelamangala Junction, NH-48 Corridor",
                latitude=13.0998,
                longitude=77.3935,
                image_urls_json=json.dumps(
                    [
                        "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1000&q=80",
                    ]
                ),
                features_json=json.dumps(
                    [
                        "NH-48 Highway Frontage",
                        "Commercial Zoning (DC Converted)",
                        "3-Phase HT Power Line",
                        "RERA Verified Broker",
                    ]
                ),
                status="available",
                owner_id="user-broker-1",
                created_at=now - timedelta(days=1, hours=12),
                updated_at=now - timedelta(hours=2),
            ),
            LandListing(
                id="prop-sunrise-orchard-03",
                title="Sunrise Hills 2.5-Acre Mango & Avocado Orchard",
                description="Scenic hillside organic orchard at Nandi Foothills featuring 140 mature Alphonso mango trees, drip irrigation network, weekend farmhouse foundation, and panoramic hill views.",
                category="orchard",
                price_display="₹68,00,000",
                price_numeric=6800000,
                area_display="2.5 Acres (1,08,900 Sq.Ft)",
                location_name="Nandi Foothills, Chikkaballapur",
                latitude=13.3702,
                longitude=77.6835,
                image_urls_json=json.dumps(
                    [
                        "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1000&q=80",
                    ]
                ),
                features_json=json.dumps(
                    [
                        "Drip Irrigation Installed",
                        "Panoramic Nandi Hill View",
                        "140 Mature Fruit Trees",
                        "Farmhouse Permit Ready",
                    ]
                ),
                status="available",
                owner_id="user-seller-1",
                created_at=now - timedelta(days=1, hours=4),
                updated_at=now - timedelta(hours=1),
            ),
            LandListing(
                id="prop-devanahalli-res-04",
                title="Airport Corridor Gated Residential Villa Plot",
                description="BIAAPA-approved east-facing residential plot just 12 minutes from Kempegowda International Airport. Underground electricity, landscaped 40ft avenue roads, and clubhouse access.",
                category="residential",
                price_display="₹82,00,000",
                price_numeric=8200000,
                area_display="4,000 Sq.Ft (50x80 East Facing)",
                location_name="Devanahalli Airport Corridor, North Bengaluru",
                latitude=13.2251,
                longitude=77.7104,
                image_urls_json=json.dumps(
                    [
                        "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1000&q=80",
                    ]
                ),
                features_json=json.dumps(
                    [
                        "BIAAPA A-Khata Approved",
                        "40ft Blacktop Road",
                        "12 Mins to Airport",
                        "Bank Loan Approved",
                    ]
                ),
                status="available",
                owner_id="user-broker-1",
                created_at=now - timedelta(hours=20),
                updated_at=now - timedelta(minutes=50),
            ),
            LandListing(
                id="prop-kaveri-riverview-05",
                title="Cauvery Valley 4-Acre Eco-Resort & Farm Parcel",
                description="Lush green river-belt land ideal for eco-stay, organic farming, or wellness retreat. Rich groundwater table, coconut grove perimeter, and direct village road connectivity.",
                category="agricultural",
                price_display="₹56,00,000",
                price_numeric=5600000,
                area_display="4.0 Acres",
                location_name="Ramanagara - Mysuru Expressway Belt",
                latitude=12.7153,
                longitude=77.2819,
                image_urls_json=json.dumps(
                    [
                        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=80",
                    ]
                ),
                features_json=json.dumps(
                    [
                        "Coconut Grove Perimeter",
                        "Rich Water Table",
                        "2km from Expressway",
                        "Zero Encumbrance",
                    ]
                ),
                status="available",
                owner_id="user-seller-1",
                created_at=now - timedelta(hours=14),
                updated_at=now - timedelta(minutes=30),
            ),
            LandListing(
                id="prop-hosur-ind-06",
                title="Electronic City Phase-3 Industrial & Warehousing Land",
                description="KIADB-adjacent industrial zone plot with 60ft heavy-vehicle approach road, drainage, and high-tension power availability. Suitable for manufacturing unit or cold storage.",
                category="industrial",
                price_display="₹1,45,00,000",
                price_numeric=14500000,
                area_display="25,000 Sq.Ft",
                location_name="Attibele - Electronic City Corridor",
                latitude=12.7784,
                longitude=77.7689,
                image_urls_json=json.dumps(
                    [
                        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1000&q=80",
                    ]
                ),
                features_json=json.dumps(
                    [
                        "60ft Container Truck Road",
                        "Industrial Conversion",
                        "HT Power Sub-Station Nearby",
                        "Immediate Possession",
                    ]
                ),
                status="available",
                owner_id="user-broker-1",
                created_at=now - timedelta(hours=8),
                updated_at=now - timedelta(minutes=15),
            ),
        ]
        db.add_all(listings)
        db.commit()
