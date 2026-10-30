---
name: Home location fields
description: user_profiles.postcode is always a lookup key; a picked town is stored as its nearest postcode plus location_name
---
`user_profiles.postcode` is what every nearby lookup runs on (local charities, GoVo, Volunteer Scotland). `location_name` holds the town or outward code the person chose. Someone who picked a town has that town's nearest postcode in `postcode`, which isn't where they live: show `location_name` first.

**Why:** GoVo only localises on full postcodes (town names return a 500, outward codes a generic page), and postcodes.io /places reports a different local authority and region spelling from a real postcode. The nearest postcode fixes both, so activity locations take their area from it too.

**How to apply:** use `HomeLocationField` for "where do you live" inputs, and call its `settle()` before saving; an empty `fields` means leave the stored value alone. Older profiles can still hold a typed town in `postcode`: treat those as no location (`isPostcodeLike`), never send them to a lookup. postcodes.io /places has no Northern Ireland, so those members need a postcode. Managers see the general area only (`memberArea`), never the postcode.
