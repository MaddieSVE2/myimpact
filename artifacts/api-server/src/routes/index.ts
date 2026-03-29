import { Router, type IRouter } from "express";
import healthRouter from "./health";
import impactRouter from "./impact";
import sidekickRouter from "./sidekick";
import customActivityRouter from "./custom-activity";
import localCharitiesRouter from "./local-charities";
import authRouter from "./auth";
import orgRouter from "./org";
import journalRouter from "./journal";
import profileRouter from "./profile";
import adminRouter from "./admin";
import contactRouter from "./contact";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/impact", impactRouter);
router.use("/sidekick", sidekickRouter);
router.use("/custom-activity", customActivityRouter);
router.use("/local-charities", localCharitiesRouter);
router.use("/org", orgRouter);
router.use("/journal", journalRouter);
router.use("/profile", profileRouter);
router.use("/admin", adminRouter);
router.use("/contact", contactRouter);
router.use("/feedback", feedbackRouter);

export default router;
