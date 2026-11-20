/*
 * Au Bar de ce Soir — Livre d'or (Apps Script)
 *
 * Tout le site est sur GitHub. Ce script ne sert plus qu'au Livre d'or :
 * les messages des invités sont rangés dans l'onglet « LivreOr » du Google Sheet.
 *
 * Le code du Manager (pour effacer des messages) n'est PAS écrit ici :
 * Paramètres du projet (roue dentée) → Propriétés du script → ADMIN_CODE = ton code.
 */

const SITE_URL = 'https://dak302.github.io/au-bar-de-se-soir/';
const GB_SHEET = 'LivreOr';
const GB_COLS = ['id', 'nom', 'message', 'date'];

/* ---------- Entrées ---------- */

// Ancienne adresse Google : renvoie vers le site GitHub.
// Avec ?fn=getGuestbook : répond en JSON.
function doGet(e) {
  if (e && e.parameter && e.parameter.fn) {
    let args = [];
    try { args = JSON.parse(e.parameter.args || '[]'); } catch (err) {}
    return api_(e.parameter.fn, args);
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Georgia,serif;background:#F7F3EC;color:#1C1A17;min-height:100vh;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;margin:0">' +
    '<div style="font-size:30px">Au Bar de ce Soir</div>' +
    '<a href="' + SITE_URL + '" target="_top" style="color:#1C1A17;border:1.5px solid #1C1A17;' +
    'border-radius:26px;padding:14px 28px;text-decoration:none;font-family:sans-serif">Ouvrir la carte</a></div>')
    .setTitle('Au Bar de ce Soir')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Le site envoie { fn: 'nomDeFonction', args: [...] }.
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return api_(body.fn, Array.isArray(body.args) ? body.args : []);
}

// Seules ces fonctions sont accessibles depuis l'extérieur.
const API_ = {
  getGuestbook: getGuestbook,
  addGuestMessage: addGuestMessage,
  deleteGuestMessage: deleteGuestMessage
};

function api_(fn, args) {
  let out;
  try {
    if (!Object.prototype.hasOwnProperty.call(API_, fn)) throw new Error('Fonction inconnue');
    out = { ok: true, data: API_[fn].apply(null, args) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Stockage ---------- */

function ss_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  const ss = SpreadsheetApp.create('Au Bar de ce Soir – données');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(GB_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GB_SHEET);
    sh.getRange(1, 1, 1, GB_COLS.length).setValues([GB_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function read_() {
  const sh = sheet_();
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, GB_COLS.length).getValues()
    .map(r => {
      const o = {};
      GB_COLS.forEach((c, i) => o[c] = (r[i] instanceof Date) ? r[i].toISOString() : r[i]);
      return o;
    })
    .filter(o => String(o.id).trim() !== '');
}

function write_(rows) {
  const sh = sheet_();
  const n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, Math.max(GB_COLS.length, sh.getLastColumn())).clearContent();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, GB_COLS.length)
      .setValues(rows.map(o => GB_COLS.map(c => (o[c] === undefined || o[c] === null) ? '' : o[c])));
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// Les dates sont gardées en texte (apostrophe) pour que Sheets ne les transforme pas.
const asText_ = d => String(d).charAt(0) === "'" ? d : "'" + d;

/* ---------- Livre d'or ---------- */

function guestbook_() {
  return read_()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 200);
}

function getGuestbook() {
  return guestbook_();
}

function addGuestMessage(nom, message) {
  const n = String(nom || '').trim().slice(0, 40);
  const m = String(message || '').trim().slice(0, 500);
  if (!m) throw new Error('EMPTY');
  return withLock_(() => {
    const rows = read_();
    rows.push({
      id: 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nom: n, message: m, date: new Date().toISOString()
    });
    write_(rows.map(r => Object.assign({}, r, { date: asText_(r.date) })));
    return guestbook_();
  });
}

function deleteGuestMessage(code, id) {
  const real = String(PropertiesService.getScriptProperties().getProperty('ADMIN_CODE') || '').trim();
  if (!real) throw new Error('ADMIN_CODE manquant dans les Propriétés du script');
  if (String(code) !== real) throw new Error('Code incorrect');
  return withLock_(() => {
    write_(read_().filter(x => x.id !== id).map(r => Object.assign({}, r, { date: asText_(r.date) })));
    return guestbook_();
  });
}
