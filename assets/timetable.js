/* MSc IT · 2nd Semester timetable (Department of Information Technology, School of Graduate Studies and Research)
   Edit this file if the timetable changes. day: 0 = Sunday … 6 = Saturday. Times are 24-hour. Leave venue "" if not assigned. */
window.TIMETABLE = {
  semester: "2nd Semester",
  courses: [
    { code: "CICS 501",  title: "Database Management Systems",      lecturer: "Dr. Fred Amankwah-Sarfo",     day: 6, start: "07:00", end: "10:00", venue: "" },
    { code: "CIIS 534",  title: "IT Governance",                    lecturer: "Prof. Stephen Asunka",        day: 6, start: "12:30", end: "14:00", venue: "" },
    { code: "CIIS 532",  title: "IT Project and Change Management", lecturer: "Prof. George Amoako",         day: 6, start: "15:00", end: "18:00", venue: "" },
    { code: "CIIS 6011", title: "Big Data Mining and Analytics",    lecturer: "Dr. Emmanuel Eli-Fianu",      day: 0, start: "11:00", end: "14:00", venue: "" },
    { code: "CICS 502",  title: "Network and Information Security", lecturer: "Dr. Israel Edem Agbehadji",   day: 0, start: "15:00", end: "18:00", venue: "C10" },
    { code: "CIIS 691",  title: "Masters Thesis/Project",           lecturer: "All supervisors",             day: 0, start: "",      end: "",      venue: "" }
  ]
};
(function(){
  const T = window.TIMETABLE;
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const label = c => `${c.code} · ${c.title}`;
  const mins = s => { const m=/^(\d{1,2}):(\d{2})$/.exec(s||""); return m ? +m[1]*60 + +m[2] : null; };
  const fmt = s => { const m=mins(s); if(m==null) return ""; let h=Math.floor(m/60), mm=m%60, ap=h>=12?"PM":"AM"; h=h%12||12; return `${h}:${String(mm).padStart(2,"0")} ${ap}`; };
  T.DAYS = DAYS;
  T.label = label;
  T.time = c => c.start ? `${fmt(c.start)} – ${fmt(c.end)}` : "Time to be announced";
  T.find = name => T.courses.find(c => label(c) === name || c.code === String(name||"").split(" · ")[0]);
  /* Best course for a date: the class on now (if the date is today), else the next one that day, else the first that day */
  T.suggest = (isoDate) => {
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate||""); if(!m) return null;
    const d=new Date(+m[1],+m[2]-1,+m[3]), day=d.getDay();
    const list=T.courses.filter(c=>c.day===day).sort((a,b)=>(mins(a.start)??9999)-(mins(b.start)??9999));
    if(!list.length) return null;
    const now=new Date();
    if(now.toDateString()===d.toDateString()){
      const t=now.getHours()*60+now.getMinutes();
      const on=list.find(c=>mins(c.start)!=null && t>=mins(c.start)-30 && t<=mins(c.end)+60);
      if(on) return on;
      const next=list.find(c=>mins(c.start)!=null && mins(c.start)>t);
      if(next) return next;
      return [...list].reverse().find(c=>mins(c.start)!=null) || list[0];
    }
    return list[0];
  };
  /* Next upcoming class from now (for the student page) */
  T.next = () => {
    const now=new Date(), t=now.getDay()*1440+now.getHours()*60+now.getMinutes();
    let best=null, bestD=Infinity;
    T.courses.forEach(c=>{
      if(mins(c.start)==null) return;
      const s=c.day*1440+mins(c.start), e=c.day*1440+mins(c.end);
      const k = (t>=s && t<e) ? 0 : (s - t + 10080) % 10080;
      if(k<bestD){ bestD=k; best=c; }
    });
    return best ? {course:best, inMinutes:bestD, live:bestD===0} : null;
  };
})();
