import { Router } from "express";
import { db, localCharitySubmissionsTable, type StoredCharityPlace } from "@workspace/db";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { authenticate } from "../middleware/authenticate.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import type { Request, Response, NextFunction } from "express";
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
import { addOverride } from "../lib/charityOverrides.js";
import {
  verifyAgainstRegister,
  verifyWebsiteForCharity,
  normalizeSubmittedUrl,
} from "../lib/charitySubmissionVerification.js";
import { getUncachableResendClient } from "../lib/resend.js";

const router = Router();

const localCharitiesRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests. Please slow down.",
});

const MAX_POSTCODE_CHARS = 12;
const ADMIN_EMAIL = "hello@myimpact.uk";

/** Per-user submission rate limit: 5 submissions per 10 minutes. */
const SUBMISSION_WINDOW_MS = 10 * 60 * 1000;
const SUBMISSION_MAX = 5;
const submissionCounts = new Map<string, { count: number; resetAt: number }>();

function submissionRateLimit(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as AuthenticatedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }
  const now = Date.now();
  const entry = submissionCounts.get(userId);
  if (!entry || entry.resetAt <= now) {
    submissionCounts.set(userId, { count: 1, resetAt: now + SUBMISSION_WINDOW_MS });
    next();
    return;
  }
  if (entry.count >= SUBMISSION_MAX) {
    res.status(429).json({ error: "Too many submissions — please try again in a few minutes." });
    return;
  }
  entry.count += 1;
  next();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Email a needs-review submission to the admin. Failure never blocks the response. */
async function emailNeedsReview(details: {
  kind: string;
  localAuthority: string;
  charityName: string;
  userEmail?: string;
  lines: Array<[string, string]>;
}): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const rows = details.lines
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<p style="margin:0 0 8px;color:#555;font-size:14px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`,
      )
      .join("");
    await client.emails.send({
      from: fromEmail,
      to: ADMIN_EMAIL,
      subject: `Charity ${details.kind} needs review: ${details.charityName} (${details.localAuthority})`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 16px;color:#213547;font-size:20px;">Local charity ${escapeHtml(details.kind)} — needs review</h2>
          ${rows}
          <p style="color:#aaa;margin:24px 0 0;font-size:12px;">This submission failed auto-verification and was NOT applied. Submitted at ${new Date().toISOString()}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send charity submission review email:", err);
  }
}

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

const ISSUE_TYPES = new Set(["wrong_website", "wrong_description", "closed", "other"]);

async function resolveArea(postcode: string): Promise<{ localAuthority: string; country: string } | null> {
  if (!postcode || postcode.length > MAX_POSTCODE_CHARS) return null;
  const geo = await geocodePostcode(postcode);
  if (!geo || !geo.adminDistrict) return null;
  return { localAuthority: geo.adminDistrict, country: geo.country };
}

/**
 * Report an issue with a suggested charity. Verified corrections are applied
 * immediately as overrides; everything else is stored and emailed for review.
 */
router.post("/report", authenticate, submissionRateLimit, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const body = req.body as Record<string, unknown>;

    const postcode = typeof body.postcode === "string" ? body.postcode.trim() : "";
    const charityName = typeof body.charityName === "string" ? body.charityName.trim().slice(0, 200) : "";
    const category = typeof body.category === "string" ? body.category.trim().slice(0, 100) : "";
    const issueType = typeof body.issueType === "string" ? body.issueType : "";
    const correctWebsite = typeof body.correctWebsite === "string" ? body.correctWebsite.trim().slice(0, 500) : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

    if (!charityName || !ISSUE_TYPES.has(issueType)) {
      res.status(400).json({ error: "charityName and a valid issueType are required" });
      return;
    }
    const area = await resolveArea(postcode);
    if (!area) {
      res.status(400).json({ error: "Could not look up that postcode" });
      return;
    }

    let applied = false;
    let detail = "";

    if (issueType === "wrong_website" && correctWebsite) {
      const normalizedUrl = normalizeSubmittedUrl(correctWebsite);
      if (normalizedUrl) {
        const [registerMatch, websiteCheck] = await Promise.all([
          verifyAgainstRegister(charityName, area.country),
          verifyWebsiteForCharity(charityName, normalizedUrl),
        ]);
        if (registerMatch && websiteCheck.ok) {
          await addOverride({
            localAuthority: area.localAuthority,
            targetName: charityName,
            kind: "patch",
            patch: { website: normalizedUrl },
          });
          applied = true;
          detail = `Register match (no. ${registerMatch.registrationNumber}); ${websiteCheck.reason}`;
        } else {
          detail = registerMatch
            ? `Website check failed: ${websiteCheck.reason}`
            : "Charity not found in official register";
        }
      } else {
        detail = "Submitted URL is not a valid web address";
      }
    } else if (issueType === "closed") {
      const registerMatch = await verifyAgainstRegister(charityName, area.country);
      if (!registerMatch) {
        await addOverride({
          localAuthority: area.localAuthority,
          targetName: charityName,
          kind: "remove",
        });
        applied = true;
        detail = "No active registration found in official register — entry removed";
      } else {
        detail = `Charity still registered (no. ${registerMatch.registrationNumber}) — needs human review`;
      }
    } else {
      detail = "Issue type requires human review";
    }

    await db.insert(localCharitySubmissionsTable).values({
      userId: user.id,
      type: "correction",
      localAuthority: area.localAuthority,
      country: area.country,
      category: category || null,
      charityName,
      issueType,
      submittedWebsite: correctWebsite || null,
      note: note || null,
      status: applied ? "applied" : "needs_review",
      verificationDetail: detail,
    });

    if (!applied) {
      await emailNeedsReview({
        kind: "correction",
        localAuthority: area.localAuthority,
        charityName,
        lines: [
          ["Charity", charityName],
          ["Local authority", area.localAuthority],
          ["Category", category],
          ["Issue", issueType],
          ["Submitted website", correctWebsite],
          ["Note", note],
          ["Verification", detail],
          ["Reported by", user.email ?? user.id],
        ],
      });
    }

    res.json({ result: applied ? "applied" : "review" });
  } catch (err) {
    console.error("Local charity report error:", err);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

/**
 * Suggest a charity for the user's area. Auto-added when the charity is
 * found in the official register and its website passes the sanity check.
 */
router.post("/suggest", authenticate, submissionRateLimit, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const body = req.body as Record<string, unknown>;

    const postcode = typeof body.postcode === "string" ? body.postcode.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    const website = typeof body.website === "string" ? body.website.trim().slice(0, 500) : "";
    const category = typeof body.category === "string" ? body.category.trim().slice(0, 100) : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

    if (!name) {
      res.status(400).json({ error: "Charity name is required" });
      return;
    }
    const area = await resolveArea(postcode);
    if (!area) {
      res.status(400).json({ error: "Could not look up that postcode" });
      return;
    }

    let applied = false;
    let detail = "";

    const registerMatch = await verifyAgainstRegister(name, area.country);
    if (!registerMatch) {
      detail = "Charity not found in official register";
    } else {
      let websiteUrl: string | undefined;
      let websiteOk = true;
      if (website) {
        const check = await verifyWebsiteForCharity(name, website);
        websiteOk = check.ok;
        detail = check.reason;
        if (check.ok) websiteUrl = normalizeSubmittedUrl(website) ?? undefined;
      }
      if (websiteOk) {
        const place: StoredCharityPlace = {
          name,
          description: note ? note.slice(0, 140) : "Suggested by a local volunteer.",
          howToJoin: "Contact them to ask about volunteering opportunities.",
          website: websiteUrl,
          source: "community",
          verified: true,
          registrationNumber: registerMatch.registrationNumber,
        };
        await addOverride({
          localAuthority: area.localAuthority,
          category: category || "Community",
          kind: "add",
          place,
        });
        applied = true;
        detail = `Register match (no. ${registerMatch.registrationNumber})${detail ? `; ${detail}` : ""}`;
      }
    }

    await db.insert(localCharitySubmissionsTable).values({
      userId: user.id,
      type: "suggestion",
      localAuthority: area.localAuthority,
      country: area.country,
      category: category || null,
      charityName: name,
      submittedWebsite: website || null,
      note: note || null,
      status: applied ? "applied" : "needs_review",
      verificationDetail: detail,
    });

    if (!applied) {
      await emailNeedsReview({
        kind: "suggestion",
        localAuthority: area.localAuthority,
        charityName: name,
        lines: [
          ["Charity", name],
          ["Local authority", area.localAuthority],
          ["Category", category],
          ["Website", website],
          ["Note", note],
          ["Verification", detail],
          ["Suggested by", user.email ?? user.id],
        ],
      });
    }

    res.json({ result: applied ? "applied" : "review" });
  } catch (err) {
    console.error("Local charity suggest error:", err);
    res.status(500).json({ error: "Failed to submit suggestion" });
  }
});

export default router;
