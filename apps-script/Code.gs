/*
 * Au Bar de ce Soir — serveur Apps Script
 *
 * Le code du Manager n'est PAS écrit ici (le dépôt GitHub est public).
 * Il se règle dans Apps Script : Paramètres du projet (roue dentée)
 * → Propriétés du script → ADMIN_CODE = ton code.
 */

const ING_SHEET = 'Ingredients';
const CKT_SHEET = 'Cocktails';
const CAT_SHEET = 'Categories';
const GB_SHEET = 'LivreOr';

const ING_COLS = ['id', 'groupe', 'base', 'nom_fr', 'nom_he', 'nom_en', 'dispo'];
const CKT_COLS = ['id', 'nom', 'categorie', 'style_fr', 'style_he', 'style_en',
  'phrase_fr', 'phrase_he', 'phrase_en', 'ingredients', 'photo', 'ordre'];
const CAT_COLS = ['id', 'photo', 'nom_fr', 'nom_he', 'nom_en', 'ordre'];
const GB_COLS = ['id', 'nom', 'message', 'date'];

const DEFAULT_CATS = [
  { id: 'vodka', nom_fr: 'Vodka', nom_he: 'וודקה', nom_en: 'Vodka', ordre: 1 },
  { id: 'gin', nom_fr: 'Gin', nom_he: "ג'ין", nom_en: 'Gin', ordre: 2 },
  { id: 'tequila', nom_fr: 'Tequila', nom_he: 'טקילה', nom_en: 'Tequila', ordre: 3 },
  { id: 'rhum', nom_fr: 'Rhum', nom_he: 'רום', nom_en: 'Rum', ordre: 4 },
  { id: 'whisky', nom_fr: 'Whisky', nom_he: 'ויסקי', nom_en: 'Whisky', ordre: 5 },
  { id: 'autres', nom_fr: 'Autres', nom_he: 'אחרים', nom_en: 'Others', ordre: 6 },
  { id: 'sansalcool', nom_fr: 'Mocktail', nom_he: 'מוקטייל', nom_en: 'Mocktail', ordre: 7 }
];

/* ---------- Entrées ---------- */

// Ancienne adresse Google Script : affiche toujours le site.
// Avec ?fn=... : répond en JSON (utilisé par le site GitHub).
function doGet(e) {
  if (e && e.parameter && e.parameter.fn) {
    let args = [];
    try { args = JSON.parse(e.parameter.args || '[]'); } catch (err) {}
    return api_(e.parameter.fn, args);
  }
  ensureSetup_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Au Bar de ce Soir')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Le site GitHub envoie { fn: 'nomDeFonction', args: [...] }.
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return api_(body.fn, Array.isArray(body.args) ? body.args : []);
}

// Seules ces fonctions sont accessibles depuis l'extérieur.
const API_ = {
  getPublicData: getPublicData,
  getGuestbook: getGuestbook,
  addGuestMessage: addGuestMessage,
  adminLogin: adminLogin,
  getAdminData: getAdminData,
  setIngredientDispo: setIngredientDispo,
  saveIngredient: saveIngredient,
  deleteIngredient: deleteIngredient,
  saveCocktail: saveCocktail,
  deleteCocktail: deleteCocktail,
  saveCategory: saveCategory,
  deleteCategory: deleteCategory,
  deleteGuestMessage: deleteGuestMessage,
  uploadPhoto: uploadPhoto
};

function api_(fn, args) {
  let out;
  try {
    if (!Object.prototype.hasOwnProperty.call(API_, fn)) throw new Error('Fonction inconnue');
    ensureSetup_();
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

function sheet_(name, cols) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function read_(name, cols) {
  const sh = sheet_(name, cols);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, cols.length).getValues()
    .map(r => {
      const o = {};
      cols.forEach((c, i) => o[c] = (r[i] instanceof Date) ? r[i].toISOString() : r[i]);
      return o;
    })
    .filter(o => String(o.id).trim() !== '');
}

function write_(name, cols, rows) {
  const sh = sheet_(name, cols);
  const n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, Math.max(cols.length, sh.getLastColumn())).clearContent();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, cols.length)
      .setValues(rows.map(o => cols.map(c => (o[c] === undefined || o[c] === null) ? '' : o[c])));
  }
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  const f = DriveApp.createFolder('Au Bar de ce Soir – photos');
  props.setProperty('PHOTO_FOLDER', f.getId());
  return f;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

const isOn_ = v => v === true || String(v).toUpperCase() === 'TRUE';
const reqs_ = c => String(c.ingredients || '').split(',').map(s => s.trim()).filter(Boolean);

function newId_(text) {
  const base = String(text || 'x').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'x';
  return base + '_' + Math.random().toString(36).slice(2, 6);
}

/* ---------- Catégories ---------- */

function allCatRows_() { return read_(CAT_SHEET, CAT_COLS); }

function cats_() {
  return allCatRows_().filter(c => c.id !== 'about')
    .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
}

function aboutPhoto_() {
  const r = allCatRows_().find(c => c.id === 'about');
  return r ? r.photo : '';
}

/* ---------- Disponibilité ---------- */

function missing_(c, ings) {
  return reqs_(c).filter(r => {
    if (r.indexOf('cat:') === 0) {
      const base = r.slice(4);
      return !ings.some(i => i.base === base && isOn_(i.dispo));
    }
    const ing = ings.find(i => i.id === r);
    return !(ing && isOn_(ing.dispo));
  });
}

/* ---------- Public ---------- */

function getPublicData() {
  ensureSetup_();
  const ings = read_(ING_SHEET, ING_COLS);
  const ckts = read_(CKT_SHEET, CKT_COLS);

  const visible = ckts
    .filter(c => missing_(c, ings).length === 0)
    .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));

  const labels = {};
  visible.forEach(c => reqs_(c).forEach(r => {
    if (r.indexOf('cat:') === 0 || labels[r]) return;
    const i = ings.find(x => x.id === r);
    if (i) labels[r] = { fr: i.nom_fr, he: i.nom_he, en: i.nom_en };
  }));

  return {
    categories: cats_(),
    aboutPhoto: aboutPhoto_(),
    cocktails: visible.map(c => ({
      id: c.id, nom: c.nom, categorie: c.categorie,
      style_fr: c.style_fr, style_he: c.style_he, style_en: c.style_en,
      phrase_fr: c.phrase_fr, phrase_he: c.phrase_he, phrase_en: c.phrase_en,
      ingredients: reqs_(c), photo: c.photo
    })),
    labels: labels
  };
}

function guestbook_() {
  return read_(GB_SHEET, GB_COLS)
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
    const rows = read_(GB_SHEET, GB_COLS);
    rows.push({ id: newId_('msg'), nom: n, message: m, date: "'" + new Date().toISOString() });
    write_(GB_SHEET, GB_COLS, rows.map(r => Object.assign({}, r, {
      date: String(r.date).charAt(0) === "'" ? r.date : "'" + r.date
    })));
    return guestbook_();
  });
}

/* ---------- Manager ---------- */

function adminCode_() {
  return String(PropertiesService.getScriptProperties().getProperty('ADMIN_CODE') || '').trim();
}

function isAdmin_(code) {
  const real = adminCode_();
  return real !== '' && String(code) === real;
}

function check_(code) {
  if (!isAdmin_(code)) throw new Error('Code incorrect');
}

function adminLogin(code) {
  if (!adminCode_()) throw new Error('ADMIN_CODE manquant dans les Propriétés du script');
  return isAdmin_(code);
}

function adminData_() {
  const ings = read_(ING_SHEET, ING_COLS).map(i => Object.assign({}, i, { dispo: isOn_(i.dispo) }));
  const ckts = read_(CKT_SHEET, CKT_COLS)
    .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
    .map(c => Object.assign({}, c, { ingredients: reqs_(c), manque: missing_(c, ings) }));
  return { ingredients: ings, cocktails: ckts, categories: cats_(), aboutPhoto: aboutPhoto_(), guestbook: guestbook_() };
}

function getAdminData(code) {
  check_(code);
  return adminData_();
}

function setIngredientDispo(code, id, on) {
  check_(code);
  return withLock_(() => {
    const ings = read_(ING_SHEET, ING_COLS);
    const i = ings.find(x => x.id === id);
    if (i) i.dispo = !!on;
    write_(ING_SHEET, ING_COLS, ings);
    return adminData_();
  });
}

function saveIngredient(code, obj) {
  check_(code);
  return withLock_(() => {
    const ings = read_(ING_SHEET, ING_COLS);
    const clean = {
      groupe: obj.groupe || 'frais',
      base: obj.groupe === 'alcool' ? (obj.base || '') : '',
      nom_fr: String(obj.nom_fr || '').trim(),
      nom_he: String(obj.nom_he || '').trim(),
      nom_en: String(obj.nom_en || '').trim(),
      dispo: !!obj.dispo
    };
    if (!clean.nom_fr) throw new Error('Le nom est obligatoire');
    const existing = obj.id && ings.find(x => x.id === obj.id);
    if (existing) Object.assign(existing, clean);
    else ings.push(Object.assign({ id: newId_(clean.nom_fr) }, clean));
    write_(ING_SHEET, ING_COLS, ings);
    return adminData_();
  });
}

function deleteIngredient(code, id) {
  check_(code);
  return withLock_(() => {
    const ckts = read_(CKT_SHEET, CKT_COLS);
    const usedBy = ckts.filter(c => reqs_(c).indexOf(id) !== -1).map(c => c.nom);
    if (usedBy.length) return { ok: false, usedBy: usedBy, data: adminData_() };
    write_(ING_SHEET, ING_COLS, read_(ING_SHEET, ING_COLS).filter(x => x.id !== id));
    return { ok: true, data: adminData_() };
  });
}

function saveCocktail(code, obj) {
  check_(code);
  return withLock_(() => {
    const ckts = read_(CKT_SHEET, CKT_COLS);
    const catIds = cats_().map(c => c.id);
    const clean = {
      nom: String(obj.nom || '').trim(),
      categorie: catIds.indexOf(obj.categorie) !== -1 ? obj.categorie : 'autres',
      style_fr: obj.style_fr || '', style_he: obj.style_he || '', style_en: obj.style_en || '',
      phrase_fr: obj.phrase_fr || '', phrase_he: obj.phrase_he || '', phrase_en: obj.phrase_en || '',
      ingredients: (obj.ingredients || []).join(',')
    };
    if (!clean.nom) throw new Error('Le nom est obligatoire');
    if (!clean.ingredients) throw new Error('Ajoute au moins un ingrédient');
    let id = obj.id;
    const existing = id && ckts.find(x => x.id === id);
    if (existing) {
      Object.assign(existing, clean);
    } else {
      id = newId_(clean.nom);
      const maxOrder = ckts.reduce((m, c) => Math.max(m, Number(c.ordre) || 0), 0);
      ckts.push(Object.assign({ id: id, photo: '', ordre: maxOrder + 1 }, clean));
    }
    write_(CKT_SHEET, CKT_COLS, ckts);
    return { id: id, data: adminData_() };
  });
}

function deleteCocktail(code, id) {
  check_(code);
  return withLock_(() => {
    write_(CKT_SHEET, CKT_COLS, read_(CKT_SHEET, CKT_COLS).filter(x => x.id !== id));
    return adminData_();
  });
}

function saveCategory(code, obj) {
  check_(code);
  return withLock_(() => {
    const rows = allCatRows_();
    const clean = {
      nom_fr: String(obj.nom_fr || '').trim(),
      nom_he: String(obj.nom_he || '').trim(),
      nom_en: String(obj.nom_en || '').trim()
    };
    if (!clean.nom_fr) throw new Error('Le nom est obligatoire');
    let id = obj.id;
    const existing = id && rows.find(x => x.id === id);
    if (existing) {
      Object.assign(existing, clean);
    } else {
      id = newId_(clean.nom_fr);
      const maxOrder = rows.reduce((m, c) => Math.max(m, Number(c.ordre) || 0), 0);
      rows.push(Object.assign({ id: id, photo: '', ordre: maxOrder + 1 }, clean));
    }
    write_(CAT_SHEET, CAT_COLS, rows);
    return { id: id, data: adminData_() };
  });
}

function deleteCategory(code, id) {
  check_(code);
  return withLock_(() => {
    const ckts = read_(CKT_SHEET, CKT_COLS).filter(c => c.categorie === id).map(c => c.nom);
    const ings = read_(ING_SHEET, ING_COLS).filter(i => i.base === id).map(i => i.nom_fr);
    const usedBy = ckts.concat(ings);
    if (usedBy.length) return { ok: false, usedBy: usedBy, data: adminData_() };
    write_(CAT_SHEET, CAT_COLS, allCatRows_().filter(x => x.id !== id));
    return { ok: true, data: adminData_() };
  });
}

function deleteGuestMessage(code, id) {
  check_(code);
  return withLock_(() => {
    const rows = read_(GB_SHEET, GB_COLS).filter(x => x.id !== id)
      .map(r => Object.assign({}, r, { date: "'" + r.date }));
    write_(GB_SHEET, GB_COLS, rows);
    return adminData_();
  });
}

function uploadPhoto(code, kind, id, dataUrl) {
  check_(code);
  const b64 = String(dataUrl).split(',')[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', kind + '_' + id + '.jpg');
  const file = folder_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  const url = 'https://lh3.googleusercontent.com/d/' + file.getId();

  return withLock_(() => {
    const name = kind === 'categorie' ? CAT_SHEET : CKT_SHEET;
    const cols = kind === 'categorie' ? CAT_COLS : CKT_COLS;
    const rows = read_(name, cols);
    let row = rows.find(x => x.id === id);
    if (!row && kind === 'categorie') { row = { id: id, photo: '', ordre: 0 }; rows.push(row); }
    if (row) {
      const old = String(row.photo || '').split('/d/')[1];
      if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) {} }
      row.photo = url;
      write_(name, cols, rows);
    }
    return adminData_();
  });
}

/* ---------- Installation et mises à jour ---------- */

function ensureSetup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_V2') === '1') return;
  withLock_(() => {
    if (props.getProperty('SETUP_V2') === '1') return;
    const ss = ss_();
    sheet_(ING_SHEET, ING_COLS);
    sheet_(CKT_SHEET, CKT_COLS);
    const catSh = sheet_(CAT_SHEET, CAT_COLS);
    catSh.getRange(1, 1, 1, CAT_COLS.length).setValues([CAT_COLS]).setFontWeight('bold');
    sheet_(GB_SHEET, GB_COLS);
    ss.getSheets().forEach(s => {
      if ([ING_SHEET, CKT_SHEET, CAT_SHEET, GB_SHEET].indexOf(s.getName()) === -1 && s.getLastRow() === 0) {
        try { ss.deleteSheet(s); } catch (e) {}
      }
    });
    if (props.getProperty('SEEDED') !== '1') {
      if (!read_(ING_SHEET, ING_COLS).length) write_(ING_SHEET, ING_COLS, SEED_INGREDIENTS_);
      if (!read_(CKT_SHEET, CKT_COLS).length) write_(CKT_SHEET, CKT_COLS, SEED_COCKTAILS_);
      props.setProperty('SEEDED', '1');
    }
    const cats = read_(CAT_SHEET, CAT_COLS);
    DEFAULT_CATS.forEach(d => {
      const c = cats.find(x => x.id === d.id);
      if (!c) cats.push(Object.assign({ photo: '' }, d));
      else {
        if (!c.nom_fr || (d.id === 'sansalcool' && c.nom_fr === 'Sans alcool')) {
          c.nom_fr = d.nom_fr; c.nom_he = d.nom_he; c.nom_en = d.nom_en;
        }
        if (!c.ordre) c.ordre = d.ordre;
      }
    });
    write_(CAT_SHEET, CAT_COLS, cats);
    props.setProperty('SETUP_V2', '1');
  });
}

const SEED_INGREDIENTS_ = [
  { id: 'vodka_greygoose', groupe: 'alcool', base: 'vodka', nom_fr: 'Vodka Grey Goose', nom_he: 'וודקה גריי גוס', nom_en: 'Grey Goose Vodka', dispo: true },
  { id: 'gin_beefeater', groupe: 'alcool', base: 'gin', nom_fr: 'Gin Beefeater', nom_he: "ג'ין ביפיטר", nom_en: 'Beefeater Gin', dispo: true },
  { id: 'gin_thinker', groupe: 'alcool', base: 'gin', nom_fr: 'Gin Thinker rosé', nom_he: "ג'ין ת'ינקר רוזה", nom_en: 'Thinker Rosé Gin', dispo: true },
  { id: 'rhum_bacardi', groupe: 'alcool', base: 'rhum', nom_fr: 'Rhum Bacardi blanc', nom_he: 'רום בקרדי לבן', nom_en: 'Bacardi White Rum', dispo: true },
  { id: 'cointreau', groupe: 'liqueur', base: '', nom_fr: 'Cointreau', nom_he: 'קואנטרו', nom_en: 'Cointreau', dispo: true },
  { id: 'campari', groupe: 'liqueur', base: '', nom_fr: 'Campari', nom_he: 'קמפרי', nom_en: 'Campari', dispo: true },
  { id: 'martini_rosso', groupe: 'liqueur', base: '', nom_fr: 'Martini Rosso', nom_he: 'מרטיני רוסו', nom_en: 'Martini Rosso', dispo: true },
  { id: 'liq_passion', groupe: 'liqueur', base: '', nom_fr: 'Liqueur de fruit de la passion', nom_he: 'ליקר פסיפלורה', nom_en: 'Passion fruit liqueur', dispo: true },
  { id: 'liq_fraise', groupe: 'liqueur', base: '', nom_fr: 'Liqueur de fraise', nom_he: 'ליקר תות', nom_en: 'Strawberry liqueur', dispo: true },
  { id: 'liq_amande', groupe: 'liqueur', base: '', nom_fr: "Liqueur d'amande", nom_he: 'ליקר שקדים', nom_en: 'Almond liqueur', dispo: true },
  { id: 'liq_chocolat', groupe: 'liqueur', base: '', nom_fr: 'Liqueur de chocolat Mozart', nom_he: 'ליקר שוקולד מוצרט', nom_en: 'Mozart chocolate liqueur', dispo: true },
  { id: 'creme_pamplemousse', groupe: 'liqueur', base: '', nom_fr: 'Crème de pamplemousse Védrenne', nom_he: 'קרם אשכולית ודרן', nom_en: 'Védrenne grapefruit liqueur', dispo: false },
  { id: 'sirop_sucre', groupe: 'sirop', base: '', nom_fr: 'Sirop de sucre demerara', nom_he: 'סירופ סוכר דמררה', nom_en: 'Demerara syrup', dispo: true },
  { id: 'sirop_passion', groupe: 'sirop', base: '', nom_fr: 'Sirop de fruit de la passion', nom_he: 'סירופ פסיפלורה', nom_en: 'Passion fruit syrup', dispo: true },
  { id: 'citron', groupe: 'frais', base: '', nom_fr: 'Citron jaune', nom_he: 'לימון', nom_en: 'Lemon', dispo: true },
  { id: 'menthe', groupe: 'frais', base: '', nom_fr: 'Menthe', nom_he: 'נענע', nom_en: 'Mint', dispo: true },
  { id: 'basilic', groupe: 'frais', base: '', nom_fr: 'Basilic', nom_he: 'בזיליקום', nom_en: 'Basil', dispo: false },
  { id: 'ginger_beer', groupe: 'frais', base: '', nom_fr: 'Ginger beer', nom_he: "ג'ינג'ר בירה", nom_en: 'Ginger beer', dispo: true },
  { id: 'eau_gazeuse', groupe: 'frais', base: '', nom_fr: 'Eau gazeuse', nom_he: 'סודה', nom_en: 'Sparkling water', dispo: false },
  { id: 'angostura', groupe: 'bitters', base: '', nom_fr: 'Angostura bitters', nom_he: 'אנגוסטורה ביטרס', nom_en: 'Angostura bitters', dispo: true }
];

const SEED_COCKTAILS_ = [
  { id: 'passion_martini', nom: 'Passion Martini', categorie: 'vodka',
    style_fr: 'Fruité · Exotique', style_he: 'פירותי · אקזוטי', style_en: 'Fruity · Exotic',
    phrase_fr: 'Velouté et ensoleillé, le fruit de la passion à son meilleur.',
    phrase_he: 'קטיפתי ושמשי, פסיפלורה במיטבה.',
    phrase_en: 'Silky and sunny, passion fruit at its best.',
    ingredients: 'cat:vodka,liq_passion,sirop_passion,citron', photo: '', ordre: 1 },
  { id: 'lemon_drop', nom: 'Lemon Drop', categorie: 'vodka',
    style_fr: 'Acidulé · Vif', style_he: 'חמצמץ · רענן', style_en: 'Tart · Bright',
    phrase_fr: 'Le citron dans sa version la plus élégante.',
    phrase_he: 'לימון בגרסה הכי אלגנטית שלו.',
    phrase_en: 'Lemon at its most elegant.',
    ingredients: 'cat:vodka,cointreau,citron,sirop_sucre', photo: '', ordre: 2 },
  { id: 'moscow_mule', nom: 'Moscow Mule', categorie: 'vodka',
    style_fr: 'Frais · Épicé', style_he: 'רענן · חריף', style_en: 'Fresh · Spicy',
    phrase_fr: 'Le piquant du gingembre, servi bien frais.',
    phrase_he: "העוקץ של הג'ינג'ר, מוגש קר.",
    phrase_en: "Ginger's kick, served ice-cold.",
    ingredients: 'cat:vodka,ginger_beer,citron', photo: '', ordre: 3 },
  { id: 'strawberry_sour', nom: 'Strawberry Sour', categorie: 'vodka',
    style_fr: 'Fruité · Acidulé', style_he: 'פירותי · חמצמץ', style_en: 'Fruity · Tart',
    phrase_fr: "La fraise, relevée d'une pointe d'acidité.",
    phrase_he: 'תות, עם נגיעה חמצמצה.',
    phrase_en: 'Strawberry, lifted by a bright sour edge.',
    ingredients: 'cat:vodka,liq_fraise,citron,sirop_sucre', photo: '', ordre: 4 },
  { id: 'gimlet', nom: 'Gimlet', categorie: 'gin',
    style_fr: 'Frais · Acidulé', style_he: 'רענן · חמצמץ', style_en: 'Fresh · Tart',
    phrase_fr: 'Net, vif, intemporel.',
    phrase_he: 'נקי, חד, על-זמני.',
    phrase_en: 'Crisp, sharp, timeless.',
    ingredients: 'cat:gin,citron,sirop_sucre', photo: '', ordre: 5 },
  { id: 'negroni', nom: 'Negroni', categorie: 'gin',
    style_fr: 'Amer · Intense', style_he: 'מריר · עוצמתי', style_en: 'Bitter · Bold',
    phrase_fr: 'Trois ingrédients, un classique absolu.',
    phrase_he: 'שלושה מרכיבים, קלאסיקה מוחלטת.',
    phrase_en: 'Three ingredients, one absolute classic.',
    ingredients: 'cat:gin,campari,martini_rosso', photo: '', ordre: 6 },
  { id: 'gin_basil_smash', nom: 'Gin Basil Smash', categorie: 'gin',
    style_fr: 'Herbacé · Frais', style_he: 'עשבוני · רענן', style_en: 'Herbal · Fresh',
    phrase_fr: 'Basilic et pamplemousse, en parfait équilibre.',
    phrase_he: 'בזיליקום ואשכולית באיזון מושלם.',
    phrase_en: 'Basil and grapefruit in perfect balance.',
    ingredients: 'cat:gin,basilic,citron,creme_pamplemousse,sirop_sucre', photo: '', ordre: 7 },
  { id: 'daiquiri', nom: 'Daiquiri', categorie: 'rhum',
    style_fr: 'Frais · Équilibré', style_he: 'רענן · מאוזן', style_en: 'Fresh · Balanced',
    phrase_fr: 'La simplicité parfaite du rhum blanc.',
    phrase_he: 'הפשטות המושלמת של רום לבן.',
    phrase_en: 'White rum in perfect simplicity.',
    ingredients: 'cat:rhum,citron,sirop_sucre', photo: '', ordre: 8 },
  { id: 'strawberry_daiquiri', nom: 'Strawberry Daiquiri', categorie: 'rhum',
    style_fr: 'Fruité · Gourmand', style_he: 'פירותי · מפנק', style_en: 'Fruity · Indulgent',
    phrase_fr: "L'été dans un verre.",
    phrase_he: 'קיץ בכוס.',
    phrase_en: 'Summer in a glass.',
    ingredients: 'cat:rhum,liq_fraise,citron,sirop_sucre', photo: '', ordre: 9 },
  { id: 'mai_tai', nom: 'Mai Tai', categorie: 'rhum',
    style_fr: 'Exotique · Amandé', style_he: 'אקזוטי · שקדי', style_en: 'Exotic · Nutty',
    phrase_fr: "Une escapade tiki aux notes d'amande.",
    phrase_he: 'בריחה טרופית עם ניחוחות שקד.',
    phrase_en: 'A tiki escape with notes of almond.',
    ingredients: 'cat:rhum,cointreau,liq_amande,citron,sirop_sucre', photo: '', ordre: 10 },
  { id: 'mojito', nom: 'Mojito', categorie: 'rhum',
    style_fr: 'Frais · Mentholé', style_he: 'רענן · נענעי', style_en: 'Fresh · Minty',
    phrase_fr: "Menthe fraîche et bulles, l'éternel favori.",
    phrase_he: 'נענע טרייה ובועות, האהוב הנצחי.',
    phrase_en: 'Fresh mint and bubbles, the eternal favourite.',
    ingredients: 'cat:rhum,menthe,citron,sirop_sucre,eau_gazeuse', photo: '', ordre: 11 }
];
