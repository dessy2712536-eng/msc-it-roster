/**
 * GCTU · MPhil/MSc Information Technology · January 2026 Cohort
 * Class Portal back end (roster verification, class register, feedback)
 *
 * SETUP
 *  1. In the Google Sheet: Extensions → Apps Script → paste this file → Save.
 *  2. Project Settings (gear) → Script properties:
 *       One property per admin – the property NAME is the admin's email, the VALUE is their password:
 *         first.admin@gmail.com   = <first admin's password>
 *         second.admin@gmail.com  = <second admin's password>
 *       Feedback emails go to every admin listed (or set NOTIFY_EMAIL to override).
 *  3. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
 *  Never write passwords in this file – it is public on GitHub.
 *
 * Sheet tabs (created automatically if missing):
 *  Master List · Log · Sessions · Attendance · Register · Feedback
 */
/* ═══════════ RUN THIS FIRST: choose "setup" in the function dropdown above and click Run ═══════════ */
function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('This script is not attached to a Google Sheet. Open the class sheet, then Extensions → Apps Script, and paste the code there.');
  if (!book.getSheetByName('Master List')) throw new Error('No "Master List" tab found. Rename the tab with the student names to exactly: Master List');
  Object.keys(HEAD).forEach(n => tab_(n));
  rebuildRegister_();
  MailApp.getRemainingDailyQuota(); // asks for permission to send feedback emails
  const made = Object.keys(HEAD).concat([T.REGISTER]).filter(n => book.getSheetByName(n));
  Logger.log('Setup complete. Tabs ready: ' + made.join(', '));
  try { SpreadsheetApp.getUi().alert('Class Portal setup complete.\n\nTabs ready: ' + made.join(', ')); } catch (e) {}
}

/* Adds a "Class Portal" menu to the sheet so setup can also be run from there */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Class Portal').addItem('Set up / repair tabs', 'setup').addToUi();
}

const TZ = 'Africa/Accra';
const STATUSES = ['Present', 'Absent', 'Excused'];
const T = {
  MASTER: 'Master List', LOG: 'Log', SESSIONS: 'Sessions',
  ATT: 'Attendance', REGISTER: 'Register', FEEDBACK: 'Feedback'
};
const HEAD = {
  'Master List': ['No.', 'Name', 'Index No.', 'Status', 'Verified On', 'Correct Name', 'Correct Index No.', 'Note', 'School Email', 'Personal Email'],
  'Log': ['Timestamp', 'Action', 'Index No.', 'Name', 'Details'],
  'Sessions': ['Session ID', 'Date', 'Course', 'Topic', 'Created', 'Updated', 'Updated By'],
  'Attendance': ['Session ID', 'Index No.', 'Status'],
  'Feedback': ['Timestamp', 'Index No.', 'Name', 'Category', 'Details', 'Session', 'Contact Email', 'Status', 'Handled By']
};
const COL = { status: 4, date: 5, newName: 6, newIdx: 7, note: 8, school: 9, personal: 10 };
const CATEGORIES = { name: 'Name spelling', index: 'Index number', attendance: 'Attendance record', other: 'Other' };

/* ───────────────────────── entry points ───────────────────────── */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'lookup') return json_(lookup_(p.idx));
  return json_({ ok: true, service: 'class-portal' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return json_(route_(d)); }
  catch (err) { return json_({ ok: false, error: 'server_error', detail: String(err) }); }
  finally { lock.releaseLock(); }
}


function route_(d) {
  const a = String(d.action || '');
  const admin = {
    admin: who => Object.assign(adminData_(), { me: who }),
    getSession: () => getSession_(d.id),
    saveSession: who => saveSession_(d, who),
    deleteSession: who => deleteSession_(d.id, who),
    setFeedback: who => setFeedback_(d.row, d.status, who)
  };
  if (admin[a]) {
    const who = adminEmail_(d.email, d.key);
    if (who.error) return { ok: false, error: who.error };
    return admin[a](who.email);
  }
  if (a === 'confirm') return confirm_(d);
  if (a === 'feedback') return feedback_(d);
  if (a === 'missing') return missing_(d);
  return { ok: false, error: 'unknown_action' };
}

/* ───────────────────────── student side ───────────────────────── */
function lookup_(idx) {
  idx = digits_(idx);
  if (!idx) return { ok: false, error: 'invalid_index' };
  const sh = tab_(T.MASTER);
  const r = findRow_(sh, idx);
  if (r < 0) return { ok: true, found: false };
  const v = sh.getRange(r, 1, 1, 10).getDisplayValues()[0];
  return {
    ok: true, found: true, name: v[1], idx: v[2], status: v[3] || 'Not verified', verifiedOn: v[4],
    schoolEmail: v[8], personalEmail: v[9],
    attendance: studentAttendance_(idx)
  };
}

function studentAttendance_(idx) {
  const sessions = readSessions_();
  const marks = {};
  readAttendance_().forEach(m => { if (m.idx === idx) marks[m.id] = m.status; });
  return sessions.map(s => ({ id: s.id, date: s.date, course: s.course, topic: s.topic, status: marks[s.id] || 'Not marked' }));
}

function confirm_(d) {
  const idx = digits_(d.idx);
  if (!idx) return { ok: false, error: 'invalid_index' };
  const em = emails_(d);
  if (em.error) return { ok: false, error: em.error };
  const sh = tab_(T.MASTER);
  const r = findRow_(sh, idx);
  if (r < 0) return { ok: false, error: 'not_found' };
  const now = now_();
  const name = sh.getRange(r, 2).getDisplayValue();
  sh.getRange(r, COL.status, 1, 5).setValues([['Verified', now, '', '', '']]);
  sh.getRange(r, COL.school, 1, 2).setValues([[em.school, em.personal]]);
  log_(now, 'Verified', idx, name, 'Details confirmed correct');
  return { ok: true, status: 'Verified', verifiedOn: now };
}

function feedback_(d) {
  const idx = digits_(d.idx);
  if (!idx) return { ok: false, error: 'invalid_index' };
  const cat = CATEGORIES[d.category] ? d.category : '';
  if (!cat) return { ok: false, error: 'invalid_category' };
  if (tooMany_(idx)) return { ok: false, error: 'rate_limited' };
  const sh = tab_(T.MASTER);
  const r = findRow_(sh, idx);
  if (r < 0) return { ok: false, error: 'not_found' };
  const name = sh.getRange(r, 2).getDisplayValue();
  const message = safe_(d.message, 600);
  const contact = cleanEmail_(d.contactEmail);
  if (d.contactEmail && !contact) return { ok: false, error: 'invalid_email' };
  const now = now_();
  let details = message;
  let sessionLabel = '';

  if (cat === 'name') {
    const newName = safe_(d.newName, 120);
    if (!newName || newName === name) return { ok: false, error: 'nothing_changed' };
    sh.getRange(r, COL.status, 1, 3).setValues([['Correction requested', now, newName]]);
    if (message) sh.getRange(r, COL.note).setValue(message);
    details = 'Correct name: ' + newName + (message ? ' | ' + message : '');
  } else if (cat === 'index') {
    const newIdx = digits_(d.newIdx);
    if (!newIdx || newIdx === idx) return { ok: false, error: 'nothing_changed' };
    sh.getRange(r, COL.newIdx).setNumberFormat('@');
    sh.getRange(r, COL.status, 1, 2).setValues([['Correction requested', now]]);
    sh.getRange(r, COL.newIdx).setValue(newIdx);
    if (message) sh.getRange(r, COL.note).setValue(message);
    details = 'Correct index: ' + newIdx + (message ? ' | ' + message : '');
  } else {
    if (!message) return { ok: false, error: 'message_required' };
    if (cat === 'attendance' && d.sessionId) {
      const s = readSessions_().filter(x => x.id === String(d.sessionId))[0];
      if (s) sessionLabel = s.date + ' · ' + s.course;
    }
  }

  const fb = tab_(T.FEEDBACK);
  const row = fb.getLastRow() + 1;
  fb.getRange(row, 2).setNumberFormat('@');
  fb.getRange(row, 1, 1, 8).setValues([[now, idx, name, CATEGORIES[cat], details, sessionLabel, contact, 'Open']]);
  log_(now, 'Feedback: ' + CATEGORIES[cat], idx, name, details);
  notify_('[Class Portal] ' + CATEGORIES[cat] + ' – ' + name,
    [
      'New feedback from the class portal', '',
      'Student:   ' + name, 'Index No.: ' + idx, 'Category:  ' + CATEGORIES[cat],
      sessionLabel ? 'Class:     ' + sessionLabel : '', '',
      'Details:', details || '(none)', '',
      contact ? 'Reply to:  ' + contact : 'No contact email given', '',
      'Sent ' + now + ' (Accra time). Mark it resolved on the admin page.'
    ].filter(x => x !== null).join('\n'),
    contact);
  return { ok: true };
}

function missing_(d) {
  const idx = digits_(d.idx);
  if (!idx) return { ok: false, error: 'invalid_index' };
  const name = safe_(d.name, 120);
  if (!name) return { ok: false, error: 'name_required' };
  const em = emails_(d);
  if (em.error) return { ok: false, error: em.error };
  if (tooMany_(idx)) return { ok: false, error: 'rate_limited' };
  if (findRow_(tab_(T.MASTER), idx) > 0) return { ok: false, error: 'already_listed' };
  const now = now_();
  const details = 'School: ' + (em.school || '—') + ' | Personal: ' + em.personal;
  log_(now, 'Missing name', idx, name, details);
  const fb = tab_(T.FEEDBACK);
  const row = fb.getLastRow() + 1;
  fb.getRange(row, 2).setNumberFormat('@');
  fb.getRange(row, 1, 1, 8).setValues([[now, idx, name, 'Missing from list', details, '', em.personal, 'Open']]);
  notify_('[Class Portal] Missing from list – ' + name,
    'A student says they are not on the class list.\n\nName:      ' + name + '\nIndex No.: ' + idx +
    '\nSchool:    ' + (em.school || '—') + '\nPersonal:  ' + em.personal +
    '\n\nAdd them to the Master List tab if they belong to the class.', em.personal);
  return { ok: true };
}

/* ───────────────────────── admin side ───────────────────────── */
/* Admins = script properties whose name is an email address; value = that admin's password */
function admins_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(p).filter(k => k.indexOf('@') > 0).map(k => ({ email: k.trim().toLowerCase(), pass: p[k] }));
}
function adminEmail_(email, key) {
  const list = admins_();
  if (!list.length) return { error: 'admin_key_not_set' };
  email = String(email || '').trim().toLowerCase();
  const a = list.filter(x => x.email === email)[0];
  if (!a || String(key || '') !== String(a.pass)) { Utilities.sleep(800); return { error: 'wrong_key' }; }
  return { email: a.email };
}

function adminData_() {
  const sh = tab_(T.MASTER);
  const last = sh.getLastRow();
  const sessions = readSessions_();
  const att = readAttendance_();
  const per = {}; // idx -> {P,A,E}
  const perSession = {};
  const matrix = {};
  att.forEach(m => {
    (matrix[m.id] = matrix[m.id] || {})[m.idx] = m.status;
    (per[m.idx] = per[m.idx] || { Present: 0, Absent: 0, Excused: 0 })[m.status]++;
    (perSession[m.id] = perSession[m.id] || { Present: 0, Absent: 0, Excused: 0 })[m.status]++;
  });
  const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 10).getDisplayValues().filter(r => r[2]).map(r => {
    const c = per[r[2]] || { Present: 0, Absent: 0, Excused: 0 };
    return {
      no: r[0], name: r[1], idx: r[2], status: r[3] || 'Not verified', date: r[4],
      newName: r[5], newIdx: r[6], note: r[7], schoolEmail: r[8], personalEmail: r[9],
      present: c.Present, absent: c.Absent, excused: c.Excused
    };
  });
  const fb = tab_(T.FEEDBACK);
  const fl = fb.getLastRow();
  const feedback = fl < 2 ? [] : fb.getRange(2, 1, fl - 1, 9).getDisplayValues().map((r, i) => ({
    row: i + 2, date: r[0], idx: r[1], name: r[2], category: r[3], details: r[4], session: r[5], contact: r[6], status: r[7] || 'Open', by: r[8]
  })).reverse();
  return {
    ok: true, updated: now_(), rows: rows,
    sessions: sessions.map(s => Object.assign({}, s, { counts: perSession[s.id] || { Present: 0, Absent: 0, Excused: 0 } })),
    feedback: feedback, matrix: matrix,
    courses: unique_(sessions.map(s => s.course))
  };
}

function getSession_(id) {
  const s = readSessions_().filter(x => x.id === String(id))[0];
  if (!s) return { ok: false, error: 'not_found' };
  const marks = {};
  readAttendance_().forEach(m => { if (m.id === s.id) marks[m.idx] = m.status; });
  return { ok: true, session: s, marks: marks };
}

function saveSession_(d, who) {
  const date = String(d.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'invalid_date' };
  const course = safe_(d.course, 80);
  if (!course) return { ok: false, error: 'course_required' };
  const topic = safe_(d.topic, 120);
  const marks = d.marks || {};
  const valid = {};
  const roster = rosterIdx_();
  Object.keys(marks).forEach(k => {
    const i = digits_(k);
    if (i && roster[i] && STATUSES.indexOf(marks[k]) >= 0) valid[i] = marks[k];
  });
  if (!Object.keys(valid).length) return { ok: false, error: 'no_marks' };

  const ss = tab_(T.SESSIONS);
  const now = now_();
  let id = String(d.id || '');
  const existing = id ? findRowBy_(ss, 1, id) : -1;
  if (id && existing < 0) return { ok: false, error: 'not_found' };
  if (!id) id = 'S' + new Date().getTime();
  const row = existing > 0 ? existing : ss.getLastRow() + 1;
  ss.getRange(row, 1, 1, 2).setNumberFormat('@');
  const created = existing > 0 ? ss.getRange(row, 5).getDisplayValue() : now;
  ss.getRange(row, 1, 1, 7).setValues([[id, date, course, topic, created, now, who || '']]);

  const keep = readAttendance_().filter(m => m.id !== id);
  Object.keys(valid).forEach(i => keep.push({ id: id, idx: i, status: valid[i] }));
  writeAttendance_(keep);
  rebuildRegister_();
  log_(now, existing > 0 ? 'Register updated' : 'Register taken', '', course, date + ' · ' + Object.keys(valid).length + ' students · by ' + (who || '?'));
  return { ok: true, id: id };
}

function deleteSession_(id, who) {
  id = String(id || '');
  const ss = tab_(T.SESSIONS);
  const r = findRowBy_(ss, 1, id);
  if (r < 0) return { ok: false, error: 'not_found' };
  const info = ss.getRange(r, 2, 1, 2).getDisplayValues()[0];
  ss.deleteRow(r);
  writeAttendance_(readAttendance_().filter(m => m.id !== id));
  rebuildRegister_();
  log_(now_(), 'Register deleted', '', info[1], info[0] + ' · by ' + (who || '?'));
  return { ok: true };
}

function setFeedback_(row, status, who) {
  const fb = tab_(T.FEEDBACK);
  row = Number(row);
  if (!(row >= 2 && row <= fb.getLastRow())) return { ok: false, error: 'not_found' };
  if (['Open', 'Resolved'].indexOf(status) < 0) return { ok: false, error: 'invalid_status' };
  fb.getRange(row, 8, 1, 2).setValues([[status, status === 'Resolved' ? (who || '') : '']]);
  return { ok: true };
}

/* Register tab: students × classes grid, rebuilt after every save */
function rebuildRegister_() {
  const reg = tab_(T.REGISTER);
  const sessions = readSessions_();
  const att = readAttendance_();
  const map = {};
  att.forEach(m => { map[m.id + '|' + m.idx] = m.status; });
  const ms = tab_(T.MASTER);
  const last = ms.getLastRow();
  const students = last < 2 ? [] : ms.getRange(2, 1, last - 1, 3).getDisplayValues().filter(r => r[2]);
  const header = ['No.', 'Name', 'Index No.'].concat(sessions.map(s => s.date + ' ' + s.course), ['Present', 'Absent', 'Excused', 'Attendance %']);
  const body = students.map(r => {
    let p = 0, a = 0, e = 0;
    const cells = sessions.map(s => {
      const st = map[s.id + '|' + r[2]] || '';
      if (st === 'Present') p++; else if (st === 'Absent') a++; else if (st === 'Excused') e++;
      return st ? st.charAt(0) : '';
    });
    const pct = (p + a) ? Math.round(p / (p + a) * 100) + '%' : '';
    return [r[0], r[1], r[2]].concat(cells, [p, a, e, pct]);
  });
  reg.clearContents();
  const all = [header].concat(body);
  reg.getRange(1, 3, all.length, 1).setNumberFormat('@');
  reg.getRange(1, 1, all.length, header.length).setValues(all);
  reg.getRange(1, 1, 1, header.length).setFontWeight('bold');
  reg.setFrozenRows(1);
}

/* ───────────────────────── data helpers ───────────────────────── */
function readSessions_() {
  const ss = tab_(T.SESSIONS);
  const l = ss.getLastRow();
  if (l < 2) return [];
  return ss.getRange(2, 1, l - 1, 7).getDisplayValues().filter(r => r[0])
    .map(r => ({ id: r[0], date: r[1], course: r[2], topic: r[3], updated: r[5], by: r[6] }))
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1));
}
function readAttendance_() {
  const at = tab_(T.ATT);
  const l = at.getLastRow();
  if (l < 2) return [];
  return at.getRange(2, 1, l - 1, 3).getDisplayValues().filter(r => r[0])
    .map(r => ({ id: r[0], idx: r[1], status: r[2] }));
}
function writeAttendance_(list) {
  const at = tab_(T.ATT);
  const l = at.getLastRow();
  if (l >= 2) at.getRange(2, 1, l - 1, 3).clearContent();
  if (!list.length) return;
  at.getRange(2, 1, list.length, 2).setNumberFormat('@');
  at.getRange(2, 1, list.length, 3).setValues(list.map(m => [m.id, m.idx, m.status]));
}
function rosterIdx_() {
  const ms = tab_(T.MASTER);
  const l = ms.getLastRow();
  const o = {};
  if (l >= 2) ms.getRange(2, 3, l - 1, 1).getDisplayValues().forEach(r => { if (r[0]) o[String(r[0]).trim()] = true; });
  return o;
}

function tab_(name) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    if (HEAD[name]) {
      sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  if (HEAD[name] && sh.getLastRow() >= 1 && sh.getRange(1, HEAD[name].length).getDisplayValue() === '') {
    sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold');
  }
  if (name === T.MASTER && sh.getRange(1, COL.school).getDisplayValue() !== 'School Email') {
    sh.getRange(1, COL.school, 1, 2).setValues([['School Email', 'Personal Email']]).setFontWeight('bold');
  }
  return sh;
}
function findRow_(sh, idx) { return findRowBy_(sh, 3, idx); }
function findRowBy_(sh, col, value) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const vals = sh.getRange(2, col, last - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === value) return i + 2;
  return -1;
}
function log_(ts, action, idx, name, details) {
  const lg = tab_(T.LOG);
  const row = lg.getLastRow() + 1;
  lg.getRange(row, 3).setNumberFormat('@');
  lg.getRange(row, 1, 1, 5).setValues([[ts, action, idx, name, details]]);
}
function notify_(subject, body, replyTo) {
  try {
    const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') ||
      admins_().map(a => a.email).join(',') || Session.getEffectiveUser().getEmail();
    if (!to) return;
    const opts = { to: to, subject: subject, body: body, name: 'GCTU MSc IT Class Portal' };
    if (replyTo) opts.replyTo = replyTo;
    MailApp.sendEmail(opts);
  } catch (err) { log_(now_(), 'Email failed', '', '', String(err)); }
}
function tooMany_(idx) {
  const c = CacheService.getScriptCache();
  const k = 'fb_' + idx;
  const n = Number(c.get(k) || 0);
  if (n >= 5) return true;
  c.put(k, String(n + 1), 3600);
  return false;
}
function emails_(d) {
  const personal = cleanEmail_(d.personalEmail);
  const school = d.schoolEmail ? cleanEmail_(d.schoolEmail) : '';
  if (!String(d.personalEmail || '').trim()) return { error: 'email_required' };
  if (!personal || (String(d.schoolEmail || '').trim() && !school)) return { error: 'invalid_email' };
  return { school: school, personal: personal };
}
function cleanEmail_(s) {
  s = String(s || '').trim().toLowerCase().slice(0, 120);
  return /^[^\s@=+\-][^\s@]*@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : '';
}
function unique_(a) { const o = {}; a.forEach(x => { if (x) o[x] = 1; }); return Object.keys(o).sort(); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function digits_(s) { s = String(s || '').replace(/\s+/g, ''); return /^\d{8,12}$/.test(s) ? s : ''; }
function safe_(s, n) {
  s = String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n || 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s; // stop spreadsheet formula injection
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
