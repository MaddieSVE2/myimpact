---
name: Annual total bucketing across pages
description: The one rule for which calendar year an impact record's value belongs to, and who must agree on it
---
A record's annual bucket is its server-persisted entry date, clamped into the record's stored report period — the server preserves the stored period on edits and ignores wizard defaults. Every surface showing an annual total (Results hero, History year card) must derive its year and figure from that server bucketing (the reconciled recap total), never from a client-side sum or mutable wizard state.

**Why:** cross-year periods (academic Sep–Aug) otherwise show different years/figures on Results vs History; a completed edit clears the edit id, so post-save renders must anchor on the entry date the save response returned.

**How to apply:** any edit flow must carry the record's stored report period into the wizard; after saves, invalidate recap caches for ALL years (an edit can move value between years). Org matched funding is a History-only addition on top of the shared reconciled base (product decision).
