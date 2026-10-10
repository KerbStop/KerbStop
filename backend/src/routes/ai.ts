import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { ApiError } from "../errors.js";
import { parseAvailability, readBill } from "../ai.js";

export const ai = Router();
ai.use(requireUser); // each call costs OpenRouter credit

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

ai.post("/bill", upload.single("bill"), async (req, res) => {
  if (!req.file) throw new ApiError("invalid_input", "Upload a JPEG, PNG or WebP image in the 'bill' field");
  const model = typeof req.query.model === "string" ? req.query.model : undefined; // for the model comparison
  res.json(await readBill(req.file.buffer, req.file.mimetype, model));
});

ai.post("/availability", async (req, res) => {
  const { text } = z.object({ text: z.string().min(2).max(500) }).parse(req.body);
  res.json(await parseAvailability(text));
});
