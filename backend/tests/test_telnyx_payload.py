"""Tests for Telnyx payload parsing (direction, our_did, caller_number)."""

from __future__ import annotations

import pytest

from telnyx.payload_utils import (
    extract_call_party_numbers,
    parse_telnyx_direction,
)


def test_parse_telnyx_direction_incoming():
    """Telnyx sends 'incoming' -> we parse as inbound."""
    assert parse_telnyx_direction("incoming") == "inbound"
    assert parse_telnyx_direction("INCOMING") == "inbound"


def test_parse_telnyx_direction_outgoing():
    """Telnyx sends 'outgoing' -> we parse as outbound."""
    assert parse_telnyx_direction("outgoing") == "outbound"
    assert parse_telnyx_direction("OUTGOING") == "outbound"


def test_parse_telnyx_direction_inbound_outbound():
    """Support inbound/outbound if Telnyx ever sends them."""
    assert parse_telnyx_direction("inbound") == "inbound"
    assert parse_telnyx_direction("outbound") == "outbound"


def test_extract_call_party_numbers_inbound():
    """Inbound: to=our DID (business), from=caller (customer)."""
    payload = {
        "from": "+16176537747",
        "to": "+16176137764",
        "direction": "incoming",
    }
    out = extract_call_party_numbers(payload)
    assert out["direction"] == "inbound"
    assert out["our_did"] == "+16176137764"
    assert out["caller_number"] == "+16176537747"
    assert out["from_number"] == "+16176537747"
    assert out["to_number"] == "+16176137764"
    assert out["raw_direction"] == "incoming"


def test_extract_call_party_numbers_outbound():
    """Outbound: from=our DID, to=callee."""
    payload = {
        "from": "+16176137764",
        "to": "+16176537747",
        "direction": "outgoing",
    }
    out = extract_call_party_numbers(payload)
    assert out["direction"] == "outbound"
    assert out["our_did"] == "+16176137764"
    assert out["caller_number"] == "+16176537747"
    assert out["from_number"] == "+16176137764"
    assert out["to_number"] == "+16176537747"


def test_extract_call_party_numbers_empty_direction_defaults_inbound():
    """Empty direction defaults to inbound."""
    payload = {"from": "+15551234567", "to": "+15559876543", "direction": ""}
    out = extract_call_party_numbers(payload)
    assert out["direction"] == "inbound"
    assert out["our_did"] == "+15559876543"
    assert out["caller_number"] == "+15551234567"
