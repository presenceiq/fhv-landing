/* =============================================================================
   _worker.js — Cloudflare Pages, advanced mode

   ★ WHY _worker.js AND NOT functions/
   Cloudflare's own docs: "Drag and drop deployments made from the Cloudflare
   dashboard do not currently support compiling a functions folder of Pages
   Functions. To deploy a functions folder, you must use Wrangler. However, note
   that a _worker.js file is supported by both Wrangler and drag and drop
   deployments." FHV deploys by dragging a zip, so functions/ is silently ignored
   — the dashboard does not even warn you. This file is the version that works.

   ★ ADVANCED MODE TAKES OVER ALL ROUTING. Every request to the site arrives
   here. Anything this file does not handle MUST be passed to env.ASSETS.fetch,
   or the other 60-odd pages stop being served.

   /palmero-homes-for-sale — server-rendered listings

   WHY THIS IS A FUNCTION AND NOT A STATIC PAGE
   The first version fetched listings in the browser after the page loaded. A
   crawler asking for the HTML received an empty <div> and the words "Loading
   current listings". A pre-rendering specialist describes that exact failure:
   "neighborhood pages often depend on client-side inventory hydration, which
   leaves Googlebot with an attractive shell and weak first HTML."
   This renders the listings INTO the HTML before it is sent, so the visitor and
   the crawler receive the same finished page. No JavaScript is needed on the
   page at all.

   COMPLIANCE — Stellar MLS Participant Data Access Agreement, 18 Aug 2026, ¶5:
   IDX use only, any other use strictly prohibited. Ben Martin, Data & Technology
   Compliance: "valuations, analytics, automations or any use other than public
   listing display is prohibited."
   NOTHING HERE CALCULATES ANYTHING FROM THE FEED. It selects rows and prints
   them. No medians, no averages, no counts presented as statistics.
   The county figures in the second section are FHV's own published public-records
   data and are hard-coded, not derived from MLS data. Ben's guidance on mixing
   sources: "creating a separate section with a header or other identifier for the
   public records portion."

   REQUIRES a D1 binding named DB on the Pages project:
   Settings > Bindings > Add > D1 database > variable name DB > fhv-leads
   ========================================================================== */

/* One entry per community listings page. Adding a community means adding a
   config entry and a HEAD/TAIL pair below — the rendering itself is shared. */
const COMMUNITIES = {
  '/palmero-homes-for-sale': {
    name: 'Palmero',
    zip: '34275',
    streets: ['ARCHIPELAGO','BLUE REEF','EQUATOR','HAVEN','ISLA PALMA','SHADY PALMS','WINDY BAY'],
    empty: 'There are no homes listed for sale in Palmero at the moment. That happens in a '
         + 'community this size. Call 941-662-9941 and I will tell you what is coming before '
         + 'it reaches the market.'
  },
  '/talon-preserve-homes-for-sale': {
    name: 'Talon Preserve',
    zip: '34275',
    streets: ['BALD CYPRESS','CRESTED EAGLE','CYPRESS WOOD','EAGLE BRANCH','FISH EAGLE',
              'GOLDEN GRASS','GRANDE TALON','HIDDEN SAWGRASS','LITTLE EAGLE','MISTY POND',
              'MOSSY PINE','RIVER BIRCH','SAWGRASS LAKE','SILVER GRASS','TALON PRESERVE',
              'WINDING PINE','WIRE GRASS'],
    empty: 'There are no homes listed for sale in Talon Preserve at the moment. '
         + 'Call 941-662-9941 and I will tell you what is coming before it reaches the market.'
  },
  '/gran-paradiso-homes-for-sale': {
    name: 'Gran Paradiso',
    zip: '34293',
    streets: ['AMERIGO','AMICA','BASILICA','BENISSIMO','BRILLIANTE','BUONO','CAMPANILE','CANAVESE','CARAVAGGIO','CINQUETERRE','CLASSICO','CRISTOFORO','DUOMO','ELEGANTE','FAMIGLIA','FELICE','GARIBALDI','GHIBERTI','GRANLAGO','GRAZIE','LAGENTE','LOGGIA','PASSAGIO','PORTENZA','PREGO','RAGAZZA','REALE','RICHEZZA','ROMAGNA','SALUTI','TESORO','TRATTORIA','UFFIZI','VALORE','VALPRATO','VANCANZA','VITA'],
    empty: 'There are no homes listed for sale in Gran Paradiso at the moment. '
         + 'Call 941-662-9941 and I will tell you what is coming before it reaches the market.'
  },
  '/islandwalk-homes-for-sale': {
    name: 'IslandWalk',
    zip: '34293',
    streets: ['ALAFAYA','ATTAVIANO','BASTIANO','BIANCHI','BORREGO','BOTTERI','CALIMENTO','CAMPOLEONE','COLUCCIO','CORRADINO','DIMARCO','ERICE','ESPOSITO','FASSIO','FERNANDO','FORMOSA','GUYANA','HUERTA','IPOLITA','ISADORA','JACINDA','JALISCA','KARINA','KIRELLA','LANUVIO','LAPPACIO','LIDO','MANGIERI','MAZZARA','MIRANESE','NAVARRO','NEVIANO','NOBILIO','ORIAGO','ORINO','ORTONA','PACCHIO','PELTO','PETRINO','PIERO','POSADA','QUINTA','QUISTO','RICCI','RINELLA','RINUCCIO','RIZZUTO','ROSALIA','ROSAMARIA','SALINAS','SAYDA','SERAFINA','SOLARZANO','TOMARO','TRENTINO','UMBRIA','VADINI','VERANDI','YELMA'],
    empty: 'There are no homes listed for sale in IslandWalk at the moment. '
         + 'Call 941-662-9941 and I will tell you what is coming before it reaches the market.'
  },
  '/grand-palm-homes-for-sale': {
    name: 'Grand Palm',
    zip: '34293',
    streets: ['ALACHUA', 'ANCLOTE', 'AVON PARK', 'CALHOUN', 'CALLAWAY', 'COLLIER', 'DAVIE', 'DESTIN', 'FAKAHATCHEE', 'FORT LAUDERDALE', 'FORT MYERS', 'GAINESVILLE', 'HUNTERS CREEK', 'MARATHON', 'OKALOOSA', 'SAGEWOOD', 'SEBRING', 'SHIMMERING OAK', 'STILL RIVER', 'STUART', 'WAKULLA', 'WINTER PARK'],
    empty: 'There are no homes listed for sale in Grand Palm at the moment. '
         + 'Call 941-662-9941 and I\'ll tell you what\'s coming before it reaches the market.'
  },
  '/sarasota-national-homes-for-sale': {
    name: 'Sarasota National',
    zip: '34293',
    streets: ['AWABUKI', 'BANBURY', 'BULLRUSH', 'CANTERWOOD', 'COLUBRINA', 'COPPERLEAF', 'CORKWOOD', 'COZY GROVE', 'CROOKED CREEK', 'EUPHORIA', 'FIDDLEWOOD', 'GALLBERRY', 'IRONBRIDGE', 'LANTANA', 'MEDJOOL', 'SKYFLOWER', 'SPARTINA', 'STAGGERBUSH', 'TARFLOWER', 'WAVERLY', 'WHISK FERN'],
    empty: 'There are no homes listed for sale in Sarasota National at the moment. '
         + 'Call 941-662-9941 and I\'ll tell you what\'s coming before it reaches the market.'
  },
  '/renaissance-homes-for-sale': {
    name: 'Renaissance',
    zip: '34293',
    streets: ['ALESSANDRO', 'BANDERA', 'BOHEMIAN', 'CONCERTO', 'GALILEO', 'MINUET', 'OVID', 'RENAISSANCE', 'REVIVAL', 'SANZIO', 'SISTINE', 'SYMPHONY', 'TAPESTRY'],
    empty: 'There are no homes listed for sale in Renaissance at the moment. '
         + 'Call 941-662-9941 and I\'ll tell you what\'s coming before it reaches the market.'
  },
  '/sunstone-homes-for-sale': {
    name: 'Sunstone',
    zip: '34293',
    streets: ['ARBOR VISTA', 'ASANA', 'ETHOS', 'GRAND PROSPERITY', 'HEARTS EASE', 'MANDALA', 'MEDITATION', 'NEW TRANQUILITY', 'SEALIGHT', 'SOLSTICE', 'SOMATIC', 'STARBRIGHT', 'STILLNESS', 'VISTA PARK', 'WELLSPRING'],
    empty: 'There are no homes listed for sale in Sunstone at the moment. '
         + 'Call 941-662-9941 and I\'ll tell you what\'s coming before it reaches the market.'
  },
  '/brightmore-homes-for-sale': {
    name: 'Brightmore',
    zip: '34293',
    streets: ['BOUNDLESS', 'CHROMATA', 'GREEN GARDEN', 'LIVEWELL', 'MYAKKA BLUE', 'ROSE GOLD', 'WATERCOLOR'],
    empty: 'There are no homes listed for sale in Brightmore at the moment. '
         + 'Call 941-662-9941 and I\'ll tell you what\'s coming before it reaches the market.'
  },
  '/sunrise-preserve-homes-for-sale': {
    name: 'Sunrise Preserve',
    zip: '34238',
    streets: ['BAY MEADOW', 'BLUE WATER', 'FALL MOON', 'HOPE SOUND', 'LONG SHORE', 'MORNING SUN', 'RAIN SONG', 'SEPTEMBER SKY', 'SUNDANCE'],
    empty: 'There are no homes listed for sale in Sunrise Preserve at the moment. '
         + 'Call 941-662-9941 and I\'ll tell you what\'s coming before it reaches the market.'
  }
};

/* A page never renders more than this many listings. Competitors paginate; at these
   volumes a cap plus a line saying how to see the rest is simpler and honest. */
const MAX_SHOWN = 24;

const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const num   = n => Number(n || 0).toLocaleString('en-US');
const esc   = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const PHOTO_BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';

function card(r) {
  const addr = [r.street_number, r.street_name, r.street_suffix].filter(Boolean).join(' ')
             + (r.unit_number ? ' #' + r.unit_number : '');

  const bits = [];
  if (r.beds != null) bits.push(r.beds + ' bd');
  if (r.baths != null) bits.push(r.baths + ' ba');
  if (r.living_area) bits.push(num(r.living_area) + ' sq ft');
  if (r.year_built) bits.push('built ' + r.year_built);

  const tags = [];
  if (r.pool) tags.push('Pool');
  if (r.water_view) tags.push('Water view');
  /* NewConstructionYN persists on a record for years, so trust the year built. */
  if (r.new_construction && r.year_built && (new Date().getFullYear() - r.year_built) <= 2) {
    tags.push('New construction');
  }
  if (r.days_on_market != null) {
    tags.push(r.days_on_market + (r.days_on_market === 1 ? ' day on market' : ' days on market'));
  }
  if (r.flood_zone) tags.push('Flood zone ' + esc(String(r.flood_zone).toUpperCase()));

  const fees = [];
  if (r.hoa_monthly) fees.push('HOA about ' + money(r.hoa_monthly) + '/mo');
  if (r.cdd) fees.push('CDD');

  /* Brokerage names often already end in a period. */
  const office = String(r.list_office_name || 'the listing brokerage').replace(/\.+$/, '');

  let h = '<div class="card">';

  /* Photos come from FHV's own R2 bucket, never from an MLS Grid URL. Only the
     first is loaded eagerly; the rest are lazy so a page of 24 listings does not
     pull 500 images at once. */
  if (r.photos && r.photos.length) {
    /* One large image with clickable thumbnails beneath it. Baymard's large-scale
       UX testing found thumbnails "the universal solution across platforms", with
       the lowest rate of accidental taps on mobile — better than dots or counters.
       Tapping a thumbnail swaps the main image with no page load.
       TEN thumbnails, not four: Baymard's point is that thumbnails should
       REPRESENT the additional images, and four out of fifty does not.
       No lightbox. The evidence for one comes mostly from agencies that sell
       lightbox builds, and this page's job is to prompt a call, not to out-browse
       Zillow. Revisit if GA4 shows people engaging heavily with photos. */
    const src = k => PHOTO_BASE + encodeURIComponent(k);
    const gid = 'g' + String(r.listing_key || '').replace(/[^A-Za-z0-9]/g, '');
    /* The whole photo list travels with the card so the lightbox can open at any
       image without another request. Keys only — the URL is built on the client. */
    const all = r.photos.map(k => encodeURIComponent(k)).join('|');
    h += '<div class="shot" data-all="' + all + '" data-addr="' + esc(addr) + '">'
       + '<img id="' + gid + '" src="' + src(r.photos[0]) + '" alt="' + esc(addr)
       + '" loading="lazy" decoding="async">'
       + '<span class="viewall">View all ' + r.photos.length + ' photos</span></div>';
    if (r.photos.length > 1) {
      const shown = r.photos.slice(0, 10);
      /* ★ Only the first three thumbnails carry a src. The other seven hold their
         URL in data-src and load when the card scrolls into view. A page of 24
         listings was otherwise requesting 264 full-size images at once, which is
         what made it slow. */
      h += '<div class="strip">'
         + shown.map((k, n) =>
             '<img' + (n < 3 ? ' src="' + src(k) + '"' : ' data-src="' + src(k) + '"')
             + ' alt="" loading="lazy" decoding="async"'
             + ' class="th' + (n === 0 ? ' on' : '') + '"'
             + ' data-g="' + gid + '" data-full="' + src(k) + '">').join('')
         /* The count used to live here. It now sits on the image itself as
            "View all N photos", which both states the total and says what to do
            about it. Two copies of the same number six inches apart is noise. */
         + '</div>';
    }
  }
  else {
    /* ★ NO PHOTO. A blank space next to cards that have images reads as broken,
       and a grid where two of twelve have pictures looks like a fault rather than
       a limit. This is a plain branded panel, deliberately NOT a stock house:
       a generic photo beside a real address would read as a picture of THAT
       property, which is exactly what a display audit flags.
       Styled inline so the five page templates need no CSS change. */
    h += '<div style="margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;'
       + 'aspect-ratio:4/3;background:var(--warm);display:flex;flex-direction:column;'
       + 'align-items:center;justify-content:center;text-align:center;padding:1rem;'
       + 'border-bottom:1px solid rgba(26,24,20,.08);">'
       + '<div style="font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:.1em;'
       + 'text-transform:uppercase;opacity:.55;margin-bottom:.45rem;">Photo not available</div>'
       + '<div style="font-size:14px;line-height:1.5;opacity:.75;max-width:22ch;">'
       + 'Call <a href="tel:9416629941" style="color:inherit;">941-662-9941</a> and I will send you the photos.</div>'
       + '</div>';
  }

  h += '<div class="price">' + money(r.list_price);
  if (r.status === 'Pending') h += '<span class="pill">Under contract</span>';
  h += '</div>';
  h += '<div class="addr">' + esc(addr) + '</div>';
  h += '<div class="sub">' + esc(r.city || '') + ' ' + esc(r.postal_code || '')
     + (r.property_subtype ? ' &middot; ' + esc(r.property_subtype) : '') + '</div>';
  if (bits.length) h += '<div class="specs">' + bits.join(' &middot; ') + '</div>';
  if (tags.length) h += '<div class="tags">' + tags.join(' &middot; ') + '</div>';
  if (fees.length) h += '<div class="fees">' + fees.join(' &middot; ') + '</div>';
  /* Article 19.23: attribute the listing brokerage on the listing itself. */
  h += '<div class="courtesy">Listing courtesy of ' + esc(office) + '. Stellar MLS via MLS GRID.</div>';
  h += '</div>';
  return h;
}

async function renderCommunity(env, cfg, HEAD, TAIL, path, page) {
  let listingsHtml = '';
  let updated = '';

  try {
    const marks = cfg.streets.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT listing_key, listing_id, status, street_number, street_name, street_suffix,
              unit_number, city, postal_code, subdivision, list_price, beds, baths,
              living_area, year_built, property_subtype, pool, water_view,
              new_construction, days_on_market, hoa_monthly, cdd, flood_zone,
              list_office_name, photos_count
         FROM idx_listings
        WHERE street_name IN (${marks})
          AND postal_code = ?
          AND status IN ('Active','Pending')
        ORDER BY list_price DESC`
    ).bind(...cfg.streets, cfg.zip).all();

    let rows = results || [];

    /* Attach whichever photos have already been downloaded. The queue drains over
       days, so most listings have none yet — the card handles that. One query for
       the whole page rather than one per listing. */
    if (rows.length) {
      try {
        const keys = rows.map(r => r.listing_key);
        const photos = {};
        for (let i = 0; i < keys.length; i += 40) {
          const chunk = keys.slice(i, i + 40);
          const marks = chunk.map(() => '?').join(',');
          const pr = await env.DB.prepare(
            `SELECT listing_key, r2_key, ord FROM idx_media
              WHERE listing_key IN (${marks}) AND status = 'stored'
              ORDER BY listing_key, ord`
          ).bind(...chunk).all();
          for (const m of (pr.results || [])) {
            (photos[m.listing_key] = photos[m.listing_key] || []).push(m.r2_key);
          }
        }
        rows = rows.map(r => Object.assign({}, r, { photos: photos[r.listing_key] || [] }));
      } catch (e) { /* photos are a bonus — never break the listings over them */ }
    }

    if (rows.length) {
      /* Real pagination rather than a cap. "Call me for the rest" is a dead end —
         a visitor who wants to see everything should be able to. */
      const total = rows.length;
      const pages = Math.ceil(total / MAX_SHOWN);
      const p = Math.min(Math.max(page || 1, 1), pages);
      const from = (p - 1) * MAX_SHOWN;
      const shown = rows.slice(from, from + MAX_SHOWN);

      listingsHtml = '';
      if (pages > 1) {
        listingsHtml += '<p class="note">Showing <strong>' + (from + 1) + '&ndash;'
          + (from + shown.length) + '</strong> of <strong>' + total + '</strong> homes currently '
          + 'listed in ' + cfg.name + '. Page ' + p + ' of ' + pages + '.</p>';
      }
      listingsHtml += '<div class="grid">' + shown.map(card).join('') + '</div>';

      if (pages > 1) {
        const lnk = (n, label, off) => off
          ? '<span class="pg pg-off">' + label + '</span>'
          : '<a class="pg" href="' + path + (n > 1 ? '?page=' + n : '') + '">' + label + '</a>';
        listingsHtml += '<nav class="pager">'
          + lnk(p - 1, '&larr; Previous', p <= 1)
          + '<span class="pg-now">Page ' + p + ' of ' + pages + '</span>'
          + lnk(p + 1, 'Next &rarr;', p >= pages)
          + '</nav>';
      }
      updated = ' Listings updated ' +
        new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' Eastern.';
    } else {
      listingsHtml = '<p class="note">' + cfg.empty + '</p>';
    }
  } catch (err) {
    /* Never show a broken page. If the database is unreachable, the county section
       below still stands on its own. */
    listingsHtml = '<p class="note">Current listings are temporarily unavailable. '
      + 'Call 941-662-9941 and I will pull them for you.</p>';
  }

  const html = HEAD + listingsHtml + '</div>' + TAIL.replace('<span id="idx-updated"></span>', updated);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      /* Short cache: listings change, but not second to second. */
      'Cache-Control': 'public, max-age=300'
    }
  });
}


/* ============================ /home-search ================================
   A filter-driven search over the replicated listings.

   ★ THIS PAGE IS noindex, AND DELIBERATELY SO. Every filter combination makes a
   new URL, and thousands of near-identical result pages is the scaled-content
   pattern that gets sites demoted. The community pages are what Google should
   index; this page is for people who have already arrived.

   COMPLIANCE: displays listings. Counts how many matched a filter, which is a
   property of the search result and not a market statistic — no medians, no
   averages, no price-per-foot, nothing derived about the market.
   ======================================================================== */

/* Street -> community, so a result can offer the matching recorded-sales page. */
const COMMUNITY_STREETS = {
  'Palmero': ['ARCHIPELAGO','BLUE REEF','EQUATOR','HAVEN','ISLA PALMA','SHADY PALMS','WINDY BAY'],
  'Talon Preserve': ['BALD CYPRESS','CRESTED EAGLE','CYPRESS WOOD','EAGLE BRANCH','FISH EAGLE','GOLDEN GRASS','GRANDE TALON','HIDDEN SAWGRASS','LITTLE EAGLE','MISTY POND','MOSSY PINE','SAWGRASS LAKE','SILVER GRASS','TALON PRESERVE','RIVER BIRCH','WINDING PINE','WIRE GRASS'],
  'Gran Paradiso': ['AMERIGO','AMICA','BASILICA','BENISSIMO','BRILLIANTE','BUONO','CAMPANILE','CANAVESE','CARAVAGGIO','CINQUETERRE','CLASSICO','CRISTOFORO','DUOMO','ELEGANTE','FAMIGLIA','FELICE','GARIBALDI','GHIBERTI','GRANLAGO','GRAZIE','LAGENTE','LOGGIA','PASSAGIO','PORTENZA','PREGO','RAGAZZA','REALE','RICHEZZA','ROMAGNA','SALUTI','TESORO','TRATTORIA','UFFIZI','VALORE','VALPRATO','VANCANZA','VITA'],
  'IslandWalk': ['ALAFAYA','ATTAVIANO','BASTIANO','BIANCHI','BORREGO','BOTTERI','CALIMENTO','CAMPOLEONE','COLUCCIO','CORRADINO','DIMARCO','ERICE','ESPOSITO','FASSIO','FERNANDO','FORMOSA','GUYANA','HUERTA','IPOLITA','ISADORA','JACINDA','JALISCA','KARINA','KIRELLA','LANUVIO','LAPPACIO','LIDO','MANGIERI','MAZZARA','MIRANESE','NAVARRO','NEVIANO','NOBILIO','ORIAGO','ORINO','ORTONA','PACCHIO','PELTO','PETRINO','PIERO','POSADA','QUINTA','QUISTO','RICCI','RINELLA','RINUCCIO','RIZZUTO','ROSALIA','ROSAMARIA','SALINAS','SAYDA','SERAFINA','SOLARZANO','TOMARO','TRENTINO','UMBRIA','VADINI','VERANDI','YELMA'],
  'Grand Palm': ['ALACHUA', 'ANCLOTE', 'AVON PARK', 'CALHOUN', 'CALLAWAY', 'COLLIER', 'DAVIE', 'DESTIN', 'FAKAHATCHEE', 'FORT LAUDERDALE', 'FORT MYERS', 'GAINESVILLE', 'HUNTERS CREEK', 'MARATHON', 'OKALOOSA', 'SAGEWOOD', 'SEBRING', 'SHIMMERING OAK', 'STILL RIVER', 'STUART', 'WAKULLA', 'WINTER PARK'],
  'Sarasota National': ['AWABUKI', 'BANBURY', 'BULLRUSH', 'CANTERWOOD', 'COLUBRINA', 'COPPERLEAF', 'CORKWOOD', 'COZY GROVE', 'CROOKED CREEK', 'EUPHORIA', 'FIDDLEWOOD', 'GALLBERRY', 'IRONBRIDGE', 'LANTANA', 'MEDJOOL', 'SKYFLOWER', 'SPARTINA', 'STAGGERBUSH', 'TARFLOWER', 'WAVERLY', 'WHISK FERN'],
  'Renaissance': ['ALESSANDRO', 'BANDERA', 'BOHEMIAN', 'CONCERTO', 'GALILEO', 'MINUET', 'OVID', 'RENAISSANCE', 'REVIVAL', 'SANZIO', 'SISTINE', 'SYMPHONY', 'TAPESTRY'],
  'Sunstone': ['ARBOR VISTA', 'ASANA', 'ETHOS', 'GRAND PROSPERITY', 'HEARTS EASE', 'MANDALA', 'MEDITATION', 'NEW TRANQUILITY', 'SEALIGHT', 'SOLSTICE', 'SOMATIC', 'STARBRIGHT', 'STILLNESS', 'VISTA PARK', 'WELLSPRING'],
  'Brightmore': ['BOUNDLESS', 'CHROMATA', 'GREEN GARDEN', 'LIVEWELL', 'MYAKKA BLUE', 'ROSE GOLD', 'WATERCOLOR'],
  'Sunrise Preserve': ['BAY MEADOW', 'BLUE WATER', 'FALL MOON', 'HOPE SOUND', 'LONG SHORE', 'MORNING SUN', 'RAIN SONG', 'SEPTEMBER SKY', 'SUNDANCE']
};
const COMMUNITY_PAGE = {
  'Palmero': '/palmero-homes-for-sale',
  'Talon Preserve': '/talon-preserve-homes-for-sale',
  'Gran Paradiso': '/gran-paradiso-homes-for-sale',
  'IslandWalk': '/islandwalk-homes-for-sale',
  'Grand Palm': '/grand-palm-homes-for-sale',
  'Sarasota National': '/sarasota-national-homes-for-sale',
  'Renaissance': '/renaissance-homes-for-sale',
  'Sunstone': '/sunstone-homes-for-sale',
  'Brightmore': '/brightmore-homes-for-sale',
  'Sunrise Preserve': '/sunrise-preserve-homes-for-sale'
};
/* ★ Keyed on STREET + ZIP. Street name alone is not unique across the state:
   a "Haven" exists in Tarpon Springs, Orlando, Arcadia, Cape San Blas and New
   Port Richey; "Bald Cypress" in Lakeland and Parrish; "Mossy Pine" in Tampa.
   Before this, fifteen out-of-area listings were appearing on the Palmero and
   Talon pages. */
const COMMUNITY_ZIP = { 'Palmero': '34275', 'Talon Preserve': '34275',
                        'Gran Paradiso': '34293', 'IslandWalk': '34293',
                        'Grand Palm': '34293',
                        'Sarasota National': '34293',
                        'Renaissance': '34293',
                        'Sunstone': '34293',
                        'Brightmore': '34293',
                        'Sunrise Preserve': '34238' };
const STREET_TO_COMMUNITY = (() => {
  const m = {};
  for (const c in COMMUNITY_STREETS)
    for (const s of COMMUNITY_STREETS[c]) m[s + '|' + COMMUNITY_ZIP[c]] = c;
  return m;
})();

/* Results per page. Portals show 20-25 with pagination; a hard cap with no way
   forward reads as "that is all there is" when it is not. */
const PER_PAGE = 24;

function opt(v, cur, label){
  return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + label + '</option>';
}


/* Describe a search the way a person would say it, so the alert prompt reads
   naturally and the lead record is legible without decoding query strings. */
function describeSearch(q) {
  const bits = [];
  const beds = q.get('beds');
  const type = q.get('type');
  const noun = type ? ({'Single Family Residence':'single-family homes','Villa':'villas',
                        'Townhouse':'townhomes','Condominium':'condos'}[type] || type) : 'homes';
  bits.push(beds ? beds + '+ bedroom ' + noun : noun);
  if (q.get('pool') === '1') bits.push('with a pool');
  const minP = q.get('minp'), maxP = q.get('maxp');
  if (minP && maxP) bits.push('between $' + Number(minP).toLocaleString('en-US') + ' and $' + Number(maxP).toLocaleString('en-US'));
  else if (maxP) bits.push('under $' + Number(maxP).toLocaleString('en-US'));
  else if (minP) bits.push('over $' + Number(minP).toLocaleString('en-US'));
  const city = q.get('city'); if (city) bits.push('in ' + city.charAt(0) + city.slice(1).toLowerCase());
  const minyr = q.get('minyr'); if (minyr) bits.push('built ' + minyr + ' or later');
  const hoa = q.get('maxhoa'); if (hoa) bits.push('HOA under $' + hoa + '/mo');
  if (q.get('nohoa') === '1') bits.push('with no HOA');
  return bits.join(', ');
}

async function renderSearch(env, url, saved) {
  const q = url.searchParams;
  const city   = (q.get('city')   || '').trim();
  const type   = (q.get('type')   || '').trim();
  const minP   = parseInt(q.get('minp') || '', 10);
  const maxP   = parseInt(q.get('maxp') || '', 10);
  const beds   = parseInt(q.get('beds') || '', 10);
  const pool   = q.get('pool')   === '1';
  const noHoa  = q.get('nohoa')  === '1';
  const maxHoa = parseInt(q.get('maxhoa') || '', 10);
  const minYr  = parseInt(q.get('minyr') || '', 10);
  let page = parseInt(q.get('page') || '1', 10);
  if (isNaN(page) || page < 1) page = 1;
  const searched = [...q.keys()].filter(k => k !== 'page' && k !== 'saved').length > 0;

  let rows = [], total = 0, err = false;

  if (searched) {
    const where = ["status IN ('Active','Pending')",
                   "postal_code >= '32000'", "postal_code <= '34999'"];
    const bind = [];
    if (city) { where.push('city = ?'); bind.push(city.toUpperCase()); }
    if (type) { where.push('property_subtype = ?'); bind.push(type); }
    if (!isNaN(minP)) { where.push('list_price >= ?'); bind.push(minP); }
    if (!isNaN(maxP)) { where.push('list_price <= ?'); bind.push(maxP); }
    if (!isNaN(beds)) { where.push('beds >= ?'); bind.push(beds); }
    if (pool) where.push('pool = 1');
    if (noHoa) where.push('(hoa_monthly IS NULL OR hoa_monthly = 0)');
    else if (!isNaN(maxHoa)) where.push('(hoa_monthly IS NULL OR hoa_monthly <= ' + maxHoa + ')');
    if (!isNaN(minYr)) { where.push('year_built >= ?'); bind.push(minYr); }
    const clause = where.join(' AND ');

    try {
      /* Count first, so the visitor is told how many matched rather than just
         how many are on screen. "Showing the first 60" reads as "that is all
         there is" when it is 60 of nearly three thousand. */
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM idx_listings WHERE ' + clause)
        .bind(...bind).first();
      total = c ? c.n : 0;

      const sql = 'SELECT listing_key, status, street_number, street_name, street_suffix, '
        + 'unit_number, city, postal_code, list_price, beds, baths, living_area, year_built, '
        + 'property_subtype, pool, water_view, new_construction, days_on_market, hoa_monthly, '
        + 'cdd, flood_zone, list_office_name FROM idx_listings WHERE ' + clause
        + ' ORDER BY list_price DESC LIMIT ' + PER_PAGE + ' OFFSET ' + ((page - 1) * PER_PAGE);
      const r = await env.DB.prepare(sql).bind(...bind).all();
      rows = r.results || [];

      /* Attach photos, same as the community listings pages do. Without this the
         search page drew every card photoless even for listings whose images were
         already stored — a Palmero result looked emptier here than on its own
         community page. One query for the page, chunked, and photos never break
         the search: a failure here leaves the cards exactly as they were. */
      if (rows.length) {
        try {
          const keys = rows.map(x => x.listing_key);
          const photos = {};
          for (let i = 0; i < keys.length; i += 40) {
            const chunk = keys.slice(i, i + 40);
            const marks = chunk.map(() => '?').join(',');
            const pr = await env.DB.prepare(
              `SELECT listing_key, r2_key, ord FROM idx_media
                WHERE listing_key IN (${marks}) AND status = 'stored'
                ORDER BY listing_key, ord`
            ).bind(...chunk).all();
            for (const m of (pr.results || [])) {
              (photos[m.listing_key] = photos[m.listing_key] || []).push(m.r2_key);
            }
          }
          rows = rows.map(x => Object.assign({}, x, { photos: photos[x.listing_key] || [] }));
        } catch (e) { /* photos are a bonus - never break the search over them */ }
      }
    } catch (e) { err = true; }
  }

  /* Distinct cities for the dropdown — FLORIDA ONLY.
     Stellar's feed carries international listings: Puerto Rico (Bayamon, Caguas,
     San Juan, Ponce), plus Bogota, Cartagena, Loja, Punta Cana. Those appeared in
     the dropdown and are places Michael cannot serve. Florida ZIP codes run
     32000-34999; Puerto Rico's are 006xx-009xx and the rest have no US ZIP at all.
     Cities are only offered if they have at least a handful of listings, so the
     list stays usable. */
  let cities = [];
  try {
    const c = await env.DB.prepare(
      "SELECT city, COUNT(*) AS n FROM idx_listings " +
      "WHERE city IS NOT NULL AND city != '' " +
      "AND postal_code >= '32000' AND postal_code <= '34999' " +
      "GROUP BY city HAVING n >= 3 ORDER BY city"
    ).all();
    cities = (c.results || []).map(x => x.city);
  } catch (e) {}

  let results = '';
  if (err) {
    results = '<p class="note">Search is temporarily unavailable. Call 941-662-9941 and I will run it for you.</p>';
  } else if (!searched) {
    results = '<p class="note">Choose what matters to you and press Search.</p>';
  } else if (!rows.length) {
    results = '<p class="note">Nothing currently matches. Try widening the price range or removing a filter '
      + ', or call <a href="tel:9416629941">941-662-9941</a> and I\'ll look for you.</p>';
  } else {
    const pages = Math.ceil(total / PER_PAGE);
    const from = (page - 1) * PER_PAGE + 1;
    const to = Math.min(page * PER_PAGE, total);

    results = '<p class="note">Showing <strong>' + from + '&ndash;' + to + '</strong> of <strong>'
      + total.toLocaleString('en-US') + '</strong> '
      + (total === 1 ? 'home' : 'homes') + ' currently for sale.'
      + (pages > 1 ? ' Page ' + page + ' of ' + pages.toLocaleString('en-US') + '.' : '')
      + '</p><div class="grid">' + rows.map(r => {
          let h = card(r);
          const comm = STREET_TO_COMMUNITY[r.street_name + '|' + r.postal_code];
          if (comm) {
            h = h.slice(0, h.lastIndexOf('</div>'))
              + '<div style="font-size:13px;margin-top:.5rem;"><a href="' + COMMUNITY_PAGE[comm]
              + '">See what ' + comm + ' homes have sold for &rarr;</a></div></div>';
          }
          return h;
        }).join('') + '</div>';

    /* Pagination. Keeps every filter, changes only the page. */
    if (pages > 1) {
      const link = (p, label, dis) => {
        if (dis) return '<span class="pg pg-off">' + label + '</span>';
        const u = new URLSearchParams(q);
        u.delete('saved');
        u.set('page', p);
        return '<a class="pg" href="/home-search?' + u.toString() + '">' + label + '</a>';
      };
      results += '<nav class="pager">'
        + link(page - 1, '&larr; Previous', page <= 1)
        + '<span class="pg-now">Page ' + page + ' of ' + pages.toLocaleString('en-US') + '</span>'
        + link(page + 1, 'Next &rarr;', page >= pages)
        + '</nav>';
    }
  }

  const nice = c => c.split(' ').map(x => x.charAt(0) + x.slice(1).toLowerCase()).join(' ');
  const cityList = cities.map(c => '<option value="' + esc(nice(c)) + '">').join('');

  /* ★ THE ALERT, NOT A GATE.
     The search is never blocked. This appears only AFTER a search has run and
     found something, and it offers what scrolling cannot: being told when a NEW
     match appears. A vendor-neutral coaching source puts the rule plainly:
     "never gate something the buyer can get for free elsewhere. If your search
     feels stingier than the portals, the prompt reads as a toll, not a benefit."
     This site shows the same Stellar data the portals show free, so a wall would
     read as a toll. The alert is the thing they cannot get by scrolling. */
  let alertBlock = '';
  if (saved === 'ok') {
    alertBlock = '<div class="alertbox alertbox-done"><strong>Done.</strong> '
      + 'I will email you when a new home matches. No spam, and you can tell me to stop any time.</div>';
  } else if (searched && rows.length) {
    const desc = describeSearch(q);
    const hidden = [...q.entries()].filter(([k]) => k !== 'email' && k !== 'saved')
      .map(([k, v]) => '<input type="hidden" name="' + k + '" value="' + esc(v) + '">').join('');
    alertBlock = '<div class="alertbox">'
      + '<h3>Want to know the moment a new one comes up?</h3>'
      + '<p>New listings appear before most people are looking. Leave your email and I will tell '
      + 'you when a home matches' + (desc ? ': <em>' + esc(desc) + '</em>' : ' this search') + '.</p>'
      + '<form method="post" action="/home-search">' + hidden
      + '<input type="email" name="email" placeholder="you@example.com" required>'
      + '<button type="submit">Email me new matches</button>'
      + '</form>'
      + '<p class="fine">Your details are never sold or shared. '
      + '<a href="https://floridahomevalueai.com/privacy">Privacy policy</a>.</p>'
      + '</div>';
  }

  const html = SEARCH_HEAD
    + '<form method="get" class="filters">'
    +   '<label>Area<input name="city" list="fl-cities" autocomplete="off" '
    +     'placeholder="Any area, or type a city" value="' + esc(city ? nice(city) : '') + '">'
    +     '<datalist id="fl-cities">' + cityList + '</datalist></label>'
    +   '<label>Type<select name="type">'
    +     opt('', type, 'Any type')
    +     opt('Single Family Residence', type, 'Single-family')
    +     opt('Villa', type, 'Villa')
    +     opt('Townhouse', type, 'Townhome')
    +     opt('Condominium', type, 'Condo')
    +   '</select></label>'
    +   '<label>Price from<select name="minp">' + ['','200000','300000','400000','500000','600000','750000','1000000']
          .map(v => opt(v, q.get('minp'), v ? '$' + Number(v).toLocaleString('en-US') : 'No minimum')).join('') + '</select></label>'
    +   '<label>Price to<select name="maxp">' + ['','300000','400000','500000','600000','750000','1000000','2000000']
          .map(v => opt(v, q.get('maxp'), v ? '$' + Number(v).toLocaleString('en-US') : 'No maximum')).join('') + '</select></label>'
    +   '<label>Beds<select name="beds">' + ['','2','3','4','5']
          .map(v => opt(v, q.get('beds'), v ? v + '+' : 'Any')).join('') + '</select></label>'
    +   '<label>Built after<select name="minyr">' + ['','2000','2010','2015','2020','2023']
          .map(v => opt(v, q.get('minyr'), v || 'Any year')).join('') + '</select></label>'
    +   '<label>HOA<select name="maxhoa">' + ['','100','200','300','500']
          .map(v => opt(v, q.get('maxhoa'), v ? 'Under $' + v + '/mo' : 'Any HOA')).join('') + '</select></label>'
    +   '<label class="chk"><input type="checkbox" name="pool" value="1"' + (pool ? ' checked' : '') + '> Pool</label>'
    +   '<label class="chk"><input type="checkbox" name="nohoa" value="1"' + (noHoa ? ' checked' : '') + '> No HOA</label>'
    +   '<button type="submit">Search</button>'
    + '</form>'
    + results
    + alertBlock
    + SEARCH_TAIL;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');   // tolerate a trailing slash

    /* ---- Near-miss addresses -> the real page, 301 ------------------------
       Two jobs.
       1. ALIASES: addresses people and AI assistants guess at. Sent to the
          real page instead of the 404 page, so the click is not wasted.
       2. RUN-ON: a published link that got joined to the next word, e.g.
          /property-tax-calculatorIt from a Facebook post. Only fires when the
          leftover is plain letters with no hyphen or slash, so real pages like
          /palmero-homes-for-sale can never be caught by it.
       Anything not matched here falls through untouched to the normal
       routing below and, if it is not a real page, to 404.html.        ---- */
    const ALIASES = {
      '/tax-calculator':            '/property-tax-calculator',
      '/property-tax':              '/property-tax-calculator',
      '/propertytaxcalculator':     '/property-tax-calculator',
      '/homestead-calculator':      '/property-tax-calculator',
      '/amendment-3':               '/property-tax-calculator',
      '/amendment3':                '/property-tax-calculator',
      '/homestead-exemption':       '/homestead',
      '/home-values':               '/home-value',
      '/value':                     '/home-value',
      '/valuation':                 '/home-value',
      '/what-is-my-home-worth':     '/home-value',
      '/whats-my-home-worth':       '/home-value',
      '/market-reports':            '/market-report',
      '/directory':                 '/local-home-services',
      '/home-services':             '/local-home-services',
      '/contact':                   '/meet',
      '/about':                     '/meet',
      '/agents':                    '/for-agents',
      '/search':                    '/home-search',
      '/listings':                  '/home-search'
    };
    const RUNON_TARGETS = [
      '/property-tax-calculator',
      '/home-value',
      '/home-search',
      '/market-report',
      '/local-home-services',
      '/seller-guide',
      '/buyer-guide',
      '/homestead',
      '/flood-zones',
      '/for-agents',
      '/meet'
    ];

    const lower = path.toLowerCase();
    let fixed = ALIASES[lower] || null;
    if (!fixed) {
      for (const target of RUNON_TARGETS) {
        if (lower.length > target.length &&
            lower.startsWith(target) &&
            /^[a-z]+$/.test(lower.slice(target.length))) {
          fixed = target;
          break;
        }
      }
    }
    if (fixed && fixed !== path) {
      const to = new URL(request.url);
      to.pathname = fixed;
      return Response.redirect(to.toString(), 301);
    }

    if (path === '/home-search') {
      try {
        if (request.method === 'POST') {
          const form = await request.formData();
          const email = (form.get('email') || '').toString().trim();
          const q = new URLSearchParams();
          for (const [k, v] of form.entries()) if (k !== 'email') q.set(k, v.toString());
          if (email) {
            /* Same vault the rest of the site writes to, same payload shape. */
            await fetch('https://fhv-lead-vault.cleirshusband.workers.dev/', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: '', phone: '', email: email, address: '',
                territory_id: 'Home search - new listing alert',
                subdivision: q.get('city') || 'Southwest Florida',
                wants: 'Wants an alert when a new home matches: ' + (describeSearch(q) || 'their saved search')
              })
            }).catch(() => {});
          }
          const back = new URL(request.url);
          back.search = q.toString();
          back.searchParams.set('saved', 'ok');
          return Response.redirect(back.toString(), 303);
        }
        return await renderSearch(env, url, url.searchParams.get('saved'));
      }
      catch (err) {
        return new Response('Search temporarily unavailable. Call 941-662-9941.',
          { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    }

    const cfg = COMMUNITIES[path];
    if (cfg) {
      try {
        const pair = PAGES[path];
        let pg = parseInt(url.searchParams.get('page') || '1', 10);
        if (isNaN(pg) || pg < 1) pg = 1;
        return await renderCommunity(env, cfg, pair.head, pair.tail, path, pg);
      } catch (err) {
        /* Never take the site down over one page. */
        return new Response('Temporarily unavailable. Call 941-662-9941.',
          { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    }

    /* Everything else is a static asset — the other 60-odd pages, the images,
       sitemap.xml, robots.txt, llms.txt. This line is not optional. */
    return env.ASSETS.fetch(request);
  }
};

const PALMERO_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Palmero Homes for Sale, Nokomis FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Palmero, Nokomis FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Palmero homes have actually sold for, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/palmero-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Palmero Homes for Sale, Nokomis FL | Putnam Realty Group">
<meta property="og:description" content="Current Palmero listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/palmero-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/palmero-entrance-nokomis-fl.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/palmero-entrance-nokomis-fl.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/palmero-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Nokomis, Florida 34275</div>
    <h1>Palmero Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Palmero, shown alongside what
    Palmero homes have actually sold for. Two separate sources, kept separate, so you can
    see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Palmero. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const PALMERO_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Palmero homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records:
    what buyers paid, not what sellers asked. <strong>This section contains no MLS data.</strong>
    Builder closings are excluded, because a builder base price is not a comparable sale for an
    existing home.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 15, 2026</td><td>5737 Haven Ter</td><td>Townhome</td><td>1,407 sqft</td><td><strong>$278,400</strong></td></tr>
        <tr><td>Jul 8, 2026</td><td>15061 Shady Palms Ln</td><td>Single-family</td><td>1,796 sqft</td><td><strong>$545,000</strong></td></tr>
        <tr><td>May 21, 2026</td><td>5734 Archipelago St</td><td>Townhome</td><td>1,478 sqft</td><td><strong>$325,000</strong></td></tr>
        <tr><td>Apr 30, 2026</td><td>5604 Blue Reef Pl</td><td>Single-family</td><td>2,410 sqft</td><td><strong>$649,000</strong></td></tr>
        <tr><td>Apr 29, 2026</td><td>5601 Blue Reef Pl</td><td>Single-family</td><td>2,410 sqft</td><td><strong>$680,000</strong></td></tr>
        <tr><td>Mar 25, 2026</td><td>15113 Shady Palms Ln</td><td>Single-family</td><td>1,796 sqft</td><td><strong>$455,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>27</strong> owner-to-owner resales in the past two years, the Palmero median ran <strong>$575,000</strong> ($249 per square foot). By type: single-family <strong>$607,500</strong> and townhomes <strong>$325,000</strong>. Builder closings are excluded, which is how the industry reports existing-home sales: a builder's first sale is a new-home sale, not a comparable for an existing home. Two of the sales above are worth a second look: 5601 and 5604 Blue Reef Place sold one day apart, both 2,410 square feet, on the same street. The one with a pool sold for $31,000 more, on the smaller lot.</p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner resales only, 24-month
    window. Figures are for general market awareness and are not appraisals.
    <a href="https://palmero.floridahomevalueai.com/"><strong>See every recorded Palmero sale, and look up what your own Palmero home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Palmero?</h2>
    <p>Michael Putnam lives in Palmero. You get a straight read on the community from someone
    who is in it, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://palmero.floridahomevalueai.com/">Palmero home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;


const TALON_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Talon Preserve Homes for Sale, Nokomis FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Talon Preserve on Palmer Ranch, Nokomis FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Talon Preserve homes have actually sold for, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Talon Preserve Homes for Sale, Nokomis FL | Putnam Realty Group">
<meta property="og:description" content="Current Talon Preserve listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/talon-preserve-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/talon-preserve-entrance-nokomis-fl.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/talon-preserve-entrance-nokomis-fl.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/talon-preserve-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Nokomis, Florida 34275</div>
    <h1>Talon Preserve Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Talon Preserve on Palmer Ranch, shown alongside what
    Talon Preserve homes have actually sold for. Two separate sources, kept separate, so you can
    see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Talon Preserve. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const TALON_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Talon Preserve homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records:
    what buyers paid, not what sellers asked. <strong>This section contains no MLS data.</strong>
    Builder closings are excluded, because a builder base price is not a comparable sale for an
    existing home.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 24, 2026</td><td>6013 Silver Grass Ct</td><td>Single-family</td><td>2,085 sqft</td><td><strong>$675,000</strong></td></tr>
        <tr><td>Jul 20, 2026</td><td>6270 Crested Eagle Ln</td><td>Single-family</td><td>2,890 sqft</td><td><strong>$1,079,000</strong></td></tr>
        <tr><td>Jul 16, 2026</td><td>6304 Winding Pine Dr</td><td>Single-family</td><td>2,663 sqft</td><td><strong>$710,000</strong></td></tr>
        <tr><td>Jul 6, 2026</td><td>6272 Winding Pine Dr</td><td>Single-family</td><td>2,627 sqft</td><td><strong>$618,000</strong></td></tr>
        <tr><td>Jun 30, 2026</td><td>6166 Winding Pine Dr</td><td>Single-family</td><td>1,704 sqft</td><td><strong>$629,000</strong></td></tr>
        <tr><td>Jun 24, 2026</td><td>14704 Golden Grass Ter</td><td>Single-family</td><td>2,074 sqft</td><td><strong>$703,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>39</strong> owner-to-owner resales in the past year, the Talon Preserve median ran <strong>$568,000</strong> ($324 per square foot). By type: single-family <strong>$608,000</strong> and villas <strong>$399,000</strong>. Builder closings are excluded. One thing the listings above show that recorded sales cannot: <strong>Pulte is still selling here</strong>, and its HOA runs about $316 to $350 a month against roughly $110 for the 2022 resales. That is a real difference in the cost of owning, and it does not appear in any sale price.</p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner resales only, 12-month window. Figures are for general market awareness and are not appraisals.
    <a href="https://talonpreserve.floridahomevalueai.com/"><strong>See every recorded Talon Preserve sale, and look up what your own Talon Preserve home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Talon Preserve?</h2>
    <p>Michael Putnam lives two miles away in Palmero and works Talon Preserve constantly.
    You get a straight read from someone who is in the area, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://talonpreserve.floridahomevalueai.com/">Talon Preserve home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

/* HEAD/TAIL pair per route. */
const GP_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gran Paradiso Homes for Sale, Venice FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Gran Paradiso in Wellen Park, Venice FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Gran Paradiso homes have actually sold for, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Gran Paradiso Homes for Sale, Venice FL | Putnam Realty Group">
<meta property="og:description" content="Current Gran Paradiso listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/granparadiso-entrance-venice-fl.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/granparadiso-entrance-venice-fl.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/gran-paradiso-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Venice, Florida 34293</div>
    <h1>Gran Paradiso Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Gran Paradiso in Wellen Park, shown alongside what
    Gran Paradiso homes have actually sold for. Two separate sources, kept separate, so you can
    see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Gran Paradiso. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const GP_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Gran Paradiso homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records:
    what buyers paid, not what sellers asked. <strong>This section contains no MLS data.</strong>
    Builder closings are excluded, because a builder base price is not a comparable sale for an
    existing home.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jun 22, 2026</td><td>20230 Granlago Dr</td><td>Single-family</td><td>2,243 sqft</td><td><strong>$500,000</strong></td></tr>
        <tr><td>Jun 15, 2026</td><td>20794 Valprato Ct</td><td>Single-family</td><td>2,365 sqft</td><td><strong>$550,000</strong></td></tr>
        <tr><td>Jun 12, 2026</td><td>13794 Vancanza Dr</td><td>Single-family</td><td>2,440 sqft</td><td><strong>$677,500</strong></td></tr>
        <tr><td>Jun 12, 2026</td><td>20362 Benissimo Dr</td><td>Villa</td><td>1,572 sqft</td><td><strong>$285,000</strong></td></tr>
        <tr><td>Jun 12, 2026</td><td>12568 Felice Dr</td><td>Villa</td><td>1,568 sqft</td><td><strong>$345,000</strong></td></tr>
        <tr><td>Jun 11, 2026</td><td>13195 Amerigo Ln</td><td>Single-family</td><td>2,254 sqft</td><td><strong>$598,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>121</strong> owner-to-owner resales in the past year, the Gran Paradiso median ran <strong>$405,000</strong> ($215 per square foot). By type: single-family <strong>$599,000</strong>, villas <strong>$320,000</strong>, coach homes <strong>$350,000</strong> and townhomes <strong>$280,000</strong>. Builder closings are excluded. Gran Paradiso is one of the few communities here with four distinct home types, and the gap between them is wider than most buyers expect: a villa and a single-family home on the same street can be nearly $280,000 apart.</p>

    <p class="muted">Sarasota County public records, qualified recorded sales only. Figures are for general market awareness and are not appraisals.
    <a href="https://granparadiso.floridahomevalueai.com/"><strong>See every recorded Gran Paradiso sale, and look up what your own Gran Paradiso home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Gran Paradiso?</h2>
    <p>Michael Putnam works Gran Paradiso and the surrounding Venice market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://granparadiso.floridahomevalueai.com/">Gran Paradiso home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const IW_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IslandWalk Homes for Sale, Venice FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in IslandWalk at the West Villages, Venice FL, from Putnam Realty Group. Live Stellar MLS listings alongside what IslandWalk homes have actually sold for, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/islandwalk-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="IslandWalk Homes for Sale, Venice FL | Putnam Realty Group">
<meta property="og:description" content="Current IslandWalk listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/islandwalk-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/islandwalk-entrance-venice-fl.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/islandwalk-entrance-venice-fl.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/islandwalk-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Venice, Florida 34293</div>
    <h1>IslandWalk Homes for Sale</h1>
    <p class="lede">Every home currently on the market in IslandWalk at the West Villages, shown alongside what
    IslandWalk homes have actually sold for. Two separate sources, kept separate, so you can
    see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in IslandWalk. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const IW_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What IslandWalk homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records:
    what buyers paid, not what sellers asked. <strong>This section contains no MLS data.</strong>
    Builder closings are excluded, because a builder base price is not a comparable sale for an
    existing home.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jun 11, 2026</td><td>13240 Guyana St</td><td>Single-family</td><td>2,000 sqft</td><td><strong>$460,000</strong></td></tr>
        <tr><td>Jun 11, 2026</td><td>13874 Botteri St</td><td>Villa</td><td>1,450 sqft</td><td><strong>$360,000</strong></td></tr>
        <tr><td>Jun 9, 2026</td><td>19396 Solarzano St</td><td>Single-family</td><td>2,516 sqft</td><td><strong>$701,200</strong></td></tr>
        <tr><td>Jun 5, 2026</td><td>13351 Esposito St</td><td>Single-family</td><td>1,893 sqft</td><td><strong>$755,000</strong></td></tr>
        <tr><td>Jun 2, 2026</td><td>13927 Vadini St</td><td>Villa</td><td>1,611 sqft</td><td><strong>$433,000</strong></td></tr>
        <tr><td>May 27, 2026</td><td>13146 Borrego St</td><td>Single-family</td><td>1,792 sqft</td><td><strong>$550,600</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>115</strong> owner-to-owner resales in the past year, the IslandWalk median ran <strong>$455,000</strong> ($272 per square foot): single-family <strong>$520,000</strong> and villas <strong>$400,000</strong>. Builder closings are excluded. One thing the recorded sales show clearly: among single-family homes, those with a pool sold at <strong>$341 per square foot against $289 without</strong>. That is an 18 percent difference, measured from what buyers actually paid.</p>

    <p class="muted">Sarasota County public records, qualified recorded sales only. Figures are for general market awareness and are not appraisals.
    <a href="https://islandwalk.floridahomevalueai.com/"><strong>See every recorded IslandWalk sale, and look up what your own IslandWalk home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in IslandWalk?</h2>
    <p>Michael Putnam works IslandWalk and the surrounding Venice market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://islandwalk.floridahomevalueai.com/">IslandWalk home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const GPALM_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Grand Palm Homes for Sale, Venice FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Grand Palm, the gated Neal Communities community in Venice near Wellen Park, Venice FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Grand Palm homes have actually sold for, and what a buyer would pay in property tax, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/grand-palm-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Grand Palm Homes for Sale, Venice FL | Putnam Realty Group">
<meta property="og:description" content="Current Grand Palm listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/grand-palm-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/grand-palm-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/grand-palm-og.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/grand-palm-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Venice, Florida 34293</div>
    <h1>Grand Palm Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Grand Palm, the gated Neal Communities community in Venice near Wellen Park, shown alongside what Grand Palm homes have actually sold for. Two separate sources, kept separate, so you can see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Grand Palm. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const GPALM_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Grand Palm homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 24, 2026</td><td>11446 Fort Lauderdale</td><td>Single-family</td><td>1,875 sqft</td><td><strong>$475,000</strong></td></tr>
        <tr><td>Jul 10, 2026</td><td>12240 Stuart Dr</td><td>Single-family</td><td>1,954 sqft</td><td><strong>$490,000</strong></td></tr>
        <tr><td>Jun 29, 2026</td><td>12386 Sagewood Dr</td><td>Single-family</td><td>2,237 sqft</td><td><strong>$660,000</strong></td></tr>
        <tr><td>Jun 24, 2026</td><td>12520 Shimmering Oak Cir</td><td>Single-family</td><td>1,850 sqft</td><td><strong>$350,000</strong></td></tr>
        <tr><td>Jun 22, 2026</td><td>12471 Sagewood Dr</td><td>Single-family</td><td>1,255 sqft</td><td><strong>$280,000</strong></td></tr>
        <tr><td>Jun 18, 2026</td><td>11442 Fort Lauderdale</td><td>Single-family</td><td>1,511 sqft</td><td><strong>$515,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>65</strong> owner-to-owner resales in the past year, the Grand Palm median ran <strong>$447,500</strong> ($257 a square foot). By type: single-family <strong>$495,000</strong> ($265 a square foot, 47 sales) and villas <strong>$409,500</strong> ($253 a square foot, 18 sales).</p>
    <p class="note">Almost every sale in Grand Palm over the past year was an owner resale; the builder closed only 2.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Grand Palm's typical single-family resale price of <strong>$495,000</strong>, yearly property tax would be about <strong>$5,055</strong> without a homestead exemption, or about <strong>$4,626</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Grand Palm is taxed as unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
    <a href="https://floridahomevalueai.com/grand-palm"><strong>Look up what your own Grand Palm home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Grand Palm?</h2>
    <p>Michael Putnam works Grand Palm and the surrounding Venice market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm">Grand Palm home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \\u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \\u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const SNAT_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sarasota National Homes for Sale, Venice FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Sarasota National, the gated golf community in Wellen Park, Venice FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Sarasota National homes have actually sold for, and what a buyer would pay in property tax, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Sarasota National Homes for Sale, Venice FL | Putnam Realty Group">
<meta property="og:description" content="Current Sarasota National listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/sarasota-national-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/sarasota-national-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/sarasota-national-og.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/sarasota-national-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Venice, Florida 34293</div>
    <h1>Sarasota National Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Sarasota National, the gated golf community in Wellen Park, shown alongside what Sarasota National homes have actually sold for. Two separate sources, kept separate, so you can see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Sarasota National. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const SNAT_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Sarasota National homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 23, 2026</td><td>10051 Crooked Creek Dr #202</td><td>Condo</td><td>1,998 sqft</td><td><strong>$355,000</strong></td></tr>
        <tr><td>Jul 21, 2026</td><td>10533 Crooked Creek Dr</td><td>Single-family</td><td>1,804 sqft</td><td><strong>$485,000</strong></td></tr>
        <tr><td>Jul 15, 2026</td><td>10832 Whisk Fern Dr</td><td>Single-family</td><td>3,079 sqft</td><td><strong>$1,255,000</strong></td></tr>
        <tr><td>Jul 10, 2026</td><td>23980 Skyflower Ct</td><td>Villa</td><td>1,568 sqft</td><td><strong>$357,500</strong></td></tr>
        <tr><td>Jul 7, 2026</td><td>23113 Banbury Way #202</td><td>Condo</td><td>1,998 sqft</td><td><strong>$285,000</strong></td></tr>
        <tr><td>Jul 2, 2026</td><td>10744 Tarflower Dr</td><td>Single-family</td><td>2,440 sqft</td><td><strong>$1,165,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>83</strong> owner-to-owner resales in the past year, the Sarasota National median ran <strong>$465,000</strong> ($254 a square foot). By type: single-family <strong>$575,000</strong> ($296 a square foot, 59 sales), condos <strong>$360,000</strong> ($181 a square foot, 20 sales) and villas <strong>$358,750</strong> ($229 a square foot, 4 sales).</p>
    <p class="note">Every recorded sale in Sarasota National over the past year was an owner resale. None were builder closings.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Sarasota National's typical single-family resale price of <strong>$575,000</strong>, yearly property tax would be about <strong>$5,872</strong> without a homestead exemption, or about <strong>$5,443</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Sarasota National is taxed as unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
    <a href="https://floridahomevalueai.com/sarasota-national"><strong>Look up what your own Sarasota National home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Sarasota National?</h2>
    <p>Michael Putnam works Sarasota National and the surrounding Wellen Park market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national">Sarasota National home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \\u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \\u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const REN_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Renaissance Homes for Sale, Venice FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Renaissance at Wellen Park, the gated Mattamy community, Venice FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Renaissance homes have actually sold for, and what a buyer would pay in property tax, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/renaissance-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Renaissance Homes for Sale, Venice FL | Putnam Realty Group">
<meta property="og:description" content="Current Renaissance listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/renaissance-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/renaissance-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/renaissance-og.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/renaissance-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Venice, Florida 34293</div>
    <h1>Renaissance Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Renaissance at Wellen Park, the gated Mattamy community, shown alongside what Renaissance homes have actually sold for. Two separate sources, kept separate, so you can see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Renaissance. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const REN_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Renaissance homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 17, 2026</td><td>11789 Tapestry Ln</td><td>Villa</td><td>1,629 sqft</td><td><strong>$328,000</strong></td></tr>
        <tr><td>Jul 9, 2026</td><td>11710 Alessandro Ln</td><td>Single-family</td><td>2,373 sqft</td><td><strong>$490,000</strong></td></tr>
        <tr><td>Jul 8, 2026</td><td>11539 Tapestry Ln</td><td>Single-family</td><td>2,294 sqft</td><td><strong>$675,000</strong></td></tr>
        <tr><td>Jun 30, 2026</td><td>20616 Galileo Pl</td><td>Villa</td><td>1,432 sqft</td><td><strong>$317,000</strong></td></tr>
        <tr><td>Jun 26, 2026</td><td>20724 Galileo Pl</td><td>Villa</td><td>1,432 sqft</td><td><strong>$299,900</strong></td></tr>
        <tr><td>Jun 25, 2026</td><td>11794 Sistine Ln</td><td>Single-family</td><td>2,086 sqft</td><td><strong>$578,500</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>51</strong> owner-to-owner resales in the past year, the Renaissance median ran <strong>$450,000</strong> ($234 a square foot). By type: single-family <strong>$550,000</strong> ($244 a square foot, 28 sales) and villas <strong>$328,000</strong> ($216 a square foot, 23 sales).</p>
    <p class="note">Builder or owner resale? In the past year Renaissance's builder closed 10 villas at a median $223 a square foot, and owners resold 23 at $216 a square foot. That's close enough that, here, a resale and a new build of the same type sell at about the same rate per foot.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Renaissance's typical single-family resale price of <strong>$550,000</strong>, yearly property tax would be about <strong>$7,103</strong> without a homestead exemption, or about <strong>$6,518</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Renaissance sits inside the City of North Port for tax purposes, which carries a higher rate than unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
    <a href="https://floridahomevalueai.com/renaissance"><strong>Look up what your own Renaissance home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Renaissance?</h2>
    <p>Michael Putnam works Renaissance and the surrounding Wellen Park market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance">Renaissance home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \\u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \\u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const SUNST_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sunstone Homes for Sale, Venice FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Sunstone at Wellen Park, the gated Mattamy community, Venice FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Sunstone homes have actually sold for, and what a buyer would pay in property tax, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/sunstone-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Sunstone Homes for Sale, Venice FL | Putnam Realty Group">
<meta property="og:description" content="Current Sunstone listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/sunstone-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/sunstone-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/sunstone-og.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/sunstone-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Venice, Florida 34293</div>
    <h1>Sunstone Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Sunstone at Wellen Park, the gated Mattamy community, shown alongside what Sunstone homes have actually sold for. Two separate sources, kept separate, so you can see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Sunstone. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const SUNST_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Sunstone homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Apr 1, 2026</td><td>12333 Asana Ct</td><td>Villa</td><td>1,744 sqft</td><td><strong>$385,000</strong></td></tr>
        <tr><td>Mar 26, 2026</td><td>17953 Grand Prosperity Dr</td><td>Single-family</td><td>1,996 sqft</td><td><strong>$460,000</strong></td></tr>
        <tr><td>Mar 12, 2026</td><td>12365 Asana Ct</td><td>Villa</td><td>1,744 sqft</td><td><strong>$360,000</strong></td></tr>
        <tr><td>Feb 20, 2026</td><td>17962 Solstice Ave</td><td>Single-family</td><td>2,370 sqft</td><td><strong>$590,000</strong></td></tr>
        <tr><td>Feb 19, 2026</td><td>12381 Asana Ct</td><td>Villa</td><td>1,502 sqft</td><td><strong>$330,000</strong></td></tr>
        <tr><td>Feb 9, 2026</td><td>17945 Grand Prosperity Dr</td><td>Single-family</td><td>2,884 sqft</td><td><strong>$610,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>10</strong> owner-to-owner resales in the past year, the Sunstone median ran <strong>$415,000</strong> ($220 a square foot). By type: single-family <strong>$525,000</strong> ($225 a square foot, 6 sales) and villas <strong>$372,500</strong> ($220 a square foot, 4 sales).</p>
    <p class="note">Builder or owner resale? In the past year Sunstone's builder closed 46 single-family homes at a median $239 a square foot, while owners resold six at a median $225 a square foot, about 6% less. On a 2,207 square foot home, that's roughly $32,000.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Sunstone's typical single-family resale price of <strong>$525,000</strong>, yearly property tax would be about <strong>$6,780</strong> without a homestead exemption, or about <strong>$6,195</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Sunstone sits inside the City of North Port for tax purposes, which carries a higher rate than unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
    <a href="https://floridahomevalueai.com/sunstone"><strong>Look up what your own Sunstone home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Sunstone?</h2>
    <p>Michael Putnam works Sunstone and the surrounding Wellen Park market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone">Sunstone home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \\u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \\u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const BRIGHT_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Brightmore Homes for Sale, Venice FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Brightmore, Wellen Park&#39;s 55+ community, Venice FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Brightmore homes have actually sold for, and what a buyer would pay in property tax, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/brightmore-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Brightmore Homes for Sale, Venice FL | Putnam Realty Group">
<meta property="og:description" content="Current Brightmore listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/brightmore-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/brightmore-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/brightmore-og.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/brightmore-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Venice, Florida 34293</div>
    <h1>Brightmore Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Brightmore, Wellen Park's 55+ community, shown alongside what Brightmore homes have actually sold for. Two separate sources, kept separate, so you can see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Brightmore. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const BRIGHT_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Brightmore homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 15, 2026</td><td>11288 Boundless Ter</td><td>Single-family</td><td>1,685 sqft</td><td><strong>$437,500</strong></td></tr>
        <tr><td>Jun 24, 2026</td><td>11463 Myakka Blue Dr</td><td>Single-family</td><td>2,390 sqft</td><td><strong>$795,000</strong></td></tr>
        <tr><td>Apr 14, 2026</td><td>11222 Livewell Ct</td><td>Single-family</td><td>1,919 sqft</td><td><strong>$450,000</strong></td></tr>
        <tr><td>Apr 8, 2026</td><td>11247 Boundless Ter</td><td>Villa</td><td>1,750 sqft</td><td><strong>$450,000</strong></td></tr>
        <tr><td>Sep 23, 2025</td><td>11239 Boundless Ter</td><td>Villa</td><td>1,413 sqft</td><td><strong>$331,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>5</strong> owner-to-owner resales in the past year, the Brightmore median ran <strong>$450,000</strong> ($257 a square foot). By type: single-family <strong>$450,000</strong> ($260 a square foot, 3 sales) and villas <strong>$390,500</strong> ($246 a square foot, 2 sales).</p>
    <p class="note">Builder or owner resale? In the past year Brightmore's builder closed 25 single-family homes at a median $290 a square foot, while owners resold three at a median $260 a square foot, about 11% less. On a 1,988 square foot home, that's roughly $61,000. Three owner resales is a small sample, so take that as a direction rather than a rule.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Brightmore's typical single-family resale price of <strong>$450,000</strong>, yearly property tax would be about <strong>$5,811</strong> without a homestead exemption, or about <strong>$5,226</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Most of Brightmore, 178 of its 191 parcels, sits inside the City of North Port for tax purposes; the other 13 are in unincorporated Sarasota County at a lower rate, so check which one a given home is in. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
    <a href="https://floridahomevalueai.com/brightmore"><strong>Look up what your own Brightmore home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Brightmore?</h2>
    <p>Michael Putnam works Brightmore and the surrounding Wellen Park market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore">Brightmore home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \\u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \\u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const SUNRISE_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sunrise Preserve Homes for Sale, Sarasota FL | Putnam Realty Group</title>
<meta name="description" content="Current homes for sale in Sunrise Preserve, the maintenance-free Mattamy community in Palmer Ranch, Sarasota FL, from Putnam Realty Group. Live Stellar MLS listings alongside what Sunrise Preserve homes have actually sold for, and what a buyer would pay in property tax, from Sarasota County public records.">
<link rel="canonical" href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">

<meta property="og:type" content="website">
<meta property="og:title" content="Sunrise Preserve Homes for Sale, Sarasota FL | Putnam Realty Group">
<meta property="og:description" content="Current Sunrise Preserve listings from Stellar MLS, alongside recorded Sarasota County sale prices. Putnam Realty Group, Nokomis.">
<meta property="og:url" content="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">
<meta property="og:image" content="https://floridahomevalueai.com/sunrise-preserve-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://floridahomevalueai.com/sunrise-preserve-og.jpg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>

<!-- RealEstateAgent entity. Deliberately NOT a listing schema: marking up another
     brokerage's listings as our own structured data would misrepresent them. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateAgent",
"name":"Putnam Realty Group",
"url":"https://floridahomevalueai.com/sunrise-preserve-homes-for-sale",
"telephone":"+1-941-662-9941",
"email":"Michael@PutnamRealtyGroup.com",
"areaServed":[{"@type":"Place","name":"Nokomis, Florida"},{"@type":"Place","name":"Venice, Florida"},{"@type":"Place","name":"Sarasota County, Florida"}],
"employee":{"@type":"RealEstateAgent","name":"Michael Putnam","jobTitle":"Sales Associate","identifier":"SL3220671"},
"parentOrganization":{"@type":"Organization","name":"Putnam Realty Group LLC"}}
</script>

<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">

  <header>
    <div class="eyebrow">Sarasota, Florida 34238</div>
    <h1>Sunrise Preserve Homes for Sale</h1>
    <p class="lede">Every home currently on the market in Sunrise Preserve, the maintenance-free Mattamy community in Palmer Ranch, shown alongside what Sunrise Preserve homes have actually sold for. Two separate sources, kept separate, so you can see the difference between what sellers are asking and what buyers have paid.</p>
  </header>

  <!-- ============ SECTION 1: STELLAR MLS ============ -->
  <section class="section src-mls">
    <div class="section-label">Source: Stellar MLS</div>
    <h2>On the market now</h2>
    <p class="note">Current listings in Sunrise Preserve. Some may be listed by brokerages other than
    Putnam Realty Group; each listing names its own.</p>

    `;

const SUNRISE_TAIL = `

    <!-- Article 19.23: source identification where listings appear.
         Article 19.15: a contact for reporting inaccuracies. -->
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
      <span id="idx-updated"></span>
    </p>
  </section>

  <!-- ============ SECTION 2: COUNTY PUBLIC RECORDS ============ -->
  <section class="section src-county">
    <div class="section-label">Source: Sarasota County public records</div>
    <h2>What Sunrise Preserve homes have actually sold for</h2>
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jun 30, 2026</td><td>8733 Rain Song Rd</td><td>Villa</td><td>1,540 sqft</td><td><strong>$470,000</strong></td></tr>
        <tr><td>Jun 12, 2026</td><td>5632 Long Shore Loop</td><td>Single-family</td><td>2,298 sqft</td><td><strong>$725,000</strong></td></tr>
        <tr><td>May 8, 2026</td><td>5604 Morning Sun Dr</td><td>Single-family</td><td>2,489 sqft</td><td><strong>$814,500</strong></td></tr>
        <tr><td>May 8, 2026</td><td>5841 Long Shore Loop</td><td>Single-family</td><td>1,843 sqft</td><td><strong>$629,900</strong></td></tr>
        <tr><td>May 8, 2026</td><td>8792 Rain Song Rd</td><td>Villa</td><td>1,675 sqft</td><td><strong>$419,000</strong></td></tr>
        <tr><td>Apr 30, 2026</td><td>5436 Hope Sound Cir</td><td>Single-family</td><td>1,843 sqft</td><td><strong>$525,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>17</strong> owner-to-owner resales in the past year, the Sunrise Preserve median ran <strong>$650,000</strong> ($327 a square foot). By type: single-family <strong>$814,250</strong> ($342 a square foot, 12 sales) and villas <strong>$440,000</strong> ($262 a square foot, 5 sales).</p>
    <p class="note">Every recorded sale in Sunrise Preserve over the past year was an owner resale. None were builder closings.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Sunrise Preserve's typical single-family resale price of <strong>$814,250</strong>, yearly property tax would be about <strong>$8,315</strong> without a homestead exemption, or about <strong>$7,886</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Sunrise Preserve is taxed as unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
    <a href="https://floridahomevalueai.com/sunrise-preserve"><strong>Look up what your own Sunrise Preserve home is worth &rarr;</strong></a></p>
  </section>

  <div class="cta">
    <h2>Thinking about buying or selling in Sunrise Preserve?</h2>
    <p>Michael Putnam works Sunrise Preserve and the surrounding Palmer Ranch market constantly.
    You get a straight read from a local agent who answers the phone, not a call center.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve">Sunrise Preserve home values</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>

</div>

<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \\u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \\u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;

const PAGES = {
  '/palmero-homes-for-sale': { head: PALMERO_HEAD, tail: PALMERO_TAIL },
  '/talon-preserve-homes-for-sale': { head: TALON_HEAD, tail: TALON_TAIL },
  '/gran-paradiso-homes-for-sale': { head: GP_HEAD, tail: GP_TAIL },
  '/islandwalk-homes-for-sale': { head: IW_HEAD, tail: IW_TAIL },
  '/grand-palm-homes-for-sale': { head: GPALM_HEAD, tail: GPALM_TAIL },
  '/sarasota-national-homes-for-sale': { head: SNAT_HEAD, tail: SNAT_TAIL },
  '/renaissance-homes-for-sale': { head: REN_HEAD, tail: REN_TAIL },
  '/sunstone-homes-for-sale': { head: SUNST_HEAD, tail: SUNST_TAIL },
  '/brightmore-homes-for-sale': { head: BRIGHT_HEAD, tail: BRIGHT_TAIL },
  '/sunrise-preserve-homes-for-sale': { head: SUNRISE_HEAD, tail: SUNRISE_TAIL }
};


const SEARCH_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Search Homes for Sale in Southwest Florida | Putnam Realty Group</title>
<meta name="description" content="Search current homes for sale across Stellar MLS, from Putnam Realty Group in Nokomis, Florida.">
<!-- Deliberately noindex: every filter combination is a new URL, and thousands of
     near-identical result pages is the scaled-content pattern that gets sites
     demoted. The community pages are what should be indexed. -->
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;700&family=DM+Mono:wght@400&display=optional" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6XW1DFSRC2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6XW1DFSRC2');
</script>
<style>
  :root{ --cream:#faf7f2; --warm:#f4f0e8; --gold:#b8722a; --ink:#1a1814;
         --ink-mid:#4a4640; --ink-faint:#5f5a54; --border:#e8e2d8; --surface:#fff; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--ink);
       min-height:100vh;font-size:18px;line-height:1.7;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem;}
  a{color:var(--gold);}

  /* Article 19.06 requires brokerage branding to be the most prominent on any page
     showing Stellar MLS data. Putnam Realty Group is therefore the masthead here,
     not Florida Home Value AI. The valuation pages, which carry no MLS data, keep
     their own identity. */
  .masthead{background:var(--ink);color:#fff;padding:1.1rem 0;}
  .masthead .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
  .brand{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;}
  .brand small{display:block;font-family:'DM Mono',monospace;font-size:15px;
       letter-spacing:.1em;text-transform:uppercase;color:#fff;font-weight:400;margin-top:3px;}
  .masthead a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;}

  header{text-align:center;padding:3.5rem 0 2.5rem;}
  .eyebrow{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.12em;
           text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}
  h1{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,5.5vw,3.5rem);
     font-weight:600;line-height:1.15;margin-bottom:1.4rem;}
  .lede{font-size:19px;color:var(--ink);max-width:620px;margin:0 auto;
        font-weight:400;line-height:1.75;}

  .section{padding:3rem 0;}
  .section-label{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:0.12em;
       color:var(--ink-faint);text-transform:uppercase;margin-bottom:.6rem;text-align:center;}
  h2{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:600;
     text-align:center;margin-bottom:1rem;color:var(--ink);}
  .note{font-size:18px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
        text-align:center;}

  /* The two data sources are kept in visually distinct, separately headed blocks.
     Ben Martin (Stellar, Data & Technology Compliance): "if the listing search
     results contains data from any other source than Stellar MLS then the Stellar
     MLS portions must have Stellar MLS branding on them. Portions that are from
     public records should also be identifiable as such. Typically, we recommend
     doing this by creating a separate section with a header or other identifier
     for the public records portion." */
  .src-mls .section-label{color:var(--gold);}
  .src-county .section-label{color:#6b7f6b;}
  .src-county{background:var(--warm);}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1rem;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;
        padding:1.05rem 1.15rem;}
  
  .shot{margin:-1.05rem -1.15rem .8rem;border-radius:12px 12px 0 0;overflow:hidden;
    background:var(--warm);aspect-ratio:4/3;}
  .shot{position:relative;cursor:zoom-in;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .viewall{position:absolute;right:.6rem;bottom:.6rem;background:rgba(26,24,20,.82);
    color:#fff;font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.04em;
    padding:5px 10px;border-radius:6px;pointer-events:none;}

  /* Lightbox. Full screen on a phone, arrows and swipe, Escape to close. */
  .lb{position:fixed;inset:0;background:rgba(12,11,9,.96);z-index:9999;display:none;
    flex-direction:column;align-items:center;justify-content:center;}
  .lb.open{display:flex;}
  .lb img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;}
  .lb-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;
    justify-content:space-between;padding:.9rem 1.1rem;color:#fff;font-size:16px;}
  .lb-close{background:none;border:0;color:#e8e2d8;font-size:30px;line-height:1;
    cursor:pointer;padding:0 .4rem;font-family:inherit;}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);
    border:0;color:#fff;font-size:26px;width:52px;height:52px;border-radius:50%;
    cursor:pointer;line-height:1;}
  .lb-prev{left:1rem;} .lb-next{right:1rem;}
  .lb-count{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.06em;}
  @media(max-width:560px){ .lb-nav{width:44px;height:44px;font-size:22px;}
    .lb-prev{left:.4rem;} .lb-next{right:.4rem;} }
  .strip{display:flex;gap:4px;margin:-.4rem 0 .7rem;align-items:center;}
  .strip{flex-wrap:wrap;}
  .strip img{width:52px;height:40px;object-fit:cover;border-radius:5px;display:block;
    background:var(--warm);
    cursor:pointer;opacity:.62;transition:opacity .12s;border:2px solid transparent;}
  .strip img:hover,.strip img.on{opacity:1;border-color:var(--gold);}
  .more{font-family:'DM Mono',monospace;font-size:15px;color:var(--ink-faint);
    padding-left:.3rem;}
  .price{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;}
  .addr{font-size:17px;margin-top:.1rem;}
  .sub{font-size:15px;color:var(--ink-faint);margin-top:.15rem;}
  .specs{font-size:16px;color:var(--ink-mid);margin-top:.45rem;}
  .tags{font-size:15px;color:var(--ink-faint);margin-top:.4rem;}
  .fees{font-size:15.5px;color:var(--ink-mid);margin-top:.45rem;}
  .courtesy{font-size:15px;color:var(--ink-faint);margin-top:.6rem;padding-top:.55rem;
        border-top:1px solid var(--border);line-height:1.5;}
  
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:14px;
        letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--warm);border:1px solid var(--border);color:var(--ink-mid);margin-left:.4rem;}

  table{width:100%;max-width:820px;margin:0 auto;border-collapse:collapse;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;
        overflow:hidden;font-size:17px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:15px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:15px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:16px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:15px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}

  .filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.9rem;
    background:var(--surface);border:1px solid var(--border);border-radius:14px;
    padding:1.35rem;max-width:900px;margin:0 auto 2rem;text-align:left;}
  .filters label{display:block;font-size:12.5px;color:var(--ink-mid);font-weight:700;}
  .filters select,.filters input[type=text],.filters input:not([type]){width:100%;
    margin-top:.3rem;padding:.6rem;border:1px solid #ccc;border-radius:8px;
    font-size:15px;font-family:inherit;background:#fff;}
  .filters .chk{display:flex;align-items:center;gap:.5rem;font-weight:400;font-size:15px;
    padding-top:1.2rem;}
  .filters .chk input{width:18px;height:18px;}
  .filters button{grid-column:1/-1;background:var(--gold);color:#fff;border:0;
    padding:.85rem 1.6rem;border-radius:8px;font-size:16px;font-weight:700;
    cursor:pointer;font-family:inherit;}
  .alertbox{background:var(--ink);color:#fff;border-radius:14px;padding:1.75rem;
    max-width:640px;margin:2.25rem auto 0;text-align:center;}
  .alertbox h3{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:600;
    margin-bottom:.5rem;color:#fff;}
  .alertbox p{color:#d8d2c8;font-size:15.5px;margin:0 auto 1.1rem;max-width:480px;}
  .alertbox form{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;}
  .alertbox input[type=email]{flex:1;min-width:220px;padding:.8rem;border:0;
    border-radius:8px;font-size:15px;font-family:inherit;}
  .alertbox button{background:var(--gold);color:#fff;border:0;padding:.8rem 1.5rem;
    border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;}
  .alertbox .fine{font-size:12px;color:#a9a29a;margin:.9rem auto 0;}
  .alertbox .fine a{color:#c9c2b8;}
  .alertbox-done{background:var(--warm);color:var(--ink);border:1px solid var(--border);
    font-size:16px;padding:1.35rem;}
  .pager{display:flex;align-items:center;justify-content:center;gap:1rem;
    margin:2rem auto 0;max-width:640px;flex-wrap:wrap;}
  .pg{display:inline-block;padding:.7rem 1.25rem;border-radius:8px;font-weight:700;
    font-size:15px;text-decoration:none;background:var(--gold);color:#fff;}
  .pg-off{background:var(--warm);color:var(--ink-faint);border:1px solid var(--border);}
  .pg-now{font-size:16px;color:var(--ink-mid);}


</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <div class="brand">Putnam Realty Group
      <small>Michael Putnam &middot; Sales Associate</small>
    </div>
    <a href="tel:9416629941">941-662-9941</a>
  </div>
</div>

<div class="wrap">
  <header>
    <div class="eyebrow">Stellar MLS &middot; Southwest Florida</div>
    <h1>Search Homes for Sale</h1>
    <p class="lede">Current listings across the whole Stellar MLS. Set what matters to you
    and see what is actually available today.</p>
  </header>
  <section class="section">
`;

const SEARCH_TAIL = `
    <p class="attrib">
      Listings courtesy of <strong>Stellar MLS</strong> as distributed by <strong>MLS GRID</strong>.
      Information is deemed reliable but is not guaranteed accurate by Stellar MLS, MLS GRID, or
      Putnam Realty Group, and should be independently verified. This information is provided
      exclusively for consumers' personal, non-commercial use and may not be used for any purpose
      other than to identify prospective properties consumers may be interested in purchasing.
      Properties may be listed by brokerages other than Putnam Realty Group.
      To report an inaccuracy, contact Michael Putnam at
      <a href="tel:9416629941">941-662-9941</a> or Michael@PutnamRealtyGroup.com.
    </p>
  </section>

  <div class="cta">
    <h2>Seen something you want to look at?</h2>
    <p>Call and I will get you in. I am a local agent who answers the phone, not a lead form.</p>
    <a class="btn" href="tel:9416629941">Call or text 941-662-9941</a>
  </div>

  <footer>
    <strong>Putnam Realty Group</strong> &middot; Michael Putnam, Sales Associate<br>
    941-662-9941 &middot; Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275
    <p class="muted">
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/gran-paradiso-homes-for-sale">Gran Paradiso</a> &middot;
      <a href="https://floridahomevalueai.com/islandwalk-homes-for-sale">IslandWalk</a> &middot;
      <a href="https://floridahomevalueai.com/grand-palm-homes-for-sale">Grand Palm</a> &middot;
      <a href="https://floridahomevalueai.com/sarasota-national-homes-for-sale">Sarasota National</a> &middot;
      <a href="https://floridahomevalueai.com/renaissance-homes-for-sale">Renaissance</a> &middot;
      <a href="https://floridahomevalueai.com/sunstone-homes-for-sale">Sunstone</a> &middot;
      <a href="https://floridahomevalueai.com/brightmore-homes-for-sale">Brightmore</a> &middot;
      <a href="https://floridahomevalueai.com/sunrise-preserve-homes-for-sale">Sunrise Preserve</a> &middot;
      <a href="https://floridahomevalueai.com/home-search">Search all listings</a><br>
      <a href="https://floridahomevalueai.com/terms">Terms of Use</a> &middot;
      <a href="https://floridahomevalueai.com/privacy">Privacy Policy</a> &middot;
      <a href="https://floridahomevalueai.com/palmero-homes-for-sale">Palmero homes for sale</a> &middot;
      <a href="https://floridahomevalueai.com/talon-preserve-homes-for-sale">Talon Preserve homes for sale</a> &middot;
      <a href="https://floridahomevalueai.com/">Florida Home Value AI</a>
    </p>
    <p class="muted">Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act.
    This is not a solicitation of property currently listed with another broker.</p>
  </footer>
</div>
<script>
/* Thumbnails past the third load only when their card reaches the screen. */
(function () {
  var lazy = document.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < lazy.length; i++) lazy[i].src = lazy[i].dataset.src;
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  for (var j = 0; j < lazy.length; j++) io.observe(lazy[j]);
})();

/* Thumbnail clicks swap the main image. One listener for the whole page rather
   than one per card — a page can carry 24 listings and 240 thumbnails. */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.g) return;
  var main = document.getElementById(t.dataset.g);
  if (!main) return;
  main.src = t.dataset.full;
  var strip = t.parentNode;
  for (var i = 0; i < strip.children.length; i++) {
    strip.children[i].classList && strip.children[i].classList.remove('on');
  }
  t.classList.add('on');
});
</script>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Property photos">
  <div class="lb-bar"><span class="lb-count" id="lb-count"></span>
    <button class="lb-close" id="lb-close" aria-label="Close">&times;</button></div>
  <img id="lb-img" alt="">
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous photo">&#8249;</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next photo">&#8250;</button>
</div>
<script>
/* Lightbox. Every photo for a listing, opened from the main image.
   One instance for the whole page rather than one per card. */
(function () {
  var BASE = 'https://fhv-idx-sync.cleirshusband.workers.dev/photo/';
  var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
      cnt = document.getElementById('lb-count');
  var keys = [], at = 0, addr = '';

  function show() {
    img.src = BASE + keys[at];
    img.alt = addr + ' \u2014 photo ' + (at + 1);
    cnt.textContent = addr + '  \u00b7  ' + (at + 1) + ' of ' + keys.length;
  }
  function open(shot) {
    keys = (shot.dataset.all || '').split('|').filter(Boolean);
    if (!keys.length) return;
    addr = shot.dataset.addr || '';
    at = 0; show();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function step(n) { at = (at + n + keys.length) % keys.length; show(); }

  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot) { open(shot); return; }
    if (e.target.id === 'lb-close' || e.target === lb) close();
    if (e.target.id === 'lb-next') step(1);
    if (e.target.id === 'lb-prev') step(-1);
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  /* Swipe, because most of this traffic is a phone. */
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();
</script>
</body>
</html>
`;
