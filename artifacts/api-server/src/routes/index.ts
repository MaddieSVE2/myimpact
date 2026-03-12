import { Router, type IRouter } from "express";
import healthRouter from "./health";
import impactRouter from "./impact";
import sidekickRouter from "./sidekick";
import customActivityRouter from "./custom-activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/impact", impactRouter);
router.use("/sidekick", sidekickRouter);
router.use("/custom-activity", customActivityRouter);

export default router;
