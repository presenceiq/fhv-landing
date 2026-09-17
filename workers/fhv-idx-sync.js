/* =============================================================================
  fhv-idx-sync — Cloudflare Worker


  WHAT IT DOES
  Replicates Stellar MLS listings from MLS Grid into the D1 database on a
  schedule, and serves them back to the website as JSON. The website never
  talks to MLS Grid; only this Worker does.


  WHY REPLICATION RATHER THAN LIVE CALLS
  MLS Grid's own Best Practices require it: pull the data down, keep it in
  sync with an incremental request, and serve from your own store. It also
  solves two other problems — the access token never reaches a browser, and
  pages can render complete HTML instead of filling in after scripts run,
  which is what a crawler needs to see.


  COMPLIANCE — Stellar MLS Participant Data Access Agreement, 18 Aug 2026
  Paragraph 5: "Salesperson Party shall use the STELLAR MLS Data obtained
  under this Agreement for IDX and VOW use only. Any other use is strictly
  prohibited." Ben Martin, Data & Technology Compliance, put it plainly:
  "Using the IDX data for valuations, analytics, automations or any use other
  than public listing display is prohibited."
  THEREFORE THIS WORKER MUST NOT CALCULATE ANYTHING FROM THE FEED. No medians,
  no averages, no counts presented as statistics, no trends, no price-per-foot.
  It stores listings and returns listings. Nothing else.


  FILTERS APPLIED BEFORE ANYTHING IS STORED
    MlgCanView false      -> record withdrawn, must be deleted, never shown
    MlgCanUse lacks IDX   -> not licensed for public display
    InternetEntireListingDisplayYN false -> seller opted out (Article 19.02)


  RATE LIMITS (MLS Grid, enforced): 2 requests/second, 7,200/hour,
  40,000/24h, 4GB/hour. Exceeding them suspends the token. This Worker paces
  requests and caps pages per run.


  MEDIA IS NOT TOUCHED. MLS Grid media URLs are signed, single-use and expire
  in an hour, and their terms forbid hot-linking. Photos would have to be
  downloaded and stored locally, which is a separate build.
  ========================================================================== */


const BASE = 'https://api.mlsgrid.com/v2';
const OSN = 'mfrmls';                 // Stellar MLS
const PAGE_SIZE = 200;
/* Cloudflare caps subrequests per invocation. Measured usage is about 3 per page
  (one fetch, one batched write, occasionally one chunked delete), so 15 pages is
  roughly 45 subrequests — inside the limit with room to spare. This was 6, which
  advanced the cursor about six weeks per run and made the initial catch-up take
  hours. A ?pages= parameter allows a smaller run if a page ever proves heavy. */
/* ★ LOWERED FROM 15. $expand=Media multiplies the size of every page — each
  listing now arrives with ~42 media records attached. 15 pages with media
  exceeds the Worker's memory. Raise only after testing. */
const MAX_PAGES_PER_RUN = 4;
/* ★ RAISED FROM 600ms after the 26 Aug API warning. MLS Grid's stated ceiling is
  2 requests per second; they warn at 4 and suspend at 6. 600ms is 1.67/sec —
  inside the limit but with no margin, and any overlap breaks it.
  1100ms is 0.9/sec, which leaves real headroom. */
const GAP_MS = 1100;


/* ★ FULL STELLAR COVERAGE. This was originally seven ZIPs, which kept the database
  small but meant the search could only cover Michael's own back yard. The licence
  covers all of Stellar (twenty counties), so the ZIP restriction is gone.
  Set ZIPS to a list again if it ever needs narrowing. */
const ZIPS = null;


/* ★ PHOTOS ARE ONLY FETCHED FOR FHV'S OWN COMMUNITIES — never for the whole
  database. Storage is cheap ($0.015/GB) but the WHOLE feed would be ~3 million
  photos, ~734GB and weeks of downloading. These eight are a few thousand photos
  and under a gigabyte. DO NOT widen this without doing the arithmetic first.
  Matched on street name AND ZIP: street names are not unique across Florida —
  a "Haven" exists in Tarpon Springs, Orlando, Arcadia and elsewhere. */
const FHV_COMMUNITIES = {
 'Palmero': { zip: '34275', streets: ["ARCHIPELAGO", "BLUE REEF", "EQUATOR", "HAVEN", "ISLA PALMA", "SHADY PALMS", "WINDY BAY"] },
 'Talon Preserve': { zip: '34275', streets: ["BALD CYPRESS", "CRESTED EAGLE", "CYPRESS WOOD", "EAGLE BRANCH", "FISH EAGLE", "GOLDEN GRASS", "GRANDE TALON", "HIDDEN SAWGRASS", "LITTLE EAGLE", "MISTY POND", "MOSSY PINE", "SAWGRASS LAKE", "SILVER GRASS", "TALON PRESERVE", "WINDING PINE", "WIRE GRASS"] },
 'Gran Paradiso': { zip: '34293', streets: ["AMERIGO", "AMICA", "BASILICA", "BENISSIMO", "BRILLIANTE", "BUONO", "CAMPANILE", "CANAVESE", "CARAVAGGIO", "CINQUETERRE", "CLASSICO", "CRISTOFORO", "DUOMO", "ELEGANTE", "FAMIGLIA", "FELICE", "GARIBALDI", "GHIBERTI", "GRANLAGO", "GRAZIE", "LAGENTE", "LOGGIA", "PASSAGIO", "PORTENZA", "PREGO", "RAGAZZA", "REALE", "RICHEZZA", "ROMAGNA", "SALUTI", "TESORO", "TRATTORIA", "UFFIZI", "VALORE", "VALPRATO", "VANCANZA", "VITA"] },
 'IslandWalk': { zip: '34293', streets: ["ALAFAYA", "ATTAVIANO", "BASTIANO", "BIANCHI", "BORREGO", "BOTTERI", "CALIMENTO", "CAMPOLEONE", "COLUCCIO", "CORRADINO", "DIMARCO", "ERICE", "ESPOSITO", "FASSIO", "FERNANDO", "FORMOSA", "GUYANA", "HUERTA", "IPOLITA", "ISADORA", "JACINDA", "JALISCA", "KARINA", "KIRELLA", "LANUVIO", "LAPPACIO", "LIDO", "MANGIERI", "MAZZARA", "MIRANESE", "NAVARRO", "NEVIANO", "NOBILIO", "ORIAGO", "ORINO", "ORTONA", "PACCHIO", "PELTO", "PETRINO", "PIERO", "POSADA", "QUINTA", "QUISTO", "RICCI", "RINELLA", "RINUCCIO", "RIZZUTO", "ROSALIA", "ROSAMARIA", "SALINAS", "SAYDA", "SERAFINA", "SOLARZANO", "TOMARO", "TRENTINO", "UMBRIA", "VADINI", "VERANDI", "YELMA"] },
 'Grand Palm': { zip: '34293', streets: ["ALACHUA", "ALTAMONTE", "ANCLOTE", "AUBURNDALE", "AUCILLA", "AVON PARK", "CALHOUN", "CALLAWAY", "CEDAR KEY", "CHATTAHOOCHEE", "COLLIER", "DAVIE", "DESTIN", "DUNEDIN", "FAKAHATCHEE", "FORT LAUDERDALE", "FORT MYERS", "FROSTPROOF", "GAINESVILLE", "HARNEY", "HENDRY", "HOLMES", "HUNTERS CREEK", "LAKE PLACID", "MARATHON", "OKALOOSA", "PALATKA", "SAGEWOOD", "SANDAL FOOT", "SEBRING", "SHIMMERING OAK", "ST PETERSBURG", "STEINHATCHEE", "STILL RIVER", "STUART", "TRAILWOOD", "WACISSA", "WAKULLA", "WINTER PARK"] },
 'Sarasota National': { zip: '34293', streets: ["BULLRUSH", "CANTERWOOD", "COLUBRINA", "COPPERLEAF", "CORKWOOD", "COZY GROVE", "CROOKED CREEK", "EUPHORIA", "FIDDLEWOOD", "GALLBERRY", "IRONBRIDGE", "LANTANA", "MEDJOOL", "SKYFLOWER", "SPARTINA", "TARFLOWER", "WAVERLY", "WHISK FERN"] },
 'Renaissance': { zip: '34293', streets: ["ALESSANDRO", "BANDERA", "BOHEMIAN", "CONCERTO", "GALILEO", "MINUET", "OVID", "RENAISSANCE", "REVIVAL", "SANZIO", "SISTINE", "SYMPHONY", "TAPESTRY"] },
 'Sunrise Preserve': { zip: '34238', streets: ["BAY MEADOW", "BLUE WATER", "FALL MOON", "HOPE SOUND", "LONG SHORE", "MORNING SUN", "RAIN SONG", "SEPTEMBER SKY", "SUNDANCE"] },
};




/* ★ WHOLE-TOWN PHOTO COVERAGE, ADDED ONE TOWN AT A TIME.
   FHV_COMMUNITIES above is street-matched and stays as it is. This is the
   other way in: every residential listing in these ZIPs gets its photos
   downloaded, not just the named communities.
   ARITHMETIC BEFORE ADDING A ZIP. Photos are bounded by MLS GRID'S 40,000
   REQUESTS PER 24 HOURS, which is their limit on the token and cannot be
   raised by paying anyone. At MEDIA_PER_RUN photos per run and 96 runs a day,
   each photo costs about two requests. Check the count first:
     SELECT COUNT(*), SUM(photos_count) FROM idx_listings
      WHERE postal_code = '34xxx' AND status IN ('Active','Pending');
   34275 Nokomis    ~418 listings, ~16,300 photos                 [ADDED 15 Sep 2026]
   34229 Osprey     4,171 parcels, roughly 9,500 photos           [ADDED 16 Sep 2026]
   ★ SIZING THE REST BEFORE ADDING IT. Measured: about 42 photos per listing.
     Sarasota county alone is 540,656 photos = 19 days at 28,800/day.
     All three counties is roughly 1.08 million = 38 days.
     Storage is trivial either way, under $3/month. TIME is the whole cost,
     and the listings sync shares the same 40,000 daily requests - running
     photos flat out for weeks leaves it on a thin margin, and the sync is
     what keeps the listings pages accurate.
   34285/34292/34293 Venice  next
   34286/34287/34288/34291 North Port  after that
   Sarasota County as a whole is ~530,000 photos, which is a month of the
   entire daily budget with the listings sync starved alongside it. Do not
   add it in one go. */
const PHOTO_ZIPS = ['34275', '34229'];

const SUFFIXES = {
 STREET: 1, ST: 1, DRIVE: 1, DR: 1, LANE: 1, LN: 1, COURT: 1, CT: 1,
 CIRCLE: 1, CIR: 1, PLACE: 1, PL: 1, TERRACE: 1, TER: 1, LOOP: 1, WAY: 1,
 PATH: 1, BOULEVARD: 1, BLVD: 1, AVENUE: 1, AVE: 1, ROAD: 1, RD: 1,
 TRAIL: 1, TRL: 1, RUN: 1, PARKWAY: 1, PKWY: 1
};


/* Reduce an address to "5758 ARCHIPELAGO" so it can be matched against FHV's
  county-derived address lists. The suffix is dropped because it is the part
  that varies: the county file says "St", the feed says "STREET". */
function addrKey(number, name, suffix) {
 const num = String(number || '').trim().toUpperCase();
 let words = String((name || '') + ' ' + (suffix || '')).toUpperCase()
   .replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean);
 while (words.length > 1 &&
        (SUFFIXES[words[words.length - 1]] || /^\d+$/.test(words[words.length - 1]))) {
   words.pop();
 }
 return (num + ' ' + words.join(' ')).trim();
}


const sleep = ms => new Promise(r => setTimeout(r, ms));


/* Does this listing get its photos downloaded? Either it sits in one of the
   named communities (street AND ZIP), or it is in a whole-town PHOTO_ZIP. */
function inFhvCommunity(r) {
 const zip = String(r.PostalCode || '').slice(0, 5);
 const st = String(r.StreetName || '').toUpperCase().trim();
 if (!zip) return false;
 if (PHOTO_ZIPS.indexOf(zip) !== -1) return true;
 if (!st) return false;
 for (const name in FHV_COMMUNITIES) {
   const c = FHV_COMMUNITIES[name];
   if (c.zip === zip && c.streets.indexOf(st) !== -1) return true;
 }
 return false;
}


async function grid(url, token, attempt = 0) {
 const res = await fetch(url, {
   headers: {
     'Authorization': 'Bearer ' + token,
     'Accept': 'application/json',
     'Accept-Encoding': 'gzip'      // MLS Grid requires compression
   }
 });


 /* 429 means we are being rate limited. Backing off and retrying is far better
    than failing the run, because a failed run leaves the cursor where it was
    and the next cron simply repeats the same overload. Three attempts, then
    give up so the run cannot spin. */
 if (res.status === 429 && attempt < 3) {
   await sleep(2000 * Math.pow(2, attempt));   // 2s, 4s, 8s
   return grid(url, token, attempt + 1);
 }


 if (!res.ok) {
   throw new Error('MLS Grid ' + res.status + ' ' + res.statusText +
                   ' — ' + (await res.text()).slice(0, 300));
 }
 return res.json();
}


/* ---------------------------------------------------------------- the sync */
async function runSync(env, maxPages) {
 const token = env.MLSGRID_TOKEN;
 if (!token) throw new Error('MLSGRID_TOKEN secret is not set on this Worker');


 const state = await env.DB.prepare(
   'SELECT last_ts FROM idx_sync_state WHERE resource = ?'
 ).bind('Property').first();
 const since = state && state.last_ts ? state.last_ts : null;


 /* Incremental where possible. MLS Grid explicitly warns against range
    queries — use "greater than the newest timestamp you already hold". */
 /* Filter AT MLS GRID, not after downloading. StandardStatus is one of only five
    searchable fields (ModificationTimestamp, OriginatingSystemName,
    StandardStatus, ListingId, MlgCanView). Without it the feed returns the whole
    history — the first run came back with records modified in 2021 and stored
    none of them, because nothing that old is still for sale.
    MLS Grid's Best Practices also say to prefer "in" over "or" statements. */
 /* NOTE: PropertyType is NOT one of the five searchable fields, so it cannot be
    filtered here and is applied to each record below instead. The five are
    ModificationTimestamp, OriginatingSystemName, StandardStatus, ListingId,
    MlgCanView. */
 let filter = `OriginatingSystemName eq '${OSN}'`
            + ` and StandardStatus in ('Active','Pending')`
            + ` and MlgCanView eq true`;
 /* ★ 'ge' NOT 'gt'. If two listings share an identical ModificationTimestamp and
    pagination splits them across a page boundary, 'gt' skips the second one
    silently and it is never seen again. 'ge' re-fetches the boundary record,
    which is harmless because the write below is an idempotent upsert.
    This is the design used by a production MLS Grid replicator (MRED). */
 if (since) filter += ` and ModificationTimestamp ge ${since}`;


 /* $expand=Media is the ONLY way to get photo records. It makes each page
    heavier, so the page cap has to come down when it is on. */
 let url = `${BASE}/Property?$filter=${encodeURIComponent(filter)}`
         + `&$expand=Media&$top=${PAGE_SIZE}`;
 let pages = 0, seen = 0, stored = 0, removed = 0, queued = 0, newest = since;


 const pageCap = maxPages || MAX_PAGES_PER_RUN;
 while (url && pages < pageCap) {
   const data = await grid(url, token);
   const rows = data.value || [];
   seen += rows.length;


   /* Cloudflare limits how many subrequests one invocation may make, and each
      D1 statement counts. Writing one row at a time blew that limit on the very
      first run. Collect the work, then send it in batches. */
   const toDelete = [];
   const toStore = [];
   const toQueue = [];


   for (const r of rows) {
     if (r.ModificationTimestamp && (!newest || r.ModificationTimestamp > newest)) {
       newest = r.ModificationTimestamp;
     }


     const zip = String(r.PostalCode || '').slice(0, 5);
     const canUse = Array.isArray(r.MlgCanUse) ? r.MlgCanUse : [];


     /* Any of these means the record must not be held or shown. */
     const drop =
       r.MlgCanView === false ||                      // withdrawn — delete it
       canUse.indexOf('IDX') === -1 ||                // not licensed for IDX
       r.InternetEntireListingDisplayYN === false ||  // seller opted out
       (ZIPS && ZIPS.indexOf(zip) === -1) ||          // area restriction, if any
       (r.StandardStatus !== 'Active' && r.StandardStatus !== 'Pending') ||
       /* ★ PropertyType must be Residential. Without this the feed also delivers
          Residential Lease, Land, Commercial Sale, Residential Income and
          Commercial Lease. On the first full import that was 1,087 of 3,022
          records — including 670 RENTALS, whose ListPrice is a MONTHLY RENT.
          A page built on that shows a $2,000 rental beside a $759,000 house. */
       r.PropertyType !== 'Residential';


     if (drop) {
       toDelete.push(r.ListingKey);
       continue;
     }


     toStore.push(env.DB.prepare(`
       INSERT INTO idx_listings (
         listing_key, listing_id, status, addr_key, street_number, street_name,
         street_suffix, unit_number, city, postal_code, subdivision, sw_subdivision,
         list_price, beds, baths, living_area, year_built, property_type,
         property_subtype, pool, water_view, new_construction, days_on_market,
         hoa_monthly, cdd, flood_zone, list_office_name, photos_count,
         mlg_can_use, internet_display, modification_ts, synced_at, remarks
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(listing_key) DO UPDATE SET
         status=excluded.status, list_price=excluded.list_price,
         days_on_market=excluded.days_on_market, photos_count=excluded.photos_count,
         hoa_monthly=excluded.hoa_monthly, list_office_name=excluded.list_office_name,
         modification_ts=excluded.modification_ts, synced_at=excluded.synced_at,
         remarks=excluded.remarks
     `).bind(
       r.ListingKey,
       r.ListingId || null,
       r.StandardStatus || null,
       addrKey(r.StreetNumber, r.StreetName, r.StreetSuffix),
       r.StreetNumber || null,
       r.StreetName || null,
       r.StreetSuffix || null,
       r.UnitNumber || null,
       r.City || null,
       zip || null,
       r.SubdivisionName || null,
       r.MFR_SWSubdivCommunityName || null,
       r.ListPrice != null ? Math.round(r.ListPrice) : null,
       r.BedroomsTotal != null ? r.BedroomsTotal : null,
       r.BathroomsTotalInteger != null ? r.BathroomsTotalInteger : null,
       r.LivingArea != null ? Math.round(r.LivingArea) : null,
       r.YearBuilt != null ? r.YearBuilt : null,
       r.PropertyType || null,
       r.PropertySubType || null,
       r.PoolPrivateYN === true ? 1 : 0,
       r.MFR_WaterViewYN === true ? 1 : 0,
       r.NewConstructionYN === true ? 1 : 0,
       r.DaysOnMarket != null ? r.DaysOnMarket : null,
       r.MFR_MonthlyHOAAmount != null ? r.MFR_MonthlyHOAAmount : null,
       r.MFR_CDDYN === true ? 1 : 0,
       r.MFR_FloodZoneCode ? String(r.MFR_FloodZoneCode).toUpperCase() : null,
       r.ListOfficeName || null,
       r.PhotosCount != null ? r.PhotosCount : 0,
       canUse.join(','),
       r.InternetEntireListingDisplayYN === false ? 0 : 1,
       r.ModificationTimestamp || null,
       new Date().toISOString(),
       /* Only stored for FHV communities — it is the only place it is displayed,
          and there is no reason to hold 77,000 descriptions. */
       /* ★ STORED FOR EVERY LISTING as of 15 Sep 2026. It used to be kept only
          for FHV's own communities, on the reasoning that nowhere else displayed
          it. Remarks arrive in the response either way, so storing them costs NO
          extra API call and nothing against the rate limit - and without them a
          listing page has nothing to say that is not on every other listing
          page. About 94,000 rows, roughly 90MB in D1. */
       (r.MFR_PublicRemarksAgent || r.PublicRemarks || null)
     ));


     /* Queue this listing's photos, if it is one of ours. */
     if (inFhvCommunity(r) && Array.isArray(r.Media)) {
       for (const m of r.Media) {
         if (!m.MediaKey || !m.MediaURL) continue;
         if (m.MediaCategory && m.MediaCategory !== 'Photo') continue;
         toQueue.push(env.DB.prepare(`
           INSERT INTO idx_media (media_key, listing_key, media_url, ord, category, status, queued_at)
           VALUES (?,?,?,?,?, 'pending', ?)
           ON CONFLICT(media_key) DO NOTHING
         `).bind(m.MediaKey, r.ListingKey, m.MediaURL,
                 m.Order != null ? m.Order : 0, m.MediaCategory || 'Photo',
                 new Date().toISOString()));
       }
     }
   }


   /* One batch for the deletions, one for the writes. Two subrequests per page
      instead of two hundred. */
   /* SQLite caps the number of bound parameters in one statement, so a single
      IN (...) holding a whole page of keys fails. Chunk it. */
   for (let i = 0; i < toDelete.length; i += 50) {
     const chunk = toDelete.slice(i, i + 50);
     const marks = chunk.map(() => '?').join(',');
     const res = await env.DB.prepare(
       `DELETE FROM idx_listings WHERE listing_key IN (${marks})`
     ).bind(...chunk).run();
     removed += (res.meta && res.meta.changes) || 0;
   }
   if (toStore.length) {
     await env.DB.batch(toStore);
     stored += toStore.length;
   }
   if (toQueue.length) {
     /* Chunked: a whole page of media rows can exceed D1's statement limits. */
     for (let i = 0; i < toQueue.length; i += 40) {
       await env.DB.batch(toQueue.slice(i, i + 40));
     }
     queued += toQueue.length;
   }


   url = data['@odata.nextLink'] || null;
   pages++;
   if (url) await sleep(GAP_MS);
 }


 await env.DB.prepare(`
   INSERT INTO idx_sync_state (resource, last_ts, last_run, last_count, last_error)
   VALUES ('Property', ?, ?, ?, NULL)
   ON CONFLICT(resource) DO UPDATE SET
     last_ts=excluded.last_ts, last_run=excluded.last_run,
     last_count=excluded.last_count, last_error=NULL
 `).bind(newest, new Date().toISOString(), stored).run();


 return { pages, seen, stored, removed, queued, newest, more: !!url };
}






/* ======================= the photo downloader ============================
  Photos cannot be hot-linked. MLS Grid: "You must maintain your own copy of
  all media files. The URLs contained in the Media resource are to be used ONLY
  for the purpose of downloading a local copy of the files. DO NOT use these
  URLs on your website or in your application."


  ★ THE USER-AGENT MUST BE THE ACCESS TOKEN. Mandatory since 1 June 2026:
  "Any User-Agent that is not your Oauth 2 access token will be blocked."


  ★ MediaKeys are immutable — "There is NEVER a reason to download the same
  media more than once." A replaced photo arrives as a NEW key. So a key that
  has been stored is never fetched again.


  Runs as a queue: a few dozen per invocation, because a Worker cannot download
  for hours. Downloads count against the same 4GB/hour budget as the feed.
  ======================================================================== */


/* ★ MEASURED, NOT GUESSED. Cloudflare's free plan allows 50 external subrequests
  per invocation (plus 1,000 to their own services). Each photo appears to cost
  TWO against that ceiling — one fetch from MLS Grid, one write to R2. Inferred
  from the observed failure: a run set to 40 stored exactly 25 before throwing
  "Too many subrequests". 25 x 2 = 50.
  22 photos is 46 subrequests, leaving room for the fresh-URL lookup and the
  closing count. This was set to 15 out of caution rather than measurement.
  The Workers Paid plan ($5/mo) raises the ceiling to 10,000, but the remaining
  backlog is a couple of days either way — not worth a minimum one-month
  commitment, especially given Cloudflare's own community threads about people
  struggling to cancel it. */
/* ★ RAISED FROM 80 TO 150 on 16 Sep 2026, after measuring where the time
   actually went. A run of 80 photos spends 88 seconds sleeping between
   requests and then sits idle for the remaining 800 seconds of its 15-minute
   window. The cap was never protecting anything - it was leaving most of the
   allowance unused.
   THE ARITHMETIC, and check it before raising this again:
   ★ CORRECTED: A PHOTO COSTS **ONE** MLS GRID REQUEST, NOT TWO. The fetch
   goes to MLS Grid; the R2 write and the D1 update are Cloudflare-internal
   and never touch their API. An earlier note here conflated Cloudflare's
   subrequest ceiling with MLS Grid's request count and halved the apparent
   headroom.
   300 IS THE CEILING WHERE ALL FOUR PUBLISHED LIMITS STILL HOLD:
     window    300 x 1.1s = 330s of a 900s cron cycle
     per hour  300 x 4 runs = 1,200 of 7,200
     per day   300 x 96 runs = 28,800 of 40,000, leaving ~11,000 for the
               listings sync and discovery, which both need some
     bandwidth 0.21 GB/hour of 4 GB
   600 per run breaks the DAILY cap (57,600). 1000 breaks the daily cap AND
   overruns the 15-minute window (1,100s of sleeping in a 900s cycle), so the
   run gets cut off partway and the next starts before it finished.
   The only way past 300 is asking MLS Grid to raise the daily cap. They
   document the process: email support@mlsgrid.com in advance for guidance
   where limits must be exceeded.
   ★ DO NOT TOUCH GAP_MS. The 1.1 second gap exists because MLS Grid sent an
   API Access Warning on 26 Aug 2026 for exceeding 2 requests per second.
   More photos per run is safe. More photos per SECOND is not. */
const MEDIA_PER_RUN = 300;
const MEDIA_MAX_ATTEMPTS = 3;

/* ★ HOW MANY LISTINGS DISCOVERY QUEUES PER RUN. This was 3, and once the
   downloader was fixed to work through several listings per run instead of
   one, DISCOVERY became the bottleneck instead: the queue was draining faster
   than it was being filled and pending fell from 165 to 81 inside an hour.
   Each listing costs ONE MLS Grid request here.
   ★ RAISED 10 -> 25 on 17 Sep. With MEDIA_PER_RUN at 300 the downloader
   cleared 6,329 photos overnight at 491 an hour, and pending fell to 19 -
   discovery could not keep the queue fed and the downloader was about to
   start idling.
   25 per run x 96 runs = 2,400 requests a day. Added to 28,800 for photos
   that is 31,200 of a 40,000 ceiling, leaving room for the listings sync.
   If pending still approaches zero while a town is unfinished, the next
   move is fewer photos per run rather than more discovery, because the
   daily total is what binds. */
const DISCOVER_PER_RUN = 25;  // a dead URL is parked, never blocks the queue




/* ★ Find FHV-community listings that have NO media rows at all and queue them.
  WHY: photos were only ever queued when the SYNC happened to re-read a listing.
  A listing that sits unchanged is invisible to the queue forever — four of
  Talon Preserve's six listings had zero media rows a day after the pipeline
  was built, and no amount of waiting would have fixed it. The sync walks all
  78,000 Stellar listings chronologically, so waiting for it to come round again
  would take about a hundred runs.
  This asks the opposite question: which of OUR listings have no photos queued?
  Then it fetches their media from the API directly. Self-healing. */
async function runMediaDiscover(env, limit) {
 const token = env.MLSGRID_TOKEN;
 if (!token) throw new Error('MLSGRID_TOKEN secret is not set');


 const zips = Object.keys(FHV_COMMUNITIES)
   .map(function (k) { return FHV_COMMUNITIES[k].zip; })
   .filter(function (z, i, a) { return a.indexOf(z) === i; });
 const streets = Object.keys(FHV_COMMUNITIES)
   .reduce(function (a, k) { return a.concat(FHV_COMMUNITIES[k].streets); }, []);


 let missing = [];

 /* Whole-town ZIPs first: no street list, so one query covers the town. */
 for (const z of PHOTO_ZIPS) {
   if (missing.length >= (limit || DISCOVER_PER_RUN)) break;
   const { results } = await env.DB.prepare(
     `SELECT l.listing_key, l.listing_id, l.street_number, l.street_name
        FROM idx_listings l
   LEFT JOIN idx_media m ON m.listing_key = l.listing_key
       WHERE l.status IN ('Active','Pending')
         AND l.postal_code = ?
         AND m.listing_key IS NULL
       LIMIT ?`
   ).bind(z, (limit || DISCOVER_PER_RUN) - missing.length).all();
   missing = missing.concat(results || []);
 }

 for (let i = 0; i < streets.length && missing.length < (limit || DISCOVER_PER_RUN); i += 40) {
   const chunk = streets.slice(i, i + 40);
   const sm = chunk.map(function () { return '?'; }).join(',');
   const zm = zips.map(function () { return '?'; }).join(',');
   const { results } = await env.DB.prepare(
     `SELECT l.listing_key, l.listing_id, l.street_number, l.street_name
        FROM idx_listings l
   LEFT JOIN idx_media m ON m.listing_key = l.listing_key
       WHERE l.status IN ('Active','Pending')
         AND l.postal_code IN (${zm}) AND l.street_name IN (${sm})
         AND m.listing_key IS NULL
       LIMIT ?`
   ).bind(...zips, ...chunk, (limit || DISCOVER_PER_RUN) - missing.length).all();
   missing = missing.concat(results || []);
 }


 if (!missing.length) {
   return { checked: 'all FHV communities', missing: 0, queued: 0,
            note: 'every listing already has its photos queued' };
 }


 let queued = 0;
 const done = [];
 for (const l of missing) {
   if (!l.listing_id) continue;
   try {
     const f = `OriginatingSystemName eq '${OSN}' and ListingId eq '${String(l.listing_id).replace(/'/g, "''")}'`;
     const data = await grid(
       `${BASE}/Property?$filter=${encodeURIComponent(f)}&$expand=Media&$top=1`, token);
     const rec = (data.value || [])[0];
     const media = (rec && rec.Media) || [];
     const rows = [];
     for (const m of media) {
       if (!m.MediaKey || !m.MediaURL) continue;
       if (m.MediaCategory && m.MediaCategory !== 'Photo') continue;
       rows.push(env.DB.prepare(
         `INSERT INTO idx_media (media_key, listing_key, media_url, ord, category, status, queued_at)
          VALUES (?,?,?,?,?, 'pending', ?) ON CONFLICT(media_key) DO NOTHING`
       ).bind(m.MediaKey, l.listing_key, m.MediaURL,
              m.Order != null ? m.Order : 0, m.MediaCategory || 'Photo',
              new Date().toISOString()));
     }
     for (let i = 0; i < rows.length; i += 40) await env.DB.batch(rows.slice(i, i + 40));
     queued += rows.length;
     done.push((l.street_number || '') + ' ' + (l.street_name || '') + ' (' + rows.length + ')');
   } catch (err) {
     done.push((l.street_name || '?') + ' FAILED: ' + String(err).slice(0, 80));
   }
   await sleep(GAP_MS);
 }
 return { missing: missing.length, queued, listings: done };
}


async function runMedia(env, limit) {
 const token = env.MLSGRID_TOKEN;
 if (!token) throw new Error('MLSGRID_TOKEN secret is not set');
 if (!env.PHOTOS) throw new Error('R2 binding PHOTOS is not set on this Worker');


 const cap = limit || MEDIA_PER_RUN;


 /* ★ WORK BY LISTING, AND FETCH FRESH URLS FIRST.
    The first version stored the MediaURL at sync time and downloaded it later.
    MLS Grid media URLs are SIGNED AND EXPIRE — roughly an hour. Anything not
    downloaded inside that window has a dead URL, and retrying the same URL can
    never succeed. That produced a stubborn, identical 15-of-40 failure rate:
    the same stale URLs failing every run.
    So: pick one listing, ask the API for its media NOW, and download while the
    URLs are minutes old. One extra API call per listing, and nothing expires. */
 /* ★ Only communities with a LIVE listings page, matched on STREET + ZIP.
    An earlier version filtered by ZIP alone, but 34293 also contains Sarasota
    National, Grand Palm, Renaissance, Sunstone and Brightmore — none of which
    has a page. The queue spent runs on those while Talon Preserve, which does
    have a page, showed one photo out of six listings. */
 const LIVE = {
   '34275': ['ARCHIPELAGO','BLUE REEF','EQUATOR','HAVEN','ISLA PALMA','SHADY PALMS','WINDY BAY',
             'BALD CYPRESS','CRESTED EAGLE','CYPRESS WOOD','EAGLE BRANCH','FISH EAGLE',
             'GOLDEN GRASS','GRANDE TALON','HIDDEN SAWGRASS','LITTLE EAGLE','MISTY POND',
             'MOSSY PINE','RIVER BIRCH','SAWGRASS LAKE','SILVER GRASS','TALON PRESERVE',
             'WINDING PINE','WIRE GRASS'],
   '34293': Object.keys(FHV_COMMUNITIES)
     .filter(function (k) { return k === 'Gran Paradiso' || k === 'IslandWalk'; })
     .reduce(function (a, k) { return a.concat(FHV_COMMUNITIES[k].streets); }, [])
 };


 let pick = null;

 /* Whole-town ZIPs are served first and need no street list. */
 for (const z of PHOTO_ZIPS) {
   if (pick) break;
   pick = await env.DB.prepare(
     `SELECT m.listing_key, COUNT(*) AS n
        FROM idx_media m JOIN idx_listings l ON l.listing_key = m.listing_key
       WHERE m.status = 'pending' AND m.attempts < ?
         AND l.postal_code = ?
         AND l.status IN ('Active','Pending')
       GROUP BY m.listing_key ORDER BY n DESC LIMIT 1`
   ).bind(MEDIA_MAX_ATTEMPTS, z).first();
 }

 for (const zip of ['34275', '34293']) {
   if (pick) break;
   const streets = LIVE[zip];
   for (let i = 0; i < streets.length && !pick; i += 40) {
     const chunk = streets.slice(i, i + 40);
     const marks = chunk.map(function () { return '?'; }).join(',');
     pick = await env.DB.prepare(
       `SELECT m.listing_key, COUNT(*) AS n
          FROM idx_media m JOIN idx_listings l ON l.listing_key = m.listing_key
         WHERE m.status = 'pending' AND m.attempts < ?
           AND l.postal_code = ? AND l.street_name IN (${marks})
           AND l.status IN ('Active','Pending')
         GROUP BY m.listing_key ORDER BY n DESC LIMIT 1`
     ).bind(MEDIA_MAX_ATTEMPTS, zip, ...chunk).first();
   }
   if (pick) break;
 }


 /* Nothing left on a live page — fall back to everything else. */
 if (!pick) {
   pick = await env.DB.prepare(
     `SELECT listing_key, COUNT(*) AS n FROM idx_media
       WHERE status = 'pending' AND attempts < ?
       GROUP BY listing_key ORDER BY n DESC LIMIT 1`
   ).bind(MEDIA_MAX_ATTEMPTS).first();
 }



 /* ★ MULTIPLE LISTINGS PER RUN. This used to process exactly ONE listing and
    stop, however few photos that listing had left. Early on that was fine -
    the listings with forty pending photos were picked first and a run filled
    its budget easily. Once those were done, each run was getting through
    whatever handful one listing had left, and the download rate HALVED from
    188 photos an hour to 77 while the account sat at a fraction of its
    allowance.
    MLS Grid permits 40,000 requests per 24 hours and each photo costs about
    two, so 80 photos across 96 runs a day is roughly 15,360 requests - well
    inside it. The cap was never the constraint. This was.
    Now the run keeps taking listings until the budget is actually spent. */
 const errors = [];
 let stored = 0, failed = 0, attempted = 0;
 const listingsDone = [];

 while (pick && attempted < cap) {
   const listingKey = pick.listing_key;
   listingsDone.push(listingKey);

  
  


   /* Fresh media for this one listing. ListingKey is not searchable, but
      ListingId is — so look it up. */
   let fresh = {};
   try {
     const row = await env.DB.prepare(
       'SELECT listing_id FROM idx_listings WHERE listing_key = ?'
     ).bind(listingKey).first();


     if (row && row.listing_id) {
       const f = `OriginatingSystemName eq '${OSN}' and ListingId eq '${String(row.listing_id).replace(/'/g, "''")}'`;
       const data = await grid(
         `${BASE}/Property?$filter=${encodeURIComponent(f)}&$expand=Media&$top=1`, token);
       const rec = (data.value || [])[0];
       for (const m of ((rec && rec.Media) || [])) {
         if (m.MediaKey && m.MediaURL) fresh[m.MediaKey] = m.MediaURL;
       }
     }
   } catch (err) {
     errors.push('refresh: ' + String(err).slice(0, 120));
   }


   const { results } = await env.DB.prepare(
     `SELECT media_key, listing_key, media_url, ord FROM idx_media
       WHERE listing_key = ? AND status = 'pending' AND attempts < ?
       ORDER BY ord LIMIT ?`
   ).bind(listingKey, MEDIA_MAX_ATTEMPTS, cap - attempted).all();


   for (const m of (results || [])) {
     attempted++;
     const url = fresh[m.media_key] || m.media_url;   // fresh first, stored as fallback
     try {
       const res = await fetch(url, {
         headers: {
           /* Not a browser string — MLS Grid requires the access token here. */
           'User-Agent': token,
           'Accept': 'image/*'
         }
       });
       if (!res.ok) throw new Error('HTTP ' + res.status + (fresh[m.media_key] ? ' (fresh url)' : ' (stored url)'));


       const type = res.headers.get('Content-Type') || 'image/jpeg';
       const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
       const key = m.listing_key + '/' + String(m.ord).padStart(3, '0') + '-' + m.media_key + '.' + ext;


       await env.PHOTOS.put(key, res.body, { httpMetadata: { contentType: type } });


       await env.DB.prepare(
         `UPDATE idx_media SET status='stored', r2_key=?, media_url=?, stored_at=?, last_error=NULL
           WHERE media_key=?`
       ).bind(key, url, new Date().toISOString(), m.media_key).run();
       stored++;
     } catch (err) {
       const msg = String(err).slice(0, 180);
       if (errors.length < 5) errors.push(msg);
       await env.DB.prepare(
         `UPDATE idx_media SET attempts = attempts + 1, last_error = ?,
                 status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END
           WHERE media_key = ?`
       ).bind(msg, MEDIA_MAX_ATTEMPTS, m.media_key).run();
       failed++;
     }
     await sleep(GAP_MS);
   }



   /* Take the next listing, if the budget allows another. */
   pick = null;
   if (attempted < cap) {
     for (const z of PHOTO_ZIPS) {
       if (pick) break;
       pick = await env.DB.prepare(
         `SELECT m.listing_key, COUNT(*) AS n
            FROM idx_media m JOIN idx_listings l ON l.listing_key = m.listing_key
           WHERE m.status = 'pending' AND m.attempts < ?
             AND l.postal_code = ? AND l.status IN ('Active','Pending')
             AND m.listing_key NOT IN (${listingsDone.map(function(){return '?';}).join(',')})
           GROUP BY m.listing_key ORDER BY n DESC LIMIT 1`
       ).bind(MEDIA_MAX_ATTEMPTS, z, ...listingsDone).first();
     }
     if (!pick) {
       pick = await env.DB.prepare(
         `SELECT listing_key, COUNT(*) AS n FROM idx_media
           WHERE status = 'pending' AND attempts < ?
             AND listing_key NOT IN (${listingsDone.map(function(){return '?';}).join(',')})
           GROUP BY listing_key ORDER BY n DESC LIMIT 1`
       ).bind(MEDIA_MAX_ATTEMPTS, ...listingsDone).first();
     }
   }
 }

 const left = await env.DB.prepare(
   "SELECT COUNT(*) AS n FROM idx_media WHERE status='pending' AND attempts < ?"
 ).bind(MEDIA_MAX_ATTEMPTS).first();


 /* Errors are returned as well as stored, so a failure is visible immediately
    rather than needing a database query to diagnose. */
 return { listings: listingsDone.length, attempted, stored, failed,
          remaining: left ? left.n : 0,
          errors: errors.length ? errors : undefined };
}


/* ★ PHOTOS MUST BE DELETED WHEN THE LISTING GOES, or storage grows forever.
  MLS Grid removes a sold listing from the feed and the sync deletes the row,
  but an object in R2 has no idea that happened. The production reference
  (MRED) puts it plainly: "When a revoked listing is hard-deleted, its
  downloaded files are removed from the sink too." This is that. */
async function runMediaCleanup(env) {
 if (!env.PHOTOS) throw new Error('R2 binding PHOTOS is not set on this Worker');


 const { results } = await env.DB.prepare(
   `SELECT m.media_key, m.r2_key FROM idx_media m
     LEFT JOIN idx_listings l ON l.listing_key = m.listing_key
     WHERE l.listing_key IS NULL LIMIT 200`
 ).all();


 const orphans = results || [];
 let deleted = 0;
 for (const o of orphans) {
   try { if (o.r2_key) await env.PHOTOS.delete(o.r2_key); } catch (e) {}
   await env.DB.prepare('DELETE FROM idx_media WHERE media_key=?').bind(o.media_key).run();
   deleted++;
 }
 return { orphansFound: orphans.length, deleted };
}


/* -------------------------------------------------------------- reconcile
  WHY: the incremental sync deletes a listing when MLS Grid marks it MlgCanView
  false. That only works if we were running when the flag flipped. If a run
  failed, or the record left the feed before we saw it, the listing sits in our
  database forever and the site shows a sold home as available. Article 19.15
  requires false data to be corrected or removed, and MLS Grid audits quarterly.


  ★ DESIGN NOTE — the first version of this was backwards. It downloaded every
  live listing key in the state to check ours against. Stellar has well over
  25,000 active and pending listings across twenty counties, so the sweep could
  never finish inside one invocation and correctly refused to purge anything.


  This asks the opposite question: for the listings WE hold, are they still
  valid? ListingId is one of only five searchable fields, and MLS Grid's Best
  Practices explicitly recommend "in" statements for requesting multiple
  records. Sixty listings becomes two requests instead of sixty. It completes
  every time, and it scales with OUR data rather than with Stellar's. */
async function runReconcile(env) {
 const token = env.MLSGRID_TOKEN;
 if (!token) throw new Error('MLSGRID_TOKEN secret is not set on this Worker');


 const { results } = await env.DB.prepare(
   'SELECT listing_key, listing_id FROM idx_listings'
 ).all();
 const held = results || [];
 if (!held.length) {
   return { complete: true, held: 0, stillValid: 0, purged: 0, note: 'nothing held' };
 }


 const stillValid = new Set();
 let requests = 0;


 for (let i = 0; i < held.length; i += 50) {
   const chunk = held.slice(i, i + 50).filter(r => r.listing_id);
   if (!chunk.length) continue;


   const ids = chunk.map(r => `'${String(r.listing_id).replace(/'/g, "''")}'`).join(',');
   const filter = `OriginatingSystemName eq '${OSN}'`
                + ` and MlgCanView eq true`
                + ` and StandardStatus in ('Active','Pending')`
                + ` and ListingId in (${ids})`;


   const data = await grid(
     `${BASE}/Property?$filter=${encodeURIComponent(filter)}&$select=ListingId&$top=200`,
     token
   );
   for (const r of (data.value || [])) if (r.ListingId) stillValid.add(r.ListingId);


   requests++;
   if (i + 50 < held.length) await sleep(GAP_MS);
 }


 /* Anything we hold that the feed no longer returns as a valid, displayable
    listing has sold, expired or been withdrawn. Remove it. */
 const stale = held.filter(r => !r.listing_id || !stillValid.has(r.listing_id))
                   .map(r => r.listing_key);


 let purged = 0;
 for (let i = 0; i < stale.length; i += 50) {
   const chunk = stale.slice(i, i + 50);
   const marks = chunk.map(() => '?').join(',');
   const res = await env.DB.prepare(
     `DELETE FROM idx_listings WHERE listing_key IN (${marks})`
   ).bind(...chunk).run();
   purged += (res.meta && res.meta.changes) || 0;
 }


 await env.DB.prepare(`
   INSERT INTO idx_sync_state (resource, last_run, last_count, last_error)
   VALUES ('Reconcile', ?, ?, NULL)
   ON CONFLICT(resource) DO UPDATE SET
     last_run=excluded.last_run, last_count=excluded.last_count, last_error=NULL
 `).bind(new Date().toISOString(), purged).run();


 return { complete: true, held: held.length, stillValid: stillValid.size, purged, requests };
}


/* ------------------------------------------------------------- the endpoint */
const CORS = {
 'Access-Control-Allow-Origin': 'https://floridahomevalueai.com',
 'Access-Control-Allow-Methods': 'GET, OPTIONS',
 'Content-Type': 'application/json'
};


export default {
 /* Runs on the schedule set in wrangler.toml. */
 async scheduled(event, env, ctx) {
   /* The weekly cron carries the reconcile; the 15-minute one carries the sync. */
   if (event.cron === '0 4 * * 0') {
     ctx.waitUntil(runReconcile(env).catch(async err => {
       await env.DB.prepare(`
         INSERT INTO idx_sync_state (resource, last_run, last_error)
         VALUES ('Reconcile', ?, ?)
         ON CONFLICT(resource) DO UPDATE SET
           last_run=excluded.last_run, last_error=excluded.last_error
       `).bind(new Date().toISOString(), String(err).slice(0, 400)).run();
     }));
     return;
   }
   /* ★★ ONE JOB AT A TIME. NEVER ctx.waitUntil PER JOB.
      This block used to make FOUR separate waitUntil calls — runMediaDiscover
      twice (a duplicate left by an earlier edit), then runMedia, then runSync.
      waitUntil starts them CONCURRENTLY. Each paces itself at GAP_MS between
      requests, but four at once multiplied the rate and MLS Grid sent an API
      Access Warning on 26 Aug 2026: "Your hourly 4.0 requests per second
      exceeded the 2 requests per second limit." Suspension is at 6 RPS.
      Awaiting them in sequence inside ONE waitUntil keeps the whole Worker to a
      single request at a time. */
   ctx.waitUntil((async () => {
     /* Discovery first — a listing with no media rows can never be downloaded,
        and the sync may not re-read it for months. */
     try { await runMediaDiscover(env); } catch (e) {}
     await sleep(GAP_MS);
     try { await runMedia(env); } catch (e) {}
     await sleep(GAP_MS);
     try {
       await runSync(env);
     } catch (err) {
       await env.DB.prepare(`
         INSERT INTO idx_sync_state (resource, last_run, last_error)
         VALUES ('Property', ?, ?)
         ON CONFLICT(resource) DO UPDATE SET
           last_run=excluded.last_run, last_error=excluded.last_error
       `).bind(new Date().toISOString(), String(err).slice(0, 400)).run();
     }
   })());
 },


 async fetch(request, env) {
   const url = new URL(request.url);
   if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });


   /* Manual sync, protected by a shared secret so it cannot be triggered by
      anyone who finds the URL. */
   /* Serve a stored photo from R2.
      MLS Grid: "You must maintain your own copy of all media files... DO NOT use
      these URLs on your website or in your application." So every image the site
      shows comes from here, never from their signed URLs.
      Cached hard: a MediaKey is immutable, so the bytes at a given key never
      change. A replaced photo arrives as a new key. */
   if (url.pathname.startsWith('/photo/')) {
     const key = decodeURIComponent(url.pathname.slice(7));
     if (!key || key.indexOf('..') !== -1) {
       return new Response('bad key', { status: 400 });
     }
     const obj = await env.PHOTOS.get(key);
     if (!obj) return new Response('not found', { status: 404 });
     return new Response(obj.body, {
       headers: {
         'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg',
         'Cache-Control': 'public, max-age=31536000, immutable',
         'Access-Control-Allow-Origin': 'https://floridahomevalueai.com'
       }
     });
   }


   if (url.pathname === '/media-discover') {
     if (url.searchParams.get('key') !== env.SYNC_KEY) {
       return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS });
     }
     try {
       const n = parseInt(url.searchParams.get('n') || '', 10);
       return new Response(JSON.stringify(await runMediaDiscover(env, (n > 0 && n <= 40) ? n : undefined)), { headers: CORS });
     } catch (err) {
       return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
     }
   }


   if (url.pathname === '/media') {
     if (url.searchParams.get('key') !== env.SYNC_KEY) {
       return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS });
     }
     try {
       const n = parseInt(url.searchParams.get('n') || '', 10);
       return new Response(JSON.stringify(await runMedia(env, (n > 0 && n <= 300) ? n : undefined)), { headers: CORS });
     } catch (err) {
       return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
     }
   }


   if (url.pathname === '/media-cleanup') {
     if (url.searchParams.get('key') !== env.SYNC_KEY) {
       return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS });
     }
     try {
       return new Response(JSON.stringify(await runMediaCleanup(env)), { headers: CORS });
     } catch (err) {
       return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
     }
   }


   if (url.pathname === '/reconcile') {
     if (url.searchParams.get('key') !== env.SYNC_KEY) {
       return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS });
     }
     try {
       return new Response(JSON.stringify(await runReconcile(env)), { headers: CORS });
     } catch (err) {
       return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
     }
   }


   if (url.pathname === '/sync') {
     if (url.searchParams.get('key') !== env.SYNC_KEY) {
       return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS });
     }
     try {
       const p = parseInt(url.searchParams.get('pages') || '', 10);
       const cap = (p > 0 && p <= 30) ? p : undefined;
       return new Response(JSON.stringify(await runSync(env, cap)), { headers: CORS });
     } catch (err) {
       return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
     }
   }


   /* Health check — shows when the feed last updated. Deliberately public so a
      stale feed is visible rather than silent. */
   if (url.pathname === '/status') {
     const s = await env.DB.prepare('SELECT * FROM idx_sync_state WHERE resource = ?')
       .bind('Property').first();
     const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM idx_listings').first();
     const media = await env.DB.prepare(
       "SELECT status, COUNT(*) AS n FROM idx_media GROUP BY status"
     ).all();
     const m = {};
     for (const row of (media.results || [])) m[row.status] = row.n;
     return new Response(JSON.stringify({ listings: c ? c.n : 0, photos: m, sync: s || null }), { headers: CORS });
   }


   /* Listings for one community, matched by address.
      Returns rows. It does not summarise, average or count them. */
   /* Listings for one community.
      ★ DESIGN NOTE: this originally took a full address list. That could not work
      — IslandWalk's 2,391 addresses are 33,000 characters and a URL caps around
      2,000-8,000. Matching on STREET NAME instead reduces IslandWalk to 465
      characters, and it is just as precise: across all four territories no street
      name appears in more than one community.
      Returns rows. It does not summarise, average or count them. */
   if (url.pathname === '/listings') {
     const streets = (url.searchParams.get('streets') || '')
       .split('|').map(s => s.trim().toUpperCase()).filter(Boolean);
     if (!streets.length) {
       return new Response(JSON.stringify({ error: 'no streets supplied' }), { status: 400, headers: CORS });
     }


     /* SQLite caps bound parameters, so query in chunks and merge. */
     let rows = [];
     for (let i = 0; i < streets.length; i += 50) {
       const chunk = streets.slice(i, i + 50);
       const marks = chunk.map(() => '?').join(',');
       const { results } = await env.DB.prepare(
         `SELECT listing_key, listing_id, status, street_number, street_name,
                 street_suffix, unit_number, city, postal_code, subdivision,
                 list_price, beds, baths, living_area, year_built, property_subtype,
                 pool, water_view, new_construction, days_on_market, hoa_monthly,
                 cdd, flood_zone, list_office_name, photos_count
            FROM idx_listings
           WHERE street_name IN (${marks})
             AND status IN ('Active','Pending')`
       ).bind(...chunk).all();
       if (results && results.length) rows = rows.concat(results);
     }
     rows.sort((a, b) => (b.list_price || 0) - (a.list_price || 0));
     return new Response(JSON.stringify({ listings: rows }), { headers: CORS });
   }


   return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: CORS });
 }
};