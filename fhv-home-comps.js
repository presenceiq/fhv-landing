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
            '0403':'condo, 2-3 storeys','0404':'condo, 4-6 storeys',
            '0405':'condo, 7+ storeys','0407':'condo row house','0401':'detached condo'};

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
    script('/fhv-c-'+tag+'.js?v=20260920a', fin);
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
  function findSubject(tag, num, street){
    var c=COMP[tag]; if(!c) return null;
    for(var com in c){
      var p=c[com].p;
      for(var i=0;i<p.length;i++)
        if(p[i][0]===num && p[i][1]===street) return { com:com, row:p[i] };
    }
    return null;
  }

  function comps(tag, subj){
    var set=COMP[tag] && COMP[tag][subj.com];
    if(!set) return { rows:[], window:null };
    var L=subj.row[3], K=subj.row[4], P=subj.row[5], N=subj.row[0], S=subj.row[1];
    var windows=[['2026-02-18','the last six months'],['2025-08-18','the last twelve months']];
    for(var w=0;w<windows.length;w++){
      var cut=windows[w][0], hit=[];
      for(var i=0;i<set.s.length;i++){
        var s=set.s[i];
        if(s[5] < cut) continue;
        if(s[0]===N && s[1]===S) continue;
        if(s[3]!==K) continue;
        if(Math.abs(s[2]-L) > 500) continue;
        if(s[4]!==P) continue;
        hit.push(s);
      }
      if(hit.length>=2){
        hit.sort(function(a,b){ return a[5]<b[5]?1:-1; });
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
      +'Recorded sales in '+esc(subj.com)+' over '+res.window+'. Same property type, within 500 square feet of yours, '
      +'and matching on whether there is a pool. Owner-to-owner sales only, straight from the Sarasota County roll.</p>';
    h+='<table style="width:100%;border-collapse:collapse;font-size:17px;">';
    h+='<tr style="text-align:left;border-bottom:2px solid #1a1814;">'
      +'<th style="padding:9px 8px;">Address</th><th style="padding:9px 8px;">Size</th>'
      +'<th style="padding:9px 8px;">Type</th><th style="padding:9px 8px;">Sold</th>'
      +'<th style="padding:9px 8px;text-align:right;">Price</th></tr>';
    res.rows.forEach(function(s){
      h+='<tr style="border-bottom:1px solid #e8e2d8;">'
        +'<td style="padding:10px 8px;">'+esc(s[0]+' '+s[1])+'</td>'
        +'<td style="padding:10px 8px;">'+s[2].toLocaleString()+' sq ft</td>'
        +'<td style="padding:10px 8px;">'+esc(TYPE[s[3]]||s[3])+(s[4]?', pool':'')+'</td>'
        +'<td style="padding:10px 8px;">'+esc(s[5])+'</td>'
        +'<td style="padding:10px 8px;text-align:right;font-weight:700;">'+money(s[6])+'</td></tr>';
    });
    h+='</table></div>';
    return h;
  }

  function noComps(subj){
    return '<div style="margin-top:1.6rem;">'
      +'<div style="font-family:\'Playfair Display\',serif;font-size:1.45rem;font-weight:700;margin-bottom:.2rem;">'
      +'Nothing comparable has sold here recently</div>'
      +'<p style="font-size:16px;color:var(--ink-mid,#4a4640);margin:0;">'
      +'No home in '+esc(subj.com)+' of your type and size has changed hands in the past twelve months. '
      +'That happens in smaller communities and with larger homes. '
      +'<a href="/home-search" style="color:#b8722a;">See what is on the market now</a>, or call me and I will '
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

  function actions(){
    return '<div class="fhv-actions" style="display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.5rem;">'
      +'<button type="button" id="fhv-print" style="font-size:16px;font-weight:700;padding:.7rem 1.3rem;'
      +'border-radius:8px;border:1px solid #e8e2d8;background:#fff;cursor:pointer;">Print this</button>'
      +'<button type="button" id="fhv-email" style="font-size:16px;font-weight:700;padding:.7rem 1.3rem;'
      +'border-radius:8px;border:0;background:#b8722a;color:#fff;cursor:pointer;">Email it to me</button>'
      +'<a href="tel:9416629941" style="font-size:16px;font-weight:700;padding:.7rem 1.3rem;border-radius:8px;'
      +'border:1px solid #e8e2d8;background:#fff;color:#1a1814;text-decoration:none;">Call 941-662-9941</a></div>';
  }

  function askEmail(addr, community){
    var box=document.getElementById('fhv-email').parentNode;
    if(document.getElementById('fhv-em')) return;
    var d=document.createElement('div');
    d.id='fhv-em'; d.style.cssText='width:100%;margin-top:.8rem;';
    d.innerHTML='<input id="fhv-em-in" type="email" placeholder="your email" style="font-size:17px;'
      +'padding:.7rem;border:1px solid #e8e2d8;border-radius:8px;width:260px;max-width:100%;"> '
      +'<button type="button" id="fhv-em-go" style="font-size:16px;font-weight:700;padding:.7rem 1.2rem;'
      +'border-radius:8px;border:0;background:#b8722a;color:#fff;cursor:pointer;">Send it</button>'
      +'<div style="font-size:14px;color:#6b6560;margin-top:.5rem;">'
      +'Your email address stays with me. I never sell it, share it or give it to anyone, and every '
      +'message has an unsubscribe link.</div>';
    box.appendChild(d);
    document.getElementById('fhv-em-go').onclick=function(){
      var v=(document.getElementById('fhv-em-in').value||'').trim();
      if(v.indexOf('@')<1) return;
      lead(addr, community||'', v);
      /* Michael sends this himself from his own inbox. Do not claim an
         automatic email until the lead vault knows about this lead type. */
      d.innerHTML='<div style="font-size:16px;">Got it. I will send this to you, '
        +'usually within the hour. If you want it sooner, call 941-662-9941.</div>';
    };
  }

  function lead(addr, community, email){
    try{
      fetch('https://fhv-lead-vault.cleirshusband.workers.dev/', {
        method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
        body: JSON.stringify({
          address: addr,
          subdivision: community || 'Florida',
          territory_id: 'HOME PAGE - address lookup with comps',
          wants: email ? 'HOME PAGE - emailed the result to themselves' : 'HOME PAGE - address lookup with comps',
          email: email || '',
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


  /* ---- print only the result sheet ---------------------------------------
     Hiding by visibility leaves the layout in place and prints blank pages.
     Mark every element that is not the sheet, an ancestor of it, or inside
     it, and remove those for the print only. */
  (function(){
    var st=document.createElement('style');
    st.textContent='@media print{'
      +'.fhv-noprint{display:none !important;}'
      +'#fhv-sheet{border:0 !important;box-shadow:none !important;padding:0 !important;margin:0 !important;'
      +'width:100% !important;max-width:100% !important;position:static !important;}'
      +'#fhv-sheet,#fhv-sheet *{overflow:visible !important;}'
      +'#fhv-sheet table{width:100% !important;font-size:11pt !important;}'
      +'#fhv-sheet .fhv-actions{display:none !important;}'
      +'#fhv-sheet .fhv-brand{border-bottom:1px solid #000 !important;}'
      +'#fhv-sheet a{text-decoration:none !important;color:#000 !important;}'
      +'@page{margin:0.6in;}'
      +'}';
    document.head.appendChild(st);
    window.fhvPrint=function(){
      var sheet=document.getElementById('fhv-sheet');
      if(!sheet){ window.print(); return; }
      var keep=[], n=sheet;
      while(n && n!==document.documentElement){ keep.push(n); n=n.parentNode; }
      var all=document.body.querySelectorAll('*'), marked=[];
      for(var i=0;i<all.length;i++){
        var e=all[i];
        if(keep.indexOf(e)!==-1) continue;
        if(sheet.contains(e)) continue;
        e.classList.add('fhv-noprint'); marked.push(e);
      }
      for(var k=0;k<keep.length;k++){ keep[k].style.maxWidth='100%'; keep[k].style.width='100%'; }
      window.print();
      setTimeout(function(){ for(var i=0;i<marked.length;i++) marked[i].classList.remove('fhv-noprint'); }, 600);
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
      var tags=tagsFor(rest), subj=null, tag=null;
      for(var i=0;i<tags.length && !subj;i++){
        for(var j=0;j<ROWS.length;j++){
          var r=ROWS[j];
          if(String(r[0])!==num) continue;
          if(rest.indexOf(r[1].toUpperCase())!==0) continue;
          subj=findSubject(tags[i], r[0], r[1]);
          if(subj){ tag=tags[i]; break; }
        }
      }
      if(!subj){ lead(addr,''); return; }   /* outside the comp data, still a real lookup */
      var res=comps(tag, subj);
      out.innerHTML = '<div id="fhv-sheet" style="background:#fff;border:1px solid #e8e2d8;border-radius:12px;'
        + 'padding:1.4rem 1.5rem;margin-top:1.6rem;text-align:left;box-shadow:0 2px 16px rgba(26,24,20,.07);">'
        + brandHeader(addr)
        + (res.rows.length ? compTable(subj,res) : noComps(subj))
        + '<p style="font-size:14px;color:#6b6560;margin-top:1.4rem;">'
        + 'Recorded transactions from Sarasota County public records, owner to owner, builder sales excluded. '
        + 'Not an appraisal. County records cannot see condition, upgrades, roof age or view, and those are '
        + 'usually what separates two homes that look identical on paper.</p>'
        + actions() + '</div>';
      document.getElementById('fhv-print').onclick=function(){ window.fhvPrint(); };
      document.getElementById('fhv-email').onclick=function(){ askEmail(addr, subj.com); };
      lead(addr, subj.com);
    });
  })();
})();
