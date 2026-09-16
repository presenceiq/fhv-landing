# Cloudflare Workers

These two Workers are **not** deployed from this repo. They are edited in the
Cloudflare dashboard and deployed from there. The copies here exist for one
reason: so an older version's source can be recovered.

That is not a theoretical concern. See below.

## fhv-idx-sync.js

**Current and complete**, as deployed 15 September 2026.

Pulls Stellar MLS listings from MLS Grid into D1 on a schedule, downloads
photos into R2, and serves them back to the site. Includes the `PHOTO_ZIPS`
change that widened photo coverage to Nokomis (34275).

Edited at:
https://dash.cloudflare.com/e6c4c9de441e803f1cd191a2950aab62/workers/services/edit/fhv-idx-sync/production

## fhv-lead-vault-v9-INCOMPLETE.js

**Out of date. Do NOT deploy this file.**

This is version 9, dated 8 September 2026. The version actually running was
uploaded on 12 September and contains four days of changes that are **not in
this file** — the calculator lead handling, the PDF email, and the session
based notification muting.

### Why the current version is missing

On 12 September the landing site's `_worker.js` was pasted into the lead
vault's editor by mistake and deployed. It was rolled back the same day, so
the live worker is fine and leads keep arriving.

But Cloudflare's editor always shows the **newest uploaded version**, not the
**active deployment**. So the editor permanently displays the wrong code, and
anyone who opens it and presses Deploy destroys lead capture.

**DO NOT OPEN THAT EDITOR.**
https://dash.cloudflare.com/e6c4c9de441e803f1cd191a2950aab62/workers/services/edit/fhv-lead-vault/production

### What was tried to recover it, and failed

- The dashboard will not display an old version's code.
- Clicking a version in Version History does nothing.
- The API endpoint `/workers/scripts/fhv-lead-vault` returns the **newest
  upload**, which is the wrong code.
- `/versions/{id}` returns metadata only — bindings, etag, author — no source.
- `/versions/{id}/content` returns the same metadata.
- No local copy exists newer than v9.
- No other Claude project session had a copy.

A Cloudflare community thread asking this exact question has no replies.

### What this costs

Three things stay broken until the worker is rebuilt:

1. The purchase-price path captures the lead but sends the visitor nothing.
2. The expired-page scan notification carries only a street name, so every
   scan means rebuilding the picture by hand across three systems.
3. The PDF email promises a PDF and delivers a link.

None of them stops a lead being captured.

## The rule that comes out of this

**A Worker's source lives here before it lives in Cloudflare.** Paste it into
the dashboard second, not first. The website got version history on 15
September; these two did not, and four days of work was lost within a week of
that gap being noted and not closed.
