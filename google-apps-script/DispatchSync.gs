/**
 * Dossiers Dispatch — synchronisation avec la feuille Google Sheets
 * Feuille : https://docs.google.com/spreadsheets/d/17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A/edit
 *
 * INSTALLATION :
 * 1. Ouvrir la feuille > Extensions > Apps Script
 * 2. Coller ce fichier (remplacer le contenu par défaut)
 * 3. Renseigner SECRET ci-dessous (ou via Propriétés du script > SECRET)
 * 4. Déployer > Nouveau déploiement > Type : Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui peut accéder : Tous (avec le lien) — obligatoire si un proxy serveur (ex. Vite en dev) appelle /exec sans cookie Google.
 * 5. Déployer > Gérer les déploiements : copier l’URL qui se termine par /exec (pas l’URL de l’éditeur).
 *    Coller dans VITE_GAS_DISPATCH_URL (.env.local), puis redémarrer npm run dev.
 * 6. Même valeur que SECRET (propriété du script ou chaîne dans getSecret_) dans VITE_GAS_DISPATCH_TOKEN.
 *    Après chaque modification du script : Déployer > Gérer > Modifier > Nouvelle version.
 *
 * Dépannage : si l’app affiche « unknown_action » après enregistrement Traitement dispatch, le déploiement
 * /exec est encore une ancienne version (sans append sur la 2e feuille). Recopiez ce fichier dans le projet
 * Apps Script lié au classeur et publiez une nouvelle version du déploiement Web.
 *
 * Sync Web : GET ?action=read&token=SECRET → JSON { values: [[en-têtes],[lignes]...] }
 * GET ?action=ping&token=SECRET → JSON { ok:true } (test déploiement sans toucher à la feuille)
 * POST { token, action:"write", rows } → réécrit les données sur la 1ʳᵉ feuille (Feuille 1, index 0).
 * POST JSON Traitement dispatch (action « dossier_append » ou toute action autre que « write », + champs dossier)
 *   → ajoute une ligne sur la 2ᵉ feuille (Feuille 2). Si une seule feuille existe, « Feuille 2 » est créée.
 * L’app charge depuis la feuille au démarrage et renvoie chaque modification (ajout / suppression).
 *
 * Si vous voyez seulement des dates en colonne A sans titres : ancien autre script ou append ;
 * supprimez ces lignes ou laissez ensureHeaders_ réparer la ligne 1 au prochain read/write.
 *
 * Si le navigateur affiche du HTML « Erreur » sur l’URL /exec, le code ci-dessous ne s’exécute pas :
 * republiez la Web App, vérifiez que ce fichier est bien dans le projet déployé, et testez
 * …/exec?action=ping&token=VOTRE_SECRET (doit renvoyer du JSON).
 */

/** Incrémentez après changement majeur ; visible dans GET ?action=ping pour vérifier la version déployée. */
var DISPATCH_SYNC_DEPLOY_TAG = 'traitement-fe2-2026-04';

var SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A';
/** Feuille 1 (1er onglet) : tableau Dossiers Dispatch — lecture + write. */
var DISPATCH_SHEET_INDEX = 0;
/** Feuille 2 (2e onglet) : lignes Traitement dispatch — append. Créée si absente. */
var TRAITEMENT_SHEET_INDEX = 1;
var TRAITEMENT_INSERT_NAME = 'Feuille 2';

/** Ligne 1 = titres comme dans l’app (dispatchGoogleSheet SHEET_HEADERS). */
/** Colonne A = Date, puis id, N° affaire, … (même ordre que affairesToSheetRows côté app). */
var HEADERS = [
  'Date',
  'id',
  'N° affaire',
  'Statut',
  'Type présence',
  'Gestionnaire absent (id)',
  'Durée absence',
  'Présence (libellé)',
  'Gestionnaire (tour)',
  'Absents (ids)',
];
var DISPATCH_HEADER_BG = '#0a4d9e';
var DISPATCH_HEADER_FG = '#ffffff';
var DISPATCH_ROW_ALT = '#f4f7fb';

/** En-têtes onglet Traitement dispatch (formulaire React). */
var DOSSIER_HEADERS = [
  'Date',
  'N° dossier',
  'Client',
  'Agence',
  'Type',
  'Statut',
  'Gestionnaire',
  'Commentaire',
];
var DOSSIER_COLS = DOSSIER_HEADERS.length;
var DOSSIER_HEADER_BG = '#0a4d9e';
var DOSSIER_HEADER_FG = '#ffffff';
var DOSSIER_ROW_ALT = '#f4f7fb';

/**
 * Jeton Web App : si vous avez défini une propriété du script nommée SECRET
 * (⚙️ Paramètres du projet → Propriétés du script → SECRET), **cette valeur est utilisée**
 * et prime sur toute chaîne dans le code. L’app (.env) doit utiliser **exactement** la même chaîne.
 */
function getSecret_() {
  var p = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (p) return p;
  /* Même valeur dans .env.local : VITE_GAS_DISPATCH_TOKEN=… (sauf si propriété SECRET ci-dessus est définie). */
  return 'REMPLACEZ_PAR_UN_JETON_LONG_ET_SECRET';
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function dispatchSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheets()[DISPATCH_SHEET_INDEX];
}

/** 2e feuille pour Traitement dispatch ; crée « Feuille 2 » s’il n’y a qu’un onglet. */
function traitementSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  if (sheets.length > TRAITEMENT_SHEET_INDEX) {
    return sheets[TRAITEMENT_SHEET_INDEX];
  }
  return ss.insertSheet(TRAITEMENT_INSERT_NAME);
}

function dossierDateCell_(data) {
  var s = data && data.date != null ? String(data.date).trim() : '';
  if (s) {
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return s;
  }
  return Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yyyy');
}

function styleDossierHeaderRow_(sheet) {
  var r = sheet.getRange(1, 1, 1, DOSSIER_COLS);
  r.setFontWeight('bold');
  r.setBackground(DOSSIER_HEADER_BG);
  r.setFontColor(DOSSIER_HEADER_FG);
  r.setFontSize(11);
  r.setVerticalAlignment('middle');
  r.setHorizontalAlignment('center');
}

function ensureDossierHeaderRow_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, DOSSIER_COLS).setValues([DOSSIER_HEADERS]);
    styleDossierHeaderRow_(sheet);
    sheet.setFrozenRows(1);
    for (var c = 1; c <= DOSSIER_COLS; c++) {
      sheet.autoResizeColumn(c);
    }
    return;
  }
  var a1 = String(sheet.getRange(1, 1).getValue() || '')
    .trim()
    .toLowerCase();
  if (a1 === 'date') {
    styleDossierHeaderRow_(sheet);
  }
}

function styleDossierDataRow_(sheet, row) {
  var rng = sheet.getRange(row, 1, 1, DOSSIER_COLS);
  rng.setVerticalAlignment('middle');
  rng.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  if (row % 2 === 0) {
    rng.setBackground(DOSSIER_ROW_ALT);
  }
}

/** Largeurs (px) pour que les titres FR ne se chevauchent pas dans l’UI Sheets. */
var DISPATCH_COL_WIDTHS = [140, 120, 140, 120, 150, 220, 130, 220, 180, 160];

function sizeDispatchColumns_(sh) {
  var n = HEADERS.length;
  for (var c = 0; c < n; c++) {
    var w = DISPATCH_COL_WIDTHS[c] != null ? DISPATCH_COL_WIDTHS[c] : 120;
    if (w > 400) w = 400;
    sh.setColumnWidth(c + 1, w);
  }
}

function styleDispatchHeader_(sh) {
  var n = HEADERS.length;
  var r = sh.getRange(1, 1, 1, n);
  r.setFontWeight('bold');
  r.setBackground(DISPATCH_HEADER_BG);
  r.setFontColor(DISPATCH_HEADER_FG);
  r.setFontSize(10);
  r.setVerticalAlignment('middle');
  r.setHorizontalAlignment('center');
  r.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sh.setRowHeight(1, 40);
}

function styleDispatchDataRows_(sh, fromRow, toRow) {
  var n = HEADERS.length;
  if (fromRow > toRow) return;
  for (var r = fromRow; r <= toRow; r++) {
    var rng = sh.getRange(r, 1, 1, n);
    rng.setVerticalAlignment('middle');
    rng.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    rng.setBackground(r % 2 === 0 ? DISPATCH_ROW_ALT : '#ffffff');
  }
}

function normHeaderCell_(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** La ligne 1 est-elle exactement la ligne d’en-têtes attendue ? */
function firstRowMatchesHeaders_(sh) {
  if (sh.getLastRow() < 1) return false;
  var first = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  for (var i = 0; i < HEADERS.length; i++) {
    if (normHeaderCell_(first[i]) !== normHeaderCell_(HEADERS[i])) return false;
  }
  return true;
}

/**
 * Ancienne saisie : date en A1 et rien en B/C (ex. append dossier) — pas la ligne d’en-têtes.
 * Ne pas confondre avec la ligne 1 correcte : A1 = « Date », B1 = « id », …
 */
function row1IsLegacyDateOnly_(first) {
  var a = first[0];
  var b = first[1];
  var c = first[2];
  if (normHeaderCell_(a) === 'date' && normHeaderCell_(b) === 'id') return false;
  if (b !== '' && b != null) return false;
  if (c !== '' && c != null) return false;
  if (a instanceof Date) return true;
  var s = String(a || '').trim();
  if (!s) return false;
  return /^\d{1,2}\/\d{1,2}\/\d{4}/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
}

function ensureHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    styleDispatchHeader_(sh);
    sizeDispatchColumns_(sh);
    sh.setFrozenRows(1);
    return;
  }
  var first = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var empty = first.every(function (c) { return c === '' || c == null; });
  var matches = firstRowMatchesHeaders_(sh);
  var shouldWriteHeaders = empty || (!matches && row1IsLegacyDateOnly_(first));
  if (shouldWriteHeaders) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    styleDispatchHeader_(sh);
    sizeDispatchColumns_(sh);
    sh.setFrozenRows(1);
  }
}

function normalizeCell_(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function doGet(e) {
  try {
    e = e || {};
    var params = e.parameter || {};
    var action = params.action;
    var token = params.token;

    if (action === 'ping' && token === getSecret_()) {
      return jsonOut_({
        ok: true,
        ping: 'DispatchSync',
        deployTag: DISPATCH_SYNC_DEPLOY_TAG,
        traitementSur2eFeuille: true,
        message: 'Web App OK (sans lecture feuille). Si deployTag manque ailleurs, ce n’est pas cette version.',
      });
    }

    if (action === 'read' && token === getSecret_()) {
      try {
        var sh = dispatchSheet_();
        ensureHeaders_(sh);
        styleDispatchHeader_(sh);
        sizeDispatchColumns_(sh);
        var range = sh.getDataRange();
        var raw = range.getValues();
        var out = [];
        for (var i = 0; i < raw.length; i++) {
          var row = raw[i];
          var norm = [];
          for (var j = 0; j < row.length; j++) norm.push(normalizeCell_(row[j]));
          out.push(norm);
        }
        return jsonOut_({ values: out });
      } catch (err) {
        return jsonOut_({ error: 'sheet_error', detail: String(err.message || err) });
      }
    }

    // Lecture historique Traitement dispatch (feuille 2) : pour recalculer le tour dans l’app.
    if (action === 'read_traitement' && token === getSecret_()) {
      try {
        var tsh = traitementSheet_();
        ensureDossierHeaderRow_(tsh);
        var rawT = tsh.getDataRange().getValues();
        var outT = [];
        for (var ii = 0; ii < rawT.length; ii++) {
          var rowT = rawT[ii];
          var normT = [];
          for (var jj = 0; jj < rowT.length; jj++) normT.push(normalizeCell_(rowT[jj]));
          outT.push(normT);
        }
        return jsonOut_({ success: true, values: outT, deployTag: DISPATCH_SYNC_DEPLOY_TAG });
      } catch (errT) {
        return jsonOut_({ success: false, error: 'sheet_error', detail: String(errT.message || errT) });
      }
    }

    return jsonOut_({
      ok: true,
      hint:
        'Lecture : ?action=read&token=SECRET — Traitement : ?action=read_traitement&token=SECRET — Test : ?action=ping&token=SECRET — Dispatch : POST {token,action:write,rows} sur Feuille 1 — Traitement : POST JSON dossier (sans action) sur Feuille 2'
    });
  } catch (fatal) {
    return jsonOut_({ error: 'doget_fatal', detail: String(fatal.message || fatal) });
  }
}

/** Décode application/x-www-form-urlencoded (clé → valeur, une occurrence par clé). */
function parseFormUrlEncoded_(contents) {
  var out = {};
  var pairs = String(contents).split('&');
  for (var i = 0; i < pairs.length; i++) {
    var p = pairs[i];
    var eq = p.indexOf('=');
    if (eq < 0) continue;
    var k = decodeURIComponent(p.substring(0, eq).replace(/\+/g, ' '));
    var v = decodeURIComponent(p.substring(eq + 1).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}

function parseBody_(e) {
  e = e || {};
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(String(e.parameter.payload));
  }
  if (e.postData && e.postData.contents) {
    var contents = String(e.postData.contents).trim();
    if (!contents) throw new Error('no_body');
    var c0 = contents.charAt(0);
    if (c0 === '{' || c0 === '[') {
      return JSON.parse(contents);
    }
    // Formulaire : "payload=%7B...%7D" (souvent sans e.parameter.payload).
    if (contents.indexOf('payload=') === 0 || contents.indexOf('&payload=') !== -1) {
      var form = parseFormUrlEncoded_(contents);
      if (form.payload) {
        return JSON.parse(form.payload);
      }
    }
    return JSON.parse(contents);
  }
  throw new Error('no_body');
}

/**
 * Tableau 2D strict pour setValues : ignore null / trous, complète à numCols colonnes.
 * Évite « 8 lignes de données mais la plage en possède 9 » si body.rows a une longueur erronée.
 */
function normalizeDispatchRowsForWrite_(rows, numCols) {
  var out = [];
  if (!rows) return out;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r == null) continue;
    if (!(r instanceof Array)) continue;
    var row = [];
    for (var c = 0; c < numCols; c++) {
      var v = c < r.length ? r[c] : '';
      row.push(v != null && v !== void 0 ? v : '');
    }
    out.push(row);
  }
  return out;
}

function doPost(e) {
  try {
    var body;
    try {
      body = parseBody_(e);
    } catch (err) {
      return jsonOut_({
        error: 'invalid_json',
        detail: String(err.message || err)
      });
    }

    if (!body || body.token !== getSecret_()) {
      return jsonOut_({ error: 'unauthorized' });
    }

    // « write » = grille Dossiers dispatch (feuille 1). Tout le reste (ex. dossier_append) = formulaire Traitement (feuille 2).
    if (body.action === 'write') {
      try {
        var sh = dispatchSheet_();
        ensureHeaders_(sh);
        var rows = body.rows;
        if (!rows || !rows.length) {
          var last = sh.getLastRow();
          if (last > 1) sh.deleteRows(2, last - 1);
          styleDispatchHeader_(sh);
          sizeDispatchColumns_(sh);
          return jsonOut_({ ok: true, written: 0 });
        }
        var nCols = HEADERS.length;
        var grid = normalizeDispatchRowsForWrite_(rows, nCols);
        if (!grid.length) {
          var last0 = sh.getLastRow();
          if (last0 > 1) sh.deleteRows(2, last0 - 1);
          styleDispatchHeader_(sh);
          sizeDispatchColumns_(sh);
          return jsonOut_({ ok: true, written: 0 });
        }
        var last2 = sh.getLastRow();
        if (last2 > 1) sh.deleteRows(2, last2 - 1);
        var lastDataRow = 1 + grid.length;
        sh.getRange(2, 1).offset(0, 0, grid.length, HEADERS.length).setValues(grid);
        styleDispatchHeader_(sh);
        sizeDispatchColumns_(sh);
        styleDispatchDataRows_(sh, 2, lastDataRow);
        return jsonOut_({ ok: true, written: grid.length });
      } catch (err) {
        return jsonOut_({
          error: 'sheet_error',
          detail: String(err.message || err)
        });
      }
    }

    // Traitement dispatch : append sur la 2e feuille (réponse attendue par l’app : success)
    try {
      var tsh = traitementSheet_();
      ensureDossierHeaderRow_(tsh);
      tsh.appendRow([
        dossierDateCell_(body),
        body.dossierNumber != null ? String(body.dossierNumber) : '',
        body.clientName != null ? String(body.clientName) : '',
        body.agency != null ? String(body.agency) : '',
        body.type != null ? String(body.type) : '',
        body.status != null ? String(body.status) : '',
        body.manager != null ? String(body.manager) : '',
        body.comment != null ? String(body.comment) : '',
      ]);
      var dr = tsh.getLastRow();
      tsh.getRange(dr, 1).setNumberFormat('@');
      styleDossierDataRow_(tsh, dr);
      return jsonOut_({
        success: true,
        message: 'Ligne ajoutée',
      });
    } catch (errT) {
      return jsonOut_({
        success: false,
        error: String(errT.message || errT),
      });
    }
  } catch (fatal) {
    return jsonOut_({ error: 'dopost_fatal', detail: String(fatal.message || fatal) });
  }
}
