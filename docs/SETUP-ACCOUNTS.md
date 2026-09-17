# Turning on accounts

Right now the account layer is built but dormant: `assets/js/supabase-config.js`
still has placeholder values, so Cybersprouts runs exactly as it did before —
progress in localStorage, no network calls. Nothing below is required to keep
working on the mockup.

These steps connect it to a real backend, after which progress follows a learner
to any browser they sign in from.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
   The free tier is plenty for early traffic.
2. Pick a strong database password and put it in a password manager. You will
   rarely need it, and there is no "forgot password" for it.
3. Choose a region near most of your learners — it is the round trip on every
   progress save.

## 2. Create the table

Open **SQL Editor → New query**, paste the whole of [`schema.sql`](schema.sql),
and run it.

Read it first. It is short, and the Row Level Security policies at the bottom
are the entire security model for learner data. That file explains what each
policy does and why `with check` matters as much as `using`.

Afterwards, confirm in **Table Editor → progress** that the table shows
"RLS enabled". If it ever says otherwise, every learner's row is world-readable.

## 3. Configure auth

In **Authentication → Providers → Email**:

- Keep **Confirm email** on. It costs a learner one click and stops anyone
  signing up with an address they do not control.
- Minimum password length: 8.

In **Authentication → URL Configuration**:

- **Site URL** — where Cybersprouts is hosted (e.g. `https://cybersprouts.dev`).
- **Redirect URLs** — add every origin you use, including local development:
  ```
  http://localhost:8000/account.html
  https://YOUR-DOMAIN/account.html
  ```
  This is an allow-list, and it matters: it is what stops someone crafting a
  confirmation link that sends the resulting session to a site they control.

> **Note on email:** Supabase's built-in email sender is rate-limited to a
> handful of messages per hour — fine for testing, not for real signups. Before
> launch, connect your own SMTP provider under **Project Settings → Auth → SMTP**
> (Resend, Postmark, and SES all have usable free tiers). Skip this and new
> learners will silently stop receiving confirmation emails once you get busy.

## 4. Point the app at it

From **Project Settings → API**, copy the **Project URL** and the **anon /
public** key into `assets/js/supabase-config.js`:

```js
const SUPABASE_CONFIG = {
  url:     'https://abcdefgh.supabase.co',
  anonKey: 'eyJhbGciOi...'
};
```

**Only the anon key.** The `service_role` key on that same page bypasses RLS
entirely and must never appear in this repository or in anything served to a
browser. If it does, rotate it immediately from that dashboard page.

The anon key being public is fine and expected — see the comment at the top of
`supabase-config.js` for why.

## 5. Test it

Serve the folder over HTTP rather than opening the files directly; `file://`
origins break the redirect flow.

```sh
python3 -m http.server 8000
```

Then walk the whole path at <http://localhost:8000>:

1. **Anonymous progress survives signup.** Complete two lessons *before*
   making an account, then sign up. Those two lessons should still be there —
   this is the merge step, and it is the most common place a sync feature
   quietly loses people's work.
2. **Progress travels.** Complete a lesson, then sign in from a private window.
   It should appear.
3. **Sign-out clears the browser.** After signing out, the roadmap should be
   empty; signing back in restores it.
4. **Isolation.** Make a second account and confirm it sees none of the first
   account's progress. If it does, stop and re-check step 2.

---

## What gets stored

| Data | Where | Notes |
|---|---|---|
| Email address | Supabase `auth.users` | Managed by Supabase |
| Password hash | Supabase `auth.users` | bcrypt, server-side; never touches this codebase |
| Session token | Browser localStorage | Issued and refreshed by supabase-js |
| Completed lessons, team, placement result | `public.progress` | One row per learner, RLS-guarded |

No progress data is sensitive, but the email addresses are personal data — if
you take this public, you owe learners a privacy note saying what you keep and
a way to delete their account.

## Not built yet

- **Account deletion from the UI.** Deleting an auth user requires the
  `service_role` key, which cannot live in client-side code. It needs a Supabase
  Edge Function. Until then, deletions happen by hand in the dashboard. Worth
  closing before any public launch.
- **Rate limiting beyond Supabase's defaults.** The built-in per-IP limits on
  auth endpoints are reasonable to start with; revisit if signups get abused.
- **OAuth (GitHub/Google).** The auth layer would take it with small changes to
  `auth.js` and `account.js` — a natural fit for learners pivoting from software
  engineering, who all have GitHub accounts already.
