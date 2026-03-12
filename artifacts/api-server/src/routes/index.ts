import { Router, type IRouter } from "express";
import healthRouter from "./health";
import impactRouter from "./impact";
import sidekickRouter from "./sidekick";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/impact", impactRouter);
router.use("/sidekick", sidekickRouter);

export default router;
