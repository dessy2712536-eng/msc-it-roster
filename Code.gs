/**
 * MSc/MPhil IT Class Roster – verification backend
 * Paste this into the Google Sheet: Extensions → Apps Script → Code.gs
 * Then Deploy → New deployment → Web app
 *   Execute as: Me      Who has access: Anyone
 * Admin password for admin.html: Project Settings (gear) → Script properties →
 *   Add property  ADMIN_KEY = <a long password only you know>
 *   (Never write the password in this file – this file is public on GitHub.)
 */
const MASTER = 'Master List';
const LOG = 'Log';
const TZ = 'Africa/Accra';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'lookup') return json_(lookup_(p.idx));
  return json_({ ok: true, service: 'class-roster' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return json_(handle_(d)); }
  finally { lock.releaseLock(); }
}

function lookup_(idx) {
  idx = digits_(idx);
  if (!idx) return { ok: false, error: 'invalid_index' };
  const sh = sheet_(MASTER);
  const r = findRow_(sh, idx);
  if (r < 0) return { ok: true, found: false };
  const v = sh.getRange(r, 1, 1, 5).getDisplayValues()[0];
  return { ok: true, found: true, name: v[1], idx: v[2], status: v[3], verifiedOn: v[4] };
}

function handle_(d) {
  const action = String(d.action || '');
  if (action === 'admin') return admin_(d.key);
  const idx = digits_(d.idx);
  if (!idx) return { ok: false, error: 'invalid_index' };
  const sh = sheet_(MASTER);
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');

  if (action === 'missing') {
    const name = safe_(d.name, 120);
    if (!name) return { ok: false, error: 'name_required' };
    if (findRow_(sh, idx) > 0) return { ok: false, error: 'already_listed' };
    log_(now, 'Missing name', idx, name, 'Student says they are not on the list');
    return { ok: true };
  }

  const r = findRow_(sh, idx);
  if (r < 0) return { ok: false, error: 'not_found' };
  const listedName = sh.getRange(r, 2).getDisplayValue();

  if (action === 'confirm') {
    sh.getRange(r, 4, 1, 5).setValues([['Verified', now, '', '', '']]);
    log_(now, 'Verified', idx, listedName, 'Details confirmed correct');
    return { ok: true, status: 'Verified', verifiedOn: now };
  }

  if (action === 'correct') {
    const newName = safe_(d.newName, 120);
    const newIdx = digits_(d.newIdx);
    const note = safe_(d.note, 300);
    if (!newName && !newIdx && !note) return { ok: false, error: 'nothing_changed' };
    sh.getRange(r, 7).setNumberFormat('@');
    sh.getRange(r, 4, 1, 5).setValues([[
      'Correction requested', now,
      newName && newName !== listedName ? newName : '',
      newIdx && newIdx !== idx ? newIdx : '',
      note
    ]]);
    const parts = [];
    if (newName && newName !== listedName) parts.push('Name → ' + newName);
    if (newIdx && newIdx !== idx) parts.push('Index → ' + newIdx);
    if (note) parts.push('Note: ' + note);
    log_(now, 'Correction requested', idx, listedName, parts.join(' | '));
    return { ok: true, status: 'Correction requested', verifiedOn: now };
  }

  return { ok: false, error: 'unknown_action' };
}

/* Master list for admin.html – protected by the ADMIN_KEY script property */
function admin_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!real) return { ok: false, error: 'admin_key_not_set' };
  if (String(key || '') !== real) { Utilities.sleep(800); return { ok: false, error: 'wrong_key' }; }
  const sh = sheet_(MASTER);
  const last = sh.getLastRow();
  const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 8).getDisplayValues()
    .filter(r => r[2]).map(r => ({
      no: r[0], name: r[1], idx: r[2], status: r[3] || 'Not verified',
      date: r[4], newName: r[5], newIdx: r[6], note: r[7]
    }));
  const lg = sheet_(LOG);
  const ll = lg.getLastRow();
  const missing = ll < 2 ? [] : lg.getRange(2, 1, ll - 1, 5).getDisplayValues()
    .filter(r => r[1] === 'Missing name').map(r => ({ date: r[0], idx: r[2], name: r[3] }));
  return { ok: true, updated: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), rows: rows, missing: missing };
}

/* helpers */
function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function digits_(s) { s = String(s || '').replace(/\s+/g, ''); return /^\d{8,12}$/.test(s) ? s : ''; }
function safe_(s, n) {
  s = String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n || 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s; // stop spreadsheet formula injection
}
function findRow_(sh, idx) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const vals = sh.getRange(2, 3, last - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === idx) return i + 2;
  return -1;
}
function log_(ts, action, idx, name, details) {
  const lg = sheet_(LOG);
  const row = lg.getLastRow() + 1;
  lg.getRange(row, 3).setNumberFormat('@');
  lg.getRange(row, 1, 1, 5).setValues([[ts, action, idx, name, details]]);
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
