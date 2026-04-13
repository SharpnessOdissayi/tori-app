import { Router, type IRouter } from "express";
import healthRouter from "./health";
import superAdminRouter from "./super-admin";
import authRouter from "./auth";
import businessRouter from "./business";
import publicRouter from "./public";
import storageRouter from "./storage";
import clientRouter from "./client";
import tranzilaRouter from "./tranzila";

const router: IRouter = Router();

router.use(healthRouter);
router.use(superAdminRouter);
router.use(authRouter);
router.use(businessRouter);
router.use(publicRouter);
router.use(storageRouter);
router.use(clientRouter);
router.use(tranzilaRouter);

export default router;
