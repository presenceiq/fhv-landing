/* =============================================================================
   fhv-alerts — Cloudflare Worker

   Watches the leads table and tells Michael the things he would otherwise miss.
   Four jobs, all reading from the same D1 database the lead vault writes to.

     actionNeeded  somebody left an email or a phone number. Say so once.
     nowListed     a household he has been mailing is now listed with another
                   brokerage. Stop mailing them immediately.
     daily         who came back a third time, and who answered his mail.
     seed          on first run, mark everything already in the table as sent,
                   so turning this on does not fire hundreds of old alerts.

   Every alert is logged in alert_log by a key, and a key is never sent twice.

   ---------------------------------------------------------------------------
   CHANGED 24 September 2026, three things.

   1. CORRECTIONS ARE NOT LEADS. The personal home pages at /h/<address> carry a
      form where an owner can report that a figure is wrong. Those arrive with
      "CORRECTION REPORTED" at the top of the wants field. Before this change
      they fell through to the catch-all and arrived titled "Contact details
      left" telling Michael to reply to a prospect. A homeowner correcting the
      square footage is not a prospect, and mixing the two means real leads get
      buried and corrections get a sales call. They now have their own subject
      line and their own instruction.

   2. HIS OWN TESTING NO LONGER ALERTS HIM. The filter held two fragments,
      putnamrealtygroup.com and cleirshusband. He tests from a comcast address,
      so every test he ran produced a real action item. Added.

   3. THE DAILY SOURCE LINE TOLD THE TRUTH BADLY. A lookup from a personal
      address page was being counted as "the home page", because the territory
      string contains the words home page. It now names itself.
   ========================================================================== */

import { EmailMessage } from "cloudflare:email";

const TO    = "michael@putnamrealtygroup.com";
const FROM  = "alerts@floridahomevalueai.com";
const VAULT = "https://fhv-lead-vault.cleirshusband.workers.dev/leads";

/* Michael's own four properties. A lookup on one of these is him, not a lead. */
const OWN = new Set(["5754|ARCHIPELAGO", "5758|ARCHIPELAGO", "3716|BEEBER", "71|SHADE"]);

/* ★ His own email addresses. Anything matching these is his own testing and is
   silently marked as handled rather than emailed to him. comcast.net alone
   would be far too broad, so the whole address is listed. */
const MY_EMAIL_BITS = ["putnamrealtygroup.com", "cleirshusband", "putnamm@comcast.net"];

const AREA_ZIPS = ["34293", "34275", "34292", "34285", "34238", "34229", "34231", "34287",
                   "34286", "34288", "34289", "34291", "34223", "34224", "34233", "34232",
                   "34241", "34242"];

const SUF = new Set([
  "DR", "ST", "LN", "CT", "CIR", "WAY", "TER", "PL", "AVE", "BLVD", "RD", "LOOP",
  "TRL", "PKWY", "RUN", "COVE", "PT", "XING", "PATH", "ROW", "SQ", "HWY", "PASS",
  "CV", "GLN", "BND", "HOLW", "WALK", "LNDG", "TRCE", "PARK", "PLZ", "CRES", "GRV",
  "VW", "ALY", "DRIVE", "STREET", "LANE", "COURT", "CIRCLE", "TERRACE", "PLACE",
  "AVENUE", "BOULEVARD", "ROAD", "TRAIL", "PARKWAY"
]);

function parse(a) {
  const t = String(a || "").toUpperCase().split(",")[0].replace(/#/g, " ").trim().split(/\s+/);
  const num = t[0] || "";
  let i = 1;
  const name = [];
  while (i < t.length && !SUF.has(t[i])) name.push(t[i++]);
  const unit = i < t.length - 1 ? t.slice(i + 1).join(" ") : "";
  return { num, name: name.join(" "), unit, key: num + "|" + name.join(" ") };
}

const nice = (s) => String(s || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const eastern = (iso) => {
  let s = String(iso || "").replace(" ", "T");
  if (!s) return "";
  if (!/Z$|[+-]\d\d:\d\d$/.test(s)) s += "Z";
  const d = new Date(s);
  return isNaN(d) ? String(iso)
    : d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
};

const mls   = (l) => String(l.listing_id || l.listing_key || "").replace(/^MFR/i, "");
const money = (n) => n ? "$" + Math.round(n).toLocaleString("en-US") : "";

async function send(env, subject, body) {
  const raw = [
    "From: FHV Alerts <" + FROM + ">",
    "To: " + TO,
    "Subject: " + subject.replace(/[^\x20-\x7E]/g, ""),
    "Date: " + (new Date()).toUTCString(),
    "Message-ID: <" + crypto.randomUUID() + "@floridahomevalueai.com>",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body
  ].join("\r\n");
  await env.EMAIL.send(new EmailMessage(FROM, TO, raw));
}

async function logged(env, key) {
  return !!await env.DB.prepare("SELECT 1 FROM alert_log WHERE key = ?").bind(key).first();
}

async function mark(env, key) {
  await env.DB.prepare("INSERT OR IGNORE INTO alert_log (key, sent_at) VALUES (?, ?)")
    .bind(key, (new Date()).toISOString()).run();
}

async function history(env) {
  const { results } = await env.DB.prepare(
    "SELECT address, names, piece, sent_on, status FROM mailings ORDER BY id"
  ).all();
  const by = {};
  for (const r of results || []) {
    const p = parse(r.address);
    (by[p.key] = by[p.key] || []).push({ ...r, unit: p.unit });
  }
  return by;
}

const describe = (rows) => rows.map((r) =>
  "  " + r.piece + (r.sent_on ? ", " + r.sent_on : "") +
  (r.status && r.status !== "mailed" ? " (" + r.status + ")" : "")
).join("\n");

async function seed(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS alert_log (key TEXT PRIMARY KEY, sent_at TEXT)").run();
  if (await logged(env, "seeded")) return;
  const { results: c } = await env.DB.prepare(
    "SELECT id FROM leads WHERE (email IS NOT NULL AND email <> '') OR (phone IS NOT NULL AND phone <> '')"
  ).all();
  for (const r of c || []) await mark(env, "action:" + r.id);
  const { results: all } = await env.DB.prepare(
    "SELECT address FROM leads WHERE address NOT LIKE '$%'"
  ).all();
  const n = {};
  for (const r of all || []) {
    const k = parse(r.address).key;
    n[k] = (n[k] || 0) + 1;
  }
  for (const k in n) if (n[k] >= 3) await mark(env, "third:" + k);
  await mark(env, "seeded");
}

async function actionNeeded(env, hist, out, dry) {
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  /* ★ CALCULATOR ROWS HAVE NO CONTACT DETAILS AND STILL MATTER.
     Everything else in here is somebody who typed an email or a phone number.
     A personal home page also records when somebody fills a mortgage payoff or
     a commission rate into the net proceeds calculator. They left no way to
     reach them, so the contact-details test would drop the row, but working out
     what you would walk away with is a stronger signal of intent to sell than
     most of the rows that do carry an email. The address is the lead: the owner
     name and mailing address are on the county roll. */
  const { results } = await env.DB.prepare(
    "SELECT id, received_at, name, email, phone, address, territory_id, subdivision, wants " +
    "FROM leads WHERE received_at > ? AND ((email IS NOT NULL AND email <> '') OR " +
    "(phone IS NOT NULL AND phone <> '') OR wants LIKE 'CALCULATOR USED%') ORDER BY id"
  ).bind(since).all();

  for (const r of results || []) {
    const key = "action:" + r.id;
    if (await logged(env, key)) continue;

    const p = parse(r.address);
    const mine = MY_EMAIL_BITS.some((b) => String(r.email || "").toLowerCase().includes(b)) || OWN.has(p.key);
    if (mine) {
      if (!dry) await mark(env, key);
      continue;
    }

    const w = String(r.wants || "").toUpperCase();

    /* ★ CORRECTION FIRST, because a correction can also carry an email address
       and would otherwise be read as somebody wanting to be sold to. The whole
       wants field is printed for a correction rather than summarised, because
       it already holds what they say is wrong, their own words, and the figures
       the page was showing them. That is the entire message. */
    const isCorrection = w.includes("CORRECTION REPORTED");

    /* ★ A suggestion is not a correction and not a lead. Somebody read the
       page and thought of something better. It wants reading in a different
       frame of mind from a broken figure, so it gets its own subject. */
    const isIdea = w.includes("SUGGESTION REPORTED");

    /* ★ An alerts signup is not somebody waiting for a reply either. They asked
       to be told when a home near them sells. Writing back "thanks for getting
       in touch" is the wrong move and it burns the one thing that makes these
       pages different. The instruction says what to do instead. */
    const isAlerts = !isCorrection && !isIdea && w.startsWith("ALERTS FOR");

    /* The net proceeds calculator on a personal address page. */
    const isCalc = w.startsWith("CALCULATOR USED");

    const kind = isCorrection              ? "A correction was reported"
               : isIdea                    ? "Someone suggested something"
               : isCalc                    ? "Someone worked out their net proceeds"
               : isAlerts                  ? "Sale alerts requested"
               : w.includes("DRIP REQUEST") ? "Drip request"
               : w.includes("CALL REQUEST") ? "Call request"
               :                              "Contact details left";

    const todo = isIdea
        ? "Read it and decide whether to build it. This is not a sales lead and it is not a bug. It is somebody who used the page and thought of something better. If you build it, write back and tell them, because that is how you get the next one."
      : isCorrection
        ? "Check the page against the county record, not against this email. If they are right, fix it and write back saying what changed. If the county record is what is wrong, tell them that and give them 941-861-8200. Do not treat this as a sales lead."
      : isCalc
        ? "They typed real numbers into the net proceeds calculator on their own address page, so they are working out what a sale would leave them. They left no email and no phone, so there is nobody to reply to. The address is the lead. Pull the owner name and mailing address off the county roll and send the piece you send. Do not call without checking Do Not Call with Brian first."
      : isAlerts
        ? "Add them to your sale alerts list. Do not send a sales reply. Next time a home in their scope closes, send them which house, when, and what it sold for. That is the whole promise the page made and it is the only thing they agreed to."
      : kind === "Drip request" ? "Set up their OneHome drip, then record it."
      : kind === "Call request" ? "Call them. They asked for it."
      :                           "Reply to them.";

    const past = hist[p.key];

    /* ★ The word CORRECTION leads the subject line so it is obvious in the
       inbox without opening anything. */
    const subject = isCorrection ? "CORRECTION: " + nice(String(r.address).split(",")[0])
                  : isIdea       ? "IDEA: " + nice(String(r.address).split(",")[0])
                  : isCalc       ? "SELLING SIGNAL: " + nice(String(r.address).split(",")[0])
                  :                "ACTION NEEDED: " + kind + ", " + nice(String(r.address).split(",")[0]);

    const body = [
      todo,
      "",
      "Address:   " + (r.address || ""),
      "Community: " + (r.subdivision || r.territory_id || ""),
      r.name  ? "Name:      " + r.name  : null,
      r.email ? "Email:     " + r.email : null,
      r.phone ? "Phone:     " + r.phone : null,
      "When:      " + eastern(r.received_at),
      "From:      " + (r.territory_id || ""),
      "",
      (isCorrection || isIdea) ? "WHAT THEY SENT\n" + String(r.wants || "") : null,
      (isCorrection || isIdea) ? "" : null,
      isAlerts ? "What they asked for:\n  " + String(r.wants || "").split("\n")[0] : null,
      isAlerts ? "" : null,
      isCalc ? "WHAT THEY FILLED IN\n" + String(r.wants || "").split("\n").slice(0, 2).join("\n") : null,
      isCalc ? "" : null,
      past ? "You've already sent them:\n" + describe(past) : "You haven't mailed them before.",
      "",
      "All leads: " + VAULT
    ].filter((x) => x !== null).join("\n");

    out.push({ subject, body });
    if (!dry) {
      await send(env, subject, body);
      await mark(env, key);
    }
  }
}

async function nowListed(env, hist, out, dry) {
  const keys = Object.keys(hist);
  if (!keys.length) return;
  const names = [...new Set(keys.map((k) => k.split("|")[1]))];
  const marks = names.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    "SELECT listing_key, listing_id, status, street_number, street_name, street_suffix, " +
    "unit_number, postal_code, list_price, list_office_name, days_on_market " +
    "FROM idx_listings WHERE street_name IN (" + marks + ") AND status IN ('Active','Pending')"
  ).bind(...names).all();

  for (const l of results || []) {
    if (!AREA_ZIPS.includes(String(l.postal_code || "").slice(0, 5))) continue;
    const k = String(l.street_number) + "|" + String(l.street_name).toUpperCase();
    const rows = hist[k];
    if (!rows) continue;
    const want = rows.map((r) => r.unit).filter(Boolean);
    if (want.length && !want.includes(String(l.unit_number || "").toUpperCase())) continue;
    if (/PUTNAM/i.test(l.list_office_name || "")) continue;

    const key = "listed:" + l.listing_key + ":" + l.status;
    if (await logged(env, key)) continue;

    const drip = rows.some((r) => /DRIP/i.test(r.piece));
    const addr = nice([l.street_number, l.street_name, l.street_suffix].filter(Boolean).join(" "))
               + (l.unit_number ? " #" + l.unit_number : "");
    const subject = (drip ? "REMOVE DRIP. " : "STOP MAILING. ") + "Now " + l.status + ": " + addr;
    const body = [
      (drip ? "Switch off their OneHome drip in Matrix, and send no more mail."
            : "Send no more mail while it's listed.")
        + " It's listed with another brokerage, so don't contact them about selling until it comes off the market.",
      "",
      "Household:  " + (rows[0].names || ""),
      mls(l) ? "MLS number: " + mls(l) + "   (search it in Matrix, then open History for earlier listings)" : null,
      "Status:     " + l.status,
      "List price: " + money(l.list_price),
      "Listed by:  " + (l.list_office_name || ""),
      l.days_on_market != null ? "On market:  " + l.days_on_market + " days" : null,
      "",
      "What you'd sent them:\n" + describe(rows)
    ].filter((x) => x !== null).join("\n");

    out.push({ subject, body });
    if (!dry) {
      await send(env, subject, body);
      await mark(env, key);
    }
  }
}

async function daily(env, hist, out, dry) {
  const today = (new Date()).toISOString().slice(0, 10);
  const since = new Date(Date.now() - 26 * 36e5).toISOString();
  const { results: all } = await env.DB.prepare(
    "SELECT id, received_at, address, territory_id, homeowner_note FROM leads " +
    "WHERE address NOT LIKE '$%' ORDER BY id"
  ).all();

  const by = {};
  for (const r of all || []) {
    const p = parse(r.address);
    if (OWN.has(p.key)) continue;
    (by[p.key] = by[p.key] || { addr: r.address, rows: [] }).rows.push(r);
  }

  const third = [];
  for (const k in by) {
    const v = by[k];
    if (v.rows.length < 3) continue;
    if (await logged(env, "third:" + k)) continue;
    const mailed = hist[k];
    third.push("  " + nice(String(v.addr).split(",")[0]) + ": " + v.rows.length + " lookups, latest "
      + eastern(v.rows[v.rows.length - 1].received_at)
      + (mailed ? "\n     You've sent them:\n" + describe(mailed).replace(/^/gm, "   ")
                : "\n     You haven't mailed them."));
    if (!dry) await mark(env, "third:" + k);
  }

  const answered = [];
  const { results: pages } = await env.DB.prepare("SELECT address, views, last_view FROM expired_pages").all();
  for (const k in hist) {
    const sent = hist[k].filter((r) => r.sent_on);
    if (!sent.length) continue;
    const firstSent = sent.map((r) => r.sent_on).sort()[0];
    const key = "resp:" + k + ":" + today;
    if (await logged(env, key)) continue;
    const hits = (by[k] ? by[k].rows : []).filter((r) => r.received_at > since && r.received_at >= firstSent);
    const pg = (pages || []).find((p) => parse(p.address).key === k && p.last_view
                                      && String(p.last_view).replace(" ", "T") > since);
    if (!hits.length && !pg) continue;
    answered.push("  " + (hist[k][0].names || "") + ", " + nice(hist[k][0].address)
      + (pg ? ": opened their page (" + pg.views + " views so far)" : "")
      + (hits.length ? (pg ? " and" : ":") + " looked up their home" : "")
      + "\n     You've sent them:\n" + describe(hist[k]).replace(/^/gm, "   "));
    if (!dry) await mark(env, key);
  }

  if (!third.length && !answered.length) return;

  const src = {};
  for (const r of all || []) {
    if (r.received_at <= since) continue;
    if (OWN.has(parse(r.address).key)) continue;
    const m = /CAME FROM (.*?) ON /.exec(r.homeowner_note || "");
    /* ★ "personal home page" is tested before "home page", because the personal
       address pages carry a territory string that contains both and were being
       counted as the site's front page. */
    const s = m ? m[1]
            : /PERSONAL HOME PAGE/i.test(r.territory_id || "") ? "a personal address page"
            : /HOME PAGE/i.test(r.territory_id || "")          ? "the home page"
            :                                                    "a community page";
    src[s] = (src[s] || 0) + 1;
  }
  const total = Object.values(src).reduce((a, b) => a + b, 0);
  const line = total
    ? "Last 24 hours: " + total + " lookups. "
      + Object.entries(src).sort((a, b) => b[1] - a[1]).map(([s, n]) => s + " " + n).join(", ") + "."
    : "Last 24 hours: no lookups.";

  const parts = [];
  if (third.length)    parts.push("CAME BACK A THIRD TIME\n" + third.join("\n\n"));
  if (answered.length) parts.push("ANSWERED YOUR MAIL\n" + answered.join("\n\n"));
  parts.push(line, "All leads: " + VAULT);

  const subject = "FHV daily: " + [
    third.length ? third.length + " came back" : "",
    answered.length ? answered.length + " answered your mail" : ""
  ].filter(Boolean).join(", ");

  out.push({ subject, body: parts.join("\n\n") });
  if (!dry) await send(env, subject, parts.join("\n\n"));
}

async function run(env, mode, dry) {
  await seed(env);
  const out = [];
  const hist = await history(env);
  if (mode !== "daily") {
    await actionNeeded(env, hist, out, dry);
    await nowListed(env, hist, out, dry);
  }
  if (mode !== "fast") await daily(env, hist, out, dry);
  return out;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, event.cron === "0 11 * * *" ? "daily" : "fast", false));
  },

  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.searchParams.get("key") !== env.RUN_KEY) return new Response("Not found", { status: 404 });
    if (u.searchParams.get("what") === "test") {
      await send(env, "FHV alerts test", "If you can read this, the alerts can reach you.");
      return new Response("A test email is on its way to " + TO);
    }
    const out = await run(env, "all", true);
    const text = out.length
      ? out.map((m) => "SUBJECT: " + m.subject + "\n\n" + m.body).join("\n\n\n")
      : "Nothing to report right now.";
    return new Response("PREVIEW ONLY. Nothing was sent.\n\n" + text,
      { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};
