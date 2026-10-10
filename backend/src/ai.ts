// OpenRouter calls. Each asks for JSON in a fixed shape, is checked with zod and retried
// once; if it still fails the route returns ai_unavailable and the front end falls back
// to manual entry. The model never sets a price: that's computed in code.
import { z } from "zod";
import { config } from "./config.js";
import { ApiError } from "./errors.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const BILL_MARGIN_CENTS = 10;

type Content = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

async function askJson<T>(schema: z.ZodType<T>, system: string, user: Content, model = config.openRouterModel): Promise<T> {
  if (!config.openRouterKey) throw new ApiError("ai_unavailable", "OPENROUTER_API_KEY is not set");
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouterKey}`,
          "Content-Type": "application/json",
          "X-Title": "Kerb",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      return schema.parse(json);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new ApiError("ai_unavailable", `The AI couldn't produce a usable answer (${lastError})`);
}

// ---- Bill reader ----

const BillRead = z.object({
  isBill: z.boolean(),
  dayRateCents: z.number().min(0).max(200).nullable(),
  nightRateCents: z.number().min(0).max(200).nullable(),
  standingChargeCentsPerDay: z.number().min(0).max(500).nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string(),
});

const BILL_PROMPT = `You read photos of Irish household electricity bills.
Return only JSON: {"isBill": boolean, "dayRateCents": number|null, "nightRateCents": number|null,
"standingChargeCentsPerDay": number|null, "confidence": number between 0 and 1, "notes": string}.
Rates are euro cents per kWh as printed, before or including VAT exactly as the bill shows its unit rate.
If the bill has a single 24-hour rate, use it as dayRateCents and set nightRateCents to null.
Use null for anything you cannot read. If the image is not an electricity bill, set isBill false and confidence 0.
Lower confidence for blur, cropping or ambiguity, and say why in notes. Do not suggest a price.`;

export async function readBill(image: Buffer, mimeType: string, model?: string) {
  const dataUrl = `data:${mimeType};base64,${image.toString("base64")}`;
  const read = await askJson(BillRead, BILL_PROMPT, [
    { type: "text", text: "Read the unit rates from this bill." },
    { type: "image_url", image_url: { url: dataUrl } },
  ], model);
  const dayRate = read.isBill ? read.dayRateCents : null;
  return {
    dayRateCents: dayRate === null ? null : Math.round(dayRate * 100) / 100,
    nightRateCents: read.isBill && read.nightRateCents !== null ? Math.round(read.nightRateCents * 100) / 100 : null,
    standingChargeCentsPerDay: read.isBill && read.standingChargeCentsPerDay !== null ? Math.round(read.standingChargeCentsPerDay * 100) / 100 : null,
    // Day rate + fixed margin, so the host always makes a profit. Computed here, not by the model.
    suggestedPriceCents: dayRate === null ? null : Math.ceil(dayRate) + BILL_MARGIN_CENTS,
    confidence: read.isBill ? read.confidence : 0,
    notes: read.notes,
  };
}

// ---- Availability parser ----

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
export const WindowSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: HHMM,
  end: HHMM,
});
const AvailabilityRead = z.object({
  windows: z.array(WindowSchema).max(28),
  confidence: z.number().min(0).max(1),
});

const AVAILABILITY_PROMPT = `You turn a charger host's plain-English availability into weekly time windows.
Return only JSON: {"windows": [{"day": 0-6, "start": "HH:MM", "end": "HH:MM"}], "confidence": number between 0 and 1}.
day: 0 = Sunday, 1 = Monday ... 6 = Saturday. Times are 24-hour local time.
A window that runs past midnight keeps the day it starts on and has end earlier than start,
e.g. "every night 7pm to 7am" on Monday is {"day":1,"start":"19:00","end":"07:00"}.
"All day" is "00:00" to "24:00". "Weekdays" means Monday to Friday; "weekends" Saturday and Sunday.
Apply exclusions ("not Fridays", "except Sunday"). If the text is unclear, give your best reading with low confidence.`;

export async function parseAvailability(text: string) {
  return askJson(AvailabilityRead, AVAILABILITY_PROMPT, text);
}
