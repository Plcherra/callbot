"""Per-business communication: canonical phone row, SMS campaign, WhatsApp."""

from communication.ensure import (
    ensure_business_communication,
    ensure_communication_for_user_after_receptionist_change,
    get_business_by_owner,
    get_default_business_for_owner,
    list_businesses_for_owner,
    mirror_business_phone_to_receptionists,
    refresh_business_after_primary_receptionist_removed,
    resolve_business_for_communication,
    resolve_target_business_for_new_receptionist,
    upsert_canonical_business_phone,
)

__all__ = [
    "ensure_business_communication",
    "ensure_communication_for_user_after_receptionist_change",
    "get_business_by_owner",
    "get_default_business_for_owner",
    "list_businesses_for_owner",
    "mirror_business_phone_to_receptionists",
    "refresh_business_after_primary_receptionist_removed",
    "resolve_business_for_communication",
    "resolve_target_business_for_new_receptionist",
    "upsert_canonical_business_phone",
]
