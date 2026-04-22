import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import entriesRouter from "./entries";
import invoicesRouter from "./invoices";
import summaryRouter from "./summary";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(entriesRouter);
router.use(invoicesRouter);
router.use(summaryRouter);
router.use(settingsRouter);

export default router;
