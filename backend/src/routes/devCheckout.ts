// Mock-payments mode only: a stand-in for Stripe Checkout so the front end can run the
// whole booking loop without Stripe keys. Each button fakes the matching webhook.
import { Router, urlencoded } from "express";
import { config } from "../config.js";
import { newId } from "../db.js";
import { getBookingRow } from "../models.js";
import * as flow from "../bookingFlow.js";

export const devCheckout = Router();

devCheckout.get("/checkout/:id", (req, res) => {
  const b = getBookingRow(req.params.id);
  if (!b) return res.status(404).send("No such booking");
  const euros = (b.holdCents / 100).toFixed(2);
  res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width">
<title>Mock checkout</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<h2>Mock Stripe Checkout</h2>
<p>Hold of <b>€${euros}</b> for booking ${b.id}. Nothing real is charged.</p>
<form method="post">
  <button name="card" value="normal">Pay with 4242 (normal risk)</button><br><br>
  <button name="card" value="elevated">Pay with 9235 (elevated risk)</button><br><br>
  <button name="card" value="blocked">Pay with 0019 (blocked by Radar)</button><br><br>
  <button name="card" value="expire">Close checkout (session expires)</button>
</form>`);
});

devCheckout.post("/checkout/:id", urlencoded({ extended: false }), async (req, res) => {
  const id = req.params.id;
  const card = req.body.card as string;
  if (card === "normal" || card === "elevated") await flow.onPaymentConfirmed(id, newId("mock_pi"), card);
  else if (card === "blocked") flow.onPaymentBlocked(id, "highest");
  else if (card === "expire") flow.onCheckoutExpired(id);
  if (card === "blocked") return res.redirect(`/api/dev/checkout/${id}`);
  res.redirect(`${config.frontendUrl}/booking/${id}`);
});
