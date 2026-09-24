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
    streets: ['ALACHUA', 'ANCLOTE', 'AUBURNDALE', 'AVON PARK', 'CALHOUN', 'CALLAWAY', 'CEDAR KEY', 'CHATTAHOOCHEE', 'COLLIER', 'DAVIE', 'DESTIN', 'DUNEDIN', 'FAKAHATCHEE', 'FORT LAUDERDALE', 'FORT MYERS', 'FROSTPROOF', 'GAINESVILLE', 'HARNEY', 'HOLMES', 'HUNTERS CREEK', 'LAKE PLACID', 'MARATHON', 'OKALOOSA', 'PALATKA', 'SAGEWOOD', 'SEBRING', 'SHIMMERING OAK', 'ST PETERSBURG', 'STEINHATCHEE', 'STILL RIVER', 'STUART', 'TRAILWOOD', 'WACISSA', 'WAKULLA', 'WINTER PARK'],
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
  'Grand Palm': ['ALACHUA', 'ANCLOTE', 'AUBURNDALE', 'AVON PARK', 'CALHOUN', 'CALLAWAY', 'CEDAR KEY', 'CHATTAHOOCHEE', 'COLLIER', 'DAVIE', 'DESTIN', 'DUNEDIN', 'FAKAHATCHEE', 'FORT LAUDERDALE', 'FORT MYERS', 'FROSTPROOF', 'GAINESVILLE', 'HARNEY', 'HOLMES', 'HUNTERS CREEK', 'LAKE PLACID', 'MARATHON', 'OKALOOSA', 'PALATKA', 'SAGEWOOD', 'SEBRING', 'SHIMMERING OAK', 'ST PETERSBURG', 'STEINHATCHEE', 'STILL RIVER', 'STUART', 'TRAILWOOD', 'WACISSA', 'WAKULLA', 'WINTER PARK'],
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

/* =============================================================================
   THE PERSONAL HOME PAGE  —  /h/<address-slug>
   =============================================================================

   WHAT IT IS
   One page per address, generated on demand from the Sarasota County roll.
   Nothing is stored per visitor and nothing is written ahead of time. Ask for
   /h/20730-benissimo-dr-venice and the page is built when the request arrives.

   WHERE THE DATA COMES FROM
   hp-granparadiso.json, a static file deployed alongside this worker. It holds
   every residential parcel in Gran Paradiso, every post-construction qualified
   sale, and the community aggregates. It is read once per isolate and kept in
   memory, so the second request costs nothing.

   COMPLIANCE
   There is NO MLS data on this page. Not one field. Every figure is either a
   Sarasota County public record or arithmetic on one. That is deliberate: the
   Stellar Participant Data Access Agreement limits IDX data to public listing
   display, so a valuation page cannot touch it.

   NOT INDEXED. X-Robots-Tag noindex plus a robots meta tag. These pages are for
   the one owner they were built for, not for search.
   ========================================================================== */

let HP_DATA = null;

async function hpData(env, origin) {
  if (HP_DATA) return HP_DATA;
  /* Built from the request's own origin rather than a made up hostname, because
     env.ASSETS matches on the whole URL and a foreign host can miss. */
  const base = origin || 'https://floridahomevalueai.com';
  const res = await env.ASSETS.fetch(new Request(base + '/hp-granparadiso.json'));
  if (!res.ok) throw new Error('hp data missing: ' + res.status);
  const raw = await res.json();

  /* Expand the compact arrays once, into objects the rest of the file can read
     without remembering column positions. */
  const F = raw.pfields;
  const parcels = raw.parcels.map(function (a) {
    const o = {};
    for (let i = 0; i < F.length; i++) o[F[i]] = a[i];
    o.typeName = raw.community.types[o.type];
    return o;
  });
  const bySlug = {};
  parcels.forEach(function (p, i) { p.i = i; bySlug[p.slug] = p; });

  const salesByParcel = {};
  raw.sales.forEach(function (s) {
    (salesByParcel[s[0]] = salesByParcel[s[0]] || []).push(
      { date: s[1], price: s[2], builder: s[3], qualified: s[4] });
  });
  Object.keys(salesByParcel).forEach(function (k) {
    salesByParcel[k].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  });

  /* One flat list of resales for comp selection. Two things are filtered out
     here, once, rather than on every lookup.

     Builder closings. A builder's first sale is a new-home sale at a base price
     plus whatever the buyer chose in the design center. It is not a comparable
     for an existing home, and including them is how a community with recent
     construction ends up looking cheaper than it is.

     Transfers the county did not treat as qualified sales. Those still appear
     in the owner's own history further down the page, because they are real
     transfers and the owner knows what they paid. They are kept out of the comp
     set because the county's own qualification flag is the only signal we have
     about whether a price was arms length.                                  */
  const resales = [];
  Object.keys(salesByParcel).forEach(function (k) {
    const p = parcels[k];
    salesByParcel[k].forEach(function (s) {
      if (!s.builder && s.qualified && p.sqft > 0) {
        resales.push({ i: p.i, date: s.date, price: s.price, sqft: p.sqft, type: p.type, pool: p.pool });
      }
    });
  });
  resales.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  HP_DATA = { c: raw.community, parcels: parcels, bySlug: bySlug, sales: salesByParcel, resales: resales, rpr: raw.rpr || {} };
  return HP_DATA;
}

/* ---------------------------------------------------------------- helpers */
function hpMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function hpK(n) { return '$' + Math.round(n / 1000).toLocaleString('en-US') + 'K'; }
function hpEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
const HP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                   'August', 'September', 'October', 'November', 'December'];
function hpDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || '';
  return HP_MONTHS[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10) + ', ' + m[1];
}
function hpShortDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return iso || '';
  return HP_MONTHS[parseInt(m[2], 10) - 1].slice(0, 3) + ' ' + m[1];
}
function hpTitle(s) {
  return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m2, c) { return c.toUpperCase(); });
}
/* The street line on its own. Used only where the city and state are already
   sitting next to it on the same line. */
function hpStreetLine(p) {
  let a = p.num + ' ' + hpTitle(p.street);
  if (p.unit) a += ' #' + p.unit;
  return a;
}

/* The whole address, written the way an address is written.
   20730 Benissimo Dr, Venice, FL 34293
   This is what goes anywhere a property is named: the heading, the page title,
   the share card, the sale history, the correction form, the vault record and
   every comparable sale. A partial address makes a reader stop and work out
   which house is meant, and there are 1,935 of them. */
function hpAddress(p, c) {
  const city = hpTitle(p.city || (c && c.city) || '');
  return hpStreetLine(p) + (city ? ', ' + city : '') + ', FL ' + p.zip;
}
function hpPct(arr, q) {
  if (!arr.length) return 0;
  const s = arr.slice().sort(function (a, b) { return a - b; });
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function hpDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- the comps
   The rule, written down so it can be argued with.

   Same community, same property type, size within a band, sold recently,
   builder closings excluded, the subject's own sales excluded. The band and
   the window widen together until there are at least three sales, and the page
   says which step it had to reach. Three is the floor because two sales is an
   anecdote.                                                                */
const HP_TIERS = [
  { pct: 0.05, days: 365,  pool: 1, label: 'within 5% of your size, sold in the last 12 months' },
  { pct: 0.10, days: 365,  pool: 1, label: 'within 10% of your size, sold in the last 12 months' },
  { pct: 0.10, days: 730,  pool: 1, label: 'within 10% of your size, sold in the last 24 months' },
  { pct: 0.15, days: 730,  pool: 1, label: 'within 15% of your size, sold in the last 24 months' },
  { pct: 0.15, days: 1095, pool: 1, label: 'within 15% of your size, sold in the last 3 years' },
  { pct: 0.10, days: 730,  pool: 0, label: 'within 10% of your size, sold in the last 24 months' },
  { pct: 0.20, days: 1095, pool: 0, label: 'within 20% of your size, sold in the last 3 years' }
];

/* A pool is worth real money here and the gap is not small. Across 204 resales
   measured in eight of these communities the difference ran about 17%, size
   matched inside each community, against the $30,000 to $50,000 usually quoted
   nationally. So the ladder tries pool against pool first, and only mixes them
   when there is no other way to reach three sales. Three is the floor because
   two sales is an anecdote. The page always says which step it had to reach. */
function hpComps(D, subj) {
  for (let t = 0; t < HP_TIERS.length; t++) {
    const tier = HP_TIERS[t];
    const cut = hpDaysAgo(tier.days);
    const lo = subj.sqft * (1 - tier.pct), hi = subj.sqft * (1 + tier.pct);
    const list = D.resales.filter(function (r) {
      return r.type === subj.type && r.i !== subj.i &&
             r.sqft >= lo && r.sqft <= hi && r.date >= cut &&
             (!tier.pool || r.pool === subj.pool);
    });
    if (list.length >= 3 || t === HP_TIERS.length - 1) {
      return { list: list, tier: tier, step: t, poolMatched: !!tier.pool };
    }
  }
  return { list: [], tier: HP_TIERS[0], step: 0, poolMatched: false };
}

/* One sale can wreck a small set. A 2,803 square foot home on Passagio sold at
   $408 a foot into a set otherwise running $252 to $325, and left alone it
   dragged the top of the range about $70,000 above anything a buyer had paid
   for a comparable home. So anything outside the standard Tukey fence, one and
   a half interquartile ranges beyond the quartiles, is set aside once there are
   at least five sales to measure a fence from. The page says how many were set
   aside and they stay visible in the table, because a homeowner is entitled to
   see the sale that did not count and decide for themselves.               */
function hpRange(subj, comps) {
  if (!comps.list.length) return null;
  const all = comps.list.map(function (r) { return r.price / r.sqft; });
  let psf = all, trimmed = 0;
  if (all.length >= 5) {
    const q1 = hpPct(all, 0.25), q3 = hpPct(all, 0.75), iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
    const kept = all.filter(function (x) { return x >= lo && x <= hi; });
    if (kept.length >= 3) { trimmed = all.length - kept.length; psf = kept; }
  }
  const r1000 = function (n) { return Math.round(n / 1000) * 1000; };
  return {
    lo: r1000(hpPct(psf, 0.25) * subj.sqft),
    mid: r1000(hpPct(psf, 0.50) * subj.sqft),
    hi: r1000(hpPct(psf, 0.75) * subj.sqft),
    psf: Math.round(hpPct(psf, 0.50)),
    n: psf.length,
    trimmed: trimmed
  };
}

/* ------------------------------------------------------------------ the tax
   This is the calculator's arithmetic, unchanged. It was checked to the penny
   against real 2026 TRIM notices, so it is copied rather than rewritten.
   School taxable is assessed less $25,000 less any personal exemption above the
   standard homestead. Non-school taxable is assessed less all exemptions.   */
function hpBill(D, p, newNonSchoolExemption) {
  const d = D.c.districts[p.dist] || D.c.districts['0100'];
  const STD = D.c.std_exemption;
  const extra = Math.max(0, p.exempt - STD);
  const nsEx = (newNonSchoolExemption === null) ? p.exempt
             : (p.hs ? newNonSchoolExemption + extra : p.exempt);
  const nsTax = Math.max(0, p.assessed - nsEx);
  const scTax = Math.max(0, p.assessed - (p.hs ? 25000 + extra : extra));
  return {
    nonschool: nsTax * d.nonschool / 1000,
    school: scTax * d.school / 1000,
    district: d
  };
}

/* ------------------------------------------------------------- the renderer */
function hpPage(D, p, host) {
  const c = D.c;
  const addr = hpAddress(p, c);
  const sales = (D.sales[p.i] || []).slice().reverse();      // newest first
  const lastSale = sales.length ? sales[0] : null;
  const comps = hpComps(D, p);
  const range = hpRange(p, comps);
  const trend = c.trend[String(p.type)] || c.trend[p.type] || {};
  const rpr = D.rpr[p.slug] || null;

  const now = hpBill(D, p, null);
  const y27 = hpBill(D, p, c.new_2027);
  const y28 = hpBill(D, p, c.new_2028);
  const saving = (now.nonschool + now.school) - (y28.nonschool + y28.school);

  const sohGap = Math.max(0, p.just - p.assessed);
  const canonical = 'https://' + host + '/h/' + p.slug;

  let h = '';

  /* ---- head ---- */
  h += '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>' + hpEsc(addr) + ' | Florida Home Value AI</title>'
    + '<meta name="robots" content="noindex, nofollow">'
    + '<meta name="description" content="' + hpEsc(addr) + '. What homes like it actually sold for, from Sarasota County public records.">'
    + '<meta property="og:type" content="website">'
    + '<meta property="og:title" content="' + hpEsc(addr) + '">'
    + '<meta property="og:description" content="What homes like this one actually sold for, and what the November ballot does to this tax bill. Sarasota County public records. Michael Putnam, Putnam Realty Group, 941-662-9941.">'
    /* The site's existing share card, already 1200x630 and already deployed.
       Facebook needs at least 1200x630 or it ignores the tag and picks some
       other image off the page, which is how a competitor's listing photo
       once ended up on a Palmero post. */
    + '<meta property="og:image" content="https://' + host + '/og-image-fhv.jpg">'
    + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">'
    + '<style>' + HP_CSS + '</style></head><body>';

  /* ---- masthead ---- */
  h += '<div class="wrap">'
    + '<div class="mast">'
    +   '<div class="brandline">Florida Home Value AI &middot; Putnam Realty Group</div>'
    +   '<div class="prepared">Prepared for one address &middot; Sarasota County public records</div>'
    +   '<h1>' + hpEsc(addr) + '</h1>'
    +   '<div class="sub">' + hpEsc(c.name) + ' &middot; ' + hpEsc(c.region) + '</div>'
    +   '<div class="facts">'
    +     hpEsc(p.typeName) + ' &middot; ' + p.sqft.toLocaleString('en-US') + ' sq ft'
    +     (p.bd ? ' &middot; ' + p.bd + ' bed' : '')
    +     (p.fb ? ' &middot; ' + (p.fb + (p.hb ? '.5' : '')) + ' bath' : '')
    +     ' &middot; built ' + p.yr
    +     (p.pool ? ' &middot; pool' : '')
    +     (p.gar ? ' &middot; ' + p.gar.toLocaleString('en-US') + ' sq ft garage' : '')
    +   '</div>'
    + '</div>';

  /* ---- 1. the net gain, first, because it is the reason to open the page --- */
  if (range && lastSale) {
    const gain = range.mid - lastSale.price;
    const up = gain >= 0;
    h += '<div class="hero ' + (up ? 'up' : 'down') + '">'
      + '<div class="herolabel">Since you bought</div>'
      + '<div class="herobig">' + (up ? '+' : '−') + hpMoney(Math.abs(gain)) + '</div>'
      + '<p>You paid ' + hpMoney(lastSale.price) + ' in ' + hpShortDate(lastSale.date) + '.'
      + ' What ' + (comps.list.length) + ' comparable ' + hpEsc(p.typeName.toLowerCase())
      + ' sales point to today is around <strong>' + hpMoney(range.mid) + '</strong>, in a range of '
      + hpMoney(range.lo) + ' to ' + hpMoney(range.hi) + '.</p>'
      + '<p class="small">That is the gross figure. Selling costs come out of it, and there is a calculator further down that takes them off. '
      + (lastSale.builder ? 'Your purchase was the original closing from ' + hpEsc(c.builder) + '.' : '')
      + '</p>'
      + '</div>';
  } else if (range) {
    h += '<div class="hero up"><div class="herolabel">What this home looks like today</div>'
      + '<div class="herobig">' + hpMoney(range.mid) + '</div>'
      + '<p>In a range of ' + hpMoney(range.lo) + ' to ' + hpMoney(range.hi)
      + ', from ' + comps.list.length + ' comparable recorded sales.</p>'
      + '<p class="small">There is no gain figure here because the county has no record of a finished house '
      + 'being bought on this address. What it shows is a lot purchase followed by construction, which is what '
      + 'a custom build looks like in the record. If you tell me what the house cost to put up I can work the '
      + 'rest out with you.</p></div>';
  } else {
    h += '<div class="hero up"><div class="herolabel">This one needs a person</div>'
      + '<div class="herobig" style="font-size:28px">No fair comparison in the record</div>'
      + '<p>Nothing else in ' + hpEsc(c.name) + ' close to this home in size and type has sold recently enough '
      + 'to build an honest range from, and I would rather say that than pad the answer with sales that are not '
      + 'really like yours.</p>'
      + '<p>That is not a dead end. It usually means the home is unusual for the community, which is often worth '
      + 'money rather than costing it. Call me on <a href="tel:19416629941">941-662-9941</a> and I will work it '
      + 'out properly, at no charge and with nothing following from it.</p></div>';
  }

  /* ---- 2. Save Our Homes ---- */
  if (p.hs && sohGap > 5000) {
    const d = now.district;
    const atMarket = Math.max(0, p.just - 250000) * d.nonschool / 1000
                   + Math.max(0, p.just - 25000) * d.school / 1000;
    const atCapped = y28.nonschool + y28.school;
    h += '<div class="card gold">'
      + '<h2>Save Our Homes is holding ' + hpMoney(sohGap) + ' off your assessment</h2>'
      + '<p>The county puts the market value of this home at ' + hpMoney(p.just)
      + ' and taxes you on ' + hpMoney(p.assessed) + '. The difference is the cap you have built up by staying put.</p>'
      + '<p>It is worth about <strong>' + hpMoney(Math.max(0, atMarket - atCapped))
      + ' a year</strong> at 2028 rates, and it resets to zero the day the home sells. '
      + 'Florida portability lets you carry up to $500,000 of that benefit to your next Florida homestead, '
      + 'which in your case would cover all of it. It is not automatic and it has its own deadline, '
      + 'so ask the Property Appraiser on 941-861-8200 before you list anything.</p>'
      + '</div>';
  }

  /* ---- 3. the comparable sales ---- */
  if (comps.list.length) {
    h += '<div class="card">'
      + '<div class="tag">Recorded sales, not estimates</div>'
      + '<h2>What homes like yours actually sold for</h2>'
      + '<p>Every home below is a ' + hpEsc(p.typeName.toLowerCase()) + ' in ' + hpEsc(c.name)
      + ' ' + hpEsc(comps.tier.label)
      + (comps.poolMatched
          ? (p.pool ? ', with a pool like yours' : ', without a pool, like yours')
          : ', with and without pools, because there were not three sales at your size either way')
      + '. Builder closings are excluded, because a builder base price is not a comparable sale for an existing home. Nothing was picked by hand.</p>'
      + '<table class="comps"><thead><tr><th>Address</th><th>Size</th><th>Sold</th><th class="r">Price</th><th class="r">Per sq ft</th></tr></thead><tbody>';
    const show = comps.list.slice(0, 12);
    show.forEach(function (r) {
      const cp = D.parcels[r.i];
      h += '<tr><td>' + hpEsc(hpStreetLine(cp)) + (cp.pool ? ' <span class="chip">pool</span>' : '')
        + '<br><span class="dim">' + hpEsc(hpTitle(cp.city || c.city)) + ', FL ' + hpEsc(cp.zip) + '</span></td>'
        + '<td>' + cp.sqft.toLocaleString('en-US') + '</td>'
        + '<td>' + hpShortDate(r.date) + '</td>'
        + '<td class="r">' + hpMoney(r.price) + '</td>'
        + '<td class="r">$' + Math.round(r.price / r.sqft) + '</td></tr>';
    });
    h += '</tbody></table>';
    if (comps.list.length > show.length) {
      h += '<p class="small">Showing the 12 most recent of ' + comps.list.length + '.</p>';
    }
    if (range) {
      h += '<div class="rangebar"><div><span>Low</span><strong>' + hpMoney(range.lo) + '</strong></div>'
        + '<div class="mid"><span>Middle</span><strong>' + hpMoney(range.mid) + '</strong></div>'
        + '<div><span>High</span><strong>' + hpMoney(range.hi) + '</strong></div></div>'
        + '<p class="small">The range is the middle half of those sales by price per square foot, '
        + 'applied to your ' + p.sqft.toLocaleString('en-US') + ' square feet. The middle figure is the median.'
        + (range.trimmed
            ? ' ' + range.trimmed + ' sale' + (range.trimmed > 1 ? 's were' : ' was')
              + ' set aside as an outlier before working the range out, because '
              + (range.trimmed > 1 ? 'their prices per square foot were' : 'its price per square foot was')
              + ' far enough from the rest to move the answer on its own. '
              + (range.trimmed > 1 ? 'They are' : 'It is') + ' still in the table above.'
            : '')
        + ' Half of those sales landed inside this range and half outside it, so it describes where the middle '
        + 'of the market has been, not the limits of what your house could sell for. Condition, upgrades and view '
        + 'move a real sale further than any of this.</p>';

      /* The county's market value and the sales will not agree, and someone
         who scrolls will notice. Say why before they have to ask. */
      if (p.just > 0) {
        const gapPct = Math.round(Math.abs(range.mid - p.just) / p.just * 100);
        if (gapPct >= 5) {
          h += '<p class="note"><strong>Why this is not the county\'s number.</strong> '
            + 'The county puts the market value of this home at ' + hpMoney(p.just) + ', which is '
            + gapPct + '% ' + (range.mid > p.just ? 'below' : 'above') + ' the middle figure above. '
            + 'That gap is normal here and it is not a mistake on either side. '
            + 'Across ' + c.just_ratio_n + ' ' + hpEsc(c.name) + ' resales in the last two years, homes here sold for a median of '
            + c.just_ratio + ' times the county\'s market value on the same parcel. '
            + 'The county figure is a mass appraisal taken as at 1 January 2026 for tax purposes, it does not '
            + 'see your upgrades, and it was never meant to be a listing price. You can check both: your parcel '
            + 'record is on <a href="https://www.sc-pa.com/">sc-pa.com</a> and every sale above is a recorded deed.</p>';
        }
      }
    }
    if (trend.chg !== null && trend.chg !== undefined) {
      const dir = trend.chg < 0 ? 'down' : 'up';
      h += '<p class="note"><strong>Which way this is moving.</strong> '
        + hpEsc(p.typeName) + ' homes in ' + hpEsc(c.name) + ' sold at $' + trend.psf12
        + ' a square foot over the last 12 months against $' + trend.psf24 + ' the 12 months before, '
        + 'so this type is ' + dir + ' about ' + Math.abs(trend.chg) + '% on the year. '
        + 'Types here move at very different rates, which is why this page uses your own type rather than a community average.</p>';
    }
    h += '</div>';
  }

  /* ---- 4. RPR, when one has been added ---- */
  if (rpr) {
    h += '<div class="card">'
      + '<div class="tag">A second opinion, not mine</div>'
      + '<h2>What RPR says</h2>'
      + '<p>RPR is run by the National Association of Realtors. It uses a different method to the one above and it can see things county records cannot.</p>'
      + '<div class="rpr"><div class="rprv">' + hpMoney(rpr.value) + '</div>'
      + '<div class="rprr">Range ' + hpK(rpr.lo) + ' to ' + hpK(rpr.hi) + ' &middot; as of ' + hpEsc(rpr.asof) + '</div></div>'
      + '<p class="small">Where the two agree, that is worth something. Where they disagree, the gap is usually condition, upgrades or view, and that is the part no automated number can settle.</p>'
      + '</div>';
  } else {
    h += '<div class="card quiet">'
      + '<h2>Want a second opinion on the number?</h2>'
      + '<p>I can pull an independent estimate for this address from RPR, which is run by the National Association of Realtors, and put it on this page next to the recorded sales. It uses a different method and it sees things county records do not. Text me the address and I will add it. There is no charge and nothing follows from it.</p>'
      + '</div>';
  }

  /* ---- 5. the tax bill ---- */
  h += '<div class="card">'
    + '<div class="tag">November 3 ballot</div>'
    + '<h2>What the homestead amendment does to this bill</h2>';
  if (p.hs) {
    h += '<p class="lead">' + hpMoney(saving) + ' a year less by 2028</p>'
      + '<p>Your non-school ad valorem tax goes from ' + hpMoney(now.nonschool) + ' now to '
      + hpMoney(y27.nonschool) + ' in 2027 and ' + hpMoney(y28.nonschool) + ' in 2028.'
      + (y28.nonschool < 1 ? ' It reaches zero.' : ' It does not reach zero: ' + hpMoney(Math.max(0, p.assessed - c.new_2028 - Math.max(0, p.exempt - c.std_exemption))) + ' of assessed value would still be taxable.') + '</p>'
      + '<p>If your taxes are escrowed that is about ' + hpMoney(saving / 12) + ' a month. It does not arrive when the votes are counted. '
      + 'The change first appears on the tax bill mailed in November 2027, and your servicer resets the escrow at its next annual analysis, so a smaller payment lands in early 2028.</p>';
  } else {
    /* The saving above is zero for a parcel with no homestead, because the
       increase does not reach it. The figure worth giving is the one it WOULD
       get, so the owner can weigh it, and that has to be worked out as though
       the homestead were in place rather than read off the real bill. */
    const d0 = now.district;
    const hypoNow = Math.max(0, p.assessed - c.std_exemption) * d0.nonschool / 1000
                  + Math.max(0, p.assessed - 25000) * d0.school / 1000;
    const hypo28 = Math.max(0, p.assessed - c.new_2028) * d0.nonschool / 1000
                 + Math.max(0, p.assessed - 25000) * d0.school / 1000;
    const hypoSaving = Math.max(0, (now.nonschool + now.school) - hypo28);
    h += '<p>This parcel does not carry a homestead exemption on the county roll, and the increase applies only to homesteaded property. Nothing on this bill changes.</p>'
      + '<p>What would change for a parcel like this is the assessment cap, which drops from 10% a year to 5%. That slows how fast the assessed value can climb. It does not reduce what is owed now.</p>'
      + '<p>If this became somebody\'s permanent residence and carried a homestead exemption, the bill would be about '
      + hpMoney(hypoNow) + ' a year today and about ' + hpMoney(hypo28) + ' by 2028, which is '
      + hpMoney(hypoSaving) + ' a year less than it is paying now. Whether this parcel can qualify is a question for the '
      + 'Property Appraiser on 941-861-8200, and there is a date most people have not heard about: anyone who is a '
      + 'permanent Florida resident by 31 December 2026 is eligible for the larger exemption from the start, and '
      + 'anyone establishing residency on or after 1 January 2027 begins at $50,000 and waits until the fifth year.</p>';
  }
  h += '<table class="bill"><thead><tr><th>Line</th><th class="r">Now</th><th class="r">2027</th><th class="r">2028</th></tr></thead><tbody>'
    + '<tr><td><strong>Non-school ad valorem</strong><br><span class="dim">county, hospital, water district, city</span></td>'
    + '<td class="r">' + hpMoney(now.nonschool) + '</td><td class="r">' + hpMoney(y27.nonschool) + '</td><td class="r"><strong>' + hpMoney(y28.nonschool) + '</strong></td></tr>'
    + '<tr><td><strong>School ad valorem</strong><br><span class="dim">not affected by the change</span></td>'
    + '<td class="r">' + hpMoney(now.school) + '</td><td class="r">' + hpMoney(y27.school) + '</td><td class="r">' + hpMoney(y28.school) + '</td></tr>'
    + '<tr><td><strong>District, fire, solid waste, stormwater</strong><br><span class="dim">not affected, and not in this calculation</span></td>'
    + '<td class="r dim" colspan="3">on your TRIM notice, unchanged</td></tr>'
    + '</tbody></table>'
    + '<p class="small">Tax district: ' + hpEsc(now.district.name) + ', ' + now.district.nonschool
    + ' mills on the non-school side and ' + now.district.school + ' on the school side. '
    + 'Assessed ' + hpMoney(p.assessed) + '. ' + hpEsc(c.roll) + '. '
    + '2026 rates were not final when this was built, so expect a difference of a few dollars either way. '
    + 'This assumes the amendment passes as written and your homestead status does not change. Not tax advice.</p>'
    + '<p class="note"><strong>The part that does not change.</strong> ' + hpEsc(c.cdd_note) + '</p>'
    + '</div>';

  /* ---- 6. net proceeds ---- */
  if (range) {
    h += '<div class="card">'
      + '<div class="tag">Net proceeds</div>'
      + '<h2>What you would actually walk away with</h2>'
      + '<p>The sale price starts at the middle of the range above. Everything else is empty because '
      + 'I do not know your numbers and I am not going to guess them. Fill in what you know and the total follows.</p>'
      + '<div class="calc">'
      +   '<label>Sale price<input type="number" id="np_price" value="' + range.mid + '" step="1000"></label>'
      +   '<label>Mortgage payoff<input type="number" id="np_loan" placeholder="what you still owe" step="1000"></label>'
      +   '<label>Listing side commission %<input type="number" id="np_lc" placeholder="whatever you agree" step="0.25"></label>'
      +   '<label>Buyer agent compensation %<input type="number" id="np_bc" placeholder="whatever you agree" step="0.25"></label>'
      +   '<label>Title and other closing costs<input type="number" id="np_cl" placeholder="ask your title company" step="100"></label>'
      +   '<label>Repairs and credits<input type="number" id="np_rp" placeholder="if any" step="500"></label>'
      + '</div>'
      + '<div class="npout" id="np_out"></div>'
      + '<p class="small"><strong>The commission boxes start empty on purpose.</strong> '
      + 'Since August 2024 there is no standard rate and no customary rate. What the listing side charges is agreed '
      + 'between you and whoever lists it, and what the buyer\'s agent gets is agreed in writing between you and your buyer. '
      + 'Putting a suggested number in those boxes would be inventing a rate that does not exist, so type in whatever '
      + 'you are actually being quoted and the total follows.</p>'
      + '<p class="small">Documentary stamps are the one figure that is fixed: Florida charges $0.70 per $100 of the sale price '
      + 'on the deed, and in Sarasota County that is customarily the seller\'s. It is worked out from the sale price above '
      + 'and shown on its own line. Prorated taxes, your exact payoff, and the HOA and district estoppel fees are not in here '
      + 'and will move the total. This is an estimate for planning, not a closing statement.</p>'
      + '</div>';
  }

  /* ---- 7. the sale history ---- */
  if (sales.length) {
    h += '<div class="card">'
      + '<div class="tag">Public record</div>'
      + '<h2>What the county has recorded on ' + hpEsc(addr) + '</h2>'
      + '<table class="comps"><thead><tr><th>Date</th><th class="r">Price</th><th>What it was</th></tr></thead><tbody>';
    sales.forEach(function (s) {
      h += '<tr><td>' + hpDate(s.date) + '</td><td class="r">' + hpMoney(s.price) + '</td>'
        + '<td>' + (s.builder ? 'Original closing from ' + hpEsc(c.builder)
                              : 'Owner to owner resale')
        /* A builder closing is already kept out of the comp set for its own
           reason, so tagging it again would say the same thing twice and imply
           the price was somehow doubtful. The tag is only for a resale the
           county did not flag as arms length. */
        + ((!s.builder && !s.qualified) ? ' <span class="chip">not counted as a comp</span>' : '')
        + '</td></tr>';
    });
    h += '</tbody></table><p class="small">Warranty and trustee deeds over $50,000 only. '
      + 'Quit claims, corrective deeds and transfers for a dollar are left out because they are not sales. '
      + 'A transfer marked <em>not counted as a comp</em> is a real recorded sale that the county did not flag '
      + 'as a qualified arms length transaction, so it appears in your history but is kept out of the comparable set above.</p></div>';
  }

  /* ---- 8. what the records cannot see ---- */
  h += '<div class="card quiet">'
    + '<h2>What the county records cannot see</h2>'
    + '<p>County records carry square footage, bedrooms, bathrooms, year built and whether there is a pool. That is the whole list. '
    + 'They do not show whether the kitchen has been redone, what the floors are, how old the roof and air handler are, '
    + 'whether the lanai is extended or enclosed, or whether you have storm shutters. '
    + 'Those are often what separates two homes that look identical on paper.</p>'
    + '<p>If you want a number that accounts for them, that takes twenty minutes and someone standing in the house. No charge and no obligation either way.</p>'
    + '<p class="cta"><a class="btn" href="tel:19416629941">Call 941-662-9941</a> <a class="btn ghost" href="sms:19416629941">Text me instead</a></p>'
    + '</div>';

  /* ---- 9. the alerts signup, three scopes ---- */
  h += '<form class="card signup" method="POST" action="/h/' + hpEsc(p.slug) + '">'
    + '<input type="hidden" name="form" value="alerts">'
    /* ---- the alerts signup ----------------------------------------------
       WHAT THIS PROMISES, AND WHY IT IS NARROWER THAN IT WAS.
       An earlier version offered new listings, price cuts and pending sales as
       well. Three problems with that. Nothing sends them. They come from the
       MLS feed rather than the county, and the Stellar agreement limits that
       data to public listing display, which an outbound email is not. And a
       closed price is the only one of the four that is a fact rather than a
       hope. So this promises recorded sales only. That part is county record,
       it needs nobody's permission, and it is the part no other agent sends.
       If Brian and Ben clear MLS-driven alerts, widen it then and not before. */
    + '<div class="tag">Alerts</div>'
    + '<h2>Know what ' + hpEsc(hpTitle(p.street)) + ' actually sells for, as it happens</h2>'
    + '<p>This page rebuilds itself every time the county records a new sale, so what you are reading is never '
    + 'out of date. Leave your email and I will tell you when one of those sales lands: which house, when it closed, '
    + 'and what the buyer actually paid.</p>'
    + '<p>That last part is the whole point. Asking prices are public and mostly noise. '
    + 'The recorded price is what your own home gets measured against, and most owners never see it '
    + 'until they are already trying to sell.</p>'
    + '<p class="small">Pick how wide you want it.</p>'
    + '<div class="scopes">'
    +   '<label><input type="radio" name="scope" value="street" checked> <strong>' + hpEsc(hpTitle(p.street)) + ' only.</strong> Your own street, nothing else.</label>'
    +   '<label><input type="radio" name="scope" value="plan"> <strong>Homes like yours anywhere in ' + hpEsc(c.name) + '.</strong> '
    +     hpEsc(p.typeName) + ', within 10% of your ' + p.sqft.toLocaleString('en-US') + ' square feet. '
    +     'These are the sales that actually move your number.</label>'
    +   '<label><input type="radio" name="scope" value="community"> <strong>All ' + c.parcels.toLocaleString('en-US') + ' homes in ' + hpEsc(c.name) + '.</strong> '
    +     'Everything, including types and sizes unlike yours.</label>'
    + '</div>'
    + '<div class="row"><input type="email" name="email" required placeholder="your email"><button type="submit">Notify me</button></div>'
    + '<p class="small"><strong>I send these myself.</strong> There is no robot behind this, which means an email '
    + 'reaches you within a day or two of a sale being recorded rather than within a second, and it means somebody '
    + 'has looked at it before it goes. If that is too slow for you, say so and I will call you instead.</p>'
    + '<p class="small">Your address and email stay with me. I never sell them, share them or give them to anyone. '
    + 'Every message has an unsubscribe link, or reply with the word stop and you are off the same day.</p>'
    + '</form>';

  /* ---- 10. the rest of the community ---- */
  h += '<div class="card quiet">'
    + '<h2>The rest of ' + hpEsc(c.name) + '</h2>'
    + '<p>' + c.parcels.toLocaleString('en-US') + ' homes, ' + c.homesteads.toLocaleString('en-US') + ' of them homesteaded, '
    + c.out_of_state.toLocaleString('en-US') + ' owned from out of state. '
    + 'Over the last 12 months ' + c.resales12 + ' changed hands owner to owner, at a median of ' + hpMoney(c.median_price12)
    + ' and $' + c.median_psf12 + ' a square foot across all four home types.</p>'
    + '<p><a href="https://granparadiso.floridahomevalueai.com/">' + hpEsc(c.name) + ' home values</a> &middot; '
    + '<a href="/property-tax-calculator">the tax calculator for any address</a> &middot; '
    + '<a href="/flood-zones">how to check the flood zone on this address</a> &middot; '
    + '<a href="/meet">about Michael Putnam</a></p>'
    + '</div>';

  /* ---- 11. corrections ------------------------------------------------------
     A form rather than a phone number, and it carries the parcel with it. When
     somebody writes "the pool was filled in years ago" I need to know which of
     1,935 houses they mean, and asking them to retype their own address after
     reading a page about their own address is the kind of thing that makes
     people give up instead. The hidden fields below carry the address and the
     figures the page showed them, so the message arrives with its own context. */
  h += '<form class="card correction" method="POST" action="/h/' + hpEsc(p.slug) + '">'
    + '<input type="hidden" name="form" value="correction">'
    + '<div class="tag">Corrections</div>'
    + '<h2>If something on this page is wrong about ' + hpEsc(addr) + '</h2>'
    + '<p>The county roll is a snapshot taken on 1 January 2026 and it gets things wrong. A pool that was filled in, '
    + 'a lanai counted as living area, a room that was never finished, a transfer that was not really a sale. '
    + 'If a figure here does not match what you know about your own house, the house is right and I want to hear about it.</p>'
    + '<p class="small">This form already carries your address and the exact numbers you are looking at, '
    + 'so you only have to tell me what is wrong. Nothing else about you is sent.</p>'
    + '<div class="carries">'
    +   '<strong>' + hpEsc(addr) + '</strong><br>'
    +   hpEsc(p.typeName) + ' &middot; ' + p.sqft.toLocaleString('en-US') + ' sq ft &middot; '
    +   p.bd + ' bed &middot; ' + (p.fb + (p.hb ? '.5' : '')) + ' bath &middot; built ' + p.yr
    +   ' &middot; ' + (p.pool ? 'pool' : 'no pool')
    +   '<br>Assessed ' + hpMoney(p.assessed) + ' &middot; county market value ' + hpMoney(p.just)
    +   ' &middot; ' + (p.hs ? 'homesteaded' : 'no homestead exemption')
    +   (range ? '<br>This page showed a range of ' + hpMoney(range.lo) + ' to ' + hpMoney(range.hi)
                + ', middle ' + hpMoney(range.mid) : '')
    + '</div>'
    + '<div class="wrongwhat">'
    +   '<label><input type="checkbox" name="wrong" value="Square footage"> The square footage</label>'
    +   '<label><input type="checkbox" name="wrong" value="Pool"> Whether there is a pool</label>'
    +   '<label><input type="checkbox" name="wrong" value="Beds or baths"> The bedrooms or bathrooms</label>'
    +   '<label><input type="checkbox" name="wrong" value="Year built"> The year built</label>'
    +   '<label><input type="checkbox" name="wrong" value="A sale in the history"> Something in the sale history</label>'
    +   '<label><input type="checkbox" name="wrong" value="Homestead or tax"> The homestead or tax figures</label>'
    +   '<label><input type="checkbox" name="wrong" value="A comparable sale"> One of the comparable sales</label>'
    +   '<label><input type="checkbox" name="wrong" value="Something else"> Something else</label>'
    + '</div>'
    + '<label class="fieldlab">What is actually true?'
    +   '<textarea name="detail" rows="4" required placeholder="The pool was filled in when we bought it in 2021."></textarea></label>'
    + '<div class="row">'
    +   '<input type="email" name="email" required placeholder="your email, so I can tell you when it is fixed">'
    +   '<button type="submit">Send it</button>'
    + '</div>'
    + '<p class="small">I read these myself. If you are right I fix the page and email you to say what changed. '
    + 'If the county record is the problem rather than my arithmetic, I will tell you that too and point you at '
    + 'the Property Appraiser on 941-861-8200, who is the only one who can change it at source.</p>'
    + '</form>';

  h += '<div class="foot">'
    + '<p><strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; <a href="tel:19416629941">941-662-9941</a><br>'
    + 'Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275</p>'
    + '<p class="small">Sale prices are recorded transactions from Sarasota County public records, owner to owner, builder sales excluded. '
    + 'Figures are for general market awareness and are not an appraisal, not tax advice and not legal advice. '
    + 'There is no MLS data on this page. Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act. '
    + 'This is not a solicitation of property currently listed with another broker. '
    + 'This page was built for one address and is not published or indexed.</p>'
    + '<p class="small">Built from the ' + hpEsc(c.roll) + '. Page generated ' + hpDate(new Date().toISOString().slice(0, 10)) + '.</p>'
    + '</div>';

  h += '</div>' + (range ? '<script>' + HP_JS + '</script>' : '') + '</body></html>';
  return h;
}

/* ------------------------------------------------------- the confirmation */
function hpDone(D, p, kind, scope) {
  let title, body;
  if (kind === 'correction') {
    title = 'Got it. That is with me now.';
    body = '<p>Your message about ' + hpEsc(hpAddress(p, D.c)) + ' arrived with the address and the exact figures '
         + 'the page was showing you, so I do not have to come back and ask which house or which number.</p>'
         + '<p>I read these myself. If the page is wrong I fix it and email you to say what changed. '
         + 'If the problem is the county record rather than my arithmetic, I will tell you that and point you at '
         + 'the Property Appraiser on 941-861-8200, because they are the only ones who can change it at source. '
         + 'Either way you hear back.</p>';
  } else {
    const what = scope === 'community'
        ? 'every sale in ' + D.c.name + ', all ' + D.c.parcels.toLocaleString('en-US') + ' homes'
      : scope === 'plan'
        ? hpEsc(p.typeName) + ' homes within 10% of your ' + p.sqft.toLocaleString('en-US') + ' square feet, anywhere in ' + D.c.name
        : hpTitle(p.street) + ' only';
    title = 'Done. You are on the list.';
    body = '<p>You will hear from me whenever a home sells in <strong>' + hpEsc(what) + '</strong>: '
         + 'which house, when it closed, and what the buyer actually paid.</p>'
         + '<p>I send these myself rather than automatically, so expect a day or two after a sale is recorded '
         + 'rather than the same minute. Nothing else goes to that address. Every email has an unsubscribe link, '
         + 'or reply with the word stop and you are off the same day.</p>';
  }
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="robots" content="noindex, nofollow"><title>' + hpEsc(title) + '</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">'
    + '<style>' + HP_CSS + '</style></head><body><div class="wrap">'
    + '<div class="card gold" style="margin-top:32px"><h2>' + hpEsc(title) + '</h2>' + body
    + '<p><a class="btn" href="/h/' + hpEsc(p.slug) + '">Back to ' + hpEsc(hpAddress(p, D.c)) + '</a></p></div>'
    + '<div class="foot"><p><strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; <a href="tel:19416629941">941-662-9941</a></p></div>'
    + '</div></body></html>';
}

/* --------------------------------------------------------------- the route */
async function hpRoute(env, request, slug) {
  const u = new URL(request.url);
  const D = await hpData(env, u.origin);
  const p = D.bySlug[String(slug || '').toLowerCase()];
  const host = u.host;

  if (!p) {
    return new Response(hpNotFound(D, host), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }

  if (request.method === 'POST') {
    const form = await request.formData();
    const email = String(form.get('email') || '').trim();
    const kind = String(form.get('form') || 'alerts');
    const addr = hpAddress(p, D.c);

    /* A correction. The message goes to the vault with the parcel attached, so
       it arrives saying which house and what the page had claimed, rather than
       as a loose sentence about an unnamed property. */
    if (kind === 'correction') {
      const wrong = form.getAll('wrong').map(String);
      const detail = String(form.get('detail') || '').trim();
      const facts = [
        p.typeName, p.sqft + ' sq ft', p.bd + ' bed', (p.fb + (p.hb ? '.5' : '')) + ' bath',
        'built ' + p.yr, (p.pool ? 'pool' : 'no pool'),
        'assessed ' + p.assessed, 'county market value ' + p.just,
        (p.hs ? 'homesteaded' : 'no homestead')
      ].join(' | ');
      await fetch('https://fhv-lead-vault.cleirshusband.workers.dev/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '', phone: '', email: email, address: addr,
          territory_id: D.c.name + ' - CORRECTION on a personal home page',
          /* The vault builds its subject line from this field, and it decides
             "lead" purely by whether contact details are present. A correction
             is not a lead. Until the vault itself can tell them apart, putting
             the word here is what makes it obvious in the inbox without
             opening anything. */
          subdivision: 'CORRECTION, ' + D.c.name,
          wants: 'CORRECTION REPORTED\nAddress: ' + addr
               + '\nPage URL: https://' + host + '/h/' + p.slug
               + '\nWhat they say is wrong: ' + (wrong.length ? wrong.join(', ') : 'not specified')
               + '\nTheir words: ' + detail
               + '\nWhat the page was showing: ' + facts
        })
      }).catch(function () {});
      return new Response(hpDone(D, p, 'correction', ''), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }
      });
    }

    const scope = String(form.get('scope') || 'street');
    if (email) {
      const wants = scope === 'community'
          ? 'Alerts for all ' + D.c.parcels + ' homes in ' + D.c.name
        : scope === 'plan'
          ? 'Alerts for ' + p.typeName + ' homes within 10% of ' + p.sqft.toLocaleString('en-US') + ' sq ft anywhere in ' + D.c.name
          : 'Alerts for ' + hpTitle(p.street) + ' only';
      await fetch('https://fhv-lead-vault.cleirshusband.workers.dev/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '', phone: '', email: email, address: addr,
          territory_id: D.c.name + ' - personal home page',
          subdivision: D.c.name,
          wants: wants + '\nPage URL: https://' + host + '/h/' + p.slug
        })
      }).catch(function () {});
    }
    return new Response(hpDone(D, p, 'alerts', scope), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }
    });
  }

  return new Response(hpPage(D, p, host), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'public, max-age=900'
    }
  });
}

function hpNotFound(D, host) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="robots" content="noindex, nofollow"><title>Address not found</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">'
    + '<style>' + HP_CSS + '</style></head><body><div class="wrap">'
    + '<div class="card"><h2>I do not have a page for that address yet</h2>'
    + '<p>These pages currently cover ' + D.c.parcels.toLocaleString('en-US') + ' homes in ' + hpEsc(D.c.name)
    + ', ' + hpEsc(D.c.city) + '. If your address is in there and this link did not work, it is my mistake rather than yours.</p>'
    + '<p>Text the address to <a href="sms:19416629941">941-662-9941</a> and I will send you the right link. '
    + 'For anywhere else in Sarasota, Charlotte or Manatee County, the '
    + '<a href="/property-tax-calculator">tax calculator</a> works on any address today.</p></div>'
    + '<div class="foot"><p><strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; <a href="tel:19416629941">941-662-9941</a></p></div>'
    + '</div></body></html>';
}

/* -------------------------------------------------------------- the styles */
const HP_CSS = `
/* Type is set larger than a web default on purpose. The people reading
   these pages own homes in Gran Paradiso and are mostly over sixty, and
   a lot of what matters here sits in the explanatory text rather than the
   headline. 18px body, and nothing on the page below 15px.
   --dim is the gray for secondary text. At #6b6259 it cleared the AA
   contrast bar at 5.59:1 but not AAA. #57504a reaches 7.41:1.
   --gold is the brand color and stays as it is for rules, borders and
   headings, where it is large enough not to matter. --goldink is the
   darker version used anywhere gold becomes readable text or a link:
   the brand gold is 3.38:1 on this background, which fails AA outright. */
:root{--ink:#1a1714;--dim:#57504a;--gold:#b07d2b;--goldink:#8a601d;--warm:#faf7f2;--line:#e6ded2;--green:#2e6b46;--red:#9b3b2f;--radius:10px}
*{box-sizing:border-box}
body{margin:0;background:var(--warm);color:var(--ink);font:400 18px/1.7 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:760px;margin:0 auto;padding:0 16px 56px}
h1{font:800 32px/1.15 "Playfair Display",Georgia,serif;margin:.3rem 0 .4rem}
h2{font:700 22px/1.25 "Playfair Display",Georgia,serif;margin:0 0 .6rem}
p{margin:0 0 .9rem}
a{color:var(--goldink)}
.mast{padding:28px 0 18px;border-bottom:1px solid var(--line)}
.brandline{font:600 13px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--goldink)}
.prepared{font-size:15px;color:var(--dim);margin-top:2px}
.sub{font-size:17px;color:var(--dim)}
.facts{margin-top:8px;font-size:17px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px}
.hero{margin:20px 0;padding:22px;border-radius:var(--radius);background:#fff;border:1px solid var(--line);border-left:4px solid var(--green)}
.hero.down{border-left-color:var(--red)}
.herolabel{font:600 13px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)}
.herobig{font:800 44px/1.05 "Playfair Display",Georgia,serif;margin:.15rem 0 .7rem;color:var(--green)}
.hero.down .herobig{color:var(--red)}
.card{margin:18px 0;padding:22px;background:#fff;border:1px solid var(--line);border-radius:var(--radius)}
.card.quiet{background:transparent;border-style:dashed}
.card.gold{border-left:4px solid var(--gold);background:#fffaf1}
.tag{font:600 12px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--goldink);margin-bottom:6px}
.lead{font:800 26px/1.2 "Playfair Display",Georgia,serif;margin:0 0 .6rem}
.small{font-size:16px;line-height:1.65;color:var(--dim)}
.dim{color:var(--dim);font-size:15px;font-weight:400}
.note{background:var(--warm);border-left:3px solid var(--gold);padding:12px 14px;border-radius:6px;font-size:17px;margin-top:14px}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:16px}
th{text-align:left;font:600 12px/1.5 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.07em;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--line);padding:6px 8px}
td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.r{text-align:right}
.chip{font-size:12px;background:var(--warm);border:1px solid var(--line);border-radius:20px;padding:1px 7px;color:var(--dim)}
.rangebar{display:flex;gap:8px;margin:16px 0 6px}
.rangebar>div{flex:1;text-align:center;padding:12px 6px;background:var(--warm);border:1px solid var(--line);border-radius:8px}
.rangebar span{display:block;font:600 12px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}
.rangebar strong{font:800 19px/1.3 "Playfair Display",Georgia,serif}
.rangebar .mid{background:#fffaf1;border-color:var(--gold)}
.rangebar .mid strong{color:var(--goldink);font-size:22px}
.rpr{background:var(--warm);border:1px solid var(--line);border-radius:8px;padding:16px;text-align:center;margin:12px 0}
.rprv{font:800 32px/1.1 "Playfair Display",Georgia,serif}
.rprr{font-size:15px;color:var(--dim)}
.calc{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}
.calc label{display:block;font-size:15px;color:var(--dim)}
.calc input{display:block;width:100%;margin-top:3px;padding:10px;font:600 16px Inter,sans-serif;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.npout{background:var(--warm);border:1px solid var(--line);border-radius:8px;padding:14px;font-size:17px}
.npout .tot{font:800 28px/1.2 "Playfair Display",Georgia,serif;color:var(--goldink);margin-top:6px}
.npout .line{display:flex;justify-content:space-between;padding:3px 0}
.row{display:flex;gap:8px;margin:12px 0}
.row input[type=email]{flex:1;min-width:0;padding:13px;font:400 16px Inter,sans-serif;border:1px solid var(--line);border-radius:8px}
.row button{padding:13px 22px;font:600 16px Inter,sans-serif;background:var(--gold);color:#fff;border:0;border-radius:8px;cursor:pointer;white-space:nowrap}
.scopes{margin:10px 0 4px}
.scopes label{display:block;padding:11px 13px;border:1px solid var(--line);border-radius:8px;margin-bottom:7px;font-size:17px;cursor:pointer;background:var(--warm);line-height:1.55}
.carries{background:var(--warm);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:8px;padding:12px 14px;font-size:16px;color:var(--dim);margin:12px 0}
.carries strong{color:var(--ink);font-size:18px}
.wrongwhat{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin:14px 0}
.wrongwhat label{font-size:17px;cursor:pointer}
.fieldlab{display:block;font-size:15px;color:var(--dim);margin-top:10px}
.fieldlab textarea{display:block;width:100%;margin-top:4px;padding:11px;font:400 16px Inter,sans-serif;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);resize:vertical}
.npout .empty span:last-child{color:var(--dim);font-style:italic}
.npout .warn{margin-top:10px;padding:10px 12px;background:#fff4e6;border-left:3px solid var(--gold);border-radius:6px;font-size:16px;color:var(--ink)}
.cta{margin-top:14px}
.btn{display:inline-block;padding:12px 20px;background:var(--gold);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:0 6px 8px 0}
.btn.ghost{background:transparent;color:var(--gold);border:1px solid var(--gold)}
.foot{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);font-size:16px;color:var(--dim)}
.foot strong{color:var(--ink)}
@media(max-width:560px){
  h1{font-size:27px}.herobig{font-size:34px}.calc{grid-template-columns:1fr}
  .rangebar{flex-direction:column}.row{flex-direction:column}
  .wrongwhat{grid-template-columns:1fr}
  table{font-size:15px}td,th{padding:8px 5px}
}
`;

/* ------------------------------------------------------ the one bit of JS
   The net proceeds calculator. Everything else on the page is already final
   HTML when it leaves the server. */
const HP_JS = `
(function(){
  var ids=['np_price','np_loan','np_lc','np_bc','np_cl','np_rp'];
  function v(id){var e=document.getElementById(id);return e?(parseFloat(e.value)||0):0;}
  function m(n){return '$'+Math.round(n).toLocaleString('en-US');}
  function blank(id){var e=document.getElementById(id);return !e || String(e.value).trim()==='';}
  function run(){
    var price=v('np_price'), loan=v('np_loan');
    var lc=price*v('np_lc')/100, bc=price*v('np_bc')/100;
    var stamps=Math.ceil(price/100)*0.70;
    var cl=v('np_cl'), rp=v('np_rp');
    var costs=lc+bc+stamps+cl+rp;
    var net=price-costs-loan;
    function row(label,amount,id){
      if(id && blank(id)) return '<div class="line empty"><span>'+label+'</span><span>not filled in</span></div>';
      return '<div class="line"><span>'+label+'</span><span>-'+m(amount)+'</span></div>';
    }
    var o=document.getElementById('np_out');
    o.innerHTML='<div class="line"><span>Sale price</span><span>'+m(price)+'</span></div>'
      +row('Listing side commission',lc,'np_lc')
      +row('Buyer agent compensation',bc,'np_bc')
      +'<div class="line"><span>Documentary stamps, $0.70 per $100</span><span>-'+m(stamps)+'</span></div>'
      +row('Title and other closing costs',cl,'np_cl')
      +row('Repairs and credits',rp,'np_rp')
      +row('Mortgage payoff',loan,'np_loan')
      +'<div class="line" style="border-top:1px solid #e6ded2;margin-top:6px;padding-top:8px"><span><strong>You walk away with</strong></span><span></span></div>'
      +'<div class="tot">'+m(net)+'</div>'
      +((blank('np_lc')||blank('np_bc')||blank('np_cl')||blank('np_loan'))
        ? '<div class="warn">Anything marked <em>not filled in</em> is being counted as zero, so this total is higher than what you would really clear. Fill those boxes in to get a real number.</div>'
        : '');
  }
  ids.forEach(function(id){var e=document.getElementById(id); if(e){e.addEventListener('input',run);}});
  run();
})();
`;


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');   // tolerate a trailing slash

    /* ---- The personal home page, one per address --------------------------
       /h/<address-slug>. Handled before anything else so the alias repair and
       run-on repair below can never touch it. Not indexed. No MLS data. */
    if (path.toLowerCase().indexOf('/h/') === 0) {
      try {
        return await hpRoute(env, request, path.slice(3));
      } catch (err) {
        return new Response('That page is temporarily unavailable. Call 941-662-9941.',
          { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    }

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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

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

    <p class="note" style="margin-top:1rem;">Across <strong>25</strong> owner-to-owner resales over the past two years, the Palmero median ran <strong>$575,000</strong> ($252 a square foot). By type: single-family <strong>$607,500</strong> ($256 a square foot, 18 sales) and townhomes <strong>$325,000</strong> ($224 a square foot, 7 sales).</p>
    <p class="note">Builder or owner resale? Palmero's builder closed 44 single-family homes at a median $213 a square foot, while owners resold 18 at a median $256 a square foot, about 20% more. On a 2,632 square foot home, that's roughly $113,000.</p>
    <p class="note">Two sales worth a second look: 5601 and 5604 Blue Reef Place sold one day apart in April 2026, both 2,410 square feet, on the same street. The one with a pool sold for $31,000 more, on the smaller lot.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Palmero's typical single-family resale price of <strong>$607,500</strong>, yearly property tax would be about <strong>$6,204</strong> without a homestead exemption, or about <strong>$5,775</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Palmero is taxed as unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2024 through August 18, 2026 (24 months, because Palmero is small). Figures are for general market awareness and are not appraisals.
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 24, 2026</td><td>6013 Silver Grass Ct</td><td>Single-family</td><td>2,085 sqft</td><td><strong>$675,000</strong></td></tr>
        <tr><td>Jul 20, 2026</td><td>6270 Crested Eagle Ln</td><td>Single-family</td><td>2,890 sqft</td><td><strong>$1,079,000</strong></td></tr>
        <tr><td>Jul 16, 2026</td><td>6304 Winding Pine Dr</td><td>Single-family</td><td>2,663 sqft</td><td><strong>$710,000</strong></td></tr>
        <tr><td>Jun 30, 2026</td><td>6166 Winding Pine Dr</td><td>Single-family</td><td>1,704 sqft</td><td><strong>$629,000</strong></td></tr>
        <tr><td>Jun 24, 2026</td><td>14704 Golden Grass Ter</td><td>Single-family</td><td>2,074 sqft</td><td><strong>$703,000</strong></td></tr>
        <tr><td>Jun 15, 2026</td><td>6266 Crested Eagle Ln</td><td>Single-family</td><td>1,909 sqft</td><td><strong>$745,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>31</strong> owner-to-owner resales in the past year, the Talon Preserve median ran <strong>$598,000</strong> ($343 a square foot). By type: single-family <strong>$657,000</strong> ($348 a square foot, 26 sales) and villas <strong>$430,000</strong> ($271 a square foot, 5 sales).</p>
    <p class="note">Builder or owner resale? Talon Preserve's builder closed 69 single-family homes at a median $344 a square foot, and owners resold 26 at $348 a square foot, about the same rate per foot.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Talon Preserve's typical single-family resale price of <strong>$657,000</strong>, yearly property tax would be about <strong>$6,709</strong> without a homestead exemption, or about <strong>$6,280</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Talon Preserve is taxed as unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 17, 2026</td><td>20080 Ragazza Cir #202</td><td>Coach home</td><td>2,187 sqft</td><td><strong>$350,000</strong></td></tr>
        <tr><td>Jul 14, 2026</td><td>12550 Ghiberti Cir #101</td><td>Coach home</td><td>1,706 sqft</td><td><strong>$360,000</strong></td></tr>
        <tr><td>Jul 13, 2026</td><td>12300 Canavese Ln</td><td>Single-family</td><td>2,035 sqft</td><td><strong>$509,000</strong></td></tr>
        <tr><td>Jul 10, 2026</td><td>12675 Richezza Dr</td><td>Single-family</td><td>2,025 sqft</td><td><strong>$450,000</strong></td></tr>
        <tr><td>Jul 10, 2026</td><td>12450 Ghiberti Cir #202</td><td>Coach home</td><td>2,187 sqft</td><td><strong>$405,000</strong></td></tr>
        <tr><td>Jul 1, 2026</td><td>20149 Lagente Cir</td><td>Townhome</td><td>1,889 sqft</td><td><strong>$275,400</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>119</strong> owner-to-owner resales in the past year, the Gran Paradiso median ran <strong>$393,000</strong> ($214 a square foot). By type: single-family <strong>$599,000</strong> ($260 a square foot, 58 sales), villas <strong>$320,000</strong> ($206 a square foot, 30 sales), coach homes <strong>$350,000</strong> ($188 a square foot, 17 sales) and townhomes <strong>$280,000</strong> ($144 a square foot, 14 sales).</p>
    <p class="note">Every recorded sale in Gran Paradiso over this period was an owner resale. None were builder closings.</p>
    <p class="note">Gran Paradiso is one of the few communities here with four distinct home types, and they sell far apart: the single-family median ran $279,000 above the villa median.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Gran Paradiso's typical single-family resale price of <strong>$599,000</strong>, yearly property tax would be about <strong>$7,736</strong> without a homestead exemption, or about <strong>$7,151</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. Gran Paradiso sits inside the City of North Port for tax purposes, which carries a higher rate than unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
    <p class="note">These are recorded closing prices from Sarasota County public records: what buyers paid,
    not what sellers asked. <strong>This section contains no MLS data.</strong> Builder closings are excluded,
    because a builder's price isn't a comparable sale for a home that's already been lived in.</p>

    <table>
      <thead><tr><th>Sold</th><th>Address</th><th>Type</th><th>Size</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Jul 23, 2026</td><td>13850 Lido St</td><td>Single-family</td><td>1,437 sqft</td><td><strong>$370,000</strong></td></tr>
        <tr><td>Jul 20, 2026</td><td>19720 Ortona St</td><td>Single-family</td><td>1,688 sqft</td><td><strong>$490,000</strong></td></tr>
        <tr><td>Jul 14, 2026</td><td>13920 Campoleone St</td><td>Single-family</td><td>1,436 sqft</td><td><strong>$499,000</strong></td></tr>
        <tr><td>Jun 30, 2026</td><td>19361 Jalisca St</td><td>Single-family</td><td>1,702 sqft</td><td><strong>$502,500</strong></td></tr>
        <tr><td>Jun 26, 2026</td><td>19138 Kirella St</td><td>Single-family</td><td>2,418 sqft</td><td><strong>$570,000</strong></td></tr>
        <tr><td>Jun 22, 2026</td><td>18819 Lanuvio St</td><td>Villa</td><td>1,443 sqft</td><td><strong>$363,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>107</strong> owner-to-owner resales in the past year, the IslandWalk median ran <strong>$450,000</strong> ($271 a square foot). By type: single-family <strong>$520,000</strong> ($282 a square foot, 78 sales) and villas <strong>$400,000</strong> ($256 a square foot, 29 sales).</p>
    <p class="note">Every recorded sale in IslandWalk over this period was an owner resale. None were builder closings.</p>
    <p class="note">One thing the recorded sales show clearly: among single-family homes, those with a pool sold at a median $327 a square foot against $271 without, about 20% more, from 24 pool sales and 54 without.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At IslandWalk's typical single-family resale price of <strong>$520,000</strong>, yearly property tax would be about <strong>$6,715</strong> without a homestead exemption, or about <strong>$6,130</strong> for a buyer who makes it their primary home, before any CDD and other non-ad valorem charges. IslandWalk sits inside the City of North Port for tax purposes, which carries a higher rate than unincorporated Sarasota County. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

    <p class="muted">Sarasota County public records, qualified owner-to-owner sales recorded August 18, 2025 through August 18, 2026. Figures are for general market awareness and are not appraisals.
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
        <tr><td>Aug 10, 2026</td><td>21297 Holmes Cir</td><td>Single-family</td><td>2,700 sqft</td><td><strong>$740,000</strong></td></tr>
        <tr><td>Jul 24, 2026</td><td>11446 Fort Lauderdale</td><td>Single-family</td><td>1,875 sqft</td><td><strong>$475,000</strong></td></tr>
        <tr><td>Jul 23, 2026</td><td>12701 Palatka Dr</td><td>Villa</td><td>1,632 sqft</td><td><strong>$413,000</strong></td></tr>
        <tr><td>Jul 10, 2026</td><td>12240 Stuart Dr</td><td>Single-family</td><td>1,954 sqft</td><td><strong>$490,000</strong></td></tr>
        <tr><td>Jul 1, 2026</td><td>11561 Trailwood Dr</td><td>Single-family</td><td>2,427 sqft</td><td><strong>$835,000</strong></td></tr>
        <tr><td>Jun 29, 2026</td><td>12386 Sagewood Dr</td><td>Single-family</td><td>2,237 sqft</td><td><strong>$660,000</strong></td></tr>
      </tbody>
    </table>

    <p class="note" style="margin-top:1rem;">Across <strong>105</strong> owner-to-owner resales in the past year, the Grand Palm median ran <strong>$447,500</strong> ($256 a square foot). By type: single-family <strong>$539,500</strong> ($267 a square foot, 64 sales) and villas <strong>$419,000</strong> ($249 a square foot, 41 sales).</p>
    <p class="note">Builder or owner resale? In the past year Grand Palm's builder closed 11 single-family homes at a median $301 a square foot, while owners resold 64 at a median $267 a square foot, about 11% less. On a 2,874 square foot home, that's roughly $96,000.</p>
    <p class="note">What a buyer would pay in property tax. A purchase resets the taxable value to about 89% of the price, so the seller's current bill doesn't carry over. At Grand Palm's typical single-family resale price of <strong>$539,500</strong>, yearly property tax would be about <strong>$5,509</strong> without a homestead exemption, or about <strong>$5,080</strong> for a buyer who makes it their primary home, before the CDD and other non-ad valorem charges. Grand Palm is taxed as unincorporated Sarasota County. It isn't part of the West Villages Improvement District that covers most of Wellen Park; it has its own, the Blackburn Creek CDD. On one Grand Palm home's 2025 tax bill that came to $985.72, and with county fire rescue, solid waste and stormwater, the charges on top of the property tax totaled $1,697.46 for the year. Amounts vary by lot and phase. <a href="https://floridahomevalueai.com/property-tax-calculator">Work out any price in the tax calculator &rarr;</a></p>

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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}
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
       min-height:100vh;font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;}
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
  .note{font-size:19px;color:var(--ink);margin:0 auto 1.75rem;max-width:700px;
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
  @media(max-width:560px){ table{font-size:16px;} th{font-size:14.5px;} th,td{padding:.5rem .4rem;} }
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
        overflow:hidden;font-size:19px;}
  th{text-align:left;padding:.55rem .7rem;font-weight:700;color:var(--ink);font-size:17px;}
  td{padding:.55rem .7rem;border-top:1px solid var(--border);}

  .attrib{font-size:17px;color:var(--ink-faint);line-height:1.7;
        margin:1.5rem auto 0;max-width:680px;text-align:center;}
  .cta{background:var(--ink);color:#fff;border-radius:14px;padding:2rem 1.75rem;margin:2.5rem auto;max-width:900px;text-align:center;}
  .cta h2{color:#fff;}
  .cta p{color:#fff;font-size:18px;margin:0 auto 1.25rem;max-width:560px;}
  .btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
       padding:.8rem 1.6rem;border-radius:8px;font-weight:700;}
  footer{border-top:1px solid var(--border);margin-top:3rem;padding:2rem 0 3rem;
         font-size:17px;color:var(--ink-mid);line-height:1.7;text-align:center;}
  footer a{color:var(--ink-mid);}
  .muted{font-size:17px;color:var(--ink-faint);margin-top:.7rem;line-height:1.7;max-width:680px;margin-left:auto;margin-right:auto;}

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
