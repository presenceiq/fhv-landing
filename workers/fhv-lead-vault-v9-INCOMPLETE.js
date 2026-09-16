/**
 * FHV Lead Vault — Worker (store + notify + leads page)
 * Routes:
 *   POST /          -> store a lead in D1, then notify agent by email
 *   GET  /          -> health check ("lead vault is running")
 *   GET  /leads     -> password-protected HTML page listing all leads (the "faucet")
 *
 * Store-first always: a lead is saved BEFORE any notification. Email failure is non-fatal.
 *
 * 2026-07-08: homeowner feedback ("Does this look right?") now stored in real columns,
 * surfaced at the top of the notification email, and shown on the leads page.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // ---- ISSUE REPORT (email-only, no D1; separate path so it can never touch lead capture) ----
    if (request.method === "POST" && url.pathname === "/report-issue") {
      let report;
      try { report = await request.json(); }
      catch (_e) { return json({ ok: false, error: "Invalid JSON" }, 400, cors); }
      try {
        await notifyIssue(env, report);
        return json({ ok: true }, 200, cors);
      } catch (e) {
        return json({ ok: false, error: "notify_failed", detail: String(e) }, 500, cors);
      }
    }

    // ---- LEADS PAGE (the human-friendly faucet) ----
    if (request.method === "GET" && url.pathname === "/leads") {
      return leadsPage(request, env, url);
    }

    /* ★★ EXPIRED LISTING PAGES, served from D1.
       One row per property. Adding a property is one INSERT, not a deploy, so the
       four valuation subdomains are never touched and cannot be wiped by a zip.
       Updating comps when another home sells is one UPDATE.
       The URL leads with the house number (19889-cf65) so a QR code on the wrong
       letter is visible to the eye instead of hidden in random characters.
       noindex, unguessable, and every view is logged and emailed. */
    if (url.pathname.startsWith("/x/")) {
      const code = decodeURIComponent(url.pathname.slice(3).replace(/\/+$/, ""));
      if (!code) return htmlResponse(notFoundHtml(), 404);

      /* The email signup posts back to this same URL with ?notify=. Kept on the
         page's own route so nothing else has to know these pages exist. */
      const notifyEmail = url.searchParams.get("notify");
      if (request.method === "POST" && notifyEmail) {
        try {
          const r2 = await env.DB.prepare(`SELECT * FROM expired_pages WHERE code = ?`).bind(code).first();
          if (r2) {
            const now = new Date().toISOString();
            await env.DB.prepare(
              `INSERT INTO leads (received_at, territory_id, name, email, phone, address,
                                  property_type, floorplan, estimated_value, view, features,
                                  insight, wants, homeowner_assessment, homeowner_note, raw_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(now, r2.community + " - expired page", "", notifyEmail.slice(0,160), "", r2.address,
                   "", "", "", "", "", "",
                   "WANTS STREET ALERTS - gave email on the expired page", "", "",
                   JSON.stringify({ source: "expired_page_notify", code: code })).run();
            await notifyEmailSignup(env, r2, notifyEmail, now);
          }
        } catch (e) {}
        return json({ ok: true }, 200, cors);
      }
      let row = null;
      try {
        row = await env.DB.prepare(`SELECT * FROM expired_pages WHERE code = ?`).bind(code).first();
      } catch (e) { /* fall through to 404 */ }
      if (!row) return htmlResponse(notFoundHtml(), 404);

      /* Log the view. Fires even if the visitor touches nothing, which is the
         whole point: the scan itself is the signal. */
      const nowIso = new Date().toISOString();
      await (async () => {
        try {
          await env.DB.prepare(
            `UPDATE expired_pages SET views = COALESCE(views,0) + 1, last_view = ? WHERE code = ?`
          ).bind(nowIso, code).run();
          await env.DB.prepare(
            `INSERT INTO leads (received_at, territory_id, name, email, phone, address,
                                property_type, floorplan, estimated_value, view, features,
                                insight, wants, homeowner_assessment, homeowner_note, raw_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(nowIso, row.community + " - expired page", "", "", "", row.address,
                 "", "", "", "", "", "", "Expired listing page opened", "", "",
                 JSON.stringify({ source: "expired_page", code: code })).run();
          await notifyExpiredView(env, row, code, nowIso);
        } catch (e) {}
      })();

      return new Response(expiredPageHtml(row), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow"
        }
      });
    }

    /* ★ ONE-CLICK "I HAVE WRITTEN TO THIS ONE".
       The link sits in the notification email. Michael mails someone, clicks it,
       and the lead is marked. No page to visit, no form, no SQL.
       Why this matters: the average lead needs 5 to 12 touches and most agents
       stop after 2 or 3. Without a record of who has been contacted he will write
       one letter and lose track. The DATABASE remembers, because Claude cannot. */
    if (url.pathname === "/mark") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("k");
      if (!id || key !== env.LEADS_PASSWORD) {
        return htmlResponse(`<p style="font:16px system-ui;padding:2rem;">Link not valid.</p>`, 401, cors);
      }
      const note  = (url.searchParams.get("note")  || "").slice(0, 300);
      const owner = (url.searchParams.get("owner") || "").slice(0, 160);
      const saved = url.searchParams.has("owner") || url.searchParams.has("note");
      const now = new Date().toISOString();
      try {
        /* NULLIF/COALESCE so an empty box never wipes a name already saved. */
        await env.DB.prepare(
          `UPDATE leads SET contacted = 1,
                            contacted_at = COALESCE(contacted_at, ?),
                            notes = COALESCE(NULLIF(?,''), notes),
                            name  = COALESCE(NULLIF(?,''), name)
             WHERE id = ?`
        ).bind(now, note, owner, id).run();
        const row = await env.DB.prepare(
          `SELECT address, subdivision, contacted_at, name, notes FROM leads WHERE id = ?`).bind(id).first();
        /* ★ The owner name box.
           The county holds the owner name; the database does not, and loading
           all 5,427 of them would mean publishing a homeowner list or an hour of
           pasting SQL. Neither is worth it. Instead: Michael clicks the parcel
           link, sees the name on the county page, and types it here once. Only
           the names that matter get stored, and they stick. */
        return htmlResponse(`<div style="font:16px/1.6 system-ui;padding:2.5rem;max-width:520px;margin:0 auto;text-align:center;">
          <div style="font-size:44px;">&#10003;</div>
          <h2 style="font-weight:600;margin:.4rem 0 1rem;">Marked as contacted</h2>
          <p style="font-size:17px;"><strong>${esc((row && row.address) || ("lead #" + id))}</strong></p>
          <p style="color:#666;margin-bottom:2rem;">${esc((row && row.subdivision) || "")}</p>

          <div style="border-top:1px solid #e5e0d8;padding-top:1.5rem;text-align:left;">
            <label style="display:block;font-weight:600;margin-bottom:.4rem;">Owner name, if you looked it up</label>
            <p style="color:#777;font-size:13.5px;margin:0 0 .7rem;">Optional. Saves you looking it up again next time.</p>
            <form method="GET" action="/mark">
              <input type="hidden" name="id" value="${esc(id)}">
              <input type="hidden" name="k" value="${esc(key)}">
              <input name="owner" placeholder="e.g. Donald and Susan Wawrzyniak"
                     value="${esc((row && row.name) || "")}"
                     style="width:100%;padding:12px;border:1px solid #d8d2c8;border-radius:9px;font-size:16px;box-sizing:border-box;">
              <input name="note" placeholder="Note, optional. e.g. letter mailed"
                     value="${esc((row && row.notes) || "")}"
                     style="width:100%;padding:12px;border:1px solid #d8d2c8;border-radius:9px;font-size:16px;margin-top:.6rem;box-sizing:border-box;">
              <button type="submit" style="width:100%;margin-top:.9rem;padding:13px;border:0;border-radius:9px;background:#b8722a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">Save</button>
            </form>
            ${saved ? '<p style="color:#2e7d32;font-weight:600;margin-top:1rem;">Saved.</p>' : ''}
          </div>

          <p style="color:#999;font-size:13.5px;margin-top:1.8rem;">You can close this.</p>
        </div>`, 200, cors);
      } catch (err) {
        return htmlResponse(`<p style="font:16px system-ui;padding:2rem;">Could not update: ${esc(String(err))}</p>`, 500, cors);
      }
    }

    // ---- health check ----
    if (request.method === "GET") {
      return json({ ok: true, status: "FHV lead vault is running. POST a lead to store it." }, 200, cors);
    }

    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, cors);

    // ---- store a lead ----
    let lead;
    try { lead = await request.json(); }
    catch (_e) { return json({ ok: false, error: "Invalid JSON" }, 400, cors); }

    const territory_id = (lead.territory_id || lead.subdivision || "unknown").toString();
    const received_at = new Date().toISOString();

    let stored_id = null;
    try {
      const result = await env.DB.prepare(
        `INSERT INTO leads (
           received_at, notify_status,
           territory_id, agent_id, agent_name, agent_email,
           name, email, phone,
           subdivision, address, property_type, floorplan, sqft, year_built,
           view, estimated_value, features, insight, wants,
           homeowner_assessment, homeowner_note,
           raw_json
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        received_at, "pending",
        territory_id, s(lead.agent_id), s(lead.agent_name), s(lead.agent_email),
        s(lead.name), s(lead.email), s(lead.phone),
        s(lead.subdivision), s(lead.address), s(lead.propertyType), s(lead.floorplan),
        s(lead.sqft), s(lead.yearBuilt), s(lead.view), s(lead.estimatedValue),
        s(lead.features), s(lead.insight), s(lead.wants),
        s(lead.homeowner_assessment), s(lead.homeowner_note),
        JSON.stringify(lead)
      ).run();
      stored_id = result.meta && result.meta.last_row_id ? result.meta.last_row_id : null;
    } catch (e) {
      return json({ ok: false, error: "store_failed", detail: String(e) }, 500, cors);
    }

    let notify_status = "sent";
    let notify_error = null;
    try {
      await notifyAgent(env, lead, territory_id, received_at, stored_id);
    } catch (e) {
      notify_status = "failed";
      notify_error = String(e);
    }

    if (stored_id != null) {
      try {
        await env.DB.prepare(`UPDATE leads SET notify_status = ?, notify_error = ? WHERE id = ?`)
          .bind(notify_status, notify_error, stored_id).run();
      } catch (_e) { /* lead is safe regardless */ }
    }

    return json({ ok: true, id: stored_id, notify: notify_status }, 200, cors);
  },
};

// ---- the leads page ----
async function leadsPage(request, env, url) {
  const pw = url.searchParams.get("pw") || "";
  const expected = env.LEADS_PASSWORD || "";

  if (!expected) {
    return htmlResponse(loginShell("Leads page is not configured yet (no password set)."), 503);
  }
  if (pw !== expected) {
    return htmlResponse(loginShell(pw ? "Wrong password. Try again." : ""), pw ? 401 : 200);
  }

  const territory = url.searchParams.get("territory") || "";

  let rows = [];
  try {
    let q;
    if (territory) {
      q = env.DB.prepare(
        "SELECT id, received_at, territory_id, name, email, phone, address, property_type, floorplan, estimated_value, view, features, insight, wants, homeowner_assessment, homeowner_note, notify_status, contacted, contacted_at, notes, raw_json FROM leads WHERE territory_id = ? ORDER BY id DESC LIMIT 500"
      ).bind(territory);
    } else {
      q = env.DB.prepare(
        "SELECT id, received_at, territory_id, name, email, phone, address, property_type, floorplan, estimated_value, view, features, insight, wants, homeowner_assessment, homeowner_note, notify_status, contacted, contacted_at, notes, raw_json FROM leads ORDER BY id DESC LIMIT 500"
      );
    }
    const res = await q.all();
    rows = res.results || [];
  } catch (e) {
    return htmlResponse(loginShell("Error loading leads: " + esc(String(e))), 500);
  }

  return htmlResponse(leadsHtml(rows, pw, territory), 200);
}

function leadsHtml(rows, pw, territory) {
  const total = rows.length;
  const failed = rows.filter(r => r.notify_status === "failed").length;
  const terrs = Array.from(new Set(rows.map(r => r.territory_id))).sort();

  const rowsHtml = rows.map(r => {
    const flagged = r.notify_status === "failed";
    const when = (r.received_at || "").replace("T", " ").replace(/\..*$/, "") + " UTC";
    const saysLow = r.homeowner_assessment && String(r.homeowner_assessment).toLowerCase().indexOf("low") >= 0;
    return `<tr${flagged ? ' style="background:#fff4f4;"' : ''}>
      <td class="muted">${esc(r.id)}</td>
      <td>${esc(when)}</td>
      <td><span class="terr">${esc(r.territory_id)}</span></td>
      <td><strong>${esc(r.name || "—")}</strong></td>
      <td>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : "—"}</td>
      <td>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : "—"}</td>
      <td>${esc(r.address || "—")}${(function(){
          try {
            const rj = r.raw_json ? JSON.parse(r.raw_json) : null;
            const pid = rj && rj.parcel_id ? String(rj.parcel_id).trim() : "";
            return pid ? `<br><a href="https://www.sarasotapropertyappraiser.gov/propertysearch/parcel/details/${esc(pid)}" target="_blank" rel="noopener" style="font-size:12px;">owner name &rarr;</a>` : "";
          } catch (e) { return ""; }
        })()}</td>
      <td>${esc(r.property_type || "")} ${esc(r.floorplan || "")}</td>
      <td>${esc(r.estimated_value || "—")}</td>
      <td>${esc(r.wants || "")}${r.insight ? `<br><span class="muted">${esc(r.insight)}</span>` : ""}</td>
      <td>${r.homeowner_assessment ? `<strong${saysLow ? ' style="color:#b8722a;"' : ''}>${esc(r.homeowner_assessment)}</strong>` : '<span class="muted">—</span>'}${r.homeowner_note ? `<br><span class="muted">${esc(r.homeowner_note)}</span>` : ""}</td>
        <td>${r.contacted ? `<span style="color:#2e7d32;font-weight:700;">&#10003;</span> <span class="muted">${esc((r.contacted_at||"").slice(0,10))}</span>${r.notes ? `<br><span class="muted">${esc(r.notes)}</span>` : ""}` : `<a href="/mark?id=${esc(r.id)}&k=${encodeURIComponent(pw)}" style="font-size:12px;">mark written</a>`}</td>
      <td>${flagged ? '<span class="badge-fail">email failed</span>' : '<span class="badge-ok">sent</span>'}</td>
    </tr>`;
  }).join("");

  const filterLinks = ['<a href="/leads?pw=' + encodeURIComponent(pw) + '"' + (territory ? '' : ' class="on"') + '>All</a>']
    .concat(terrs.map(t => '<a href="/leads?pw=' + encodeURIComponent(pw) + '&territory=' + encodeURIComponent(t) + '"' + (territory === t ? ' class="on"' : '') + '>' + esc(t) + '</a>'))
    .join(" ");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>FHV Leads</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f6f7f9;color:#1a1a1a;}
    .wrap{max-width:1280px;margin:0 auto;padding:20px;}
    h1{font-size:20px;margin:0 0 4px;}
    .sub{color:#666;font-size:13px;margin-bottom:16px;}
    .stats{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;}
    .stat{background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:10px 16px;}
    .stat b{font-size:22px;display:block;}
    .stat span{font-size:12px;color:#666;}
    .filter{margin-bottom:12px;font-size:13px;}
    .filter a{display:inline-block;padding:5px 12px;margin-right:6px;border:1px solid #d3d7dc;border-radius:20px;text-decoration:none;color:#333;background:#fff;}
    .filter a.on{background:#1a5fb4;color:#fff;border-color:#1a5fb4;}
    .tablewrap{background:#fff;border:1px solid #e3e6ea;border-radius:10px;overflow:auto;}
    table{border-collapse:collapse;width:100%;font-size:13px;}
    th,td{text-align:left;padding:9px 11px;border-bottom:1px solid #eef0f2;vertical-align:top;white-space:nowrap;}
    th{background:#fafbfc;position:sticky;top:0;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#666;}
    td{white-space:normal;}
    .muted{color:#999;font-size:12px;}
    .terr{background:#eef3fb;color:#1a5fb4;padding:2px 8px;border-radius:6px;font-size:12px;}
    .badge-ok{color:#2a7a2a;font-size:12px;}
    .badge-fail{background:#d33;color:#fff;padding:2px 7px;border-radius:6px;font-size:11px;}
    .empty{padding:40px;text-align:center;color:#999;}
  </style></head><body><div class="wrap">
    <h1>Florida Home Value — Leads</h1>
    <div class="sub">Newest first. Rows highlighted red = the notification email failed (follow up directly). "Homeowner says" in gold = they think the estimate is low — call them first.</div>
    <div class="stats">
      <div class="stat"><b>${total}</b><span>leads shown</span></div>
      <div class="stat"><b>${rows.filter(r => !r.contacted).length}</b><span>not written to</span></div>
      <div class="stat"><b>${failed}</b><span>email failed</span></div>
      <div class="stat"><b>${terrs.length}</b><span>territories</span></div>
    </div>
    <div class="filter">${filterLinks}</div>
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>#</th><th>Received</th><th>Territory</th><th>Name</th><th>Email</th><th>Phone</th>
          <th>Address</th><th>Type/Plan</th><th>Estimate</th><th>Wants / Insight</th><th>Homeowner says</th><th>Written to</th><th>Notify</th>
        </tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="13" class="empty">No leads yet.</td></tr>'}</tbody>
      </table>
    </div>
  </div></body></html>`;
}

function loginShell(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>FHV Leads — Sign in</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
    .card{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:30px;max-width:340px;width:90%;}
    h1{font-size:18px;margin:0 0 6px;}
    p{color:#666;font-size:13px;margin:0 0 16px;}
    input{width:100%;padding:11px;border:1px solid #ccd;border-radius:8px;font-size:15px;box-sizing:border-box;margin-bottom:10px;}
    button{width:100%;padding:11px;background:#1a5fb4;color:#fff;border:0;border-radius:8px;font-size:15px;cursor:pointer;}
    .err{color:#d33;font-size:13px;margin-bottom:10px;}
  </style></head><body>
    <form class="card" method="GET" action="/leads">
      <h1>FHV Leads</h1>
      <p>Enter your password to view leads.</p>
      ${message ? '<div class="err">' + esc(message) + '</div>' : ''}
      <div style="position:relative;">
        <input id="pwfield" type="password" name="pw" placeholder="Password" autofocus style="margin-bottom:0;padding-right:44px;">
        <button type="button" id="eye" onclick="var f=document.getElementById('pwfield');f.type=f.type==='password'?'text':'password';this.textContent=f.type==='password'?'show':'hide';" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:auto;background:none;color:#1a5fb4;border:0;font-size:12px;cursor:pointer;padding:6px;">show</button>
      </div>
      <button type="submit" style="margin-top:10px;">View Leads</button>
    </form>
  </body></html>`;
}

async function notifyAgent(env, lead, territory_id, received_at, leadId) {
  const to = (lead.agent_email && String(lead.agent_email).trim()) || env.FALLBACK_TO;
  if (!to) throw new Error("no recipient");
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const assess = (lead.homeowner_assessment && String(lead.homeowner_assessment).trim()) || "";
  const hnote  = (lead.homeowner_note && String(lead.homeowner_note).trim()) || "";
  const saysLow = assess && assess.toLowerCase().indexOf("low") >= 0;

  const addr = (lead.address && String(lead.address).trim()) || "";
  const area = lead.subdivision || territory_id || "";
  const hasContact = !!(lead.name || lead.email || lead.phone);

  /* ★ THE SUBJECT LINE CARRIES THE ADDRESS.
     It used to read "New Talon Preserve lead — Homeowner", which says nothing.
     Michael received twelve of these between 12 and 17 August and acted on none,
     because every one opened with three blank lines — name, email and phone all
     "(not provided)" — and closed with "no contact given yet". They read as
     non-events. They were not: each is somebody in his farm who looked up their
     own home, and the ADDRESS is the product. He can mail them.
     The address now appears where he can see it without opening anything. */
  const subject = saysLow
    ? `HOT — ${area}: ${addr || "lookup"} says value is LOW`
    : hasContact
      ? `${area} enquiry — ${lead.name || "no name"} — ${addr || "no address"}`
      : `${area} lookup — ${addr || "no address given"}`;

  const lines = [];

  if (assess) {
    lines.push(`*** THE HOMEOWNER SAYS THE ESTIMATE IS ${assess.toUpperCase()} ***`);
    if (hnote) lines.push(`In their words: "${hnote}"`);
    lines.push(``);
  }

  /* Address first, because on most of these it is the only thing there is. */
  lines.push(
    `ADDRESS   ${addr || "(none given)"}`,
    `COMMUNITY ${area}`,
    `WHEN      ${received_at}`,
    ``
  );

  /* ★ ONE-CLICK LINK TO THE COUNTY PARCEL PAGE.
     The page sends the Sarasota County account number along with the address,
     taken from addresses.js. That page carries the OWNER NAME, which is the one
     thing an anonymous lookup does not give you and the thing needed to write to
     them. Without this Michael was searching sc-pa.com by hand every time. */
  const parcel = (lead.parcel_id && String(lead.parcel_id).trim()) || "";
  if (parcel) {
    lines.push(
      `OWNER NAME AND FULL RECORD, one click:`,
      /* ★ Angle brackets terminate a bare URL in plain text. Without them mail
         clients ran the following word into the link, producing a dead
         ".../0162110233No" that went nowhere. */
      `<https://www.sarasotapropertyappraiser.gov/propertysearch/parcel/details/${parcel}>`,
      ``
    );
  }

  if (hasContact) {
    lines.push(
      `--- THEY LEFT CONTACT DETAILS. CALL THEM. ---`,
      `Name   ${lead.name || "(not given)"}`,
      `Phone  ${lead.phone || "(not given)"}`,
      `Email  ${lead.email || "(not given)"}`,
      `Wants  ${lead.wants || ""}`,
      ``
    );
  } else {
    lines.push(
      `No contact details. This is an anonymous lookup, which is how the tool is`,
      `built — no gate. The address is the product: it tells you where they live.`,
      ``
    );
  }

  /* Only print property fields that actually have something in them. */
  const detail = [
    ["Type",     [lead.propertyType, lead.floorplan].filter(Boolean).join(" ")],
    ["Size",     lead.sqft ? lead.sqft + " sqft" : ""],
    ["Built",    lead.yearBuilt],
    ["View",     lead.view],
    ["Estimate", lead.estimatedValue],
    ["Features", lead.features],
    ["Insight",  lead.insight],
  ].filter(function (r) { return r[1] && String(r[1]).trim(); });

  if (detail.length) {
    lines.push(`--- what they told the tool ---`);
    detail.forEach(function (r) { lines.push(`${r[0].padEnd(9)} ${r[1]}`); });
    lines.push(``);
  }

  lines.push(`Territory ${territory_id}`);

  /* ★ The one-click "written to this one" link. Needs the row id, which the
     caller passes in. Without an id the link is simply omitted. */
  if (leadId && env.LEADS_PASSWORD) {
    lines.push(
      ``,
      `----------------------------------------`,
      `AFTER YOU WRITE TO THEM, CLICK THIS:`,
      `<https://fhv-lead-vault.cleirshusband.workers.dev/mark?id=${leadId}&k=${encodeURIComponent(env.LEADS_PASSWORD)}>`,
      ``,
      ``
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.NOTIFY_FROM || "onboarding@resend.dev",
      to: [to],
      subject,
      text: lines.join("\n"),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(function () { return ""; });
    throw new Error(`notify HTTP ${res.status} ${t}`);
  }
}

// ---- issue report email (email-only; address captured for personal inspection) ----
async function notifyIssue(env, report) {
  const to = env.ISSUE_TO || env.FALLBACK_TO || "michael@putnamrealtygroup.com";
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const territory = s(report.territory_id) || s(report.subdivision) || "unknown";
  const address = s(report.address) || "(not provided)";
  let cats = report.categories;
  if (Array.isArray(cats)) cats = cats.filter(Boolean).join(", ");
  cats = s(cats) || "(none selected)";
  const note = s(report.note) || "(none)";
  const replyEmail = s(report.reply_email) || "(not provided)";
  const est = s(report.estimatedValue) || "";
  const ptype = s(report.propertyType) || "";
  const when = new Date().toISOString();

  const subject = `[FHV ISSUE] ${territory} — ${address}`;
  const lines = [
    `An issue was reported from the ${territory} tool.`,
    `Received: ${when}`,
    ``,
    `ADDRESS:       ${address}`,
    `Issue type(s): ${cats}`,
    ``,
    `Their note: ${note}`,
    ``,
    `Reply email (optional): ${replyEmail}`,
    ``,
    `--- context at time of report ---`,
    `Territory:      ${territory}`,
    `Type:           ${ptype}`,
    `Estimate shown: ${est}`,
  ];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.NOTIFY_FROM || "onboarding@resend.dev",
      to: [to],
      subject,
      text: lines.join("\n"),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`issue notify HTTP ${res.status} ${t}`);
  }
}

function s(v) { return v == null ? null : String(v); }
/* ────────────────────────────────────────────────────────────────
   EXPIRED LISTING PAGE RENDERER
   Everything variable lives in the D1 row. This function is the template.
   ──────────────────────────────────────────────────────────────── */
const MP_HEADSHOT = "data:image/jpeg;base64,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";

function notFoundHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>Not found</title>
  <style>body{font:17px/1.7 -apple-system,system-ui,sans-serif;background:#faf7f2;color:#1a1814;
  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center;}
  a{color:#b8722a;}</style></head><body><div>
  <p style="font-size:1.3rem;margin:0 0 .6rem;">This page is not here.</p>
  <p style="color:#4a4640;">The link may have a typo, or it may have been retired.<br>
  <a href="https://floridahomevalueai.com">floridahomevalueai.com</a></p>
  </div></body></html>`;
}

function expiredPageHtml(r) {
  const comps = (() => { try { return JSON.parse(r.comps_json || "[]"); } catch (e) { return []; } })();
  const notes = (() => { try { return JSON.parse(r.notes_json || "[]"); } catch (e) { return []; } })();
  const money = n => "$" + Number(n).toLocaleString("en-US");

  const rows = comps.map(c => `
        <tr>
          <td><span class="addr">${esc(c.address)}</span>${c.note ? `<span class="note">${esc(c.note)}</span>` : ""}</td>
          <td>${esc(c.sold || "")}</td><td class="r price">${money(c.price)}</td>
        </tr>`).join("");

  const noteBlocks = notes.map(n =>
    `<p><strong>${esc(n.title)}</strong> ${esc(n.body)}</p>`).join("\n    ");

  const firstName = (r.address || "").split(" ")[0];
  const street = (r.address || "").split(" ").slice(1).join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(r.address)} | Recorded Sales | Putnam Realty Group</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Playfair+Display:wght@600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--cream:#faf7f2;--warm:#f4f0e8;--gold:#b8722a;--ink:#1a1814;--ink-mid:#4a4640;
--ink-faint:#6b655e;--border:#e8e2d8;--surface:#ffffff;--sage:#4a7c59;--radius:14px;--radius-sm:10px;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
.wrap{max-width:760px;margin:0 auto;padding:0 1.25rem;}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:1.4rem 0;}
.brand{font-family:'Playfair Display',serif;font-size:1.25rem;font-weight:600;}
.brand span{color:var(--gold);}
.sub{font-size:13.5px;color:var(--ink-mid);margin-top:.15rem;}
.hero{padding:2.6rem 0 1.6rem;}
.eyebrow{font-family:'DM Mono',monospace;font-size:12.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--gold);font-weight:500;}
h1{font-family:'Playfair Display',serif;font-size:2.1rem;line-height:1.2;margin:.5rem 0 .35rem;}
.facts{font-size:15.5px;color:var(--ink-mid);font-family:'DM Mono',monospace;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.6rem;margin:1.6rem 0;}
h2{font-family:'Playfair Display',serif;font-size:1.35rem;margin-bottom:.5rem;}
.rule{font-size:14.5px;color:var(--ink-mid);background:var(--warm);border-left:3px solid var(--gold);
padding:.85rem 1rem;border-radius:0 var(--radius-sm) var(--radius-sm) 0;margin:.9rem 0 1.3rem;}
table{width:100%;border-collapse:collapse;font-size:16px;}
th{text-align:left;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.06em;
text-transform:uppercase;color:var(--ink-mid);font-weight:500;padding:0 .5rem .55rem 0;border-bottom:1px solid var(--border);}
th.r,td.r{text-align:right;padding-right:0;}
td{padding:.7rem .5rem;border-bottom:1px solid var(--border);vertical-align:top;}
tr:last-child td{border-bottom:none;}
.addr{font-weight:700;}
.note{display:block;font-size:14px;color:var(--ink-mid);line-height:1.5;margin-top:.1rem;}
.price{font-family:'DM Mono',monospace;font-weight:500;white-space:nowrap;}
.range{background:var(--warm);border-radius:var(--radius-sm);padding:1.15rem 1.3rem;margin-top:1.3rem;text-align:center;}
.range .n{font-family:'Playfair Display',serif;font-size:1.75rem;}
.range .l{font-size:14px;color:var(--ink-mid);}
p{margin-bottom:1rem;} p:last-child{margin-bottom:0;}
.cta{background:var(--ink);color:var(--cream);border-radius:var(--radius);padding:1.8rem;margin:1.8rem 0;text-align:center;}
.cta h2{color:var(--cream);} .cta p{font-size:16px;color:#d8d2c8;}
.btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;font-weight:700;
padding:.85rem 1.5rem;border-radius:var(--radius-sm);margin:.35rem .3rem 0;font-size:16px;}
.btn.alt{background:transparent;border:1px solid #6b655e;color:var(--cream);}
footer{border-top:1px solid var(--border);padding:1.8rem 0 2.6rem;font-size:14px;color:var(--ink-mid);}
footer strong{color:var(--ink);}
.src{font-size:13.5px;color:var(--ink-mid);margin-top:1rem;line-height:1.65;}
@media(max-width:560px){
 h1{font-size:1.7rem;} body{font-size:17px;}
 table,thead,tbody,tr,td{display:block;width:100%;} thead{display:none;}
 tr{border-bottom:1px solid var(--border);padding:.8rem 0;} tr:last-child{border-bottom:none;}
 td{border:none;padding:.12rem 0;} td.r{text-align:left;}
 .price{font-size:17px;font-weight:500;}
}
</style>
<script>
window.rprAvmWidgetOptions = {
  Token: "B7078914-3207-44B1-A650-21ECA3E39AB7",
  Query: (new URLSearchParams(location.search).get("addr") || ${JSON.stringify(r.rpr_query || r.address)}),
  CoBrandCode: "btsputnamrealtygroup",
  ContainerSelector: "#rpr-avm-widget",
  ShowRprLinks: false
};
</script>
<script src="https://www.narrpr.com/widgets/avm-widget/widget.ashx/script"></script>
</head>
<body>

<header><div class="wrap">
  <div class="brand">Florida Home <span>Value AI</span></div>
  <div class="sub">Putnam Realty Group &middot; Sarasota County public records</div>
</div></header>

<div class="wrap">

  <div class="hero">
    <div class="eyebrow">Prepared for one address</div>
    <h1>${esc(r.address)}</h1>
    <div class="facts">${esc(r.subhead || "")}</div>
    ${r.entrance_img ? `<img src="${esc(r.entrance_img)}" alt="${esc(r.community)} community entrance"
      style="width:100%;height:auto;
      border-radius:var(--radius);margin-top:1.3rem;display:block;">` : ""}
  </div>

  <div class="card">
    <h2>${esc(r.intro || "What sold on your street")}</h2>
    <div class="rule">Every home below is the same floor plan and size, on your street, sold in the last six
    months. Recorded sale prices from Sarasota County, not estimates. No builder sales. Nothing selected by hand.</div>
    <table>
      <thead><tr><th>Address</th><th>Sold</th><th class="r">Price</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${(r.range_low && r.range_high) ? `<div class="range">
      <div class="n">${money(r.range_low)} &ndash; ${money(r.range_high)}</div>
      <div class="l">${comps.length} sales, same floor plan, same street, past six months</div>
    </div>` : ""}
  </div>

  ${notes.length ? `<div class="card"><h2>Two things worth knowing</h2>
    ${noteBlocks}
  </div>` : ""}

  <div class="card" id="rpr">
    <h2>A second opinion, not mine</h2>
    <p>Below is an independent estimate for this address from RPR, which is run by the National Association
    of Realtors. It uses a different method to mine, and it can see things county records cannot.</p>
    <div id="rpr-avm-widget" style="margin-top:1.2rem;"></div>
    <p class="src">Where the two agree, that is worth something. Where they disagree, that gap is usually
    condition, upgrades or view, and it is the part no automated number can settle.</p>

    <div style="margin-top:1.4rem;padding-top:1.2rem;border-top:1px solid var(--border);">
      <p style="font-size:15.5px;color:var(--ink-mid);margin-bottom:.7rem;">Want to look up a different
      address? Type it here. The recorded sales above stay as they are, because those are the ones that
      match your home.</p>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
        <input id="addr" type="text" placeholder="123 Example St, Venice FL"
          style="flex:1;min-width:200px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:Lato,sans-serif;">
        <button id="addrgo" style="padding:12px 20px;border:0;border-radius:var(--radius-sm);background:var(--ink);color:#fff;font-weight:700;font-size:16px;cursor:pointer;">Look it up</button>
      </div>
      <p id="addrback" style="display:none;font-size:15px;margin-top:.8rem;">
        <a href="." style="color:var(--gold);font-weight:700;">&larr; Back to ${esc(r.address)}</a></p>
    </div>
  </div>

  <div class="cta">
    <h2>What the county records cannot see</h2>
    <p>County records carry square footage, bedrooms, bathrooms, year built and whether there is a pool.
    That is the whole list. They do not show whether your kitchen has been redone, what the floors are, how
    old the roof and air handler are, whether the lanai is extended or enclosed, or whether you have storm
    shutters. On this street those are exactly the things that separated the bottom of that range from the top.</p>
    <p>If you want a number that accounts for them, that takes twenty minutes and someone standing in the
    house. No charge and no obligation either way.</p>
    <a class="btn" href="tel:9416629941">Call 941-662-9941</a>
    <a class="btn alt" href="sms:9416629941?&body=${encodeURIComponent("About " + r.address)}">Text me instead</a>
  </div>

  ${r.community_url ? `<div class="card">
    <h2>The rest of ${esc(r.community)}</h2>
    <p>The same county records cover the whole community, not just your street.</p>
    <p style="margin-top:.9rem;">
      <a href="${esc(r.community_url)}" style="color:var(--gold);font-weight:700;">${esc(r.community)} home values &rarr;</a>
    </p>
    <div style="display:flex;align-items:center;gap:.95rem;margin-top:1.6rem;padding-top:1.4rem;border-top:1px solid var(--border);">
      <img src="${MP_HEADSHOT}" alt="Michael Putnam"
           style="width:76px;height:76px;border-radius:50%;object-fit:cover;flex:none;display:block;">
      <div style="font-size:16px;color:var(--ink-mid);line-height:1.55;">
        And if you are wondering who is sending you this, that is here too.<br>
        <a href="https://floridahomevalueai.com/about" style="color:var(--gold);font-weight:700;">About Michael Putnam &rarr;</a>
      </div>
    </div>
  </div>` : ""}

  <div class="card">
    <h2>Know what happens on ${esc(street)} before anyone else</h2>
    <p>Leave your email and I will tell you when anything happens on your street. A home goes on the market,
    a price gets cut, something goes under contract, something closes and for how much.</p>
    <p>Most of that never reaches you until it is over. This gets it to you while it still matters.</p>
    <p style="font-size:15px;color:var(--ink-mid);">Your address is never sold, shared or given to anyone.
    I use it for this one thing. Every email has an unsubscribe link at the bottom, or reply with the word
    stop and I will remove you the same day.</p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem;">
      <input id="em" type="email" placeholder="your email" style="flex:1;min-width:200px;padding:13px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:Lato,sans-serif;">
      <button id="go" style="padding:13px 22px;border:0;border-radius:var(--radius-sm);background:var(--gold);color:#fff;font-weight:700;font-size:16px;cursor:pointer;">Notify me</button>
    </div>
    <div id="msg" style="display:none;font-weight:700;margin-top:.8rem;"></div>
  </div>

</div>

<footer><div class="wrap">
  <strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; 941-662-9941<br>
  Sales Associate SL3220671 &middot; Broker: Brian Putnam Jr. BK3276432
  <div class="src">Sale prices are recorded transactions from Sarasota County public records, owner to owner,
  builder sales excluded. Figures are for general market awareness and are not an appraisal. Fair housing
  compliant. This page was prepared for one address and is not published or indexed.</div>
</div></footer>

<script>
(function(){
  /* the "look up another address" box: reload with ?addr= so the RPR widget,
     which uses document.write, picks it up during page load */
  var ad=document.getElementById("addr"), adgo=document.getElementById("addrgo"),
      adback=document.getElementById("addrback");
  if(ad&&adgo){
    var lookup=function(){
      var v=(ad.value||"").trim();
      if(v.length<6) return;
      location.href = location.pathname + "?addr=" + encodeURIComponent(v) + "#rpr";
    };
    adgo.onclick=lookup;
    ad.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); lookup(); } });
    var cur=new URLSearchParams(location.search).get("addr");
    if(cur && adback){ ad.value=cur; adback.style.display="block"; }
  }

  var em=document.getElementById("em"), go=document.getElementById("go"), msg=document.getElementById("msg");
  if(!em||!go) return;
  var submit=function(){
    var v=(em.value||"").trim();
    if(v.indexOf("@")<1||v.indexOf(".")<0){
      msg.style.display="block"; msg.style.color="#b8722a";
      msg.textContent="That does not look like an email address."; return;
    }
    try{
      fetch(location.pathname+"?notify="+encodeURIComponent(v),{method:"POST",keepalive:true}).catch(function(){});
    }catch(e){}
    msg.style.display="block"; msg.style.color="#4a7c59";
    msg.textContent="Done. I will email you when something happens on your street.";
    em.disabled=true; go.disabled=true; go.style.opacity=".55";
  };
  go.onclick=submit;
  em.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); submit(); } });
})();
</script>
</body>
</html>`;
}

async function notifyEmailSignup(env, row, email, when) {
  if (!env.RESEND_API_KEY) return;
  const to = env.FALLBACK_TO || env.ISSUE_TO;
  if (!to) return;
  const lines = [
    `THEY GAVE YOU AN EMAIL ADDRESS. CALL THEM.`,
    ``,
    `EMAIL     ${email}`,
    `ADDRESS   ${row.address}`,
    `COMMUNITY ${row.community}`,
    `WHEN      ${when}`,
    ``,
    `They asked to be told when anything happens on their street.`,
    `That is a warmer signal than a lookup: they scanned a letter, read the page,`,
    `and then typed something in.`,
    ``,
    `Set up the MLS alert for that street, and send the first one soon so the`,
    `promise is kept while the letter is still on the counter.`,
    ``, ``
  ];
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM, to: [to],
        subject: `EMAIL GIVEN \u2014 ${row.address}`,
        text: lines.join("\n")
      })
    });
  } catch (e) {}
}

async function notifyExpiredView(env, row, code, when) {
  if (!env.RESEND_API_KEY) return;
  const to = env.FALLBACK_TO || env.ISSUE_TO;
  if (!to) return;
  const lines = [
    `EXPIRED PAGE OPENED`,
    ``,
    `ADDRESS   ${row.address}`,
    `COMMUNITY ${row.community}`,
    `WHEN      ${when}`,
    `VIEWS     ${(row.views || 0) + 1}`,
    ``,
    `They scanned the QR code from your letter and looked at the page.`,
    `Nothing was typed. The scan itself is the signal.`,
    ``,
    `<https://fhv-lead-vault.cleirshusband.workers.dev/x/${code}>`,
    ``, ``
  ];
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM, to: [to],
        subject: `Expired page opened \u2014 ${row.address}`,
        text: lines.join("\n")
      })
    });
  } catch (e) {}
}

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", ...(headers || {}) },
  });
}
function htmlResponse(html, status) {
  return new Response(html, { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
