/* Shared helpers for the class portal pages */
(function(){
  const API = (window.ROSTER_API || "").trim();
  const configured = /^https:\/\/script\.google\.com\//.test(API);
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function call(method, payload){
    if(!configured) throw new Error("not_configured");
    const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 25000);
    try{
      const res = method==="GET"
        ? await fetch(API+"?"+new URLSearchParams(payload), {signal:ctrl.signal})
        : await fetch(API, {method:"POST", body:JSON.stringify(payload), signal:ctrl.signal});
      return await res.json();
    } finally { clearTimeout(t); }
  }

  const MSG = {
    not_configured:"This page isn't connected to the class sheet yet. The class rep needs to add the web app link in config.js.",
    network:"Couldn't reach the class sheet. Check your internet connection and try again.",
    invalid_index:"That doesn't look like a valid index number.",
    email_required:"Enter your personal email address.",
    invalid_email:"One of the email addresses isn't valid. Check it and try again.",
    nothing_changed:"That's the same as what's already on the list.",
    message_required:"Tell us what the issue is.",
    rate_limited:"You've sent several messages in the last hour. Please wait a while before sending another.",
    already_listed:"That index number is already on the list. Go back and look it up instead.",
    wrong_key:"That email and password don't match an admin account.",
    admin_key_not_set:"No admin accounts are set up yet. In Apps Script → Project Settings → Script properties, add each admin email with a password.",
    no_marks:"Mark at least one student before saving.",
    course_required:"Enter the course for this class.",
    invalid_date:"Pick the date of the class.",
    not_found:"That record wasn't found. Refresh and try again.",
    wrong_pin:"That PIN isn't right. Try again.",
    pin_locked:"Too many wrong PINs. This index number is locked for 15 minutes. If you've forgotten your PIN, tap Forgot PIN.",
    no_pin:"No PIN is set for this index number yet. Go back and create one.",
    pin_exists:"A PIN has already been created for this index number. Enter it, or tap Forgot PIN if it wasn't you.",
    pin_format:"Your PIN must be exactly 6 digits.",
    pin_weak:"That PIN is too easy to guess. Avoid repeated digits (111111) or runs (123456).",
    programme_required:"Choose MPhil or MSc.",
    topic_required:"Enter your thesis topic (at least 10 characters).",
    invalid_status:"That status isn't valid.",
    thesis_closed:"The deadline for thesis topics has passed, so submissions are closed. Contact the class rep if you need to make a change.",
    invalid_deadline:"Pick a valid date and time for the deadline."
  };
  const errText = e => MSG[e && e.message] || MSG[e] || (e && e.name==="AbortError" ? MSG.network : (e instanceof TypeError ? MSG.network : MSG.network));

  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDate(iso, long){
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso||""); if(!m) return iso||"";
    const d = new Date(+m[1], +m[2]-1, +m[3]);
    return long ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : `${d.getDate()} ${MON[d.getMonth()]}`;
  }
  /* "2026-11-28 23:59" → "Sat, 28 Nov 2026 at 11:59 PM" */
  function fmtDeadline(s){
    const m=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(s||""); if(!m) return s||"";
    const h=+m[2], ap=h>=12?"PM":"AM", h12=h%12||12;
    return `${fmtDate(m[1],true)} at ${h12}:${m[3]} ${ap}`;
  }
  function today(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

  function busy(btn, on, label){
    if(!btn) return;
    if(on){ btn.dataset.label = btn.dataset.label || btn.innerHTML; btn.disabled=true; btn.innerHTML=`<span class="spin" aria-hidden="true"></span>${label||"Please wait"}`; }
    else { btn.disabled=false; if(btn.dataset.label) btn.innerHTML=btn.dataset.label; }
  }
  let toastT;
  function toast(text){
    let el = $("#toast");
    if(!el){ el=document.createElement("div"); el.id="toast"; el.className="toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
    el.textContent=text; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true, 2600);
  }

  /* Sheet (modal) with focus return + Escape */
  let lastFocus=null;
  function openSheet({title, body, left, right, onMount}){
    closeSheet(true);
    lastFocus=document.activeElement;
    const scrim=document.createElement("div"); scrim.className="scrim"; scrim.id="scrim";
    scrim.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-bar"><span class="l">${left||""}</span><h2 id="sheetTitle">${esc(title)}</h2><span class="r">${right||""}</span></div>
      <div class="sheet-body">${body}</div></div>`;
    scrim.addEventListener("click",e=>{ if(e.target===scrim || e.target.closest("[data-close]")) closeSheet(); });
    document.body.appendChild(scrim); document.body.style.overflow="hidden";
    const f=scrim.querySelector("input,select,textarea,.btn-filled"); if(f) f.focus({preventScroll:true});
    if(onMount) onMount(scrim);
    return scrim;
  }
  function closeSheet(silent){
    const s=$("#scrim"); if(!s) return;
    s.remove(); document.body.style.overflow="";
    if(!silent && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeSheet(); });

  /* Logo with graceful fallback */
  function mountLogo(){
    document.querySelectorAll("img.logo").forEach(img=>{
      const swap=()=>{ const f=document.createElement("div"); f.className="logo-fallback"; f.setAttribute("aria-hidden","true"); f.textContent="GCTU"; img.replaceWith(f); };
      if(img.complete && !img.naturalWidth) swap(); else img.addEventListener("error",swap,{once:true});
    });
  }

  const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const pillClass = s => ({Present:"present",Absent:"absent",Excused:"excused"})[s] || "none";
  const initials = n => String(n).replace(/[^A-Za-z\s-]/g,"").split(/[\s-]+/).filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase();

  window.Portal = {API, configured, $, esc, call, errText, MSG, fmtDate, fmtDeadline, today, busy, toast, openSheet, closeSheet, mountLogo, EMAIL_RE, pillClass, initials};
})();
