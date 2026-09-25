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

let HP_DATA = null;   /* first community, kept only as hpRange's fallback */
let HP_REG  = null;   /* every community this worker serves */

/* Each community is one file in the repo root. Adding a community is one line
   here plus the file. A file that is missing or broken is skipped rather than
   taking the other communities down with it. */
const HP_FILES = ['/hp-granparadiso.json', '/hp-islandwalk.json',
                  '/hp-grandpalm.json', '/hp-sarasotanational.json',
                  '/hp-talonpreserve.json', '/hp-sunrisepreserve.json'];

/* Load every community once per isolate, and index every address across all of
   them. Slugs carry the city, and no two communities have shared one yet, but
   the first file to claim a slug keeps it so a collision can never make an
   address ambiguous. */
async function hpData(env, origin) {
  if (HP_REG) return HP_REG;
  /* Built from the request's own origin rather than a made up hostname, because
     env.ASSETS matches on the whole URL and a foreign host can miss. */
  const base = origin || 'https://floridahomevalueai.com';
  const comms = [];
  for (let i = 0; i < HP_FILES.length; i++) {
    try {
      const res = await env.ASSETS.fetch(new Request(base + HP_FILES[i]));
      if (!res.ok) continue;
      comms.push(hpLoadOne(await res.json()));
    } catch (err) { /* one bad file must not cost the others */ }
  }
  if (!comms.length) throw new Error('hp data missing');

  const allSlugs = {}, allParcels = [];
  comms.forEach(function (D) {
    D.parcels.forEach(function (p) {
      allParcels.push(p);
      if (!allSlugs[p.slug]) allSlugs[p.slug] = p;
    });
  });
  HP_DATA = comms[0];
  HP_COVERED = hpNamesOf(comms.map(function (D) { return D.c.name; }));
  HP_REG = {
    comms: comms,
    parcels: allParcels,
    bySlug: allSlugs,
    homes: allParcels.length,
    names: comms.map(function (D) { return D.c.name; })
  };
  return HP_REG;
}

function hpLoadOne(raw) {
  /* ---- never trust the data file to be in step with this code -------------
     The worker and hp-granparadiso.json are deployed as two separate files, and
     on 24 September the worker went up with the data file left behind. The new
     code asked for c.ratio_now, the old file did not have it, and every address
     page returned "temporarily unavailable" until the file caught up.
     A page must never go down because a number is missing. Anything the code
     relies on gets a sane default here, once, and the features that need real
     values check for them rather than assuming. */
  const c = raw.community || {};
  if (!c.types)        c.types = ['Single-family', 'Villa', 'Townhome', 'Condo'];
  if (!c.districts)    c.districts = { '0100': { name: 'Sarasota County (unincorporated)', nonschool: 5.3787, school: 6.095 } };
  if (!c.std_exemption) c.std_exemption = 51411;
  if (!c.new_2027)     c.new_2027 = 150000;
  if (!c.new_2028)     c.new_2028 = 175000;   /* the amendment's 2028 figure */
  if (!c.trend)        c.trend = {};
  if (!c.name)         c.name = 'this community';
  if (!c.city)         c.city = '';
  if (!c.region)       c.region = '';
  if (!c.builder)      c.builder = 'the builder';
  if (!c.site)         c.site = '';
  if (!c.n_types)      c.n_types = 0;
  if (!c.bt || !c.bt.n) c.bt = null;
  if (!c.roll)         c.roll = 'the county certified roll';
  /* ratio_now drives the market context and the time adjustment. Without it the
     page simply leaves those parts out rather than failing. */
  if (typeof c.ratio_now !== 'number') c.ratio_now = null;
  if (typeof c.ratio_peak !== 'number') c.ratio_peak = null;
  if (!c.ratio_index)  c.ratio_index = null;
  if (!c.just_ratio)   c.just_ratio = c.ratio_now;
  if (!c.just_ratio_n) c.just_ratio_n = 0;

  /* Expand the compact arrays once, into objects the rest of the file can read
     without remembering column positions. */
  const F = raw.pfields;
  const parcels = raw.parcels.map(function (a) {
    const o = {};
    for (let i = 0; i < F.length; i++) o[F[i]] = a[i];
    o.typeName = c.types[o.type] || c.types[0];
    return o;
  });
  if (!c.parcels) c.parcels = parcels.length;

  const bySlug = {};
  parcels.forEach(function (p, i) {
    p.i = i;
    bySlug[p.slug] = p;
    /* Built once per parcel rather than on every keystroke of every search. */
    p.hay     = hpClean(p.num + ' ' + p.street + ' ' + p.unit, true).join(' ');
    p.haywide = hpClean(p.num + ' ' + p.street + ' ' + p.unit + ' ' + (p.city || ''), true).join(' ');
  });

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
        resales.push({ i: p.i, date: s.date, price: s.price, sqft: p.sqft,
                       type: p.type, pool: p.pool, just: p.just });
      }
    });
  });
  resales.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  /* Newest first, so resales[0] is the freshest sale in the file. That date is
     what every window on this page is measured back from, and what the page
     prints as its vintage. */
  c.asof = resales.length ? resales[0].date : null;
  c.asofLabel = c.asof ? hpMonthYear(c.asof) : '';

  const D = { c: c, parcels: parcels, bySlug: bySlug, sales: salesByParcel,
              resales: resales, rpr: raw.rpr || {} };
  /* Every parcel knows its own community, so once an address is resolved the
     rest of the page works on that community's comps, ratios and millage
     without any of it being threaded through by hand. */
  parcels.forEach(function (p) { p.cd = D; });
  return D;
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
/* ONE address format, everywhere, and it is the one RPR can read.
   The county never writes a unit into an address at all. It keeps StreetNumber,
   LOCDescription and LocUnit as separate fields, so any assembled address is
   somebody's choice of format. Where the county does write it in prose, in the
   legal description, it writes UNIT. Stellar MLS writes "Unit #101". RPR cannot
   parse "#101" but parses "Unit 101" and returns a five star answer.
   So: the county's word, the county's street abbreviation, and the format RPR
   understands. Display and query are now the same string, which means they can
   never drift apart. Slugs are stored in the data files and are unaffected, so
   no link anyone has ever been sent breaks. */
function hpStreetLine(p) {
  let a = p.num + ' ' + hpTitle(p.street);
  if (p.unit) a += ', Unit ' + p.unit;
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
/* ===========================================================================
   THE TWO THINGS THAT GO WRONG ON THEIR OWN
   ===========================================================================
   These pages are permanent and the copy is in the present tense. Two separate
   ways that breaks, both found in an audit on 25 September 2026:

   THE BALLOT. Every page discussed the homestead amendment as something that
   "would" happen "if it passes", and no sentence anywhere named the year. On
   4 November 2026 that is wrong on all 8,706 pages whichever way the vote went,
   and one paragraph on 2,900 pages stated a residency deadline as settled law
   with no contingency at all. Michael's decision: after the vote, pivot to the
   homestead registration deadline rather than guess at the result.
   HP_BALLOT.result stays null until he tells a session the outcome. Once the
   day has passed and result is still null the page says nothing about figures
   it has not been told, which is the honest state rather than a stale forecast.

   THE CLOCK. The comparable-sale windows were measured against Date.now() while
   the data file is frozen. Simulated across all 8,706 parcels: around
   1 September 2027 every one of the 7,555 "strong case" pages flips to "treat
   this one as a wide guess" and the published band widens from 12% to 20% with
   no market change behind it, and by 3 September 2029 every page loses its value
   entirely. Meanwhile the page tells people "the same link still works in two
   years". So the windows are now measured from the newest sale in the data, and
   the page prints that date. Michael's call: visible ageing beats silent
   ageing. =========================================================== */
const HP_BALLOT = {
  day:    '2026-11-03',
  label:  '3 November 2026',
  /* null until the result is known. Set to 'passed' or 'failed' and the
     forecast copy can come back, written for that outcome. */
  result: null
};
function hpBallotOpen() {
  if (HP_BALLOT.result) return false;
  return new Date().toISOString().slice(0, 10) <= HP_BALLOT.day;
}

/* Counted back from the data, not from today. asOf is the newest sale in the
   community file. */
function hpDaysAgo(n, asOf) {
  const base = asOf ? Date.parse(asOf + 'T12:00:00Z') : Date.now();
  const d = new Date((isNaN(base) ? Date.now() : base) - n * 86400000);
  return d.toISOString().slice(0, 10);
}
/* "September 2026", for saying out loud how old the figures are. */
function hpMonthYear(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  return HP_MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
}

/* ---------------------------------------------------------------- the comps
   The rule, written down so it can be argued with.

   Same community, same property type, size within a band, sold recently,
   builder closings excluded, the subject's own sales excluded. The band and
   the window widen together until there are at least three sales, and the page
   says which step it had to reach. Three is the floor because two sales is an
   anecdote.                                                                */
const HP_TIERS = [
  { pct: 0.05, days: 365,  pool: 1, label: 'within 5% of your size, sold in the most recent 12 months on record' },
  { pct: 0.10, days: 365,  pool: 1, label: 'within 10% of your size, sold in the most recent 12 months on record' },
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
    const cut = hpDaysAgo(tier.days, D.c.asof);
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

/* ---- turning comparable sales into a number -------------------------------

   WHAT THIS DOES, AND WHY IT IS NOT PRICE PER SQUARE FOOT.

   The first version took the median price per square foot of the comparable
   sales and multiplied by the subject's size. Measured against every qualified
   Gran Paradiso resale, it was good where the comps were nearly the same size
   as the subject, and badly wrong where they were not. 12691 Cinqueterre came
   out at $775,000 and sold for $470,000, because price per square foot is not
   flat across sizes: homes of 1,500 to 1,800 feet ran $207 a foot in the last
   year while homes over 3,000 feet ran $193, and the bands in between run
   higher than both. Apply a small home's rate to a big home and you get a
   number nobody would pay.

   What replaced it: each comparable's sale price divided by that home's OWN
   county market value, then the median of those ratios applied to the subject's
   county market value. The county figure already carries size, type, age,
   condition grade and location, so the comps only have to share a market ratio
   rather than a size. In Gran Paradiso that ratio runs about 1.29, which is
   itself a measured fact rather than an assumption.

   Measured against the same 113 sales, leave-one-out:
     price per square foot   6.2% median error, 80% within 15%, worst 65%
     this method             4.9% median error, 89% within 15%, worst 23%
   and on the twenty homes where the comp ladder had to widen, 21.7% to 8.0%.

   THE RANGE IS SET FROM MEASURED ERROR, NOT FROM THE COMPS.
   The old range was the middle half of the comps by price per foot. It came out
   about 7% wide and it contained the actual sale price 36% of the time, which
   made it worse than useless: it looked precise and it was not. The width now
   comes from how wrong this method actually is, so it is honest about its own
   accuracy rather than about the spread of the comps.                        */

const HP_RATIO_FALLBACK = 1.29;   /* community median sale to county value */

/* ---- putting old sales into today's money --------------------------------
   The county's value is a single snapshot taken on 1 January 2026, but the
   comparable sales can be three years old. Divide a 2022 price by a 2026 county
   value and the ratio comes out high, not because that house was special but
   because the whole market was higher then. Left alone this quietly inflates
   every estimate that has to reach back for comps: 12073 Amica came out at
   $464,000 off two 2024 sales at ratios of 1.72 and 1.67, when today's market
   ratio is 1.28.

   So each comparable is put into today's money first, using an index measured
   from the community's own sales: the median sale-to-county-value ratio in the
   half year it sold, against the ratio now. In Gran Paradiso that index peaked
   at 1.81 in the second half of 2022 and sits at 1.28 today, which is the same
   29% fall from peak the recorded prices show. Nothing here is assumed; it is
   all counted from deeds. */
function hpHalf(date) {
  return String(date).slice(0, 4) + (String(date).slice(5, 7) <= '06' ? 'H1' : 'H2');
}
function hpToToday(c, ratio, date) {
  const idx = c.ratio_index;
  if (!idx || !c.ratio_now) return ratio;
  const at = idx[hpHalf(date)];
  if (!at) return ratio;
  return ratio * (c.ratio_now / at);
}

function hpRange(subj, comps, c) {
  c = c || (HP_DATA && HP_DATA.c) || {};
  if (!comps.list.length) return null;

  /* The ratio of what each comparable sold for to what the county says that
     same house is worth. */
  const ratios = [];
  const psf = [];
  comps.list.forEach(function (r) {
    if (r.just > 0) ratios.push(hpToToday(c, r.price / r.just, r.date));
    if (r.sqft > 0) psf.push(r.price / r.sqft);
  });

  let mid;
  if (ratios.length >= 3 && subj.just > 0) {
    mid = hpPct(ratios, 0.50) * subj.just;
  } else if (subj.just > 0) {
    mid = HP_RATIO_FALLBACK * subj.just;          /* thin comps, community ratio */
  } else {
    mid = hpPct(psf, 0.50) * subj.sqft;           /* no county value at all */
  }

  /* How much to trust it. A tight match on three or more nearly identical
     homes is a different thing from a ladder that had to widen twice, and the
     page says so rather than using one confident voice for both. */
  let tight = comps.step <= 1 && comps.list.length >= 3;
  let band  = tight ? 0.12 : 0.20;

  /* A RANGE THAT SITS ENTIRELY ABOVE EVERY COMP ON THE PAGE IS NOT CREDIBLE,
     AND 104 PAGES DID EXACTLY THAT. One Grand Palm home showed a low of
     $331,000 with four comps printed underneath at $280,000, $287,000,
     $289,000 and $310,000, and called it the strong case. The ratio method does
     that when the subject's own county value is well above the county values of
     the homes that sold, so it is extrapolating rather than comparing.
     The mid is NOT pulled down to meet the comps, because that would be
     inventing a different number. Instead the page stops claiming a tight case
     and says out loud that nothing comparable has sold at this level, which is
     itself real information for the owner. */
  const hiComp = comps.list.reduce(function (m, r) { return r.price > m ? r.price : m; }, 0);
  let aboveComps = false;
  if (hiComp > 0 && mid * (1 - band) > hiComp) {
    aboveComps = true;
    tight = false;
    band = 0.20;
  }

  const r1000 = function (n) { return Math.round(n / 1000) * 1000; };
  return {
    lo: r1000(mid * (1 - band)),
    mid: r1000(mid),
    hi: r1000(mid * (1 + band)),
    psf: psf.length ? Math.round(hpPct(psf, 0.50)) : null,
    n: comps.list.length,
    band: band,
    tight: tight,
    aboveComps: aboveComps,
    hiComp: hiComp,
    trimmed: 0
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

  /* THE SAVE OUR HOMES GAP IS NOT ALWAYS THE OWNER'S, AND THE OLD COPY ASSUMED
     IT WAS. On a certified roll, the assessed value of a home that changed hands
     recently can still be the SELLER'S capped figure. A capped amount does not
     transfer to a buyer. 196 of these pages had a purchase inside the last two
     roll years together with a gap over $5,000, and the page credited that gap
     to the new owner, told them it widens every year they stay, and offered to
     port all of it. One of them bought in April 2026 and was shown $145,961.
     None of that was theirs. So the gap is only ever claimed for an owner whose
     purchase is old enough for the figure to be their own. A page with no
     recorded finished-house purchase at all is a custom build whose owner put it
     up, so the cap there is theirs. */
  const rollYear = (function () {
    const m = String(c.roll || '').match(/\b(20\d\d)\b/);
    return m ? parseInt(m[1], 10) : 2026;
  })();
  const boughtYr = lastSale ? (parseInt(String(lastSale.date).slice(0, 4), 10) || 0) : 0;
  const capMine  = !lastSale || (boughtYr > 0 && boughtYr <= rollYear - 2);
  /* three of the six communities carry the placeholder "the builder" rather than
     a verified name, and "the original closing from the builder" is filler. */
  const namedBuilder = !!(c.builder && /^[A-Z]/.test(String(c.builder)));

  let h = '';

  /* ---- head ---- */
  h += '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>' + hpEsc(addr) + ' | Florida Home Value AI</title>'
    + '<meta name="robots" content="noindex, nofollow">'
    + '<meta name="description" content="' + hpEsc(addr) + '. What homes like it actually sold for, from Sarasota County public records.">'
    + '<meta property="og:type" content="website">'
    + '<meta property="og:title" content="' + hpEsc(addr) + '">'
    + '<meta property="og:description" content="What homes like this one actually sold for, and what the homestead rules do to this tax bill. Sarasota County public records. Michael Putnam, Putnam Realty Group, 941-662-9941.">'
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
    + '<style>' + HP_CSS + '</style>'

    /* ---- RPR, and why it is set up exactly like this -----------------------
       The widget is browser only. It uses document.write and it wants the
       visitor's own IP address, so there is no server side call that returns a
       number and nothing for the worker to fetch. What the worker CAN do is
       write the address into the widget's options before the script loads,
       which is all the widget needs. No reload, no ?address= parameter, no
       box to fill in. The visitor lands on their page and RPR fills itself.

       THE SCRIPT MUST LOAD NORMALLY, HERE IN THE HEAD. It calls document.write,
       so injecting it later blows the page away. This is the same pattern as
       the community pages, which is the pattern already proven on this domain
       with this token.

       Token and co-brand are the ones already in use. The domain matters:
       RPR authorises floridahomevalueai.com separately from the wildcard, so
       these root domain pages are covered and a community subdomain is not.
       Nothing is sent to RPR beyond the address, which is on the page anyway. */
    + '<script>window.rprAvmWidgetOptions={'
    +   'Token:"B7078914-3207-44B1-A650-21ECA3E39AB7",'
    +   'Query:' + JSON.stringify(addr) + ','
    +   'CoBrandCode:"btsputnamrealtygroup",'
    +   'ContainerSelector:"#rprWidgetContainer",'
    +   'ShowRprLinks:false};<\/script>'
    + '<script src="https://www.narrpr.com/widgets/avm-widget/widget.ashx/script"><\/script>'
    + '</head><body data-slug="' + hpEsc(p.slug) + '">';

  /* ---- masthead ---- */
  h += '<div class="wrap">'
    + '<div class="mast">'
    +   '<div class="brandline"><img src="/putnam-mark.png" alt="" class="mark">'
    +     'Florida Home Value AI &middot; Putnam Realty Group</div>'
    +   '<div class="prepared">Prepared for one address &middot; Sarasota County public records</div>'
    +   '<h1>' + hpEsc(addr) + '</h1>'
    +   '<div class="sub">' + hpEsc(c.name) + (c.region ? ' &middot; ' + hpEsc(c.region) : '') + '</div>'
    +   '<div class="facts">'
    +     hpEsc(p.typeName) + ' &middot; ' + p.sqft.toLocaleString('en-US') + ' sq ft'
    +     (p.bd ? ' &middot; ' + p.bd + ' bed' : '')
    +     (p.fb ? ' &middot; ' + (p.fb + (p.hb ? '.5' : '')) + ' bath' : '')
    +     ' &middot; built ' + p.yr
    +     (p.pool ? ' &middot; pool' : '')
    +     (p.gar ? ' &middot; ' + p.gar.toLocaleString('en-US') + ' sq ft garage' : '')
    +   '</div>'
    + '</div>';

  /* ---- 1. good news and bad news, replacing the single gain figure ---------
     This used to open with one number, the gain since purchase, at 44px. On 26%
     of pages that number is negative, and on 89% of 2022 purchases it is
     negative by a median of $117,000. Opening a person's own home page with
     -$117,000 is the fastest way to make them close the tab, and softening the
     number would have meant lying about it.
     So the page asks the question instead and shows both sides at the same
     weight. The good news panel is always a real checkable figure rather than a
     consolation: an untaxed homestead gap that is genuinely theirs, an
     exemption they are entitled to and have not claimed, a rising price per
     foot, or the November ballot. Nothing is invented and nothing is hidden.
     THE SOH PANEL SHOWS THE GAP, NOT AN ANNUAL SAVING, ON PURPOSE. Section 2
     prints its own annual figure and two different dollar amounts for the same
     thing on one page is a contradiction. The gap matches section 2's heading.
     A GAIN UNDER THE GREATER OF $10,000 OR 3% IS NOT A GAIN. 600 pages sit
     inside that. One Talon home was $1,400 off a $716,400 purchase, and putting
     a big red minus $1,400 on a $715,000 house reads as though the page cannot
     tell signal from noise. Those get their own wording. */
  if (range && lastSale) {
    const gain  = range.mid - lastSale.price;
    const flat  = Math.abs(gain) < Math.max(10000, range.mid * 0.03);
    const up    = gain >= 0;
    const chg   = (typeof trend.chg === 'number') ? trend.chg : null;
    const typeL = hpEsc(p.typeName.toLowerCase());
    const held  = boughtYr > 0 ? rollYear - boughtYr : 0;
    const offPk = (c.ratio_peak && c.ratio_now && c.ratio_peak > c.ratio_now)
                ? Math.round((1 - c.ratio_now / c.ratio_peak) * 100) : null;
    /* "in the 12 months to September 2026" rather than "over the last 12
       months", which is a rolling claim against a frozen number. */
    const win = c.asofLabel ? 'in the 12 months to ' + hpEsc(c.asofLabel)
                            : 'in the most recent 12 months on record';
    const peakWhen = hpEsc(String(c.ratio_peak_when || '')
                       .replace('H1', ' first half').replace('H2', ' second half'));

    const paid  = 'You paid ' + hpMoney(lastSale.price) + ' in ' + hpShortDate(lastSale.date) + '.'
                + (lastSale.builder && namedBuilder
                   ? ' That was the original closing from ' + hpEsc(c.builder) + '.' : '');
    const nC = comps.list.length;
    const today = nC + ' comparable ' + typeL + (nC === 1 ? ' sale points' : ' sales point')
                + ' to about <strong>'
                + hpMoney(range.mid) + '</strong> today, in a range of ' + hpMoney(range.lo)
                + ' to ' + hpMoney(range.hi) + '.';

    /* The good news for any page where the gain itself is not the good news.
       Money first, information second. */
    function hpUpside() {
      if (p.hs && sohGap > 5000 && capMine) {
        return { big: hpMoney(sohGap), txt: false,
          body: 'is the part of this home’s value you are never taxed on. The county’s value is '
              + hpMoney(p.just) + '. The figure your bill is worked out from is '
              + hpMoney(p.assessed) + '. Save Our Homes holds that gap open and widens it every year '
              + 'you stay.',
          small: '<a href="#soh">How that works, and what happens to it the day you sell</a>' };
      }
      /* Florida homestead needs permanent Florida residency, so this headline is
         a promise of nothing to the 676 owners the county records as out of
         state. The data file carried that flag all along and the condition
         never looked at it. */
      if (!p.hs && !p.oos) {
        return { big: 'There is money on the table', txt: true,
          body: 'The county has no homestead exemption recorded on this address. If you live here as your '
              + 'main home and have never filed for one, it caps what you can be taxed on for as long as '
              + 'you stay, and it costs nothing to apply. One call to the Property Appraiser on '
              + '<a href="tel:19418618200">941-861-8200</a> settles it either way. If this is a rental or '
              + 'a second home it does not apply.', small: '' };
      }
      if (chg !== null && chg > 0) {
        return { big: '+' + chg.toFixed(1) + '%', txt: false,
          body: 'Price per square foot for ' + typeL + ' homes in ' + hpEsc(c.name) + ' is up '
              + chg.toFixed(1) + '% ' + win + ', against the 12 before that. The figure beside '
              + 'this one looks back at what you paid. This one looks at where the market is heading.',
          small: '' };
      }
      if (saving > 200 && hpBallotOpen()) {
        return { big: hpMoney(saving) + ' a year', txt: false,
          body: 'is what the homestead amendment on the ' + HP_BALLOT.label + ' ballot would take off this '
              + 'bill by 2028, if it passes. It is a fixed dollar exemption, so what you get back does not '
              + 'depend on what your home is worth or on which way the market went.',
          small: '<a href="#ballot">The year by year figures for this address</a>' };
      }
      return { big: 'Nothing is settled', txt: true,
        body: 'The figure beside this one is a comparison, not a verdict'
            + (offPk ? '. ' + hpEsc(c.name) + ' is running about ' + offPk + '% below where it peaked in '
               + peakWhen + ', so everyone who bought near the top is in the same position' : '')
            + '. None of it is locked in while you still own the house.', small: '' };
    }

    let G, B;

    if (flat) {
      G = hpUpside();
      B = { big: 'About where you started', txt: true,
        body: paid + ' ' + today + ' That is a difference of ' + hpMoney(Math.abs(gain))
            + ' apart, which on a house this size sits inside the margin rather than counting as a '
            + 'real move.'
            + (held >= 3 ? ' Holding for ' + held + ' years and landing back where you started is a small '
               + 'step backwards once you allow for the cost of selling.' : '') };
    } else if (up) {
      G = { big: '+' + hpMoney(gain), txt: false, body: paid + ' ' + today, small: '' };
      if (chg !== null && chg < 0) {
        B = { big: '−' + Math.abs(chg).toFixed(1) + '%', txt: false,
          body: 'It was bigger a year ago. Price per square foot for ' + typeL + ' homes in '
              + hpEsc(c.name) + ' is down ' + Math.abs(chg).toFixed(1) + '% ' + win
              + ', against the 12 before that'
              + (offPk ? ', and the community as a whole is running about ' + offPk
                 + '% below where it was in ' + peakWhen : '')
              + '. A gain that is shrinking is still a gain, but you should know which way it is moving.' };
      } else {
        B = { big: 'None of it is cash', txt: true,
          body: 'A gain on paper is not money in your account. Commission, title, doc stamps and whatever '
              + 'is left on the mortgage all come out of it first, and most people are out by tens of '
              + 'thousands when they guess at that.' };
      }
    } else {
      G = hpUpside();
      B = { big: '−' + hpMoney(Math.abs(gain)), txt: false,
        body: paid + ' ' + today + ' That is a paper figure. It is not a loss unless you sell into it.' };
    }

    h += '<div class="hero ask">'
      + '<h2 class="askq">Do you want the good news first, or the bad news?</h2>'
      + '<p class="small">Good news first. The bad news is sitting right beside it, because a page that '
      + 'showed you only one of them would not be worth opening.</p>'
      + '<div class="gnbn">'
      +   '<div class="gn"><div class="gnlabel">The good news</div>'
      +     '<div class="gnbig' + (G.txt ? ' txt' : '') + '">' + G.big + '</div><p>' + G.body + '</p>'
      +     (G.small ? '<p class="small">' + G.small + '</p>' : '')
      +   '</div>'
      +   '<div class="bn"><div class="gnlabel">The bad news</div>'
      +     '<div class="gnbig' + (B.txt ? ' txt' : '') + '">' + B.big + '</div><p>' + B.body + '</p>'
      +   '</div>'
      + '</div>'
      + '<p class="small">Neither of those is what you would walk away with. '
      + '<a href="#proceeds">That is further down the page, and you can put your own mortgage balance '
      + 'into it</a>.</p>'
      + '</div>';
  } else if (range) {
    h += '<div class="hero up"><div class="herolabel">What this home looks like today</div>'
      + '<div class="herobig">' + hpMoney(range.mid) + '</div>'
      + '<p>In a range of ' + hpMoney(range.lo) + ' to ' + hpMoney(range.hi)
      + ', from ' + comps.list.length + ' comparable recorded sale'
      + (comps.list.length === 1 ? '' : 's') + '.</p>'
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
  if (p.hs && sohGap > 5000 && capMine) {
    /* WHAT SAVE OUR HOMES SAVES TODAY, NOT UNDER SOME FUTURE EXEMPTION.
       The old version hardcoded a $250,000 exemption on the market-value side,
       ignored this parcel's own exemptions entirely, and then subtracted the
       2028 bill. Two different tax regimes subtracted from each other. It was
       wrong on 3,074 of the 3,179 pages that printed it, 665 of them printing
       "$0 a year" three lines under "the gap is never taxed", and one
       overstating by four and a half times.
       The fix runs this parcel through the page's OWN bill function with the
       county's market value in place of the capped value, so the figure cannot
       drift from the tax table further down and cannot go stale if exemption
       rules change in the data file. */
    const atMkt = hpBill(D, Object.assign({}, p, { assessed: p.just }), null);
    const worth = Math.max(0, (atMkt.nonschool + atMkt.school) - (now.nonschool + now.school));
    h += '<div class="card gold" id="soh">'
      + '<h2>You are taxed on ' + hpMoney(sohGap) + ' less than the county\'s own value</h2>'
      + '<p>Two different numbers sit on your county record, and they are not the same thing. '
      + 'The county\'s value for this home is <strong>' + hpMoney(p.just) + '</strong>. '
      + 'The figure your bill is worked out from is <strong>' + hpMoney(p.assessed) + '</strong>, '
      + 'before your exemptions come off that. '
      + 'The ' + hpMoney(sohGap) + ' in between is never taxed at all.</p>'
      + '<p class="small">Both of those are the county\'s figures, not mine, and neither is the same as what the '
      + 'home would sell for. The selling figure is the one further up this page.</p>'
      + '<p>That comes from a Florida rule called Save Our Homes. Once you have a homestead exemption, '
      + 'the county can raise the amount you are taxed on by no more than 3% a year, and by less than that in '
      + 'years when inflation runs lower, however far the home itself goes up. '
      + 'The longer you stay, the wider that gap gets.</p>'
      + '<p><strong>It saves you about ' + hpMoney(worth) + ' a year.</strong></p>'
      + '<p>Here is the part that takes people by surprise. The day you sell, that gap goes to zero. '
      + 'Whoever buys this home starts paying tax on the full value, not on your protected amount.</p>'
      + '<p>If you buy another Florida home and live in it, you can take that gap with you. Florida calls it '
      + 'portability and it covers up to $500,000. How much of your ' + hpMoney(sohGap) + ' actually moves '
      + 'across depends on what you buy. Buy a home the county values at or above this one and the whole gap '
      + 'transfers. Buy something less expensive and you get a proportional share of it instead, which is the '
      + 'part that catches downsizers.</p>'
      + '<p>It does not happen on its own. You have to file for it and there is a deadline. One free call to '
      + 'the Property Appraiser on <a href="tel:19418618200">941-861-8200</a> before you list will tell you '
      + 'exactly what your own number would be.</p>'
      + '</div>';
  } else if (p.hs && sohGap > 5000 && lastSale) {
    /* The 196-page case. Same gap, but the purchase is too recent for the
       figure to be theirs, so every sentence in the card above would be wrong
       for them, including the offer to port the whole gap. The honest version
       is more use to them than the wrong version was: their bill is going up
       and nobody is telling them. WHEN a cap resets is the Property Appraiser's
       to state, so this points at them instead of reciting a rule. */
    h += '<div class="card gold" id="soh">'
      + '<h2>The figure you are taxed on this year is unlikely to hold</h2>'
      + '<p>Two numbers sit on your county record. The county’s value for this home is <strong>'
      + hpMoney(p.just) + '</strong>. The figure your bill is worked out from is <strong>'
      + hpMoney(p.assessed) + '</strong>, which is ' + hpMoney(sohGap) + ' lower.</p>'
      + '<p>On a home that has not changed hands in years, that gap belongs to the owner and it widens '
      + 'every year they stay. This address changed hands in ' + hpShortDate(lastSale.date) + ', so the '
      + 'lower figure on the ' + rollYear + ' roll is very likely still the previous owner’s. '
      + 'A capped amount does not come with the house. It resets.</p>'
      + '<p><strong>What that means for you is that the amount you are taxed on should be expected to go '
      + 'up, and the bill with it.</strong> I am not going to guess by how much or in which year, because '
      + 'the exact timing is the Property Appraiser’s call and not mine.</p>'
      + '<p>One free call to them on <a href="tel:19418618200">941-861-8200</a> with this address gets you '
      + 'the real answer, and it is worth making before you budget around this year’s bill. Ask two '
      + 'things: when the assessed value resets, and whether your own homestead exemption and any '
      + 'portability you brought with you are both on the record.</p>'
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
      + '. Builder closings are excluded, because a builder base price is not a comparable sale for an existing home.</p>'
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
      h += '<div class="rangebar' + (range.tight ? '' : ' wide') + '">'
        + '<div><span>Low</span><strong>' + hpMoney(range.lo) + '</strong></div>'
        + '<div class="mid"><span>Most likely</span><strong>' + hpMoney(range.mid) + '</strong></div>'
        + '<div><span>High</span><strong>' + hpMoney(range.hi) + '</strong></div></div>';

      /* ---- how much to trust it, said out loud ----------------------------
         The same two numbers used to appear in the same confident voice
         whether they came from eleven nearly identical sales or from four
         loosely similar ones three years old. Being wrong is survivable.
         Being wrong in the same calm voice as being right is what makes a
         homeowner stop believing the whole page. So the page now says which
         of the two situations they are in, and backs it with the measured
         hit rate rather than an adjective. */
      if (range.tight) {
        h += '<div class="trust good"><strong>This is the strong case.</strong> '
          + range.n + ' comparable homes, close to yours in size, sold in the window shown above. '
          + (c.bt ? 'I tested this against ' + c.bt.n + ' real ' + hpEsc(c.name) + ' sales: the range caught the '
                     + 'actual selling price ' + c.bt.cov + '% of the time and the middle figure was out by about '
                     + c.bt.err + '%.' : '')
          + '</div>';
      } else if (range.aboveComps) {
        h += '<div class="trust weak"><strong>Read this one carefully.</strong> '
          + 'The figure above is higher than anything comparable has actually sold for here. The highest of '
          + 'the ' + range.n + ' sales in the table below is ' + hpMoney(range.hiComp) + '. The county values '
          + 'your home well above the homes that sold, so the arithmetic is reaching past its own evidence '
          + 'rather than sitting inside it, and I have widened the range instead of pretending otherwise. '
          + 'That usually means the home is genuinely at the top of what is here, which is worth money, but '
          + 'it is not something a page can settle. Twenty minutes in the house does settle it. '
          + '<a href="tel:19416629941">941-662-9941</a>.</div>';
      } else {
        h += '<div class="trust weak"><strong>Treat this one as a wide guess.</strong> '
          + 'I could not find enough recent sales genuinely like your home, so the net had to be cast wider '
          + 'and the range is wider to match. It is honest, but it is not the same thing as the case above, '
          + 'and this is exactly the situation where twenty minutes in the house is worth more than any '
          + 'amount of arithmetic. <a href="tel:19416629941">941-662-9941</a>.</div>';
      }

      h += '<p class="small">How this is worked out: every home in the table is compared with what the county '
        + 'says that same house is worth, and the middle of those ratios is applied to the county value of yours. '
        + 'That is used rather than price per square foot because price per foot is not flat across sizes, '
        + 'and using it made large homes come out badly wrong. Condition, upgrades and view still move a real '
        + 'sale further than any of this.</p>';

      /* The county's market value and the sales will not agree, and someone
         who scrolls will notice. Say why before they have to ask. */
      if (p.just > 0) {
        const mult = range.mid / p.just;
        const gapPct = Math.round(Math.abs(range.mid - p.just) / p.just * 100);
        if (gapPct >= 5) {
          /* This paragraph used to assert the community median of 1.29 even on
             a home whose own multiple was 1.67, which reads as the page
             contradicting itself within two sentences. It now states this
             home's own multiple first and only calls it normal when it is. */
          const haveRatio = typeof c.ratio_now === 'number' && c.ratio_now > 0;
          const normal = haveRatio && Math.abs(mult - c.ratio_now) < 0.15;
          h += '<p class="note"><strong>Why this is not the county\'s number.</strong> '
            + 'The county puts the market value of this home at ' + hpMoney(p.just) + '. '
            + 'The figure above works out to ' + mult.toFixed(2) + ' times that. '
            + (!haveRatio
                ? 'Homes here routinely sell for more than the county figure.'
              : normal
                ? 'That is the ordinary relationship here: across ' + c.just_ratio_n + ' '
                  + hpEsc(c.name) + ' homes sold in the two years to '
                  + hpEsc(c.asofLabel || 'the roll date') + ', the typical one went for '
                  + c.ratio_now.toFixed(2) + ' times what the county said that same home was worth.'
                : 'That is ' + (mult > c.ratio_now ? 'above' : 'below') + ' the ' + c.ratio_now.toFixed(2)
                  + ' that is typical here, which is worth knowing rather than glossing over. It usually means '
                  + 'the comparable homes carry something the county roll does not price the same way, most often '
                  + 'a pool or a lot premium. It is a reason to check the sales in the table above rather than '
                  + 'take the figure on faith.')
            + ' Either way, the county value is not a price. The county values every home in Sarasota County at once, '
            + 'off records, without ever going inside, and it does it as at 1 January 2026. It cannot see your '
            + 'kitchen, your roof or your view. You can check both yourself: your own record is on '
            + '<a href="https://www.sc-pa.com/">sc-pa.com</a>, and every sale in the table above is a deed '
            + 'anyone can look up.</p>';
        }
      }

      /* Where the whole community sits, measured the same way. This is the one
         number on the page that is about the market rather than the house, and
         it is the reason a 2022 buyer is not being singled out. */
      if (c.ratio_peak && c.ratio_now) {
        const off = Math.round((1 - c.ratio_now / c.ratio_peak) * 100);
        const half = c.ratio_peak_when.indexOf('H1') > -1 ? 'early' : 'late';
        const pyr = c.ratio_peak_when.slice(0, 4);
        if (off >= 3) {
          h += '<p class="note"><strong>This is the whole community, not your house.</strong> '
            + 'There is a way to measure it that cannot be argued with. The county puts a value on every home '
            + 'here, and those values do not jump around when the market moves. So compare what homes actually '
            + 'sold for against what the county says they are worth. '
            + 'In ' + half + ' ' + pyr + ', ' + hpEsc(c.name) + ' homes sold for ' + c.ratio_peak.toFixed(2)
            + ' times the county value. As at ' + hpEsc(c.asofLabel || 'the roll date') + ' they sell for '
            + c.ratio_now.toFixed(2) + ' times. '
            + '<strong>That is ' + off + '% down from the top.</strong> '
            + 'It is the same for every home here. If you bought near the peak, so did your neighbors, '
            + 'and none of it is real money unless you sell.</p>';
        }
      }
    }
    if (trend.chg !== null && trend.chg !== undefined) {
      const others = [];
      for (let ti = 0; ti < c.types.length; ti++) {
        if (ti === p.type) continue;
        const t2 = c.trend[String(ti)] || c.trend[ti];
        if (!t2 || t2.chg === null || t2.chg === undefined) continue;
        others.push(c.types[ti].toLowerCase() + 's ' + (t2.chg < 0 ? 'down ' : 'up ') + Math.abs(t2.chg) + '%');
      }
      h += '<p class="note"><strong>Your type of home, not the community average.</strong> '
        + hpEsc(p.typeName) + ' homes here sold for $' + trend.psf12 + ' a square foot in the 12 months to '
        + hpEsc(c.asofLabel || 'the roll date') + '. '
        + 'The year before, $' + trend.psf24 + '. That is '
        + (trend.chg < 0 ? 'down ' : 'up ') + Math.abs(trend.chg) + '%.'
        + (others.length ? ' Meanwhile ' + others.join(', ') + '.' : '')
        + ' The types here move at very different rates, so a single community average would tell most owners '
        + 'something untrue about their own home. That is why this page only counts sales of '
        + hpEsc(p.typeName.toLowerCase()) + ' homes.</p>';
    }
    h += '</div>';
  }

  /* ---- 4. the email offer, mid page ---------------------------------
     WHERE THIS SITS AND WHY. It used to be near the bottom, after the
     calculator and the sale history. By then most people have what they
     came for and have stopped reading. It now sits directly under the
     comparable sales, which is the moment the page has just proved it
     knows something, and before the tax section, which is long.
     It is still not a gate. Everything above it was free and everything
     below it stays free. What it offers is delivery of something they
     have already seen and liked, which is a different and easier ask
     than paying with an address to get in. */
  h += '<form class="card signup" id="alerts" method="POST" action="/h/' + hpEsc(p.slug) + '">'
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
    + '<div class="tag">Sale alerts</div>'
    + '<h2>Be told when a home near you sells, and for how much</h2>'
    + '<p>Bookmark this page. The address in your browser bar is all of it, the same link still works in two '
    + 'years, and I reload the county records regularly so new sales turn up here on their own. '
    + 'You do not have to give me anything for that.</p>'
    + '<p>What an email address gets you is not the link. It is being told. '
    + 'When a home near you sells I will send you which house, when it closed, and what the buyer actually paid, '
    + 'without you having to remember to come back and look.</p>'
    + '<p>And when a home near you does sell, I will tell you: which house, when it closed, and what the buyer '
    + 'actually paid. Asking prices are public and mostly noise. The recorded price is what your own home gets '
    + 'measured against, and most owners never see it until they are already trying to sell.</p>'
    + '<p class="small">Pick how close to home you want it.</p>'
    + '<div class="scopes">'
    +   '<label><input type="radio" name="scope" value="street" checked> <strong>' + hpEsc(hpTitle(p.street)) + ' only.</strong> Your own street, nothing else.</label>'
    +   '<label><input type="radio" name="scope" value="plan"> <strong>Homes like yours anywhere in ' + hpEsc(c.name) + '.</strong> '
    +     hpEsc(p.typeName) + ', within 10% of your ' + p.sqft.toLocaleString('en-US') + ' square feet. '
    +     'These are the sales that actually move your number.</label>'
    +   '<label><input type="radio" name="scope" value="community"> <strong>All ' + c.parcels.toLocaleString('en-US') + ' homes in ' + hpEsc(c.name) + '.</strong> '
    +     'Everything, including types and sizes unlike yours.</label>'
    + '</div>'
    + '<div class="row"><input type="email" name="email" required placeholder="your email"><button type="submit">Email me the link</button></div>'
    + '<p class="small">Expect a message within a few days of a sale being recorded, not the same minute. '
    + 'County records take a little while to appear and I would rather send you a real closed price than a rumor. '
    + 'If you want to know sooner than that, call me and I will just tell you.</p>'
    + '<p class="small">Your address and email stay with me. I never sell them, share them or give them to anyone. '
    + 'Every message has an unsubscribe link, or reply with the word stop and you are off the same day.</p>'
    + '</form>';


  /* ---- 4. RPR, when one has been added ---- */
  if (rpr) {
    h += '<div class="card">'
      + '<div class="tag">A second opinion, not mine</div>'
      + '<h2>What RPR says</h2>'
      + '<p>RPR is run by the National Association of Realtors. It works a different way to the sales above, and it '
      + 'draws on listing photos, descriptions and price histories that county records never contain.</p>'
      + '<div class="rpr"><div class="rprv">' + hpMoney(rpr.value) + '</div>'
      + '<div class="rprr">Range ' + hpK(rpr.lo) + ' to ' + hpK(rpr.hi) + ' &middot; as of ' + hpEsc(rpr.asof) + '</div></div>'
      + '<p class="small">Where the two agree, that is worth something. Where they disagree, the gap is usually condition, upgrades or view, and that is the part no automated number can settle.</p>'
      + '</div>';
  } else {
    h += '<div class="card quiet">'
      + '<h2>A second opinion, worked out a different way</h2>'
      /* Deliberately not "below is an estimate". RPR comes up empty for about 6%
         of these addresses, all of them condominiums with a unit number, and a
         sentence that promises a number is a broken promise on 260 pages. This
         wording is true whether the widget fills or not. */
      + '<p>RPR, which is run by the National Association of Realtors, works out its own estimate for '
      + 'this address. It is theirs and not mine. I have not touched it and I cannot change it, which is '
      + 'the point: two methods agreeing tells you more than one method sounding confident.</p>'
      + '<p>It works differently from everything above. Mine is built only from recorded sale prices on deeds. '
      + 'RPR also draws on listing photos, descriptions and asking price histories, which county records do '
      + 'not contain. So where the two disagree, neither one is lying. They are looking at different things.</p>'
      + '<div id="rprWidgetContainer"></div>'
      /* Hidden until the script has waited and found the container still empty.
         Keyed off what actually happened rather than off my guess about which
         addresses RPR knows, so it stays right if RPR changes either way. */
      + '<p class="small" id="rprNone" style="display:none">Nothing came back from RPR for this address. '
      + 'That is RPR and not this page, and it does not mean anything is wrong with your home. '
      + 'Call me on <a href="tel:19416629941">941-662-9941</a> and I will pull it by hand and tell you '
      + 'what it says.</p>'
      + '<p class="small">RPR is an estimate too, not an appraisal.</p>'
      + '</div>';
  }

  /* ---- 5. the tax bill ---- */
  /* THE YEAR IS NAMED NOW. "the November 3 ballot" read in 2027 points at
     whatever election is next. And once the day has passed this card stops
     forecasting and becomes the homestead deadline card, which is Michael's
     decision and is useful all year round rather than for six weeks. */
  const ballotOpen = hpBallotOpen();
  h += '<div class="card" id="ballot">';
  if (!ballotOpen) {
    /* AFTER THE VOTE, AND THE RESULT IS NOT SET. The page will not print a
       forecast built on an outcome it has not been told. What it gives instead
       is the pair of dates that decide an exemption, which are statutory and
       came off the Property Appraiser's own page rather than out of reasoning:
       own and occupy as a permanent residence on 1 January of the year claimed,
       and file by 1 March of that year.
       When Michael sets HP_BALLOT.result the forecast copy can come back,
       written for what actually happened. */
    h += '<div class="tag">Homestead deadlines</div>'
      + '<h2>The two dates that decide your exemption</h2>';
    if (p.hs) {
      h += '<p>You already have a homestead exemption on this address, so these dates are not yours to '
        + 'worry about while you stay put. They matter the moment you move, because a new home starts over.</p>'
        + '<p>To claim it on a different Florida home you have to own it and be living in it as your '
        + 'permanent residence on <strong>1 January</strong> of the year you are claiming, and file by '
        + '<strong>1 March</strong> of that year. Miss 1 January and you wait a whole year, whatever date '
        + 'you file.</p>'
        + '<p class="small">The homestead amendment went to the ballot on ' + HP_BALLOT.label + '. There is no '
        + 'figure for it on this page, because a forecast built on a result this page has not been told '
        + 'would be a guess dressed up as arithmetic. The Property Appraiser on '
        + '<a href="tel:19418618200">941-861-8200</a> has the current numbers before I do.</p>';
    } else {
      h += '<p>The county has no homestead exemption recorded on this address. If this is your main home, '
        + 'that is money leaving every single year, and it is free to apply for.</p>'
        + '<p>Two dates decide it. You have to own the home and be living in it as your permanent residence '
        + 'on <strong>1 January</strong> of the year you are claiming. And you have to file by '
        + '<strong>1 March</strong> of that year. Late applications are considered, but 1 March is the '
        + 'timely deadline and 1 January is the one you cannot make up later.</p>'
        + '<p>One free call to the Property Appraiser on <a href="tel:19418618200">941-861-8200</a> with '
        + 'this address will tell you whether it qualifies and what it would take off the bill. If this is '
        + 'a rental or a second home it does not apply.</p>';
    }
  } else {
  h += '<div class="tag">' + HP_BALLOT.label + ' ballot</div>'
    + '<h2>What the homestead amendment would do to this bill</h2>';
  if (p.hs) {
    h += '<p class="lead">' + hpMoney(saving) + ' a year less by 2028</p>'
      + '<p>The part of your tax bill that this amendment changes goes from ' + hpMoney(now.nonschool) + ' now to '
      + hpMoney(y27.nonschool) + ' in 2027 and ' + hpMoney(y28.nonschool) + ' in 2028.'
      + (y28.nonschool < 1 ? ' It reaches zero.' : ' It does not reach zero. Even in 2028 you would still be taxed on ' + hpMoney(Math.max(0, p.assessed - c.new_2028 - Math.max(0, p.exempt - c.std_exemption))) + ' of value.') + '</p>'
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
    h += '<p>This home does not have a homestead exemption on the county records. The amendment only helps homes that do, '
      + 'so nothing on this bill changes.</p>'
      + '<p>One thing would change. On a home without homestead, the county can currently raise the amount you are taxed '
      + 'on by up to 10% a year. The amendment cuts that to 5%. It slows down how fast the bill can grow. It does not '
      + 'reduce what is owed now.</p>'
      + '<p>If this became somebody\'s permanent residence and carried a homestead exemption, the bill would be about '
      + hpMoney(hypoNow) + ' a year today and about ' + hpMoney(hypo28) + ' by 2028 if the amendment passes. '
      /* THE OLD SENTENCE DID NOT ADD UP AND READ AS A NON-SEQUITUR. It printed
         two figures and then a saving measured from a THIRD number that was
         never named, the actual no-homestead bill. On one page the two printed
         figures differed by $1,040 while the sentence claimed $1,625. The third
         number is now stated. */
      + 'What it is actually paying now, with no homestead, is ' + hpMoney(now.nonschool + now.school)
      + ' a year, so the homestead plus the amendment together would be about ' + hpMoney(hypoSaving)
      + ' a year less than that.</p>'
      + '<p>Whether this home can qualify is a question for the Property Appraiser on '
      + '<a href="tel:19418618200">941-861-8200</a>. There are two dates that decide it and most people have '
      + 'not heard about either: you have to own the home and be living in it as your permanent residence on '
      + '<strong>1 January</strong> of the year you are claiming, and file by <strong>1 March</strong> of '
      + 'that year. And if the amendment passes as written, anyone who is a permanent Florida resident before '
      + '1 January 2027 gets the larger exemption from the start, while anyone establishing residency after '
      + 'that begins lower and waits until the fifth year. That last part is contingent on the vote, so '
      + 'confirm it with them rather than with me.</p>';
  }
  }
  /* Three columns while the vote is ahead, one after it. A 2027 and a 2028
     column is a forecast, and the page does not publish a forecast of a result
     it has not been told. */
  h += '<table class="bill"><thead><tr><th>Line</th><th class="r">Now</th>'
    + (ballotOpen ? '<th class="r">2027</th><th class="r">2028</th>' : '')
    + '</tr></thead><tbody>'
    + '<tr><td><strong>The part' + (ballotOpen ? ' that changes' : '') + '</strong>'
    + '<br><span class="dim">county, city, hospital and water district</span></td>'
    + '<td class="r">' + hpMoney(now.nonschool) + '</td>'
    + (ballotOpen ? '<td class="r">' + hpMoney(y27.nonschool) + '</td><td class="r"><strong>'
        + hpMoney(y28.nonschool) + '</strong></td>' : '') + '</tr>'
    + '<tr><td><strong>School tax</strong>'
    + (ballotOpen ? '<br><span class="dim">the amendment does not touch this</span>' : '') + '</td>'
    + '<td class="r">' + hpMoney(now.school) + '</td>'
    + (ballotOpen ? '<td class="r">' + hpMoney(y27.school) + '</td><td class="r">'
        + hpMoney(y28.school) + '</td>' : '') + '</tr>'
    + '<tr><td><strong>District, fire, trash and stormwater</strong>'
    + '<br><span class="dim">not counted here</span></td>'
    + '<td class="r dim" colspan="' + (ballotOpen ? '3' : '1') + '">on your TRIM notice</td></tr>'
    + '</tbody></table>'
    + '<p class="small">Your tax district is ' + hpEsc(now.district.name) + '. The rate is ' + now.district.nonschool
    + ' per thousand dollars of value on the part that changes, and ' + now.district.school + ' on the school part. '
    /* THERE IS NO SINGLE "YOU ARE TAXED ON" FIGURE AND THE PAGE USED TO PRINT
       ONE. It printed the assessed value on 5,862 pages, which is the figure
       BEFORE exemptions. The school side and the non-school side have different
       taxable amounts because the extra homestead band does not apply to
       schools. On one parcel the printed number was four times the real taxable
       base. Both bases are now stated, and both are derived the same way the
       table above derives them. */
    + 'Your assessed value is ' + hpMoney(p.assessed) + '. Exemptions come off that before the rate is '
    + 'applied, so the part that changes is taxed on ' + hpMoney(Math.max(0, p.assessed - p.exempt))
    + ' and the school part on '
    + hpMoney(Math.max(0, p.assessed - (p.hs ? 25000 + Math.max(0, p.exempt - c.std_exemption)
                                             : Math.max(0, p.exempt - c.std_exemption))))
    + '. Those two are the figures your TRIM notice calls taxable value. ' + hpEsc(c.roll) + '. '
    + 'A final certified rate can move the total by a few dollars either way. '
    + (ballotOpen ? 'The 2027 and 2028 columns assume the amendment passes as written and that your homestead '
        + 'status does not change. ' : '')
    + 'Not tax advice.</p>'
    /* Grand Palm and Sunrise Preserve have no verified TRIM notice, so cdd_note
       is empty and 2,056 pages printed this bold heading followed by nothing.
       No note means say nothing, which is the same rule the build script uses. */
    + (c.cdd_note ? '<p class="note"><strong>The part that does not change.</strong> '
        + hpEsc(c.cdd_note) + '</p>' : '')
    + '</div>';

  /* ---- 6. net proceeds ---- */
  if (range) {
    h += '<div class="card" id="proceeds">'
      + '<div class="tag">Net proceeds</div>'
      + '<h2>What you would actually walk away with</h2>'
      + '<p>The sale price starts at the middle of the range above. Everything else is empty because '
      + 'I do not know your numbers and I am not going to guess them. Fill in what you know and the total follows.</p>'
      + '<div class="npwrap">'
      +   '<div class="calc">'
      +   '<label>Sale price<input type="number" id="np_price" value="' + range.mid + '" step="1000"></label>'
      +   '<label>Mortgage payoff<input type="number" id="np_loan" placeholder="what you still owe" step="1000"></label>'
      +   '<label>Listing side commission %<input type="number" id="np_lc" placeholder="whatever you agree" step="0.25"></label>'
      +   '<label>Buyer agent compensation %<input type="number" id="np_bc" placeholder="whatever you agree" step="0.25"></label>'
      +   '<label>Title and other closing costs<input type="number" id="np_cl" placeholder="ask your title company" step="100"></label>'
      +   '<label>Repairs and credits<input type="number" id="np_rp" placeholder="if any" step="500"></label>'
      + '</div>'
      +   '<div class="npout" id="np_out"></div>'
      + '</div>'
      + '<p class="small"><strong>The commission boxes start empty on purpose.</strong> '
      + 'There has never been a standard commission rate. It has always been negotiable and it always was, '
      + 'whatever anyone has told you over the years. What changed in August 2024 is that the rules now make that '
      + 'plain and put the buyer agent\'s pay in writing between you and your buyer. '
      + 'Putting a number in those boxes would be inventing a rate that does not exist, so type in what you are '
      + 'actually being quoted and the total follows.</p>'
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
      + 'as a normal open-market sale, usually because it was between family, between companies, or part of a larger '
      + 'deal. It stays in your history because it happened, and it is left out of the comparable list because it '
      + 'would skew the number.</p></div>';
  }

  /* ---- what the county cannot see, and what it is worth --------------------
     The county roll carries size, beds, baths, year and pool. That is the whole
     list. Everything a buyer actually walks in and reacts to is invisible to it.

     The percentages below are the ones already used by the community valuation
     tool, and they are local judgment rather than anything measured from deeds,
     which the page says out loud. A pool is deliberately NOT in this list,
     because the comparable sales above are already matched pool against pool,
     so it is in the figure already. Asking for it again would count it twice.
     An earlier draft also claimed a pool was worth a measured percentage. That
     claim is gone. Every way of measuring it from deeds alone confounds the
     pool with the kind of home that tends to have one, and a figure that
     cannot be defended does not belong on a page that asks to be checked.    */
  if (range) {
    h += '<div class="card" id="extras">'
      + '<div class="tag">What the county cannot see</div>'
      + '<h2>Your home is not a spreadsheet. Add what makes it yours.</h2>'
      + '<p>The county record for this address holds the size, the bedrooms, the bathrooms, the year it was built '
      + 'and whether there is a pool. That is the entire list. It has never been inside. '
      + 'It does not know whether the kitchen was redone last year, whether the lanai is screened or under air, '
      + 'what you look at from the back, or how old the roof is.</p>'
      + '<p>Check the ones that apply and watch the number move.</p>'
      + '<div class="extras">'
      +   '<label><input type="checkbox" class="xf" data-up="0.03"> Outdoor kitchen</label>'
      +   '<label><input type="checkbox" class="xf" data-up="0.03"> Kitchen or bathrooms recently redone to a high standard</label>'
      +   '<label><input type="checkbox" class="xf" data-up="0.03"> Lanai enclosed and under air</label>'
      + '</div>'
      + '<div class="extras">'
      +   '<label>What you look at from the back'
      +     '<select class="xv">'
      +       '<option value="0">Other houses, or a road</option>'
      +       '<option value="0.04">A wide lake</option>'
      +       '<option value="0.03">A lake or a canal</option>'
      +       '<option value="0.03">A pond</option>'
      +       '<option value="0.015">Preserve or woodland</option>'
      +     '</select></label>'
      +   '<label>Condition'
      +     '<select class="xc">'
      +       '<option value="0">Ready to sell as it stands</option>'
      +       '<option value="-0.05">Needs some work, paint and small repairs</option>'
      +       '<option value="-0.15">Needs real work before it would show well</option>'
      +     '</select></label>'
      + '</div>'
      + '<div class="xout" id="x_out" data-base="' + range.mid + '" data-lo="' + range.lo + '" data-hi="' + range.hi + '"></div>'
      + '<p class="small"><strong>Where these percentages come from, honestly.</strong> '
      + 'They are the same ones behind the ' + hpEsc(c.name) + ' valuation tool, and they are local judgment '
      + 'from what buyers here pay attention to. They are not measured from recorded sales, because a deed does '
      + 'not record whether a house has an outdoor kitchen. The total uplift is capped at 12% however much you '
      + 'check, because these things stop adding up after a point.</p>'
      + '<p class="small">A pool is not on the list on purpose. The county does record pools, so the comparable '
      + 'sales above are already matched pool against pool and it is in the figure already. For the record, '
      + 'a pool is already priced into the figure above rather than being added on here.</p>'
      + '<p class="small">Solar you own outright, impact windows, a recent roof and a whole-house generator are '
      + 'all worth money to the right buyer, and I have left them off because I cannot put an honest number on '
      + 'them from sales data. Tell me about them and I will factor them in properly.</p>'
      + '<p class="cta"><a class="btn" href="tel:19416629941">Call 941-662-9941</a> '
      + '<a class="btn ghost" href="sms:19416629941">Text me instead</a></p>'
      + '<p class="small">Twenty minutes and someone standing in the house beats any amount of arithmetic. '
      + 'No charge and no obligation either way.</p>'
      + '</div>';
  }

  /* ---- THE SHARED PAGE WAS A DEAD END ----------------------------------
     Somebody's neighbor reads a page about a house that is not theirs and had
     no way to get their own, because nothing on an address page pointed back at
     the lookup. Owner sharing is the cheapest reach there is and the page threw
     it away. The communities are named on purpose: a stranger can tell in one
     glance whether this applies to them instead of clicking to find out. */
  h += '<div class="card quiet">'
    + '<h2>Not your house?</h2>'
    + '<p>This page was built for ' + hpEsc(hpAddress(p, c)) + ' and nothing else. '
    + 'If you live somewhere else, there is a page like this one waiting for your own address.</p>'
    + '<p>Covered right now: ' + hpEsc(HP_COVERED) + '. '
    + '<a href="/my-home">Type your address here</a> and it builds itself. '
    + 'If your community is not on that list, text the address to '
    + '<a href="sms:19416629941">941-662-9941</a> and I will build it by hand.</p>'
    + '</div>';

  /* ---- 10. the rest of the community ---- */
  h += '<div class="card quiet">'
    + '<h2>The rest of ' + hpEsc(c.name) + '</h2>'
    + '<p>' + c.parcels.toLocaleString('en-US') + ' homes. ' + c.homesteads.toLocaleString('en-US') + ' of them are somebody\'s main residence, '
    + 'and ' + c.out_of_state.toLocaleString('en-US') + ' are owned by somebody who lives in another state. '
    + 'In the 12 months to ' + hpEsc(c.asofLabel || 'the roll date') + ', ' + c.resales12
    + ' were sold by one owner to another. Half went for more than '
    + hpMoney(c.median_price12) + ' and half for less, which works out to $' + c.median_psf12
    + ' a square foot across ' + (c.n_types >= 2 ? hpWords(c.n_types) + ' kinds of home' : 'every home') + ' here.</p>'
    + '<p>' + (c.site ? '<a href="' + hpEsc(c.site) + '">' + hpEsc(c.name) + ' home values</a> &middot; ' : '')
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
  h += '<form class="card correction" id="corrections" method="POST" action="/h/' + hpEsc(p.slug) + '">'
    + '<input type="hidden" name="form" value="correction">'
    + '<div class="tag">Corrections and ideas</div>'
    + '<h2>Something wrong here, or something missing?</h2>'
    + '<p class="lead" style="font-size:19px">' + hpEsc(addr) + '</p>'
    + '<p>The county record is a snapshot taken on 1 January 2026 and it gets things wrong. A pool that was filled '
    + 'in years ago, a lanai counted as living space, a room that was never finished, a transfer that was not '
    + 'really a sale. If a figure here does not match what you know about your own house, the house is right and '
    + 'I want to hear about it.</p>'
    + '<p>And if nothing is wrong but something is missing, tell me that too. '
    + 'This page exists because people kept asking me the same questions, so the best ideas for what goes on it '
    + 'next are going to come from whoever is reading it, not from me.</p>'
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
    +   '<label><input type="checkbox" name="wrong" value="Something else"> Something else is wrong</label>'
+   '<label><input type="checkbox" name="wrong" value="SUGGESTION"> Nothing is wrong, I have a suggestion</label>'
    + '</div>'
    + '<label class="fieldlab">Tell me what is wrong, or what you would change'
    +   '<textarea name="detail" rows="4" required placeholder="The pool was filled in when we bought it in 2021. And it would be useful to see what the HOA fee actually covers."></textarea></label>'
    + '<div class="row">'
    +   '<input type="email" name="email" required placeholder="your email, so I can tell you when it is fixed">'
    +   '<button type="submit">Send it</button>'
    + '</div>'
    + '<p class="small">I read every one of these myself. If you are right about a figure, I fix it and email you '
    + 'to say what changed. If the county record is the problem rather than my arithmetic, I will tell you that and '
    + 'point you at the Property Appraiser on <a href="tel:19418618200">941-861-8200</a>, who are the only ones who '
    + 'can change it at the source. And if you suggested something I end up building, you will be the first to see it.</p>'
    + '</form>';

  h += '<div class="foot">'
    + '<p><strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; <a href="tel:19416629941">941-662-9941</a><br>'
    + 'Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275</p>'
    /* There was no licence number and no broker named on any of the 8,706
       pages, and the only use of the word broker positioned Michael as one.
       Brian sets the final wording; this is correct-by-default until he does. */
    + '<p class="small">' + HP_LICENCE + '</p>'
    + '<p class="small">Sale prices are recorded transactions from Sarasota County public records, owner to owner, builder sales excluded. '
    + 'Figures are for general market awareness and are not an appraisal, not tax advice and not legal advice. '
    /* Same fact, stated as the reason the page can be checked rather than as a
       thing the page lacks. Stellar still needs it unambiguous that no IDX data
       is used here, and it still is. */
    /* THE OLD SENTENCE WAS FALSE AND THE PAGE PROVED IT TWO SECTIONS EARLIER.
       It claimed every figure came from county records rather than the MLS,
       while the RPR widget sits on every page and the page itself says RPR
       draws on listing photos and asking price histories. Narrowed so it is
       true either way: what Michael works out is county record, RPR's number is
       RPR's own. Whether the widget is permitted under the Stellar PDAA went to
       Brian on 25 September 2026. */
    + 'Every figure I work out here comes from Sarasota County public records rather than from the MLS, which '
    + 'is why you can look any of it up yourself. The RPR estimate on this page is RPR\'s own, produced from '
    + 'their data and not from mine. '
    + 'Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act. '
    + 'This is not a solicitation of property currently listed with another brokerage. '
    + 'This page was built for one address and is not published or indexed.</p>'
    + '<p class="small">I record that this page was opened, and which figures were typed into the net proceeds '
    + 'calculator, so I know which addresses to follow up on. No cookies, no third party tracking, and nothing '
    + 'here is ever sold or shared.</p>'
    /* "Page generated <today>" was the freshest-looking thing on the page and
       the only one that meant nothing. A reader opening a bookmark in 2028 saw
       a 2028 date a few words after "2026 certified roll". What matters is how
       old the FIGURES are, so that is what it says now. */
    + '<p class="small">Built from the ' + hpEsc(c.roll)
    + (c.asofLabel ? '. Every figure on this page is as at ' + hpEsc(c.asofLabel)
        + ', which is the most recent sale in that record' : '') + '.</p>'
    + '</div>';

  h += '</div>' + (range ? '<script>' + HP_JS + '</script>' : '')
     + '<script>' + HP_BEACON_JS + '</script></body></html>';
  return h;
}

/* ------------------------------------------------------- the confirmation */
function hpDone(D, p, kind, scope) {
  let title, body;
  if (kind === 'idea') {
    title = 'Thank you. That is a good place for it to come from.';
    body = '<p>Your idea for ' + hpEsc(hpAddress(p, D.c)) + ' arrived with the address attached, so I know '
         + 'exactly which page you were looking at when you thought of it.</p>'
         + '<p>I read every one of these. This page exists because people kept asking me the same questions, '
         + 'so the best ideas for what goes on it next come from whoever is reading it. '
         + 'If I end up building what you suggested, you will be the first to see it.</p>';
  } else if (kind === 'correction') {
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
    /* Back to WHERE THEY WERE, not the top of a page they already read. The
       form sits two thirds of the way down, so landing at the top means
       scrolling all of it again to get back to the spot. */
    + '<p><a class="btn" href="/h/' + hpEsc(p.slug)
    +   (kind === 'alerts' ? '#alerts' : '#corrections') + '">Back to '
    +   hpEsc(hpAddress(p, D.c)) + '</a></p></div>'
    + '<div class="foot"><p><strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; <a href="tel:19416629941">941-662-9941</a></p></div>'
    + '</div></body></html>';
}

/* Write a row straight into the leads table.

   ★ WHY NOTHING GOES THROUGH THE VAULT ANY MORE.
   The vault worker emails Michael the moment a row arrives, and it decides what
   to say by one test: are there contact details. So a suggestion saying "Love
   it" arrived titled "Gran Paradiso enquiry" with "THEY LEFT CONTACT DETAILS.
   CALL THEM" across it, and the community read "SUGGESTION, Gran Paradiso"
   because the only way to get the word into the subject was to stuff it in the
   subdivision field. British spelling, wrong instruction, mangled field, and no
   filter for Michael's own test address.

   fhv-alerts already knows the difference between a correction, a suggestion, an
   alerts signup and a calculator hit, and already has the right wording and the
   self-filter for his own email. So rows land in the table directly and
   fhv-alerts does the talking. The vault still serves its own leads list off
   the same table, so nothing is lost. */
async function hpLog(env, row) {
  try {
    await env.DB.prepare(
      'INSERT INTO leads (received_at, notify_status, territory_id, subdivision, address, ' +
      'name, email, phone, wants, homeowner_note, raw_json) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      new Date().toISOString(), row.notify || 'logged',
      row.territory, row.community, row.address,
      '', row.email || '', '', row.wants, row.note || null,
      JSON.stringify(row.raw || {})
    ).run();
  } catch (err) { /* a page must never fail because a row did not land */ }
}

/* --------------------------------------------------------------- the route */
async function hpRoute(env, request, slug) {
  const u = new URL(request.url);
  const REG = await hpData(env, u.origin);
  const host = u.host;

  /* The lookup page. /my-home is the URL that goes on Facebook and on print.
     A bare /h with no address lands here too, rather than on a 404, because
     somebody will trim the address off a link they were sent. */
  const raw = String(slug || '').trim();
  if (!raw || raw === '/' || raw.toLowerCase() === 'my-home') {
    const q = (u.searchParams.get('a') || '').trim();

    /* Someone typed an address and pressed the button. Resolve it here so the
       common case, one obvious match, goes straight to their page instead of
       making them pick from a list of one. */
    if (q) {
      /* The stored slug uses the county's spelling, so try that first, then the
         collapsed form for somebody who typed "Circle" where the county says CIR. */
      const exact = REG.bySlug[hpClean(q, false).join('-')]
                 || REG.bySlug[hpClean(q, true).join('-')];
      if (exact) return Response.redirect('https://' + host + '/h/' + exact.slug, 302);
      let m = hpSearch(REG, q, 12);

      /* ---- a misspelled street must not be a dead end ----------------------
         These communities are full of Italian street names. Ragazza, Cinqueterre,
         Campanile, Passagio. "20181 Ragaza Cir 101" found nothing and told the
         owner their own address did not exist, which is the worst thing this page
         can do. A house number is short and people get it right, so when nothing
         matches, fall back to every home at that number and let them pick. This
         recovers every possible street misspelling, not one particular typo. */
      let loose = false;
      if (!m.length) {
        /* ONLY the first number with three or more digits, which is the house
           number. Trying the others walks into nonsense: "99999 Ragazza Cir 101"
           does not exist, and falling through to the 101 listed every home with
           101 anywhere in it. */
        const toks2 = hpClean(q, true);
        const nums = toks2.filter(function (t) { return /^[0-9]{3,}$/.test(t); });
        const words = toks2.filter(function (t) { return /^[a-z]{4,}$/.test(t); });
        if (nums.length) {
          const at = hpSearch(REG, nums[0], 40);

          /* ---- a misspelled street is not the same as a street we do not have.
             "20181 Ragaza Cir" is a typo for Ragazza and the owner should get
             their page. "5754 Archipelago" is in Palmero, which is not built, and
             showing them other homes numbered 5754 would be nonsense. So a
             candidate only counts if one of the typed words shares a four letter
             opening with its street. Ragaza and Ragazza share "raga". Archipelago
             shares nothing with anything at 5754. */
          const near = at.filter(function (p2) {
            const st = hpNorm(p2.street).split(' ');
            for (let i = 0; i < words.length; i++) {
              for (let j = 0; j < st.length; j++) {
                if (st[j].length < 4) continue;
                /* same opening four letters, which catches a doubled or dropped
                   letter in the middle, or within two typos of each other, which
                   catches a wrong first letter. */
                if (words[i].slice(0, 4) === st[j].slice(0, 4)) return true;
                if (hpNear(words[i], st[j])) return true;
              }
            }
            return false;
          });

          if (near.length) { m = near.slice(0, 12); loose = true; }
          else if (!words.length) { m = at.slice(0, 12); loose = at.length > 0; }
        }
      }

      if (m.length === 1 && !loose) return Response.redirect('https://' + host + '/h/' + m[0].slug, 302);
      return new Response(hpLookupPage(REG, host, q, m, true, loose), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
    return new Response(hpLookupPage(REG, host, '', [], false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
    });
  }

  /* Type-ahead. Returns rows, nothing else, and is never indexed. */
  if (raw.toLowerCase() === 'my-home/suggest') {
    const m = hpSearch(REG, u.searchParams.get('q') || '', 8);
    return new Response(JSON.stringify({ matches: m.map(function (p2) {
      return { slug: p2.slug, addr: hpEsc(hpStreetLine(p2)),
               sub: hpEsc(hpTitle(p2.city || p2.cd.c.city) + ', FL ' + p2.zip + '  ' + p2.typeName
                          + ', ' + p2.sqft.toLocaleString('en-US') + ' sq ft') };
    }) }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8',
                 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }
    });
  }

  const p = REG.bySlug[raw.toLowerCase()];

  if (!p) {
    return new Response(hpNotFound(REG, host), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }

  /* From here on D is this address's own community. */
  const D = p.cd;

  if (request.method === 'POST') {
    const form = await request.formData();
    const email = String(form.get('email') || '').trim();
    const kind = String(form.get('form') || 'alerts');
    const addr = hpAddress(p, D.c);

    /* The silent beacon. No email, no phone, so the alerts worker's "somebody
       left contact details" test correctly ignores a view. A calculator row is
       tagged so that worker can pick it out on purpose. Nothing is shown to the
       visitor and nothing is waited on. */
    if (kind === 'log') {
      /* ---- WHY THIS WRITES TO D1 AND NOT TO THE VAULT ----------------------
         It went to the vault first and the vault emailed Michael on arrival,
         one message per page view titled "Gran Paradiso lookup". That is the
         exact flood this was designed to avoid: the point of a view row is to
         be counted later, not to interrupt him. The vault decides on its own
         what to email and it is not this file's job to argue with it, so these
         rows skip it and land in the table directly.

         Nothing is lost by doing that. fhv-alerts reads the same table, so the
         daily digest still counts these, the "came back a third time" entry
         still works, and a CALCULATOR row still produces its own alert inside
         five minutes with wording written for it.

         notify_status is 'logged' rather than 'pending' so nothing that retries
         unsent notifications ever picks one of these up and mails it anyway. */
      const what = String(form.get('kind') || '') === 'calc' ? 'calc' : 'view';
      const ref = String(form.get('ref') || '').slice(0, 200);
      const detail = String(form.get('detail') || '').slice(0, 200);
      let src = 'direct';
      if (ref && ref.indexOf(host) === -1) {
        let h2 = '';
        try { h2 = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) { h2 = ''; }
        src = /facebook|fb\.com|instagram/.test(h2) ? 'Facebook'
            : /google/.test(h2)                      ? 'Google'
            : /bing|duckduckgo|yahoo/.test(h2)       ? 'another search engine'
            : /chatgpt|openai|perplexity|claude|gemini/.test(h2) ? 'an AI assistant'
            : h2 || 'somewhere without a referrer';
      } else if (ref) {
        src = 'another page on the site';
      }
      const territory = D.c.name + ' - personal home page ' + (what === 'calc' ? 'CALCULATOR' : 'view');
      const wants = (what === 'calc'
                      ? 'CALCULATOR USED on a personal home page\nThey filled in: ' + detail
                      : 'PAGE VIEW on a personal home page')
                  + '\nAddress: ' + addr
                  + '\nPage URL: https://' + host + '/h/' + p.slug;
      await hpLog(env, {
        territory: territory, community: D.c.name, address: addr, wants: wants,
        note: 'CAME FROM ' + src + ' ON a personal address page',
        raw: { kind: what, slug: p.slug, source: src, detail: detail }
      });
      return new Response(null, { status: 204, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
    }

    /* A correction. The message goes to the vault with the parcel attached, so
       it arrives saying which house and what the page had claimed, rather than
       as a loose sentence about an unnamed property. */
    if (kind === 'correction') {
      const wrong = form.getAll('wrong').map(String);
      /* Somebody with an idea is not somebody reporting a broken figure, and
         the two need different subject lines or they get read in the wrong
         frame of mind. If the only box ticked is the suggestion box, it is a
         suggestion. */
      const isIdea = wrong.length === 1 && wrong[0] === 'SUGGESTION';
      const tag = isIdea ? 'SUGGESTION' : 'CORRECTION';
      const detail = String(form.get('detail') || '').trim();
      const facts = [
        p.typeName, p.sqft + ' sq ft', p.bd + ' bed', (p.fb + (p.hb ? '.5' : '')) + ' bath',
        'built ' + p.yr, (p.pool ? 'pool' : 'no pool'),
        'assessed ' + p.assessed, 'county market value ' + p.just,
        (p.hs ? 'homesteaded' : 'no homestead')
      ].join(' | ');
      await hpLog(env, {
        notify: 'pending', email: email, address: addr, community: D.c.name,
        territory: D.c.name + ' - ' + tag + ' on a personal home page',
        wants: tag + ' REPORTED\nAddress: ' + addr
             + '\nPage URL: https://' + host + '/h/' + p.slug
             + (isIdea ? '' : '\nWhat they say is wrong: ' + (wrong.length ? wrong.join(', ') : 'not specified'))
             + '\nTheir words: ' + detail
             + '\nWhat the page was showing: ' + facts,
        raw: { kind: tag.toLowerCase(), slug: p.slug, wrong: wrong, detail: detail }
      });
      return new Response(hpDone(D, p, isIdea ? 'idea' : 'correction', ''), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }
      });
    }

    const scope = String(form.get('scope') || 'street');
    if (email) {
      const wants = scope === 'community'
          ? 'Alerts for all ' + D.c.parcels.toLocaleString('en-US') + ' homes in ' + D.c.name
        : scope === 'plan'
          ? 'Alerts for ' + p.typeName + ' homes within 10% of ' + p.sqft.toLocaleString('en-US') + ' sq ft anywhere in ' + D.c.name
          : 'Alerts for ' + hpTitle(p.street) + ' only';
      await hpLog(env, {
        notify: 'pending', email: email, address: addr, community: D.c.name,
        territory: D.c.name + ' - personal home page',
        wants: wants + '\nPage URL: https://' + host + '/h/' + p.slug,
        raw: { kind: 'alerts', slug: p.slug, scope: scope }
      });
    }
    return new Response(hpDone(D, p, 'alerts', scope), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }
    });
  }

  return new Response(hpPage(D, p, host), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      /* private, not public. noindex is not access control, and these pages
         carry one household's purchase price, assessed value and homestead
         status. A shared proxy has no business holding that. */
      'Cache-Control': 'private, max-age=900'
    }
  });
}

function hpNotFound(REG, host) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="robots" content="noindex, nofollow"><title>Address not found</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">'
    + '<style>' + HP_CSS + '</style></head><body><div class="wrap">'
    + '<div class="card"><h2>I do not have a page for that address yet</h2>'
    + '<p>These pages currently cover ' + REG.homes.toLocaleString('en-US') + ' homes in ' + hpNames(REG)
    + '. If your address is in there and this link did not work, it is my mistake rather than yours.</p>'
    + '<p>Text the address to <a href="sms:19416629941">941-662-9941</a> and I will send you the right link. '
    + 'For anywhere else in Sarasota, Charlotte or Manatee County, the '
    + '<a href="/property-tax-calculator">tax calculator</a> works on any address today.</p></div>'
    + '<div class="foot"><p><strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; <a href="tel:19416629941">941-662-9941</a></p></div>'
    + '</div></body></html>';
}


/* ==========================================================================
   THE WAY IN  —  /my-home
   ==========================================================================

   THE GAP THIS FILLS. The pages at /h/<address> could only be reached by
   somebody who already had the exact link. That made them a thing to mail,
   not a thing to find, and it made every Facebook post in the plan impossible:
   "type your address" had nowhere to type. This is the address box.

   TWO WAYS IN, BOTH LANDING HERE.
     1. floridahomevalueai.com/my-home  — the URL to put in a Facebook post,
        on a postcard, in a letter. Short enough to say out loud.
     2. A link in the footer of every page on the site, added by the rewriter
        further down rather than by editing sixty HTML files.

   IT WORKS WITHOUT JAVASCRIPT. The form is a plain GET. The type-ahead is an
   enhancement on top, and if it never loads, typing an address and pressing
   the button still works. That matters because this page IS indexed, unlike
   the address pages it sends people to.                                     */

function hpNorm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Rank matches so that typing a house number finds the house, and typing a
   street finds the street. Anything starting with what was typed beats
   anything merely containing it. */
/* Is one word within two typos of another? Only used to rescue a misspelled
   street when the house number already matched, so it can afford to be strict:
   lengths within two, and at most two edits. Cheap Levenshtein, capped. */
function hpNear(a, b) {
  if (Math.abs(a.length - b.length) > 2) return false;
  if (a.length < 5 || b.length < 5) return false;
  const prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]; prev[0] = i; let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = Math.min(prev[j] + 1, prev[j - 1] + 1,
                           last + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      last = prev[j]; prev[j] = cur;
      if (cur < best) best = cur;
    }
    if (best > 2) return false;
  }
  return prev[b.length] <= 2;
}

/* Filled in once per isolate from whatever data files actually loaded, so it can
   never claim a community that is not really there. */
let HP_COVERED = '';

/* Small numbers read better as words in a sentence. */
function hpWords(n) {
  const w = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
  return w[n] || String(n);
}

/* Words that carry no information in an address search. The page now displays
   "20181 Ragazza Cir, Unit 101", so an owner will type "unit" and will paste the
   whole line including the city, the state and the zip. Before this, both of
   those failed and told them their own address did not exist, which is the worst
   thing this page could do to somebody. Street types are NOT in here: "cir" and
   "dr" tell two addresses apart. */
const HP_NOISE = ['unit', 'apt', 'apartment', 'ste', 'suite', 'no', 'num', 'lot',
                  'fl', 'florida', 'usa', 'us'];

/* The county abbreviates a street type, Stellar MLS spells it out, and a person
   types whichever they saw. "20181 Ragazza Circle" and "20181 RAGAZZA CIR" are
   the same house, so both collapse to the county's spelling before matching.
   Only the type words are mapped. Street NAMES are left alone. */
const HP_STYPE = {
  circle: 'cir', drive: 'dr', street: 'st', lane: 'ln', court: 'ct',
  boulevard: 'blvd', terrace: 'ter', place: 'pl', avenue: 'ave', road: 'rd',
  trail: 'trl', parkway: 'pkwy', crossing: 'xing', point: 'pt', square: 'sq',
  highway: 'hwy', cove: 'cv', glen: 'gln', bend: 'bnd', hollow: 'holw',
  landing: 'lndg', trace: 'trce', plaza: 'plz', grove: 'grv', view: 'vw',
  alley: 'aly', crescent: 'cres', pass: 'pass', path: 'path', row: 'row',
  run: 'run', walk: 'walk', way: 'way', loop: 'loop', park: 'park'
};

/* map=false leaves street types alone, for trying the stored slug, which is
   built from the county's own spelling. map=true collapses them, and the parcel
   haystack is collapsed the same way so both sides always agree.

   WHY BOTH SIDES. Mapping only the query breaks any street whose NAME contains a
   type word. There are three here, Cozy Grove Dr, Winter Park Ct and Avon Park
   Ct, covering 105 homes: a search for "Cozy Grove" became "cozy grv" and found
   nothing. Collapsing the haystack too makes it symmetric and those work again. */
function hpClean(q, map) {
  const out = [];
  /* "Unit101" and "Apt101" arrive glued together often enough to be worth
     splitting before anything else looks at them. */
  const pre = hpNorm(q).replace(/\b(unit|apt|apartment|ste|suite|no|num|lot)([0-9])/g, '$1 $2');
  pre.split(' ').forEach(function (t) {
    if (!t) return;
    if (HP_NOISE.indexOf(t) > -1) return;
    if (/^3[0-9]{4}$/.test(t)) return;        /* a Florida zip is not a house number */
    out.push(map === false ? t : (HP_STYPE[t] || t));
  });
  return out;
}

function hpSearch(REG, q, limit) {
  const toks = hpClean(q, true);
  const n = toks.join(' ');
  if (n.length < 2) return [];
  const hits = [];
  for (const p of REG.parcels) {
    const hay = p.hay;
    let score = -1;
    if (hay === n) score = 0;
    else if (hay.indexOf(n) === 0) score = 1;
    else if ((' ' + hay).indexOf(' ' + n) > -1) score = 2;
    else if (hay.indexOf(n) > -1) score = 3;
    else if (toks.length > 1) {
      /* Nothing matched as one run of text. Try every word instead, so a pasted
         line still finds the house even with a typo somewhere in it. The city is
         in this haystack but not the one above, so ranking is unchanged while a
         pasted "..., Venice, FL 34293" no longer blocks the match. */
      const wide = p.haywide;
      let all = true;
      for (let i = 0; i < toks.length; i++) {
        if (wide.indexOf(toks[i]) === -1) { all = false; break; }
      }
      if (all) score = 4;
    }
    if (score >= 0) hits.push({ p: p, score: score });
    if (hits.length > 400) break;
  }
  hits.sort(function (a, b) {
    if (a.score !== b.score) return a.score - b.score;
    return a.p.slug < b.p.slug ? -1 : 1;
  });
  return hits.slice(0, limit || 8).map(function (h) { return h.p; });
}

/* A plain English list: "Gran Paradiso and IslandWalk", or with three or more,
   "A, B and C". */
function hpNamesOf(list) {
  const n = list.slice();
  if (!n.length) return '';
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}

function hpNames(REG) {
  return hpEsc(hpNamesOf(REG.names));
}

function hpLookupPage(REG, host, q, matches, tried, loose) {
  const c = REG.comms[0].c;
  let h = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>What your home is worth, and every sale that says so | Florida Home Value AI</title>'
    + '<meta name="description" content="One page about your own home. What it is worth today with every comparable sale listed underneath, what Save Our Homes has saved you, what the homestead rules do to your tax bill, and what you would walk away with if you sold. Sarasota County public records.">'
    + '<link rel="canonical" href="https://' + host + '/my-home">'
    + '<meta property="og:type" content="website">'
    + '<meta property="og:title" content="What your home is worth, and every sale that says so">'
    + '<meta property="og:description" content="Type your address and get one page about your own home, built from Sarasota County public records, with every comparable sale listed so you can check the work. Michael Putnam, Putnam Realty Group.">'
    + '<meta property="og:image" content="https://' + host + '/og-image-fhv.jpg">'
    + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">'
    + '<style>' + HP_CSS + HP_LOOKUP_CSS + '</style></head><body><div class="wrap">';

  h += '<div class="mast">'
    +   '<div class="brandline"><img src="/putnam-mark.png" alt="" class="mark">'
    +     'Florida Home Value AI &middot; Putnam Realty Group</div>'
    /* WHOSE HOME IS THIS ABOUT. The headline used to be "What homes on your
       street actually sold for", which is about the neighbors and not about the
       person reading it, when the entire page is about one address: theirs. And
       it used to say "not an estimate from a national website", which stopped
       being true the day RPR went on these pages. Both were Michael's catch. */
    +   '<h1>What your home is worth, and every sale that says so</h1>'
    +   '<p class="lede">One page about your own home. Not a neighborhood average and not a figure with '
    +   'nothing behind it: the comparable sales it rests on are listed underneath with full addresses, '
    +   'so you can look up any deed yourself.</p>'
    +   '<p class="lede">Type your address and the page builds itself. What your home is worth today, what '
    +   'Save Our Homes has saved you, what the homestead rules do to your tax bill, and what you would '
    +   'walk away with if you sold. Every figure comes from Sarasota County public records.</p>'
    +   '<p class="lede">RPR, which is run by the National Association of Realtors, works out its own '
    +   'estimate for your address, and it sits on the page beside mine. Where the two disagree the page '
    +   'says so rather than picking a winner.</p>'
    +   '<p class="lede">The page is yours to keep. The link is permanent and it still works in two '
    +   'years. There is nothing to fill in.</p>'
    + '</div>';

  h += '<form class="card lookup" method="GET" action="/my-home" autocomplete="off">'
    + '<label class="fieldlab" for="hpq">Your address</label>'
    + '<div class="row">'
    +   '<input type="text" id="hpq" name="a" value="' + hpEsc(q || '') + '" required '
    +     'placeholder="start typing your house number" aria-describedby="hphint">'
    +   '<button type="submit">Show me</button>'
    + '</div>'
    + '<div id="hpsuggest" class="suggest"></div>'
+ '<div class="coverage"><strong>Built so far: ' + hpNames(REG) + '.</strong> '
+ 'That is ' + REG.homes.toLocaleString('en-US') + ' homes, which is almost every home in the '
+ 'communities I cover. Palmero is the one still to come. '
+ 'If your home is not in yet, text the address to <a href="sms:19416629941">941-662-9941</a>. '
+ 'I will build your page by hand and send you the link, and it tells me which community to do first.</div>'
    + '<p class="small" id="hphint">Start with the house number, for example 20730. '
    + 'In a condo, your house number and your unit number together will find it, '
    + 'like 20181 101. Punctuation does not matter.</p>'
    + '</form>';

  if (tried && matches.length) {
    h += '<div class="card"><h2>'
      + (loose ? 'Not quite, but here is every home at that number'
               : matches.length + (matches.length === 1 ? ' address matches that' : ' addresses match that'))
      + '</h2>'
      + (loose ? '<p>I could not match that street name, so this is every home at number '
               + hpEsc(hpClean(q, true).filter(function (t) { return /^[0-9]{3,}$/.test(t); })[0] || '')
               + '. Yours is almost certainly here.</p>'
               : '<p>Pick yours.</p>')
      + '<ul class="hits">';
    matches.forEach(function (p) {
      h += '<li><a href="/h/' + hpEsc(p.slug) + '">' + hpEsc(hpAddress(p, p.cd.c)) + '</a>'
        + '<span class="dim"> ' + hpEsc(p.cd.c.name) + ' &middot; ' + hpEsc(p.typeName) + ', '
        + p.sqft.toLocaleString('en-US') + ' sq ft, built ' + p.yr + '</span></li>';
    });
    h += '</ul></div>';
  } else if (tried && !matches.length) {
    h += '<div class="card"><h2>Nothing here matches that</h2>'
      + '<p>Two likely reasons, and neither is your fault.</p>'
      + '<p><strong>Your community may not be built yet.</strong> This currently covers '
      + hpNames(REG) + '. Palmero is the one still to come.</p>'
      + '<p><strong>Or the spelling is not what the county has.</strong> Try just the house number on its own, '
      + 'or just the street name, and pick from the list.</p>'
      + '<p>Either way, text the address to <a href="sms:19416629941">941-662-9941</a> and I will build it by '
      + 'hand and send you the link. That costs you nothing and it is how I find out which community to do next.</p>'
      + '<p class="cta"><a class="btn ghost" href="/property-tax-calculator">Meanwhile, the tax calculator works on any address in Sarasota, Charlotte or Manatee County</a></p>'
      + '</div>';
  }

  h += '<div class="card quiet"><h2>What the page shows you</h2>'
    + '<ul class="what">'
    + '<li><strong>Every comparable sale near you.</strong> Full addresses, sizes, dates and the price on the deed, '
    + 'so you can look up every one of them yourself.</li>'
    + '<li><strong>Where your own home sits among them,</strong> and how far it has moved since you bought it, '
    + 'up or down.</li>'
    + '<li><strong>What Save Our Homes has saved you</strong>, in dollars a year, and what happens to it the day you sell.</li>'
    + '<li><strong>Your tax bill, line by line, and the homestead deadlines that change it.</strong></li>'
    + '<li><strong>What you would walk away with</strong> after the costs of selling.</li>'
    + '<li><strong>Every sale the county has recorded on your address</strong>, back to the day it was built.</li>'
    + '</ul>'
    + '<p class="small">Every figure is a Sarasota County public record or arithmetic on one, not MLS data, which is '
    + 'what makes all of it checkable. The pages are not indexed by search engines, so yours is not going to turn up '
    + 'in somebody else\'s search results.</p>'
    + '</div>';

  h += '<div class="foot">'
    + '<p><strong>Michael Putnam</strong> &middot; Putnam Realty Group &middot; <a href="tel:19416629941">941-662-9941</a><br>'
    + 'Michael@PutnamRealtyGroup.com &middot; Nokomis, FL 34275</p>'
    + '<p class="small">' + HP_LICENCE + '</p>'
    + '<p class="small">Figures are for general market awareness and are not an appraisal, not tax advice and not '
    + 'legal advice. Putnam Realty Group supports the Fair Housing Act and the Equal Opportunity Act. '
    + 'This is not a solicitation of property currently listed with another brokerage.</p>'
    + '<p><a href="/">Home</a> &middot; <a href="/property-tax-calculator">Property tax calculator</a> &middot; '
    + '<a href="https://granparadiso.floridahomevalueai.com/">Gran Paradiso home values</a> &middot; '
    + '<a href="https://islandwalk.floridahomevalueai.com/">IslandWalk home values</a> &middot; '
    + '<a href="https://grandpalm.floridahomevalueai.com/">Grand Palm home values</a> &middot; '
    + '<a href="https://talonpreserve.floridahomevalueai.com/">Talon Preserve home values</a> &middot; '
    + '<a href="/meet">About Michael Putnam</a></p>'
    + '</div>';

  h += '</div><script>' + HP_LOOKUP_JS + '</script></body></html>';
  return h;
}

const HP_LOOKUP_CSS = `
.lede{font-size:19px;line-height:1.6;margin:0 0 .8rem}
.mast h1{font-size:36px;margin:.5rem 0 .8rem}
.lookup{padding:24px}
.lookup .row input[type=text]{flex:1;min-width:0;padding:15px;font:400 19px Inter,sans-serif;border:2px solid var(--gold);border-radius:8px;background:#fff;color:var(--ink)}
.lookup .row button{padding:15px 26px;font:600 18px Inter,sans-serif}
.suggest{margin:0}
.suggest a{display:block;padding:12px 14px;border:1px solid var(--line);border-top:0;background:#fff;text-decoration:none;color:var(--ink);font-size:17px}
.suggest a:first-child{border-top:1px solid var(--line);border-radius:8px 8px 0 0}
.suggest a:last-child{border-radius:0 0 8px 8px}
.suggest a:hover,.suggest a:focus{background:var(--warm)}
.suggest .nomatch{padding:13px 15px;border:1px solid var(--line);border-radius:8px;background:#fdf3f1;font-size:16px;line-height:1.6}
.coverage{margin:12px 0 4px;padding:13px 15px;background:var(--warm);border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:8px;font-size:16px;line-height:1.6}
.suggest .s2{display:block;font-size:15px;color:var(--dim)}
ul.hits{list-style:none;padding:0;margin:0}
ul.hits li{padding:11px 0;border-bottom:1px solid var(--line);font-size:17px}
ul.hits a{font-weight:600}
ul.what{padding-left:20px;margin:0 0 .9rem}
ul.what li{margin-bottom:.6rem;font-size:17px;line-height:1.6}
@media(max-width:560px){.mast h1{font-size:28px}.lede{font-size:17px}}
`;

const HP_LOOKUP_JS = `
(function(){
  var box=document.getElementById('hpq'), out=document.getElementById('hpsuggest');
  if(!box||!out) return;
  var t=null, last='';
  function draw(list, q){
    /* Silence is indistinguishable from broken. When nothing matches, say so
       and say why, rather than leaving an empty box under the cursor. */
    if(!list.length){
      out.innerHTML = '<div class="nomatch">No address here starts with <strong>'
        + q.replace(/[&<>"]/g,'') + '</strong>. '
        + 'Either the community is not built yet, or the county spells it differently. '
        + 'Text it to <a href="sms:19416629941">941-662-9941</a> and I will build it by hand.</div>';
      return;
    }
    out.innerHTML=list.map(function(r){
      return '<a href="/h/'+r.slug+'">'+r.addr+'<span class="s2">'+r.sub+'</span></a>';
    }).join('');
  }
  function go(){
    var q=box.value.trim();
    if(q===last) return;
    last=q;
    if(q.length<2){ out.innerHTML=''; return; }
    fetch('/my-home/suggest?q='+encodeURIComponent(q))
      .then(function(r){ return r.json(); })
      .then(function(d){ if(box.value.trim()===q) draw(d.matches||[], q); })
      .catch(function(){});
  }
  box.addEventListener('input', function(){ clearTimeout(t); t=setTimeout(go,120); });
  box.addEventListener('focus', go);
  document.addEventListener('click', function(e){
    if(e.target!==box && !out.contains(e.target)) out.innerHTML='';
  });
})();
`;

/* The licence and brokerage line for every page. One constant, so it changes
   in one place once Brian settles the exact wording. */
const HP_LICENCE = 'Michael Putnam, Florida Real Estate Sales Associate with Putnam Realty Group';

/* ===========================================================================
   THE LEADS VIEWER AND THE MARK BUTTON  —  /leads?k=  and  /mark?id=&k=
   ===========================================================================

   WHY THESE EXIST HERE
   Both used to live on fhv-lead-vault.cleirshusband.workers.dev, an endpoint on
   the open internet that accepted any POST from anyone, wrote it into the leads
   table and emailed Michael. On 25 September 2026 a credential scanner found it
   and put twelve junk rows and twelve emails through it in eight seconds. The
   payloads were attempts to read .env and /proc/self/environ and to run shell
   commands, none of which a Worker can do, so nothing was compromised. The real
   problem was never the scanner: it was that anyone who found that URL could
   write a convincing fake lead straight into Michael's inbox.

   The endpoint is being retired. That removed two things he actually used, so
   they are rebuilt here, on his own domain, behind a key:

     /leads?k=KEY          browse the table, which was the vault's /leads
     /mark?id=N&k=KEY      mark a row contacted, which was the vault's /mark

   THE KEY IS NOT SECURITY THEATRE BUT IT IS NOT MUCH EITHER. It keeps the table
   out of reach of anything sweeping for open endpoints, which is the actual
   threat that turned up. Anyone Michael sends the URL to can read his leads. If
   that ever matters, move it behind Cloudflare Access.
   Nothing here writes on a GET except /mark, which only ever sets one column on
   one row and cannot create one. */
const HP_LEADS_KEY = 'nZiXUZTehDwquzE7Vk89GkDxe5Lc1FAf';

/* THE KEY DOES NOT TRAVEL IN A URL, AND THAT IS THE WHOLE POINT OF THIS SHAPE.
   The existing leads page takes its password as ?pw= and the lead emails carry
   a ?k= link, so the credential to every customer record sits in Michael's
   mailbox, in his browser history and in request logs. When this page was first
   written on 25 September 2026 it repeated that mistake within the hour.
   So: the key is posted once from a form, it comes back as an HttpOnly cookie,
   and nothing after that has it in an address bar. A ?k= link still works, for
   the bookmark and for links already sent, but it sets the cookie and
   immediately redirects to a bare /leads so the key does not sit on screen or
   in history.
   This is not bank-grade. Anyone holding the cookie or the key can read the
   leads. It is a large improvement on mailing the key to yourself forever. */
const HP_LEADS_COOKIE = 'fhv_leads';

function hpLeadsCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split('=');
    if (kv[0] && kv[0].trim() === HP_LEADS_COOKIE) {
      return decodeURIComponent((kv[1] || '').trim());
    }
  }
  return '';
}

function hpLeadsLogin(message, status) {
  return new Response('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="robots" content="noindex, nofollow"><title>FHV leads</title><style>'
    + 'body{font:400 17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
    + 'background:#faf7f2;color:#1a1714;display:flex;align-items:center;justify-content:center;'
    + 'min-height:100vh;margin:0;padding:20px}'
    + 'form{background:#fff;border:1px solid #e6ded2;border-radius:10px;padding:26px;max-width:360px;width:100%}'
    + 'h1{font-size:20px;margin:0 0 6px}p{color:#57504a;font-size:15px;margin:0 0 16px}'
    + 'input{width:100%;padding:13px;border:1px solid #d8d2c8;border-radius:8px;font-size:16px;'
    + 'box-sizing:border-box;margin-bottom:10px}'
    + 'button{width:100%;padding:13px;background:#8a601d;color:#fff;border:0;border-radius:8px;'
    + 'font-size:16px;cursor:pointer}.e{color:#9b3b2f;font-size:15px;margin-bottom:10px}'
    + '</style></head><body><form method="POST" action="/leads">'
    + '<h1>FHV leads</h1><p>Your leads key.</p>'
    + (message ? '<div class="e">' + message + '</div>' : '')
    + '<input type="password" name="k" autofocus autocomplete="current-password">'
    + '<button type="submit">Open</button></form></body></html>',
    { status: status || 200, headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store'
      } });
}

async function hpLeadsRoute(env, request, path) {
  const url = new URL(request.url);
  const noStore = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store'
  };
  /* 30 days, so he is not retyping it every visit. HttpOnly keeps it away from
     any script on the page, Secure keeps it off plain HTTP, Lax means it still
     arrives when he clicks a link in an email. */
  const setCookie = HP_LEADS_COOKIE + '=' + encodeURIComponent(HP_LEADS_KEY)
    + '; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax';

  /* The form posts the key. Right key, cookie set, straight to the table. */
  if (path === '/leads' && request.method === 'POST') {
    let given = '';
    try {
      const form = await request.formData();
      given = (form.get('k') || '').toString();
    } catch (err) { given = ''; }
    if (given !== HP_LEADS_KEY) return hpLeadsLogin('That is not the key.', 401);
    return new Response(null, { status: 303, headers: {
      'Location': '/leads', 'Set-Cookie': setCookie, 'Cache-Control': 'no-store' } });
  }

  /* A ?k= link, from the bookmark or from an email already sent. Swap it for the
     cookie and get the key out of the address bar. */
  if (url.searchParams.get('k') === HP_LEADS_KEY) {
    const to = path === '/mark' ? '/mark?id=' + encodeURIComponent(url.searchParams.get('id') || '')
                               : '/leads';
    return new Response(null, { status: 303, headers: {
      'Location': to, 'Set-Cookie': setCookie, 'Cache-Control': 'no-store' } });
  }

  if (hpLeadsCookie(request) !== HP_LEADS_KEY) {
    /* A wrong or missing key gets the login form on /leads and nothing at all
       anywhere else, so probing /mark teaches nothing. */
    if (path === '/leads') return hpLeadsLogin('', 200);
    return new Response('Not found', { status: 404 });
  }

  if (path === '/mark') {
    const id = parseInt(url.searchParams.get('id') || '', 10);
    if (!id) return new Response('No id', { status: 400, headers: noStore });
    try {
      /* THE TABLE HAS ITS OWN contacted COLUMN AND THE OTHER LEADS PAGE SETS IT.
         Writing notify_status instead would leave the two pages disagreeing
         about who has been written to. COALESCE so a second click does not move
         the original date. */
      await env.DB.prepare(
        'UPDATE leads SET contacted = 1, contacted_at = COALESCE(contacted_at, ?) WHERE id = ?'
      ).bind(new Date().toISOString(), id).run();
    } catch (err) {
      return new Response('Could not mark that one. Call it done anyway.',
        { status: 500, headers: noStore });
    }
    return new Response('<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      + '<meta name="robots" content="noindex, nofollow"><title>Marked</title>'
      + '<style>body{font:400 18px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
      + 'margin:0;padding:40px 20px;background:#faf7f2;color:#1a1714}a{color:#8a601d}</style>'
      + '</head><body><p><strong>Row ' + id + ' marked as written to.</strong></p>'
      + '<p><a href="/leads">Back to all leads</a></p></body></html>',
      { headers: noStore });
  }

  /* /leads */
  let rows = [];
  try {
    const q = await env.DB.prepare(
      'SELECT id, received_at, contacted, contacted_at, territory_id, subdivision, address, '
      + 'name, email, phone, wants FROM leads ORDER BY id DESC LIMIT 300'
    ).all();
    rows = q.results || [];
  } catch (err) {
    return new Response('The leads table did not answer. Try again in a minute.',
      { status: 503, headers: noStore });
  }

  const esc = function (v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  };
  /* Rows hold whatever a form was handed, so everything is escaped on the way
     out. One of them held a shell command on 25 September. */
  const waiting = rows.filter(function (r) { return !Number(r.contacted || 0); }).length;
  let body = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="robots" content="noindex, nofollow"><title>FHV leads</title><style>'
    + 'body{font:400 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
    + 'margin:0;padding:18px;background:#faf7f2;color:#1a1714}'
    + 'h1{font-size:22px;margin:0 0 4px}.n{color:#57504a;font-size:15px;margin:0 0 16px}'
    + 'table{border-collapse:collapse;width:100%;background:#fff}'
    + 'th{text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;'
    + 'color:#57504a;border-bottom:1px solid #e6ded2;padding:8px;position:sticky;top:0;background:#fff}'
    + 'td{border-bottom:1px solid #f0eae1;padding:8px;vertical-align:top;font-size:15px}'
    + 'td.w{white-space:pre-wrap;max-width:420px}'
    + 'tr.done{opacity:.5}a{color:#8a601d}.tag{font-size:12px;padding:2px 6px;border-radius:4px;'
    + 'background:#f3ece1}</style></head><body>'
    + '<h1>FHV leads</h1><p class="n">' + rows.length + ' most recent, newest first. '
    + waiting + ' not written to yet. Faded rows are done.</p><table><thead><tr>'
    + '<th>#</th><th>When</th><th>Address</th><th>Who</th><th>What they wanted</th><th></th>'
    + '</tr></thead><tbody>';
  for (const r of rows) {
    const done = Number(r.contacted || 0) === 1;
    const who = [r.name, r.email, r.phone].filter(function (x) { return x; }).length;
    body += '<tr' + (done ? ' class="done"' : '') + '>'
      + '<td>' + r.id + '</td>'
      + '<td>' + esc(String(r.received_at || '').replace('T', ' ').slice(0, 16)) + '</td>'
      + '<td>' + esc(r.address) + (r.subdivision ? '<br><span class="tag">'
          + esc(r.subdivision) + '</span>' : '') + '</td>'
      + '<td>' + (who ? esc(r.name) + (r.name && (r.email || r.phone) ? '<br>' : '')
          + esc(r.email) + (r.email && r.phone ? '<br>' : '') + esc(r.phone)
          : '<span class="tag">anon</span>') + '</td>'
      + '<td class="w">' + esc(r.wants) + '</td>'
      + '<td>' + (done ? 'done' : '<a href="/mark?id=' + r.id + '">mark done</a>')
      + '</td></tr>';
  }
  body += '</tbody></table></body></html>';
  return new Response(body, { headers: noStore });
}

/* -------------------------------------------------------------- the styles */
const HP_CSS = `
/* Type is set larger than a web default on purpose. A lot of what matters
   here sits in the explanatory text rather than in the headline, and this gets
   read on phones as often as on a desktop. 18px body, nothing below 15px.
   (An earlier version of this comment described the readers of a named
   community by age. It shipped in the HTML of all 8,706 pages and was visible
   in View Source. Nothing about who the readers are goes in here.)
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
.mark{width:34px;height:34px;vertical-align:middle;margin-right:9px}
.brandline{font:600 13px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--goldink)}
.prepared{font-size:15px;color:var(--dim);margin-top:2px}
.sub{font-size:17px;color:var(--dim)}
.facts{margin-top:8px;font-size:17px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px}
.hero{margin:20px 0;padding:22px;border-radius:var(--radius);background:#fff;border:1px solid var(--line);border-left:4px solid var(--green)}
.hero.down{border-left-color:var(--red)}
.herolabel{font:600 13px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)}
.herobig{font:800 44px/1.05 "Playfair Display",Georgia,serif;margin:.15rem 0 .7rem;color:var(--green)}
.hero.down .herobig{color:var(--red)}
/* the good news / bad news pair. Two panels, equal weight, so neither number
   is the headline. Stacks on a phone with the good news first. */
.hero.ask{border-left-color:var(--gold)}
.askq{font:800 27px/1.2 "Playfair Display",Georgia,serif;margin:0 0 .5rem}
.gnbn{display:grid;gap:16px;margin:16px 0 14px}
@media(min-width:700px){.gnbn{grid-template-columns:1fr 1fr}}
.gn,.bn{padding:15px 16px;border-radius:8px;background:var(--warm);border:1px solid var(--line)}
.gn{border-left:4px solid var(--green)}
.bn{border-left:4px solid var(--red)}
.gnlabel{font:600 12px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.gnbig{font:800 31px/1.08 "Playfair Display",Georgia,serif;margin:.2rem 0 .5rem}
.gnbig.txt{font-size:21px;line-height:1.25}
.gn .gnbig{color:var(--green)}
.bn .gnbig{color:var(--red)}
.gn p,.bn p{margin:0;font-size:16px;line-height:1.62}
.gn p+p,.bn p+p{margin-top:.55rem}
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
.rangebar.wide .mid{background:var(--warm);border-color:var(--line)}
.rangebar.wide .mid strong{color:var(--ink)}
.trust{padding:13px 15px;border-radius:8px;font-size:16px;line-height:1.6;margin:4px 0 12px}
.trust.good{background:#f1f7f3;border-left:4px solid var(--green)}
.trust.weak{background:#fdf3f1;border-left:4px solid var(--red)}
.rpr{background:var(--warm);border:1px solid var(--line);border-radius:8px;padding:16px;text-align:center;margin:12px 0}
.rprv{font:800 32px/1.1 "Playfair Display",Georgia,serif}
.rprr{font-size:15px;color:var(--dim)}
/* The calculator and its total sit SIDE BY SIDE on anything wide enough, and
   the total sticks, so the number moves in front of you as you type instead of
   being a screen and a half below the box you are filling in. On a phone there
   is no room for two columns, so the total sticks to the top of the screen
   instead and follows you down the inputs. */
.npwrap{display:grid;gap:14px;margin:14px 0}
@media(min-width:820px){.npwrap{grid-template-columns:1.1fr 1fr;align-items:start}
  .npwrap .npout{position:sticky;top:14px}}
@media(max-width:819px){.npwrap .npout{position:sticky;top:0;z-index:5;
  box-shadow:0 6px 18px rgba(26,24,20,.10)}}
.calc{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:560px){.calc{grid-template-columns:1fr}}
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
.extras{display:grid;grid-template-columns:1fr;gap:8px;margin:12px 0}
.extras label{display:block;font-size:17px;line-height:1.5;padding:10px 12px;background:var(--warm);border:1px solid var(--line);border-radius:8px;cursor:pointer}
.extras select{display:block;width:100%;margin-top:5px;padding:10px;font:400 16px Inter,sans-serif;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.xout{background:#fffaf1;border:1px solid var(--gold);border-radius:8px;padding:16px;text-align:center;margin:14px 0}
.xout .xbig{font:800 30px/1.15 "Playfair Display",Georgia,serif;color:var(--goldink)}
.xout .xsub{font-size:16px;color:var(--dim);margin-top:4px}
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
/* ---------------------------------------------------------------------------
   THE BEACON. Two signals, both silent to the visitor.

   A VIEW, recorded once per browser per address, ever. Not once per visit.
   The page tells people to bookmark it, so an owner coming back weekly is
   doing exactly what was asked, and counting those as fresh interest would
   fill the daily digest with the same handful of owners. Because a repeat
   row can now only come from a DIFFERENT browser, three rows on one address
   means three different people looked at that house, which is worth knowing.

   THE CALCULATOR. Somebody typing a mortgage payoff or a commission rate into
   the net proceeds boxes is not browsing, they are working out what they would
   walk away with. That is the strongest selling signal on the page and no
   portal hands it over. Fires once per page load, not once per keystroke.

   Both go out with sendBeacon, which survives the page being closed and never
   makes the visitor wait. If it fails, nothing on the page changes.        */
const HP_BEACON_JS = `
(function(){
  var slug=document.body.getAttribute('data-slug');
  if(!slug) return;
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function ping(kind,extra){
    try{
      var f=new FormData();
      f.append('form','log'); f.append('kind',kind);
      f.append('ref',document.referrer||''); f.append('detail',extra||'');
      if(navigator.sendBeacon) navigator.sendBeacon('/h/'+slug,f);
      else fetch('/h/'+slug,{method:'POST',body:f,keepalive:true}).catch(function(){});
    }catch(e){}
  }
  if(!lsGet('fhv_seen_'+slug)){ lsSet('fhv_seen_'+slug,'1'); ping('view',''); }

  /* The calculator. np_price arrives filled in, so it is not a signal on its
     own and is deliberately not in this list. */
  var watch=['np_loan','np_lc','np_bc','np_cl','np_rp'], fired=false;
  function check(){
    if(fired) return;
    var used=[];
    for(var i=0;i<watch.length;i++){
      var e=document.getElementById(watch[i]);
      if(e && String(e.value).trim()!=='' && (parseFloat(e.value)||0)>0) used.push(watch[i]);
    }
    if(!used.length) return;
    fired=true;
    var name={np_loan:'mortgage payoff',np_lc:'listing commission',np_bc:'buyer agent compensation',
              np_cl:'closing costs',np_rp:'repairs and credits'};
    ping('calc',used.map(function(k){return name[k];}).join(', '));
  }
  watch.forEach(function(id){
    var e=document.getElementById(id);
    if(e) e.addEventListener('change',check);
  });

  /* Did RPR actually fill its box? The widget gives no callback, so the only
     honest test is to look. Poll for eight seconds, then say so if it is still
     empty. A slow answer is not a missing one, which is why this waits rather
     than checking once. */
  var box=document.getElementById('rprWidgetContainer'), miss=document.getElementById('rprNone');
  if(box&&miss){
    var tries=0;
    var look=setInterval(function(){
      tries++;
      var got=(box.textContent||'').replace(/\s/g,'').length>8||box.querySelector('iframe,img,table');
      if(got){ clearInterval(look); return; }
      if(tries>=16){ clearInterval(look); miss.style.display=''; }
    },500);
  }
})();
`;

const HP_JS = `
(function(){
  /* the "what the county cannot see" adjuster */
  var out=document.getElementById('x_out');
  if(out){
    var base=+out.getAttribute('data-base'), lo=+out.getAttribute('data-lo'), hi=+out.getAttribute('data-hi');
    var m=function(n){return '$'+(Math.round(n/1000)*1000).toLocaleString('en-US');};
    var draw=function(){
      var up=0, boxes=document.querySelectorAll('.xf');
      for(var i=0;i<boxes.length;i++) if(boxes[i].checked) up+=parseFloat(boxes[i].getAttribute('data-up'))||0;
      var v=document.querySelector('.xv'), c=document.querySelector('.xc');
      var adj=up+(v?parseFloat(v.value)||0:0)+(c?parseFloat(c.value)||0:0);
      /* The cap has to apply to the TOTAL. The three boxes only add to 9%, so
         clamping them alone could never bind, and the view dropdown then added
         up to 4% more on top of a figure the page called capped at 12%. A
         downward condition adjustment is left alone. */
      if(adj>0.12) adj=0.12;
      var nb=base*(1+adj), nlo=lo*(1+adj), nhi=hi*(1+adj);
      var diff=nb-base;
      out.innerHTML='<div class="xbig">'+m(nb)+'</div>'
        +'<div class="xsub">'+m(nlo)+' to '+m(nhi)
        +(Math.abs(diff)>=1000?'  ·  '+(diff>0?'+':'\u2212')+m(Math.abs(diff))+' against the figure above':'')
        +'</div>';
    };
    var all=document.querySelectorAll('.xf,.xv,.xc');
    for(var j=0;j<all.length;j++) all[j].addEventListener('change',draw);
    draw();
  }
})();
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

    /* Michael's own two pages, both key-gated, both replacing endpoints that
       used to sit unauthenticated on fhv-lead-vault.cleirshusband.workers.dev.
       Checked before anything else so a scanner never reaches further in. */
    if (path === '/leads' || path === '/mark') {
      try {
        return await hpLeadsRoute(env, request, path);
      } catch (err) {
        return new Response('Not found', { status: 404 });
      }
    }

    /* /my-home is the address box, /h/<slug> is one owner's page. */
    const hpPath = path.toLowerCase();
    if (hpPath === '/my-home' || hpPath === '/my-home/suggest'
        || hpPath === '/h' || hpPath.indexOf('/h/') === 0) {
      try {
        const arg = hpPath.indexOf('/h/') === 0 ? path.slice(3)
                  : hpPath === '/h'             ? ''
                  :                               path.slice(1);
        return await hpRoute(env, request, arg);
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
            /* THIS WAS THE LAST THING ON THE SITE THAT POSTED TO THE VAULT.
               It now writes straight to D1 through the same function the
               personal pages use, so nothing on floridahomevalueai.com depends
               on a public endpoint any more and the workers.dev route can be
               switched off. notify stays 'pending' because this person left an
               email address and fhv-alerts should mail Michael about them. */
            await hpLog(env, {
              notify: 'pending',
              territory: 'Home search - new listing alert',
              community: q.get('city') || 'Southwest Florida',
              address: '',
              email: email,
              wants: 'Wants an alert when a new home matches: '
                   + (describeSearch(q) || 'their saved search'),
              raw: { kind: 'home-search', search: q.toString() }
            });
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
    const assetRes = await env.ASSETS.fetch(request);

    /* One link, sixty pages, added as each page streams out. */
    const ct = assetRes.headers.get('content-type') || '';
    if (ct.indexOf('text/html') === -1) return assetRes;
    return new HTMLRewriter()
      .on('nav[aria-label="Site links"]', {
        element(el) {
          el.prepend(
            '<a href="https://floridahomevalueai.com/my-home" style="font-size:13px;'
            + 'color:#fff;padding:4px 12px;border:1px solid #b07d2b;border-radius:999px;'
            + 'background:#b07d2b;text-decoration:none;font-weight:600;">My Home Page</a>',
            { html: true });
        }
      })
      .transform(assetRes);
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
