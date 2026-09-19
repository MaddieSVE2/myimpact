---
name: Attachment cleanup safety
description: Why user-uploaded attachment cleanup must be driven by explicit pending-upload reservations.
---

Never delete attachment objects by comparing the whole App Storage bucket with a database snapshot. Cleanup may delete only objects tied to expired pending-upload reservations, after confirming the storage key is not registered as an attachment.

**Why:** API startup and republishing can briefly expose database and storage views that are not aligned. A bucket-wide “not present in this snapshot” sweep can permanently delete valid activity, journal, or evidence photos while leaving their database rows behind.

**How to apply:** Keep registered attachment keys permanently outside automatic orphan cleanup. Give expired reservations a grace period for near-deadline registration, and use explicit user deletion flows for registered files.