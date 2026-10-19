/* PDF registers with GCTU letterhead (uses jsPDF + jsPDF-AutoTable, loaded in admin.html) */
(function(){
  const BLUE=[11,79,168], INK=[28,28,30], GREY=[108,108,112], LINE=[210,210,215];
  const COLOR={Present:[30,123,52], Absent:[201,0,26], Excused:[168,82,0]};
  const ORG="GHANA COMMUNICATION TECHNOLOGY UNIVERSITY";
  const SCHOOL="School of Graduate Studies and Research · Department of Information Technology";
  const PROG="MPhil/MSc. Information Technology · January 2026 Cohort";

  let logoCache;
  async function logo(){
    if(logoCache!==undefined) return logoCache;
    try{
      const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src="assets/gctu-logo.png?v=1"; });
      const c=document.createElement("canvas"); const s=256; c.width=s; c.height=s;
      const k=Math.min(s/img.naturalWidth, s/img.naturalHeight); const w=img.naturalWidth*k, h=img.naturalHeight*k;
      c.getContext("2d").drawImage(img,(s-w)/2,(s-h)/2,w,h);
      logoCache=c.toDataURL("image/png");
    }catch(e){ logoCache=null; }
    return logoCache;
  }
  const ready = () => !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable);

  function letterhead(doc, L, title){
    const W=doc.internal.pageSize.getWidth(), M=14;
    if(L) doc.addImage(L,"PNG",M,10,20,20);
    else { doc.setFillColor(...BLUE); doc.roundedRect(M,10,20,20,3,3,"F"); doc.setTextColor(255); doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.text("GCTU",M+10,21.5,{align:"center"}); }
    const x=M+25;
    doc.setTextColor(...INK); doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.text(ORG,x,15);
    doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(...GREY); doc.text(SCHOOL,x,20);
    doc.setTextColor(...BLUE); doc.setFont("helvetica","bold"); doc.text(PROG + " · " + ((window.TIMETABLE||{}).semester||""),x,25);
    doc.setDrawColor(...BLUE); doc.setLineWidth(.6); doc.line(M,33,W-M,33);
    doc.setTextColor(...INK); doc.setFontSize(15); doc.setFont("helvetica","bold"); doc.text(title,M,43);
    return 48;
  }
  function details(doc, y, pairs){
    const body=[]; for(let i=0;i<pairs.length;i+=2){ const a=pairs[i], b=pairs[i+1]||["",""]; body.push([a[0].toUpperCase(),String(a[1]??"")||"—",b[0].toUpperCase(),b[0]?(String(b[1]??"")||"—"):""]); }
    doc.autoTable({startY:y, body, theme:"plain", margin:{left:14,right:14},
      styles:{font:"helvetica",fontSize:9,cellPadding:{top:1.2,bottom:1.2,left:0,right:3},textColor:INK,valign:"top"},
      columnStyles:{0:{cellWidth:30,fontStyle:"bold",textColor:GREY,fontSize:7.5},1:{cellWidth:61},2:{cellWidth:30,fontStyle:"bold",textColor:GREY,fontSize:7.5},3:{cellWidth:"auto"}}});
    return doc.lastAutoTable.finalY+2;
  }
  function footers(doc, who){
    const n=doc.getNumberOfPages(), W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
    const stamp=new Date().toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.setFont("helvetica","normal");
      doc.text(`Generated ${stamp}${who?` by ${who}`:""} · GCTU MPhil/MSc IT Class Portal`,14,H-8);
      doc.text(`Page ${i} of ${n}`,W-14,H-8,{align:"right"}); }
  }
  const tableStyle = {
    theme:"grid", styles:{font:"helvetica",fontSize:8.5,cellPadding:1.8,lineColor:LINE,lineWidth:.15,textColor:INK},
    headStyles:{fillColor:BLUE,textColor:255,fontStyle:"bold"}, alternateRowStyles:{fillColor:[247,247,250]}, margin:{left:14,right:14,bottom:16}
  };
  const fmtDate = iso => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||""); if(!m) return iso||""; return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}); };
  const safeName = s => String(s).replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"");

  /* One class: attendance sheet with signatures */
  async function classRegister({session, rows, marks, by, me}){
    const L=await logo();
    const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"});
    let y=letterhead(doc,L,"Class Attendance Register");
    const c=window.TIMETABLE && window.TIMETABLE.find(session.course);
    const counts={Present:0,Absent:0,Excused:0};
    rows.forEach(r=>{ const v=marks[r.idx]; if(counts[v]!=null) counts[v]++; });
    y=details(doc,y,[
      ["Course", session.course], ["Date", fmtDate(session.date)],
      ["Lecturer", c?c.lecturer:""], ["Time", c?window.TIMETABLE.time(c):""],
      ["Venue", c&&c.venue?c.venue:""], ["Topic", session.topic||""],
      ["Taken by", (by||"").split("@")[0]], ["Summary", `${counts.Present} present · ${counts.Absent} absent · ${counts.Excused} excused · ${rows.length} students`]
    ]);
    doc.autoTable({...tableStyle, startY:y+2,
      head:[["No.","Name","Index No.","Status"]],
      body:rows.map((r,i)=>[i+1,r.name,r.idx,marks[r.idx]||"Not marked"]),
      columnStyles:{0:{cellWidth:12,halign:"right"},2:{cellWidth:32},3:{cellWidth:30,fontStyle:"bold"}},
      didParseCell:d=>{ if(d.section==="body"&&d.column.index===3&&COLOR[d.cell.raw]) d.cell.styles.textColor=COLOR[d.cell.raw]; }
    });
    let sy=doc.lastAutoTable.finalY+18; const H=doc.internal.pageSize.getHeight();
    if(sy>H-30){ doc.addPage(); sy=30; }
    doc.setDrawColor(...INK); doc.setLineWidth(.3); doc.setFontSize(8.5); doc.setTextColor(...GREY);
    [["Lecturer's signature",14],["Class rep's signature",80],["Date",146]].forEach(([t,x])=>{ doc.line(x,sy,x+50,sy); doc.text(t,x,sy+4.5); });
    footers(doc, me);
    doc.save(`Register-${safeName(session.course.split(" · ")[0])}-${session.date}.pdf`);
  }

  /* All classes (optionally one course): students × classes grid with totals */
  async function fullRegister({sessions, rows, matrix, course, me}){
    const L=await logo();
    const S=sessions.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
    const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4",orientation:S.length>6?"landscape":"portrait"});
    let y=letterhead(doc,L, course ? "Course Attendance Register" : "Attendance Register · All Courses");
    const c=course && window.TIMETABLE && window.TIMETABLE.find(course);
    let tp=0,ta=0; S.forEach(s=>{ const m=matrix[s.id]||{}; Object.values(m).forEach(v=>{ if(v==="Present")tp++; else if(v==="Absent")ta++; }); });
    const pairs = course
      ? [["Course",course],["Lecturer",c?c.lecturer:""],["Schedule",c?`${window.TIMETABLE.DAYS[c.day]} ${window.TIMETABLE.time(c)}`:""],["Venue",c&&c.venue?c.venue:""],["Classes held",S.length],["Average attendance",(tp+ta)?Math.round(tp/(tp+ta)*100)+"%":"—"]]
      : [["Courses",[...new Set(S.map(s=>s.course.split(" · ")[0]))].join(", ")],["Classes held",S.length],["Students",rows.length],["Average attendance",(tp+ta)?Math.round(tp/(tp+ta)*100)+"%":"—"]];
    y=details(doc,y,pairs);
    const head=["No.","Name","Index No.",...S.map(s=>{ const d=/^(\d{4})-(\d{2})-(\d{2})/.exec(s.date); const lbl=d?`${+d[3]}/${+d[2]}`:s.date; return course?lbl:`${lbl}\n${s.course.split(" · ")[0]}`; }),"P","A","E","%"];
    const body=rows.map((r,i)=>{ let p=0,a=0,e=0; const cells=S.map(s=>{ const v=(matrix[s.id]||{})[r.idx]||""; if(v==="Present")p++; else if(v==="Absent")a++; else if(v==="Excused")e++; return v?v[0]:""; });
      return [i+1,r.name,r.idx,...cells,p,a,e,(p+a)?Math.round(p/(p+a)*100)+"%":"—"]; });
    const first=3, last=first+S.length;
    doc.autoTable({...tableStyle, startY:y+2, head:[head], body,
      styles:{...tableStyle.styles, fontSize:S.length>10?6.8:8, cellPadding:1.4, halign:"center"},
      columnStyles:{0:{cellWidth:9,halign:"right"},1:{halign:"left",cellWidth:S.length>10?42:52},2:{cellWidth:22}},
      didParseCell:d=>{
        if(d.section!=="body") return;
        const i=d.column.index;
        if(i>=first&&i<last){ const k={P:"Present",A:"Absent",E:"Excused"}[d.cell.raw]; if(k){ d.cell.styles.textColor=COLOR[k]; d.cell.styles.fontStyle="bold"; } }
        if(i===head.length-1){ const n=parseInt(d.cell.raw,10); if(!isNaN(n)){ d.cell.styles.fontStyle="bold"; d.cell.styles.textColor=n>=75?COLOR.Present:n>=50?COLOR.Excused:COLOR.Absent; } }
      }
    });
    const ky=doc.lastAutoTable.finalY+6; doc.setFontSize(7.5); doc.setTextColor(...GREY);
    doc.text("Key: P = Present · A = Absent · E = Excused. Attendance % = Present ÷ (Present + Absent); excused classes are not counted.",14,ky);
    footers(doc, me);
    doc.save(`Register-${course?safeName(course.split(" · ")[0]):"All-Courses"}-${new Date().toISOString().slice(0,10)}.pdf`);
  }

  window.RegisterPDF={ready, classRegister, fullRegister};
})();
