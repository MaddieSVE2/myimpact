import { Router, type IRouter } from "express";
import healthRouter from "./health";
import impactRouter from "./impact";
import sidekickRouter from "./sidekick";
import customActivityRouter from "./custom-activity";
import localCharitiesRouter from "./local-charities";
import authRouter from "./auth";
import ssoRouter from "./sso";
import orgRouter from "./org";
import orgShareRouter from "./org-share";
import orgAdminRouter from "./org-admin";
import orgSurveysRouter from "./org-surveys";
import orgV1Router from "./org-v1";
import journalRouter from "./journal";
import profileRouter from "./profile";
import adminRouter from "./admin";
import contactRouter from "./contact";
import feedbackRouter from "./feedback";
import inviteRouter from "./invite";
import publicProfileRouter from "./public-profile";
import attachmentsRouter from "./attachments";
import calendarRouter from "./calendar";
import challengesRouter from "./challenges";
import billingRouter from "./billing";
import analyticsRouter from "./analytics";
import testOnlyRouter from "./test-only";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/auth/sso", ssoRouter);
router.use("/impact", impactRouter);
router.use("/sidekick", sidekickRouter);
router.use("/custom-activity", customActivityRouter);
router.use("/local-charities", localCharitiesRouter);
router.use("/org", orgRouter);
router.use("/org", orgAdminRouter);
router.use("/org", orgSurveysRouter);
router.use("/org-share", orgShareRouter);
router.use("/v1/org", orgV1Router);
router.use("/journal", journalRouter);
router.use("/profile", profileRouter);
router.use("/admin", adminRouter);
router.use("/contact", contactRouter);
router.use("/feedback", feedbackRouter);
router.use("/user/invite", inviteRouter);
router.use("/public-profile", publicProfileRouter);
router.use("/attachments", attachmentsRouter);
router.use("/calendar", calendarRouter);
router.use("/challenges", challengesRouter);
router.use("/billing", billingRouter);
router.use("/analytics", analyticsRouter);
router.use("/push", pushRouter);

// Test-only endpoints are mounted unconditionally; the router itself
// returns 404 for every request unless E2E_TEST_MODE=1 is set.
router.use("/test", testOnlyRouter);

export default router;
