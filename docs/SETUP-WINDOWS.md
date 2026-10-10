# Running the Kerb back end on Windows: step by step

This assumes you know nothing. Follow it top to bottom. Each step says what you're doing and why.

## What you're setting up, in one paragraph

The **back end** is a small program that runs on your laptop. The front end (King's app) talks to it at `http://localhost:4000` (`localhost` means "this computer"). The back end needs a few secrets to talk to outside services: a **Stripe secret key** (so it can take test payments and check IDs), a **Stripe webhook secret** (so it can trust messages Stripe sends back), and an **OpenRouter key** (so it can use AI). You'll get each one, put them in a file called `.env`, and start the program.

You'll use **two terminal windows** at the end. A terminal is the black window where you type commands. On Windows, open one by pressing the Windows key, typing `cmd`, and pressing Enter. That's "Command Prompt".

---

## Step 1: Check Node.js is installed

Node.js is what runs the back end's code.

1. Open Command Prompt.
2. Type `node -v` and press Enter.
3. If you see something like `v20.11.0` or higher, you're fine. Skip to Step 2.
4. If you see "not recognized", go to [nodejs.org](https://nodejs.org), download the **LTS** version, run the installer with all the default options, then **close and reopen** Command Prompt and try `node -v` again.

## Step 2: Get the code onto your laptop

The code is on GitHub at `KerbStop/kerbstop`. You need a copy of it locally.

1. Check git is installed: type `git --version`. If it says "not recognized", install it from [git-scm.com/download/win](https://git-scm.com/download/win) with the default options, then reopen Command Prompt.
2. Go to a folder where you keep projects, for example your Documents:
   ```
   cd %USERPROFILE%\Documents
   ```
   (`cd` means "change directory", i.e. move into a folder.)
3. Download the code:
   ```
   git clone https://github.com/KerbStop/kerbstop.git
   ```
   This creates a folder called `kerbstop`.
4. Move into the back end folder inside it:
   ```
   cd kerbstop\backend
   ```
5. Install the libraries the code depends on (Express, Stripe, etc.):
   ```
   npm install
   ```
   This takes a minute and creates a `node_modules` folder. Warnings are fine; red `ERR!` lines are not, so send me those if you see them.

The back end won't start until the keys below are in place; it tells you which ones are missing.

## Step 3: Create your `.env` file

`.env` is a plain text file that holds your secrets. The code reads it when it starts. It is listed in `.gitignore`, which means git will never upload it, so your keys stay private.

1. Still in the `kerbstop\backend` folder, copy the template:
   ```
   copy .env.example .env
   ```
2. Open it in Notepad:
   ```
   notepad .env
   ```
   You'll see lines like `STRIPE_SECRET_KEY=` with nothing after the `=`. You'll fill these in over the next steps. Keep Notepad open.

Rules for this file: no spaces around `=`, no quote marks, one setting per line. For example, `STRIPE_SECRET_KEY=sk_test_51Abc...`.

## Step 4: Get your Stripe secret key

Stripe handles the payments. You'll use its **test mode** (also called a sandbox), where nothing is real money and you pay with fake card numbers.

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and log in (you've done this).
2. Make sure you're in test mode: look for a "Test mode" toggle or a "Sandbox" label near the top. It should be on.
3. Go to [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys).
4. Find **Secret key**, click **Reveal**, and copy it. It starts with `sk_test_`. (Ignore the "Publishable key" that starts with `pk_test_`; the back end doesn't need it.)
5. In Notepad, paste it after `STRIPE_SECRET_KEY=`.

**Never share the secret key** in chat, screenshots, or GitHub.

## Step 5: Turn on Stripe Connect

Connect is the Stripe feature that pays hosts (the people renting out their chargers). Without it, the "become a host" step fails.

1. Go to [dashboard.stripe.com/test/connect](https://dashboard.stripe.com/test/connect).
2. Click **Get started** and go through the short questions. If asked, choose that your platform is a **marketplace**, and that connected accounts use **Express** dashboards.

## Step 6: Get your OpenRouter key

OpenRouter gives the back end access to AI models. It's used to read electricity bills and to understand availability like "weekdays 9 to 5".

1. On the screen you were on, choose **Individual**.
2. Go to [openrouter.ai/keys](https://openrouter.ai/keys) and click **Create key**. Name it `kerb`. Copy the key, which starts with `sk-or-`. You'll only see it once.
3. In Notepad, paste it after `OPENROUTER_API_KEY=`.
4. Add credit at [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits). $5 is far more than the hackathon needs.

Now **save the file in Notepad** (Ctrl+S). Leave `STRIPE_WEBHOOK_SECRET=` empty for now.

## Step 6b: Turn on Stripe Identity

Stripe Identity checks a driver's or host's government ID (passport, driving licence or national ID card) and a selfie.

1. Go to [dashboard.stripe.com/test/identity](https://dashboard.stripe.com/test/identity).
2. If it asks you to get started or accept terms, do so. In test mode no real IDs are checked: Stripe's verification page gives you buttons to simulate a pass or a fail.

## Step 7: Start the back end (terminal 1)

1. In Command Prompt, still in `kerbstop\backend`, run:
   ```
   npm run dev
   ```
2. You should see `Seeded 9 hosts and 12 chargers` the first time, then `Kerb back end listening on port 4000`. Leave this window open; closing it stops the back end.
3. If it says `Missing environment variables`, fill those in `.env`, save, and run it again. For this first run only, you can put a placeholder like `whsec_placeholder` in `STRIPE_WEBHOOK_SECRET`; you'll get the real one in Step 8.

## Step 8: Connect Stripe to your laptop (terminal 2)

**Why this step exists:** when a driver pays, Stripe's servers send a message called a **webhook** saying "this payment went through". Stripe can't reach your laptop directly over the internet, so the Stripe CLI (the program you downloaded) listens for those messages and forwards them to your back end. The back end only marks a booking as paid when that message arrives, which stops people faking payment.

1. Open a **second** Command Prompt window.
2. Install the Stripe CLI if you haven't (`winget install Stripe.StripeCli`, then reopen the terminal and run `stripe login`). Then, from the `backend` folder, run:
   ```
   npm run stripe:listen
   ```
   That runs `stripe listen` with the four events the back end handles.
3. It prints a line like:
   ```
   Ready! Your webhook signing secret is whsec_abc123...
   ```
4. Copy the `whsec_...` part. In Notepad, paste it after `STRIPE_WEBHOOK_SECRET=` and save.
5. **Leave this window open** while you test. It shows each Stripe event as it arrives, which is useful to watch.

## Step 9: Restart the back end so it reads the new secret

The back end only reads `.env` when it starts.

1. Go to **terminal 1**, press **Ctrl+C** to stop it, then run `npm run dev` again.

## Step 9a: Create the demo host account

The 12 sample chargers need a Stripe account to pay their hosts. This creates one test account, "Kerb Demo Host", that all of them pay into, so every demo payment shows the host's share in Stripe.

1. In a terminal in the `backend` folder, run:
   ```
   npm run stripe:demo-host
   ```
2. It prints a line `STRIPE_DEMO_ACCOUNT_ID=acct_...`. Paste that into `.env` and save.
3. It also prints a link. Open it and fill in the form with Stripe's test details: use the suggested test phone number, enter `000000` when it asks for an SMS code, and use the test IBAN `IE29AIBK93115212345678`. Anything else can be made up.
4. Restart terminal 1 (Ctrl+C, then `npm run dev`).

## Step 10: Check it's all working

1. Open [http://localhost:4000/api/health](http://localhost:4000/api/health) in your browser.
2. You should see:
   ```
   {"ok":true,"ai":true}
   ```
   - The page loading at all means the Stripe settings worked, because the back end refuses to start without them.
   - `ai: true` means the OpenRouter key loaded.

## Step 11: Test the whole flow

Booking needs a signed-in, ID-verified user, which comes from King's front end (email sign-in, then the Stripe Identity page). Once the front end has sign-in, try this:

1. Sign in on the front end with your email.
2. Start ID verification. On Stripe's test page, choose the option to simulate a successful verification.
3. Book a charger. On Stripe Checkout, pay with card `4242 4242 4242 4242`, any future expiry (e.g. `12/30`), any CVC and any postcode.
4. Watch terminal 2: you'll see `checkout.session.completed` arrive, and the booking turns **Reserved**.
5. In the Stripe dashboard under **Payments**, the payment shows as **Uncaptured** (the hold). Start and stop charging, and it becomes a partial capture with the host's share sent to Kerb Demo Host.

## When something goes wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| `'node' is not recognized` | Node isn't installed, or the terminal opened before you installed it | Install Node (Step 1), then reopen the terminal |
| `EADDRINUSE :::4000` | The back end is already running in another window | Close the other window, or press Ctrl+C there |
| `Missing environment variables: ...` | Those lines in `.env` are empty | Fill them in, save, restart `npm run dev` |
| `unauthorized` from the API | No sign-in token, or it expired | Sign in again on the front end |
| `identity_required` from the API | The user hasn't passed ID verification | Do the Stripe Identity step on the front end |
| Booking stays `pending_payment` after paying | The webhook isn't arriving | Check terminal 2 is running and `STRIPE_WEBHOOK_SECRET` matches what it printed; restart terminal 1 |
| Terminal 2 shows `[400]` errors | The webhook secret is wrong | Copy the `whsec_` value again, save `.env`, restart terminal 1 |
| `ai_unavailable` from the AI endpoints | The OpenRouter key is missing or has no credit | Check the key in `.env` and your credit balance |

If you get stuck, paste the error text into the thread, but **not your keys**.
