/* Cybersprouts — Supabase connection settings.
   ============================================================================

   Fill these in with your own project's values from the Supabase dashboard:
   Project Settings → API. Then follow docs/SETUP-ACCOUNTS.md to create the
   table and its security policies.

   ---------------------------------------------------------------------------
   "Wait — an API key, in a public JavaScript file?"
   ---------------------------------------------------------------------------
   Yes, and that is the intended design. The anon key is a *publishable* key.
   It identifies your project to Supabase; it does not grant access to data.
   Every request it makes is still evaluated against Row Level Security (RLS)
   policies running inside Postgres, and those policies are what actually keep
   one learner from reading another learner's progress. Anyone can read this
   key out of the page source, and that is fine — with RLS on, the worst they
   can do is ask the database questions it will refuse to answer.

   The key you must NEVER put here is the `service_role` key. That one bypasses
   RLS entirely and is the equivalent of handing out your database password.
   It belongs only on a server you control. If it ever lands in this file, or
   in any file in this repository, rotate it immediately.

   The security of this setup rests on the RLS policies in docs/schema.sql,
   not on keeping this file secret. Read those policies before you trust them.
   ============================================================================ */

const SUPABASE_CONFIG = {
  url:     'https://YOUR-PROJECT-REF.supabase.co',
  anonKey: 'YOUR-PUBLISHABLE-ANON-KEY'
};

/* Until the placeholders above are replaced, the whole account layer stays
   dormant and Cybersprouts behaves exactly as it did before: progress in
   localStorage, no network calls, no broken sign-in buttons. */
const SUPABASE_READY = !(
  !SUPABASE_CONFIG.url ||
  !SUPABASE_CONFIG.anonKey ||
  SUPABASE_CONFIG.url.includes('YOUR-PROJECT-REF') ||
  SUPABASE_CONFIG.anonKey.includes('YOUR-PUBLISHABLE')
);
