(function(){
  // Starts with a number, has at least two words, and is long enough to be real.
  // Blocks "123" and stray keystrokes; allows "3716 Beeber St North Port" with no ZIP.
  window.fhvLooksLikeAddress = function(a){
    a=(a||'').trim();
    if(!/^\d/.test(a)) return false;
    if(a.length < 8) return false;
    return a.split(/\s+/).length >= 2;
  };
})();
/* FHV shared address-capture for catch-all estimate pages.
   A page opts in by: (1) including this script, (2) setting window.FHV_TERRITORY (and optional FHV_SUBDIVISION),
   (3) having an #rpr-address input plus a button that calls goRpr().
   On a sufficient address (house number + ZIP) it logs an address-only lead to the worker, then runs the RPR estimate. */
(function(){
  window.goRpr = function(){
    var addr=(document.getElementById('rpr-address').value||'').trim();
    if(!addr){return;}
    var T=window.FHV_TERRITORY||'Florida (catch-all)';
    var SUB=window.FHV_SUBDIVISION||'Florida';
    if(fhvLooksLikeAddress(addr)){
      try{
        fetch("https://fhv-lead-vault.cleirshusband.workers.dev/",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,
          body:JSON.stringify({name:"",phone:"",email:"",address:addr,territory_id:T+" - address-only",subdivision:SUB,
          wants:"Instant estimate requested - address only, no contact given yet",agent_name:"Michael Putnam",agent_email:"michael@putnamrealtygroup.com"})}).catch(function(){});
      }catch(e){}
    }
    location.href=location.pathname+'?addr='+encodeURIComponent(addr)+'#estimate';
  };
  // Capture-only (no navigation) - for pages that run their own estimate flow (e.g. coming-soon RPR pages).
  window.fhvCaptureAddress = function(addr){
    addr=(addr||'').trim(); if(!addr) return;
    var T=window.FHV_TERRITORY||'Florida (catch-all)';
    var SUB=window.FHV_SUBDIVISION||'Florida';
    if(fhvLooksLikeAddress(addr)){
      try{ fetch("https://fhv-lead-vault.cleirshusband.workers.dev/",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,
        body:JSON.stringify({name:"",phone:"",email:"",address:addr,territory_id:T+" - address-only",subdivision:SUB,
        wants:"Instant estimate requested - address only, no contact given yet",agent_name:"Michael Putnam",agent_email:"michael@putnamrealtygroup.com"})}).catch(function(){}); }catch(e){}
    }
  };
})();

/* ---- HOMEOWNER ASSESSMENT (opt-in per page via window.FHV_ASSESS = true) ----
   Shows AFTER the estimate renders. No gate: the visitor already has their number.
   Step 1 = one tap (Too high / About right / Too low) -> logged immediately.
   Step 2 = optional note + optional email -> logged on Send. Both skippable. */
(function fhvAssessModule(){
  function post(payload){
    var T=window.FHV_TERRITORY||'Florida (catch-all)';
    var SUB=window.FHV_SUBDIVISION||'Florida';
    var body={name:"",phone:"",email:"",address:payload.address||"",
      territory_id:T+" - "+(payload.tag||"assessment"),subdivision:SUB,
      wants:payload.wants||"",homeowner_assessment:payload.assessment||"",
      homeowner_note:payload.note||"",agent_name:"Michael Putnam",
      agent_email:"michael@putnamrealtygroup.com"};
    if(payload.email) body.email=payload.email;
    try{
      return fetch("https://fhv-lead-vault.cleirshusband.workers.dev/",
        {method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,
         body:JSON.stringify(body)});
    }catch(e){ return null; }
  }
 function build(){
    if(!window.FHV_ASSESS) return;
    var qs=new URLSearchParams(window.location.search);
    var p=qs.get('address')||qs.get('addr');         // two page patterns in use
    if(!p) return;                                   // only after an estimate was requested
    var addr=decodeURIComponent(p);
    var host=document.getElementById('rprWidgetContainer')
          || document.getElementById('rprAvmWidget')
          || document.getElementById('estimate');
    if(!host||document.getElementById('fhv-assess')) return;

    var css='<style>'
      +'#fhv-assess{max-width:620px;margin:1.25rem auto 0;background:#fff;border:1px solid #e8e2d8;border-left:3px solid #b8722a;border-radius:12px;padding:1.25rem 1.35rem;font-family:Lato,sans-serif;box-shadow:0 2px 16px rgba(26,24,20,.08);}'
      +'#fhv-assess .q{font-size:1.05rem;font-weight:700;color:#1a1814;margin-bottom:.25rem;}'
      +'#fhv-assess .sub{font-size:13px;color:#6b6560;margin-bottom:.9rem;}'
      +'#fhv-assess .btns{display:flex;flex-wrap:wrap;gap:.5rem;}'
      +'#fhv-assess .btns button{flex:1 1 30%;min-width:100px;padding:11px 10px;font-size:15px;font-weight:700;font-family:Lato,sans-serif;color:#1a1814;background:#faf7f2;border:1px solid #b8722a;border-radius:999px;cursor:pointer;}'
      +'#fhv-assess .btns button:hover{background:#b8722a;color:#fff;}'
      +'#fhv-assess .btns button.on{background:#b8722a;color:#fff;}'
      +'#fhv-assess label{display:block;font-size:13px;color:#4a4640;margin:1rem 0 .35rem;font-weight:700;}'
      +'#fhv-assess textarea,#fhv-assess input{width:100%;padding:10px 12px;border:1px solid #e8e2d8;border-radius:8px;font-size:15px;font-family:Lato,sans-serif;color:#1a1814;background:#fff;}'
      +'#fhv-assess textarea{min-height:76px;resize:vertical;}'
      +'#fhv-assess .send{margin-top:.9rem;padding:11px 22px;font-size:15px;font-weight:700;font-family:Lato,sans-serif;color:#fff;background:#b8722a;border:none;border-radius:999px;cursor:pointer;}'
      +'#fhv-assess .send:hover{background:#d4904a;}'
      +'#fhv-assess .skip{font-size:12px;color:#9a948e;margin-top:.6rem;}'
      +'#fhv-assess .status{font-size:15px;color:#4a7c59;font-weight:700;margin-top:.9rem;padding:.7rem .9rem;border-radius:8px;background:rgba(74,124,89,.1);}'
      +'</style>';

    var html=css
      +'<div id="fhv-assess">'
      +'  <div class="q">Does that look about right to you?</div>'
      +'  <div class="sub">One tap. Your answer helps me understand this market, and it tells me where the automated number tends to miss.</div>'
      +'  <div class="btns">'
      +'    <button type="button" data-v="Too high">Too high</button>'
      +'    <button type="button" data-v="About right">About right</button>'
      +'    <button type="button" data-v="Too low">Too low</button>'
      +'  </div>'
      +'  <div id="fhv-step2" style="display:none;">'
      +'    <label for="fhv-note">Anything the estimate cannot see? Lot, view, upgrades, condition. (optional)</label>'
      +'    <textarea id="fhv-note" placeholder="Preserve lot, new roof in 2024, remodeled kitchen..."></textarea>'
      +'    <label for="fhv-email">Want me to send you a refined estimate? (optional)</label>'
      +'    <input id="fhv-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">'
      +'    <button type="button" class="send" id="fhv-send">Send this to Michael</button>'
      +'    <div class="skip">Completely optional. You already have your estimate either way.</div>'
      +'    <div class="status" id="fhv-status" style="display:none;"></div>'
      +'  </div>'
      +'</div>';

    var wrap=document.createElement('div');
    wrap.innerHTML=html;
    host.parentNode.insertBefore(wrap,host.nextSibling);

    var chosen='', sent=false;
    var btns=wrap.querySelectorAll('.btns button');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click',function(){
        chosen=this.getAttribute('data-v');          // record only - no send yet
        for(var j=0;j<btns.length;j++){ btns[j].className=''; }
        this.className='on';
        document.getElementById('fhv-step2').style.display='block';
      });
    }

    // Send ONE record, either when they submit, or when they leave the page.
    function flush(){
      if(sent || !chosen) return;
      sent=true;
      post({address:addr,assessment:chosen,tag:"assessment",
            wants:"Homeowner said the instant estimate looks: "+chosen});
    }
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState==='hidden') flush();
    });
    window.addEventListener('pagehide',flush);

    var send=document.getElementById('fhv-send');
    send.addEventListener('click',function(){
      var note=(document.getElementById('fhv-note').value||'').trim();
      var email=(document.getElementById('fhv-email').value||'').trim();
      var st=document.getElementById('fhv-status'); st.style.display='block';
      if(!note && !email){ st.style.color='#8a5a1a'; st.textContent='Add a note or an email first, or you are all set as is.'; return; }
      send.disabled=true; sent=true; st.style.color='#4a4640'; st.textContent='Sending...';
      var r=post({address:addr,assessment:chosen,note:note,email:email,tag:"assessment + detail",
        wants:"Homeowner assessment: "+(chosen||"not answered")+(email?" | asked for a refined estimate":"")});
      function done(){ st.style.color='#4a7c59';
        st.textContent=email?'Got it. I will look at your address and send you a refined estimate.':'Got it. Thank you, that helps.';
        document.getElementById('fhv-note').disabled=true;
        document.getElementById('fhv-email').disabled=true;
        try{ st.scrollIntoView({behavior:'smooth',block:'center'}); }catch(e){ st.scrollIntoView(); } }
      if(r&&r.then){ r.then(done).catch(done); } else { done(); }
    });
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',build); }
  else { build(); }
})();

/* ---- STREET ALERTS ---------------------------------------------------------
   Sits BELOW the assessment box. The assessment asks for a tap first and only
   then shows an email field, so 62 of 66 visitors never saw one. This offers a
   different thing - ongoing alerts rather than a refined estimate - with the
   email field visible from the start and nothing to tap first.
   Nothing is gated. The estimate above is already theirs.                    */
(function fhvAlertModule(){
  function build(){
    var qs=new URLSearchParams(window.location.search);
    var p=qs.get('address')||qs.get('addr');
    if(!p) return;                                   // only after an estimate
    var addr=decodeURIComponent(p);
    if(document.getElementById('fhv-alert')) return;

    var T   = window.FHV_TERRITORY   || 'Florida (catch-all)';
    var SUB = window.FHV_SUBDIVISION || '';
    var named = /coming-soon/i.test(T) && SUB && SUB !== 'Florida';
    /* a named community can be watched whole; a catch-all cannot, so it gets a
       wider radius instead */
    var defRadius = named ? 'half a mile' : 'one mile';

    var css='<style>'
      +'#fhv-alert{max-width:620px;margin:1.25rem auto 0;background:#fff;border:1px solid #e8e2d8;border-left:3px solid #b8722a;border-radius:12px;padding:1.25rem 1.35rem;font-family:Lato,sans-serif;box-shadow:0 2px 16px rgba(26,24,20,.08);}'
      +'#fhv-alert .q{font-size:1.05rem;font-weight:700;color:#1a1814;margin-bottom:.25rem;}'
      +'#fhv-alert .sub{font-size:13px;color:#6b6560;line-height:1.55;margin-bottom:.9rem;}'
      +'#fhv-alert input[type=email]{width:100%;padding:11px 12px;border:1px solid #e8e2d8;border-radius:8px;font-size:15px;font-family:Lato,sans-serif;box-sizing:border-box;margin-bottom:.75rem;}'
      +'#fhv-alert .opt{font-size:14px;color:#1a1814;margin-bottom:.85rem;}'
      +'#fhv-alert .opt label{display:block;margin-bottom:.3rem;cursor:pointer;}'
      +'#fhv-alert .opt input{margin-right:.45rem;}'
      +'#fhv-alert .send{width:100%;padding:11px 22px;font-size:15px;font-weight:700;font-family:Lato,sans-serif;color:#fff;background:#b8722a;border:none;border-radius:999px;cursor:pointer;}'
      +'#fhv-alert .send:hover{background:#d4904a;}'
      +'#fhv-alert .fine{font-size:12px;line-height:1.5;color:#9a948e;margin-top:.75rem;}'
      +'#fhv-alert .msg{font-size:14px;margin-top:.6rem;}'
      +'</style>';

    var html=css
      +'<div id="fhv-alert">'
      +'  <div class="q">Know what happens near your home before anyone else</div>'
      +'  <div class="sub">When a home goes on the market, a price gets cut, something goes under contract, '
      +'or something closes and for how much. Most of that never reaches you until it is over.</div>'
      +'  <input id="fhv-alert-email" type="email" inputmode="email" autocomplete="email" placeholder="your email">'
      +'  <div class="opt">'
      +'    <label><input type="radio" name="fhv-scope" value="radius" checked>Within '+defRadius+' of your home</label>'
      +(named ? '    <label><input type="radio" name="fhv-scope" value="community">All of '+SUB+'</label>' : '')
      +'  </div>'
      +'  <button type="button" class="send" id="fhv-alert-go">Send me the alerts</button>'
      +'  <div class="fine">Your email is never sold, shared or given to anyone. It is used for this one thing. '
      +'You can stop them at any time.</div>'
      +'  <div class="msg" id="fhv-alert-msg"></div>'
      +'</div>';

    /* place it under the assessment box if that ran, otherwise under the estimate */
    var host=document.getElementById('fhv-assess')
          || document.getElementById('rprWidgetContainer')
          || document.getElementById('rprAvmWidget')
          || document.getElementById('estimate');
    if(!host) return;
    var wrap=document.createElement('div');
    wrap.innerHTML=html;
    host.parentNode.insertBefore(wrap,host.nextSibling);

    document.getElementById('fhv-alert-go').addEventListener('click',function(){
      var em=(document.getElementById('fhv-alert-email').value||'').trim();
      var msg=document.getElementById('fhv-alert-msg');
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){
        msg.style.color='#b00'; msg.textContent='That email does not look right - have another look.'; return;
      }
      var picked='radius', rs=document.getElementsByName('fhv-scope');
      for(var i=0;i<rs.length;i++){ if(rs[i].checked) picked=rs[i].value; }
      var scope=(picked==='community' && named) ? SUB : defRadius+' around '+addr;
      var btn=this; btn.disabled=true; btn.textContent='Sending...';
      try{ if(window.gtag) gtag('event','alert_signup',{territory:T}); }catch(e){}
      fetch("https://fhv-lead-vault.cleirshusband.workers.dev/",{method:"POST",
        headers:{"Content-Type":"application/json"},keepalive:true,
        body:JSON.stringify({name:"",phone:"",email:em,address:addr,
          territory_id:T+" - street alerts",subdivision:SUB||'Florida',
          wants:"STREET ALERTS for "+scope,
          agent_name:"Michael Putnam",agent_email:"michael@putnamrealtygroup.com"})
      }).then(function(){
        document.getElementById('fhv-alert').innerHTML=
          '<div class="q">You are on the list.</div>'+
          '<div class="sub">You will hear from me when something happens within '+scope+'. Nothing else, ever.</div>';
      }).catch(function(){
        btn.disabled=false; btn.textContent='Send me the alerts';
        msg.style.color='#b00'; msg.textContent='That did not go through. Try once more, or call 941-662-9941.';
      });
    });
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',build); }
  else { build(); }
})();
