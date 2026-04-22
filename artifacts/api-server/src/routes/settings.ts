import { Router, type IRouter } from "express";
import { zodSchemas } from "@workspace/api-zod";
import { getSettings, updateSettings } from "../lib/settings";

const router: IRouter = Router();

router.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

router.patch("/settings", async (req, res) => {
  const body = zodSchemas.UpdateSettingsBody.parse(req.body ?? {});
  res.json(await updateSettings(body));
});

export default router;
