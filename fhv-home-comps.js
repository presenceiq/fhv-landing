/* FHV home-page address lookup.
   Types a house number, picks an address, gets the RPR estimate on the same
   page with recorded county comps beneath it.

   FHV never states a value. RPR gives the estimate and the range. The comps
   are context, so a visitor can see what that number is sitting against.

   Data: fhv-streets.js (street -> shard), fhv-p-<tag>.js (parcels, for the
   address list) and fhv-c-<tag>.js (parcels with type/pool plus qualified
   arm's-length sales, for the comps). */
(function(){
  var box = document.getElementById('fhv-addr');
  if(!box) return;
  var out = document.getElementById('fhv-result');

  var IDX=null, SHARDS=[], ROWS=[], COMP={}, LOADED={}, PEND={}, BUSY=false;

  function tidy(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
  function money(n){ return '$'+String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':s; return d.innerHTML; }

  var TYPE={'0100':'detached','TH':'townhome','0402':'villa or duplex condo',
            '0403':'condo, 2-3 stories','0404':'condo, 4-6 stories',
            '0405':'condo, 7+ stories','0407':'condo row house','0401':'detached condo'};

  function script(src, done){
    var s=document.createElement('script'); s.src=src;
    s.onload=done; s.onerror=done; document.head.appendChild(s);
  }

  function loadIndex(cb){
    if(IDX) return cb();
    if(BUSY) return setTimeout(function(){ loadIndex(cb); },120);
    BUSY=true;
    script('/fhv-streets.js?v=20260916a', function(){
      IDX=window.FHV_INDEX||null;
      if(IDX) SHARDS=IDX.shardList||[];
      cb();
    });
  }

  function tagsFor(st){
    var want=[],k;
    if(!IDX) return want;
    for(k in IDX.streets){
      if(k.indexOf(st)===0 || (k.length>3 && st.indexOf(k)===0)){
        for(var i=0;i<IDX.streets[k].length;i++){
          var t=SHARDS[IDX.streets[k][i]];
          if(t && want.indexOf(t)===-1) want.push(t);
        }
      }
      if(want.length>6) break;
    }
    return want;
  }

  function loadTag(tag, done){
    if(LOADED[tag]) return done();
    if(PEND[tag]) return PEND[tag].push(done);
    PEND[tag]=[done];
    var left=2, fin=function(){
      if(--left) return;
      LOADED[tag]=1;
      var p=window.FHV_P && window.FHV_P[tag];
      if(p && p.rows) ROWS=ROWS.concat(p.rows);
      var c=window.FHV_C && window.FHV_C[tag];
      if(c) COMP[tag]=c;
      var q=PEND[tag]; delete PEND[tag];
      for(var i=0;i<q.length;i++) q[i]();
    };
    script('/fhv-p-'+tag+'.js?v=20260916a', fin);
    script('/fhv-c-'+tag+'.js?v=20260921e', fin);
  }

  function ensure(st, cb){
    loadIndex(function(){
      var t=tagsFor(st), n=t.length;
      if(!n) return cb();
      t.forEach(function(x){ loadTag(x, function(){ if(--n===0) cb(); }); });
    });
  }

  function search(q){
    q=tidy(q); if(q.length<2) return [];
    var m=q.match(/^(\d+)\s*(.*)$/), res=[];
    for(var i=0;i<ROWS.length && res.length<8;i++){
      var r=ROWS[i];
      if(m){
        if(String(r[0]).indexOf(m[1])!==0) continue;
        if(m[2]){
          var rs=r[1].toUpperCase();
          if(rs.indexOf(m[2])!==0 && m[2].indexOf(rs)!==0) continue;
        }
      } else if(String(r[1]).toUpperCase().indexOf(q)!==0) continue;
      res.push(r);
    }
    return res;
  }

  function town(r){ return (IDX && IDX.zipCity && IDX.zipCity[r[8]]) || ''; }
  function full(r){
    var s=r[0]+' '+r[1]+(r[2]?' '+r[2]:''), t=town(r);
    return s + (t ? ', '+t+', FL '+r[8] : '');
  }

  /* ---- the comps rule, settled 20 Sep 2026 -------------------------------
     Same community. Same type, with townhome end and inside treated as one
     product. Within 500 sq ft. Same pool status. Qualified arm's-length
     sales only. Six months, widening to twelve only when short. Five max.
     Type, size and pool are NEVER relaxed - only the window moves. */
  /* Several condo units share one building address, so the unit decides which
     home this is. Audit on 5,000 addresses: ignoring it picked the wrong unit
     for 62% of unit owners. */
  function findSubject(tag, num, street, unit){
    var c=COMP[tag]; if(!c) return null;
    unit=unit||'';
    for(var com in c){
      var p=c[com].p;
      for(var i=0;i<p.length;i++)
        if(p[i][0]===num && p[i][1]===street && (p[i][2]||'')===unit) return { com:com, row:p[i] };
    }
    return null;
  }

  function comps(tag, subj){
    var set=COMP[tag] && COMP[tag][subj.com];
    if(!set) return { rows:[], window:null };
    var L=subj.row[3], K=subj.row[4], P=subj.row[5], N=subj.row[0], S=subj.row[1], U=subj.row[2]||'';
    /* Condo buildings have fixed floor plans, often exactly two sizes (Gran
       Paradiso: 1,706 downstairs, 2,187 upstairs, 481 apart). A 500 sq ft band
       let one plan comp against the other, so condos get 250. Houses and
       townhomes keep 500. Michael's call, 21 Sep 2026. */
    var BAND = (String(K).indexOf('04')===0) ? 250 : 500;
    var windows=[['2026-02-18','the last six months'],['2025-08-18','the last twelve months']];
    for(var w=0;w<windows.length;w++){
      var cut=windows[w][0], hit=[];
      for(var i=0;i<set.s.length;i++){
        var s=set.s[i];
        if(s[6] < cut) continue;
        if(s[0]===N && s[1]===S && (s[2]||'')===U) continue;   /* their own home only */
        if(s[4]!==K) continue;
        if(Math.abs(s[3]-L) > BAND) continue;
        if(s[5]!==P) continue;
        hit.push(s);
      }
      if(hit.length>=2){
        hit.sort(function(a,b){ return a[6]<b[6]?1:-1; });
        return { rows:hit.slice(0,5), window:windows[w][1] };
      }
    }
    return { rows:[], window:null };
  }

  function compTable(subj, res){
    var h='<div style="margin-top:1.6rem;">';
    h+='<div style="font-family:\'Playfair Display\',serif;font-size:1.45rem;font-weight:700;margin-bottom:.2rem;">'
      +'What sold near you</div>';
    h+='<p style="font-size:16px;color:var(--ink-mid,#4a4640);margin:0 0 .9rem;">'
      +'Recorded sales in '+esc(subj.com)+' over '+res.window+'. Same property type, within '+(String(subj.row[4]).indexOf('04')===0?'250':'500')+' square feet of yours, '
      +'and matching on whether there is a pool. Owner-to-owner sales only, straight from the Sarasota County roll.</p>';
    h+='<table style="width:100%;border-collapse:collapse;font-size:17px;">';
    h+='<tr style="text-align:left;border-bottom:2px solid #1a1814;">'
      +'<th style="padding:9px 8px;">Address</th><th style="padding:9px 8px;">Size</th>'
      +'<th style="padding:9px 8px;">Type</th><th style="padding:9px 8px;">Sold</th>'
      +'<th style="padding:9px 8px;text-align:right;">Price</th></tr>';
    res.rows.forEach(function(s){
      h+='<tr style="border-bottom:1px solid #e8e2d8;">'
        +'<td style="padding:10px 8px;">'+esc(s[0]+' '+s[1]+(s[2]?' #'+s[2]:''))+'</td>'
        +'<td style="padding:10px 8px;">'+s[3].toLocaleString()+' sq ft</td>'
        +'<td style="padding:10px 8px;">'+esc(TYPE[s[4]]||s[4])+(s[5]?', pool':'')+'</td>'
        +'<td style="padding:10px 8px;">'+esc(s[6])+'</td>'
        +'<td style="padding:10px 8px;text-align:right;font-weight:700;">'+money(s[7])+'</td></tr>';
    });
    h+='</table></div>';
    return h;
  }

  function noComps(subj){
    return '<div style="margin-top:1.6rem;">'
      +'<div style="font-family:\'Playfair Display\',serif;font-size:1.45rem;font-weight:700;margin-bottom:.2rem;">'
      +'No owner resale to compare yet</div>'
      +'<p style="font-size:16px;color:var(--ink-mid,#4a4640);margin:0;">'
      +'No home in '+esc(subj.com)+' of your type and size has been resold by its owner in the past twelve months. '
      +'In newer communities most sales are still the builder\'s, and a builder\'s price isn\'t a fair comparison '
      +'for a home that\'s already been lived in. In smaller communities it can simply be quiet. '
      +'<a href="/home-search" style="color:#b8722a;">See what\'s on the market now</a>, or call me and I\'ll '
      +'work out what the nearest sales say about your address.</p></div>';
  }


  /* ---- the result block -------------------------------------------------- */
  function brandHeader(addr){
    return '<div class="fhv-brand" style="border-bottom:1px solid #e8e2d8;padding-bottom:.8rem;margin-bottom:1.1rem;">'
      +'<div style="font-family:\'Playfair Display\',serif;font-weight:700;font-size:1.7rem;line-height:1.15;">'
      +'Putnam Realty Group</div>'
      +'<div style="font-size:1.05rem;color:var(--ink-mid,#4a4640);margin-top:.15rem;">'
      +'Michael Putnam &middot; 941-662-9941 &middot; floridahomevalueai.com</div>'
      +'<div style="font-family:\'Playfair Display\',serif;font-weight:800;font-size:1.3rem;margin-top:.9rem;">'
      +esc(addr)+'</div></div>';
  }

  function actions(addr){
    /* From their value straight to their own tax bill, with the address already
       in. utm_source makes the calculator's lead say where they came from. */
    var tax = addr ? ('<a href="/property-tax-calculator?addr=' + encodeURIComponent(addr)
      + '&utm_source=home%20page%20result" style="display:block;width:100%;box-sizing:border-box;'
      + 'text-align:center;font-size:17px;font-weight:700;padding:.85rem 1.3rem;border-radius:8px;'
      + 'background:#1a1814;color:#fff;text-decoration:none;margin-bottom:.2rem;">'
      + 'See what the amendment does to your tax bill &rarr;</a>') : '';
    return '<div class="fhv-actions" style="display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.5rem;">' + tax
      +'<button type="button" id="fhv-print" style="font-size:16px;font-weight:700;padding:.7rem 1.3rem;'
      +'border-radius:8px;border:1px solid #e8e2d8;background:#fff;cursor:pointer;">Print this</button>'
      +'<button type="button" id="fhv-drip" style="font-size:16px;font-weight:700;padding:.7rem 1.3rem;'
      +'border-radius:8px;border:0;background:#b8722a;color:#fff;cursor:pointer;">Email me when a home like mine sells</button>'
      +'<button type="button" id="fhv-call" style="font-size:16px;font-weight:700;padding:.7rem 1.3rem;'
      +'border-radius:8px;border:1px solid #b8722a;background:#fff;color:#1a1814;cursor:pointer;">Have Michael call me</button>'
      +'<a href="tel:9416629941" style="font-size:16px;font-weight:700;padding:.7rem 1.3rem;border-radius:8px;'
      +'border:1px solid #e8e2d8;background:#fff;color:#1a1814;text-decoration:none;">Call 941-662-9941</a></div>';
  }

  /* Two requests, named the way Michael works: a DRIP request (ongoing emails
     about homes like theirs, which he sets up in OneHome) and a CALL request.
     The labels in `wants` are what the fhv-alerts worker watches for, so it can
     send him "ACTION NEEDED" within minutes. Do not rename them without
     changing the worker too. */
  function askContact(kind, addr, community){
    var box=document.getElementById('fhv-drip').parentNode;
    var old=document.getElementById('fhv-em'); if(old) old.parentNode.removeChild(old);
    var drip=(kind==='drip');
    var d=document.createElement('div');
    d.id='fhv-em'; d.style.cssText='width:100%;margin-top:.8rem;';
    d.innerHTML=(drip ? '' : '<input id="fhv-em-name" type="text" autocomplete="given-name" placeholder="your first name (optional)" '
      +'style="font-size:17px;padding:.7rem;border:1px solid #e8e2d8;border-radius:8px;width:260px;max-width:100%;margin-bottom:.5rem;"><br>')
      +'<input id="fhv-em-in" type="'+(drip?'email':'tel')+'" placeholder="'
      +(drip?'your email':'your phone number')+'" style="font-size:17px;'
      +'padding:.7rem;border:1px solid #e8e2d8;border-radius:8px;width:260px;max-width:100%;"> '
      +'<button type="button" id="fhv-em-go" style="font-size:16px;font-weight:700;padding:.7rem 1.2rem;'
      +'border-radius:8px;border:0;background:#b8722a;color:#fff;cursor:pointer;">'+(drip?'Send me updates':'Call me')+'</button>'
      +'<div style="font-size:14px;color:#6b6560;margin-top:.5rem;">'
      +(drip ? 'Your email address stays with me. I never sell it, share it or give it to anyone, and every '
             +'message has an unsubscribe link.'
             : 'Your number stays with me. I only use it to call you about your home.')+'</div>';
    box.appendChild(d);
    document.getElementById(drip ? 'fhv-em-in' : 'fhv-em-name').focus();
    document.getElementById('fhv-em-go').onclick=function(){
      var v=(document.getElementById('fhv-em-in').value||'').trim();
      if(drip){ if(v.indexOf('@')<1) return; lead(addr, community||'', v, '', 'drip'); }
      else    { if(v.replace(/[^0-9]/g,'').length<10) return;
                var nm=((document.getElementById('fhv-em-name')||{}).value||'').trim().slice(0,60);
                lead(addr, community||'', '', v, 'call', nm); }
      d.innerHTML = drip
        ? '<div style="font-size:16px;">Got it. I\'ll set that up for you, usually the same day. You\'ll get an '
          +'email whenever a home like yours goes up for sale, cuts its price, goes under contract or sells.</div>'
        : '<div style="font-size:16px;">Got it. I\'ll call you, usually the same day. If it\'s easier, call or '
          +'text me any time at 941-662-9941.</div>';
    };
  }

  var LAST={comps:[], window:'', subj:null};
  function compsNote(){
    if(!LAST.comps.length) return 'No comparable sale in the last twelve months.';
    var t='Recorded sales in '+LAST.subjCom+' over '+LAST.window+': ';
    t+=LAST.comps.map(function(s){
      return s[0]+' '+s[1]+(s[2]?' #'+s[2]:'')+', '+s[3]+' sq ft, '+(TYPE[s[4]]||s[4])+(s[5]?' with pool':'')
             +', sold '+s[6]+' for '+money(s[7]);
    }).join(' | ');
    return t;
  }
  function lead(addr, community, email, phone, kind, name){
    /* The page fires on every load with ?addr= in it, so the back button, a
       refresh or reopening a saved link each sent another email about the same
       visit (Michael got four in a row, 21 Sep 2026). An anonymous lookup now
       sends once per address per browser every twelve hours. A visitor
       handing over their email always goes through. */
    if(!email && !phone){
      try{
        var k='fhv-lead:'+tidy(addr), last=+(localStorage.getItem(k)||0);
        if(Date.now()-last < 12*3600*1000) return;
        localStorage.setItem(k, String(Date.now()));
      }catch(e){}
    }
    try{
      fetch('https://fhv-lead-vault.cleirshusband.workers.dev/', {
        method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
        body: JSON.stringify({
          address: addr,
          subdivision: community || 'Florida',
          territory_id: 'HOME PAGE - address lookup with comps',
          estimated_value: rprValue() || '',
          sqft: LAST.subj ? String(LAST.subj[3]) : '',
          year_built: LAST.subj ? String(LAST.subj[6]) : '',
          property_type: LAST.subj ? (TYPE[LAST.subj[4]]||LAST.subj[4]) + (LAST.subj[5]?', pool':'') : '',
          homeowner_note: compsNote(),
          /* `insight` is the field the notification email actually prints, so the
             comps go there as well as in homeowner_note. */
          insight: (rprValue() ? ('RPR '+rprValue()+(rprRange()?', range '+rprRange():'')+'. ') : '')
                   + compsNote(),
          wants: kind==='drip' ? 'DRIP REQUEST - email me when a home like mine sells'
               : kind==='call' ? 'CALL REQUEST - have Michael call me'
               : 'HOME PAGE - address lookup with comps',
          email: email || '',
          phone: phone || '',
          name: name || '',
          agent_name:'Michael Putnam', agent_email:'michael@putnamrealtygroup.com'
        })
      });
    }catch(e){}
  }

  /* ---- the field --------------------------------------------------------- */
  var hits=document.createElement('div');
  hits.style.cssText='display:none;background:#fff;border:1px solid #e8e2d8;border-radius:8px;'
    +'box-shadow:0 6px 24px rgba(26,24,20,.13);max-height:320px;overflow:auto;margin:.4rem 0 0;text-align:left;';
  box.parentNode.insertBefore(hits, box.nextSibling);

  function draw(){
    var res=search(box.value);
    if(!res.length){ hits.style.display='none'; return; }
    hits.innerHTML='';
    res.forEach(function(r){
      var row=document.createElement('div');
      row.textContent=full(r);
      row.style.cssText='padding:12px 14px;cursor:pointer;font-size:17px;border-bottom:1px solid #e8e2d8;';
      row.onmouseover=function(){ row.style.background='#faf7f2'; };
      row.onmouseout=function(){ row.style.background='#fff'; };
      row.onmousedown=function(e){
        e.preventDefault();
        box.value=full(r); hits.style.display='none';
        /* Same route every RPR page on this site uses: the address goes into the
           URL and the page comes back with it. RPR reads it before load, which is
           the only way that widget can work. The comps then render underneath. */
        location.href = location.pathname + '?addr=' + encodeURIComponent(full(r)) + '#fhv-result';
      };
      hits.appendChild(row);
    });
    hits.style.display='block';
  }

  box.setAttribute('autocomplete','off');
  box.oninput=function(){
    var q=tidy(box.value), m=q.match(/^(\d+)\s*(.*)$/), st=m?m[2]:q;
    if(st && st.length>=2) ensure(st, function(){ if(tidy(box.value)===q) draw(); });
    draw();
  };
  box.onblur=function(){ setTimeout(function(){ hits.style.display='none'; },180); };



  /* RPR draws its own markup into #rprAvmWidget. If it lands in the page we can
     read it and both print it and send it. If they switch to a cross-origin
     frame one day, this returns nothing and the rest still works. */
  function rprNode(){ return document.getElementById('rprAvmWidget') || document.getElementById('rprWidgetContainer'); }
  function rprText(){
    var n=rprNode(); if(!n) return '';
    if(n.querySelector('iframe')) return '';          /* their frame, not ours to read */
    return (n.innerText||n.textContent||'').replace(/\s+/g,' ').trim();
  }
  function rprValue(){
    var t=rprText(); if(!t) return '';
    var m=t.match(/\$[\d,]{6,}/);                     /* the headline estimate */
    return m ? m[0] : '';
  }
  function rprRange(){
    var t=rprText(); if(!t) return '';
    var m=t.match(/\$[\d.]+K?\s*[–-]\s*\$[\d.]+K?/);
    return m ? m[0].replace(/\s+/g,' ') : '';
  }

  /* ---- print ---------------------------------------------------------------
     The sheet is copied into a hidden frame and that frame is printed. The
     page the visitor is looking at is never touched, so nothing moves. */
  (function(){
    window.fhvPrint=function(){
      var sheet=document.getElementById('fhv-sheet');
      if(!sheet) return;
      var old=document.getElementById('fhv-print-frame');
      if(old) old.parentNode.removeChild(old);

      var f=document.createElement('iframe');
      f.id='fhv-print-frame';
      f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);

      var body=sheet.cloneNode(true);
      var acts=body.querySelector('.fhv-actions');
      if(acts) acts.parentNode.removeChild(acts);

      /* the estimate lives outside the sheet on the page. Copying the whole
         widget brought its chart area along and pushed the comps onto page
         two, so print a compact line instead. */
      var v=rprValue(), r=rprRange();
      if(v){
        var t=rprText(), asof=(t.match(/as of\s*([0-9\/]+)/i)||[])[1]||'';
        var blk=document.createElement('div');
        blk.style.cssText='margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid #999;';
        blk.innerHTML='<div style="font-size:10pt;margin-bottom:2px;">Estimated value from RPR'
          +(asof?', as of '+asof:'')+'</div>'
          +'<div style="font-size:18pt;font-weight:700;line-height:1.2;">'+v+'</div>'
          +(r?'<div style="font-size:10.5pt;">Range '+r+'</div>':'');
        var br=body.querySelector('.fhv-brand');
        if(br && br.nextSibling) body.insertBefore(blk, br.nextSibling); else body.appendChild(blk);
      }

      var css='@page{margin:0.6in;}'
        +'body{font-family:Lato,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
        +'font-size:11pt;line-height:1.5;color:#000;margin:0;}'
        +'table{width:100%;border-collapse:collapse;font-size:10.5pt;page-break-inside:avoid;}'
        +'tr{page-break-inside:avoid;}'
        +'h1,h2,h3,div{page-break-after:avoid;}'
        +'th{text-align:left;border-bottom:2px solid #000;padding:7px 6px;}'
        +'td{border-bottom:1px solid #999;padding:8px 6px;}'
        +'a{color:#000;text-decoration:none;}'
        +'.fhv-brand{border-bottom:1px solid #000 !important;padding-bottom:10px;margin-bottom:14px;}';

      var d=f.contentWindow.document;
      d.open();
      d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'
        +document.title.replace(/[<>]/g,'')+'</title><style>'+css+'</style></head><body></body></html>');
      d.close();
      d.body.appendChild(d.importNode(body, true));

      var go=function(){
        try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){}
        setTimeout(function(){ if(f.parentNode) f.parentNode.removeChild(f); }, 1500);
      };
      if(d.readyState==='complete') setTimeout(go,60); else f.onload=function(){ setTimeout(go,60); };
    };
  })();

  /* ---- on arrival with an address, draw the comps -------------------------- */
  (function(){
    var q=new URLSearchParams(location.search);
    var addr=q.get('addr')||q.get('address');
    if(!addr || !out) return;
    box.value=addr;
    var t=tidy(addr), m=t.match(/^(\d+)\s*(.*)$/);
    if(!m) return;
    var num=m[1], rest=m[2];
    ensure(rest, function(){
      var tags=tagsFor(rest), subj=null, tag=null, best=null, bestLen=-1;
      for(var j=0;j<ROWS.length;j++){
        var r=ROWS[j];
        if(String(r[0])!==num) continue;
        var key=tidy(r[0]+' '+r[1]+(r[2]?' '+r[2]:''));
        if(t!==key && t.indexOf(key+' ')!==0) continue;
        if(key.length>bestLen){ best=r; bestLen=key.length; }
      }
      if(best){
        for(var i=0;i<tags.length && !subj;i++){
          subj=findSubject(tags[i], best[0], best[1], best[2]);
          if(subj) tag=tags[i];
        }
      }
      if(!subj){
        /* 6% of houses sit in subdivisions the comp data doesn't cover. Say so,
           rather than showing the estimate and then nothing. */
        out.innerHTML = '<div id="fhv-sheet" style="background:#fff;border:1px solid #e8e2d8;border-radius:12px;'
          + 'padding:1.4rem 1.5rem;margin-top:1.6rem;text-align:left;box-shadow:0 2px 16px rgba(26,24,20,.07);">'
          + brandHeader(addr)
          + '<p style="font-size:17px;margin:0;">I don\'t have recorded sales mapped for this address yet, so there '
          + 'are no comparable sales to show here. The estimate above still applies. If you want to know what '
          + 'the nearest sales say about your home, call or text me and I\'ll pull them myself.</p>'
          + actions(addr) + '</div>';
        document.getElementById('fhv-print').onclick=function(){ window.fhvPrint(); };
        document.getElementById('fhv-drip').onclick=function(){ askContact('drip', addr, ''); };
        document.getElementById('fhv-call').onclick=function(){ askContact('call', addr, ''); };
        LAST={comps:[],window:'',subj:null,subjCom:''};
        setTimeout(function(){ lead(addr,''); },1800);
        return;
      }
      var res=comps(tag, subj);
      LAST={comps:res.rows, window:res.window||'', subj:subj.row, subjCom:subj.com};
      out.innerHTML = '<div id="fhv-sheet" style="background:#fff;border:1px solid #e8e2d8;border-radius:12px;'
        + 'padding:1.4rem 1.5rem;margin-top:1.6rem;text-align:left;box-shadow:0 2px 16px rgba(26,24,20,.07);">'
        + brandHeader(addr)
        + (res.rows.length ? compTable(subj,res) : noComps(subj))
        + '<p style="font-size:14px;color:#6b6560;margin-top:1.4rem;">'
        + 'Recorded transactions from Sarasota County public records, owner to owner, builder sales excluded. '
        + 'Not an appraisal. County records cannot see condition, upgrades, roof age or view, and those are '
        + 'usually what separates two homes that look identical on paper.</p>'
        + actions(addr) + '</div>';
      document.getElementById('fhv-print').onclick=function(){ window.fhvPrint(); };
      document.getElementById('fhv-drip').onclick=function(){ askContact('drip', addr, subj.com); };
      document.getElementById('fhv-call').onclick=function(){ askContact('call', addr, subj.com); };
      setTimeout(function(){ lead(addr, subj.com); }, 1800);
    });
  })();
})();
