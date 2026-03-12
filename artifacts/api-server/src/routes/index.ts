import { Router, type IRouter } from "express";
import healthRouter from "./health";
import impactRouter from "./impact";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/impact", impactRouter);

export default router;
