/* FHV address suggestions for the RPR pages.
   The tax calculator already carries a street index and per-street parcel
   shards for Sarasota, Charlotte and Manatee. This reuses them so that a
   visitor in those three counties can type a house number and pick their
   address, instead of having to type it perfectly for RPR to match it.
   Outside the three counties nothing appears and the box behaves as before. */
(function(){
  var box = document.getElementById('rpr-address');
  if(!box) return;

  var STREETS=null, SHARDS=[], P=null, R=[], LOADED={}, PENDING={}, INDEXING=false;

  var hits = document.createElement('div');
  hits.style.cssText = 'display:none;background:#fff;border:1px solid #e8e2d8;border-radius:8px;'
                     + 'box-shadow:0 6px 24px rgba(26,24,20,.13);max-height:320px;overflow:auto;'
                     + 'margin:0 0 10px;';

  /* TEMPORARY DIAGNOSTIC - remove once the cause is known. Writes what the
     script can see directly onto the page, because the console showed nothing. */
  var dbg=document.createElement('div');
  dbg.style.cssText='font:12px monospace;color:#b8722a;margin-top:6px;';
  dbg.textContent='[suggest] script running';
  box.parentNode.insertBefore(dbg, box.nextSibling);
  var LOG=[];
  function say(t){ LOG.push(t); if(LOG.length>6) LOG.shift();
                   dbg.innerHTML='[suggest] '+LOG.join('<br>[suggest] '); }
  box.parentNode.style.position = 'relative';
  box.parentNode.insertBefore(hits, box.nextSibling);

  function tidy(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }

  function loadIndex(cb){
    if(STREETS) return cb();
    if(INDEXING) return setTimeout(function(){ loadIndex(cb); }, 120);
    INDEXING = true;
    var sc=document.createElement('script');
    sc.src='/fhv-streets.js?v=20260916a';
    sc.onload=function(){
      var H=window.FHV_INDEX||null;
      if(H){ STREETS=H.streets; SHARDS=H.shardList||[]; P=H; say('index v'+H.v+' loaded, '+Object.keys(H.streets).length+' streets'); }
      else { say('index script loaded but FHV_INDEX missing'); }
      cb();
    };
    sc.onerror=function(){ say('index FAILED to load'); cb(); };
    document.head.appendChild(sc);
  }

  function shardsFor(st){
    var want=[],k;
    if(!STREETS) return want;
    for(k in STREETS){
      if(k.indexOf(st)===0 || (k.length>3 && st.indexOf(k)===0)){
        for(var i=0;i<STREETS[k].length;i++){
          var tag=SHARDS[STREETS[k][i]];
          if(tag && want.indexOf(tag)===-1) want.push(tag);
        }
      }
      if(want.length>8) break;
    }
    return want;
  }

  function loadShard(tag, done){
    if(LOADED[tag]){ done(); return; }
    if(PENDING[tag]){ PENDING[tag].push(done); return; }
    PENDING[tag]=[done];
    var sc=document.createElement('script');
    sc.src='/fhv-p-'+tag+'.js?v=20260916a';
    sc.onload=function(){
      LOADED[tag]=1;
      var pack=window.FHV_P && window.FHV_P[tag];
      if(pack && pack.rows){ R=R.concat(pack.rows); say('shard '+tag+' loaded, '+R.length+' parcels'); } else { say('shard '+tag+' loaded but no rows'); }
      var q=PENDING[tag]; delete PENDING[tag];
      for(var i=0;i<q.length;i++) q[i]();
    };
    sc.onerror=function(){
      LOADED[tag]=1;
      var q=PENDING[tag]; delete PENDING[tag];
      for(var i=0;i<q.length;i++) q[i]();
    };
    document.head.appendChild(sc);
  }

  function ensure(st, cb){
    loadIndex(function(){
      var tags=shardsFor(st), left=tags.length;
      say('street "'+st+'" -> '+(tags.length?tags.join(','):'NO SHARD'));
      if(!left) return cb();
      tags.forEach(function(t){ loadShard(t, function(){ if(--left===0) cb(); }); });
    });
  }

  function streetMatch(full, typed){
    if(!typed) return true;
    return full.toUpperCase().indexOf(typed)===0;
  }

  function search(q){
    q=tidy(q);
    if(q.length<2) return [];
    var m=q.match(/^(\d+)\s*(.*)$/), res=[];
    for(var i=0;i<R.length && res.length<8;i++){
      var r=R[i];
      if(m){
        if(String(r[0]).indexOf(m[1])!==0) continue;
        if(!streetMatch(r[1], m[2])) continue;
      } else {
        if(String(r[1]).toUpperCase().indexOf(q)!==0) continue;
      }
      res.push(r);
    }
    return res;
  }

  function zipCity(){ return (P && P.zipCity) || {}; }
  function town(r){ return zipCity()[r[8]] || ''; }

  /* RPR needs street, city, state, ZIP. This is the whole point of the
     exercise: the visitor types a house number and RPR gets a full address. */
  function fullAddress(r){
    var street = r[0]+' '+r[1]+(r[2] ? ' '+r[2] : '');
    var t = town(r);
    return street + (t ? ', '+t+', FL '+r[8] : '');
  }

  function show(){
    var res=search(box.value);
    say('typed "'+box.value+'" - '+R.length+' parcels in memory - '+res.length+' matches');
    if(!res.length){ hits.style.display='none'; return; }
    hits.innerHTML='';
    res.forEach(function(r){
      var row=document.createElement('div');
      row.textContent=fullAddress(r);
      row.style.cssText='padding:11px 13px;cursor:pointer;font-size:15px;border-bottom:1px solid #e8e2d8;background:#fff;';
      row.onmouseover=function(){ row.style.background='#faf7f2'; };
      row.onmouseout =function(){ row.style.background='#fff'; };
      row.onmousedown=function(e){
        e.preventDefault();
        box.value=fullAddress(r);
        hits.style.display='none';
      };
      hits.appendChild(row);
    });
    hits.style.display='block';
  }

  box.setAttribute('autocomplete','off');
  box.oninput=function(){
    var q=tidy(box.value), m=q.match(/^(\d+)\s*(.*)$/), st=m?m[2]:q;
    if(st && st.length>=2){ ensure(st, function(){ if(tidy(box.value)===q) show(); }); }
    show();
  };
  box.onblur=function(){ setTimeout(function(){ hits.style.display='none'; },180); };
})();
