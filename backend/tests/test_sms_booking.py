"""SMS booking: intent helpers and inbound flow (mocked)."""

from __future__ import annotations

import json

from telnyx import sms_booking as sb


def test_friendly_time_label_afternoon():
    label = sb._friendly_time_label("2026-04-15T15:30:00-04:00", "America/New_York")
    assert "3:30" in label and "PM" in label


def test_confirm_and_reject():
    assert sb._is_confirm_message("YES")
    assert sb._is_confirm_message("ok")
    assert not sb._is_confirm_message("yes tuesday at 3")
    assert sb._is_reject_message("no")
    assert sb._is_reject_message("NOPE")
    assert not sb._is_reject_message("nothing")


def test_sms_params_always_generic():
    p = sb._sms_params_base(date_text="tomorrow 2pm")
    assert p["generic_appointment_requested"] is True


def test_handle_incoming_message_duplicate_event_short_circuits(monkeypatch):
    seen = {"inserts": 0}

    class _Q:
        def select(self, *a, **k):
            return self

        def eq(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def insert(self, *a, **k):
            return self

        def execute(self):
            # duplicate event id -> row exists
            return type("R", (), {"data": [{"telnyx_event_id": "evt-1"}]})()

    class _SB:
        def table(self, name):
            return _Q()

    monkeypatch.setattr("telnyx.sms_booking.create_service_role_client", lambda: _SB())

    calls = []
    monkeypatch.setattr(
        "telnyx.sms_booking.load_scheduling_context_for_receptionist",
        lambda rid: calls.append(rid) or {"ok": False},
    )

    sb.handle_incoming_message(
        customer_phone="+15550001111",
        message_text="hi",
        receptionist_id="rec-ignored",
        business_did="+15550002222",
        telnyx_event_id="evt-dup",
    )
    assert calls == []


def test_webhook_message_received_dispatches(monkeypatch):
    envelope = {
        "data": {
            "id": "webhook-event-1",
            "event_type": "message.received",
            "payload": {
                "direction": "inbound",
                "text": "tomorrow 2pm",
                "from": {"phone_number": "+15551110000"},
                "to": [{"phone_number": "+15552220000"}],
            },
        }
    }
    raw = json.dumps(envelope).encode("utf-8")
    called = {}

    def fake_inbound(*, data):
        called["data"] = data

    monkeypatch.setattr("telnyx.sms_booking.handle_inbound_telnyx_message", fake_inbound)

    from telnyx.sms_webhook import handle_sms_webhook

    out = handle_sms_webhook(raw)
    assert out["received"] is True
    assert called["data"]["id"] == "webhook-event-1"
