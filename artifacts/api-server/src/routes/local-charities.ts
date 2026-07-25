import { Router } from "express";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { authenticate } from "../middleware/authenticate.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import { geocodePostcode } from "../lib/postcode.js";
import {
  ensureAuthority,
  getStoredSuggestions,
} from "../lib/premappedCharities.js";
import {
  attachVotes,
  charityVoteKey,
  getVoteState,
  toggleVote,
} from "../lib/localCharityVotes.js";
import { isPersonaEmail } from "./auth.js";

const router = Router();

const localCharitiesRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests. Please slow down.",
});

const MAX_POSTCODE_CHARS = 12;

/**
 * Instant pre-mapped local charity suggestions.
 *
 * Maps the user's postcode to a local authority (postcodes.io) and serves
 * charity suggestions per main category straight from the pre-mapped store —
 * no live AI call in the request path. The first time a local authority is
 * seen, generation is queued in the background and the response reports
 * status "pending" so the frontend can show the external search links until
 * results exist.
 */
router.get("/premapped", authenticate, localCharitiesRateLimit, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }

    const postcode = typeof req.query.postcode === "string" ? req.query.postcode.trim() : "";
    if (!postcode) {
      res.status(400).json({ error: "postcode is required" });
      return;
    }
    if (postcode.length > MAX_POSTCODE_CHARS) {
      res.status(400).json({ error: `postcode must be at most ${MAX_POSTCODE_CHARS} characters.` });
      return;
    }

    const geo = await geocodePostcode(postcode);
    if (!geo || !geo.adminDistrict) {
      res.status(404).json({ error: "Could not look up that postcode" });
      return;
    }

    const area = await ensureAuthority(geo.adminDistrict, geo.country);
    const [categories, voteState] = await Promise.all([
      getStoredSuggestions(geo.adminDistrict),
      getVoteState(geo.adminDistrict, userId),
    ]);
    const categoriesWithVotes = attachVotes(categories, voteState.counts, voteState.mine);

    res.json({
      // "ready" only means generation has completed at least once; individual
      // categories may still be empty when nothing confident was found.
      status: categories.length > 0 ? "ready" : area.status === "failed" ? "failed" : "pending",
      location: {
        postcode: postcode.toUpperCase(),
        localAuthority: geo.adminDistrict,
        country: geo.country,
      },
      categories: categoriesWithVotes,
    });
  } catch (err) {
    console.error("Local charities premapped error:", err);
    res.status(500).json({ error: "Failed to load local charity suggestions" });
  }
});

/**
 * Toggle the signed-in user's thumbs-up for one suggested charity.
 *
 * The charity must exist in the stored suggestions for the given local
 * authority (identified by registration number or, for unverified
 * suggestions, by name). Demo persona accounts are shared logins, so their
 * votes are blocked with a sign-in prompt.
 */
router.post("/vote", authenticate, localCharitiesRateLimit, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }
    if (isPersonaEmail(user.email)) {
      res.status(403).json({
        error: "Demo accounts can't vote. Sign in with your own account to rate charities.",
        code: "demo_account",
      });
      return;
    }

    const localAuthority =
      typeof req.body?.localAuthority === "string" ? req.body.localAuthority.trim() : "";
    const registrationNumber =
      typeof req.body?.registrationNumber === "string" ? req.body.registrationNumber.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

    if (!localAuthority || (!registrationNumber && !name)) {
      res.status(400).json({ error: "localAuthority and a charity identifier are required" });
      return;
    }

    // Only allow votes for charities that actually appear in this area's
    // stored suggestions — the vote key must match a real place.
    const categories = await getStoredSuggestions(localAuthority);
    const target = categories
      .flatMap((c) => c.places)
      .find((p) =>
        registrationNumber
          ? p.registrationNumber?.trim() === registrationNumber
          : charityVoteKey(p) === charityVoteKey({ name, registrationNumber: undefined }),
      );

    if (!target) {
      res.status(404).json({ error: "That charity isn't in the suggestions for this area" });
      return;
    }

    const result = await toggleVote(localAuthority, charityVoteKey(target), user.id);
    res.json(result);
  } catch (err) {
    console.error("Local charities vote error:", err);
    res.status(500).json({ error: "Failed to record vote" });
  }
});

export default router;
