/**
 * =============================================================================
 * APPS SCRIPT — 2 ONGLETS : « Dossiers Dispatch » + « Traitement dispatch »
 * =============================================================================
 *
 * À COLler dans le même projet que votre feuille (Extensions → Apps Script),
 * en remplacement ou en complément d’un ancien script, puis :
 *   Déployer → Gérer les déploiements → Application Web → Nouvelle version.
 *
 * COMPORTEMENT
 * - GET  ?action=read&token=SECRET  → lit UNIQUEMENT l’onglet DISPATCH (affaires).
 * - POST { token, action:"write", rows } → réécrit UNIQUEMENT l’onglet DISPATCH.
 * - POST { token, date, dossierNumber, … } (sans action write) → AJOUTE une ligne
 *   sur l’onglet TRAITEMENT (« Traitement dispatch » dans l’app).
 *
 * ONGLETS (même classeur, SPREADSHEET_ID)
 * - DISPATCH_SHEET_NAME : ex. « Dispatch » — créez cet onglet et mettez le même nom,
 *   ou changez la constante pour correspondre à votre onglet existant (ex. « Feuille 1 »).
 * - TRAITEMENT_SHEET_NAME : ex. « Traitement dispatch » — créé automatiquement au
 *   premier enregistrement si absent.
 *
 * SECRET : propriété du script « SECRET » (recommandé) ou chaîne dans getSecret_().
 * Même valeur que VITE_GAS_DISPATCH_TOKEN dans .env.local de l’app.
 *
 * (Le code ci‑dessous est aligné sur MergedDispatchDossierWebApp.gs du dépôt.)
 * =============================================================================
 */

var SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A';
/** Page « Dossiers Dispatch » : sync tableau affaires. */
var DISPATCH_SHEET_NAME = 'Dispatch';
/** Page « Traitement dispatch » : une ligne ajoutée par sauvegarde. */
var TRAITEMENT_SHEET_NAME = 'Traitement dispatch';

function getSecret_() {
  var p = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (p) return p;
  return 'REMPLACEZ_PAR_UN_JETON_LONG_ET_SECRET';
}

var DISPATCH_HEADERS = [
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
var DISPATCH_COLS = DISPATCH_HEADERS.length;
var DISPATCH_HEADER_BG = '#0a4d9e';
var DISPATCH_HEADER_FG = '#ffffff';
var DISPATCH_ROW_ALT = '#f4f7fb';
var DISPATCH_COL_WIDTHS = [140, 120, 140, 120, 150, 220, 130, 220, 180, 160];

function sizeDispatchColsMerged_(sh) {
  for (var c = 0; c < DISPATCH_COLS; c++) {
    var w = DISPATCH_COL_WIDTHS[c] != null ? DISPATCH_COL_WIDTHS[c] : 120;
    if (w > 400) w = 400;
    sh.setColumnWidth(c + 1, w);
  }
}

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

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normalizeCell_(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function getDispatchSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(DISPATCH_SHEET_NAME);
  if (!sh) {
    throw new Error('Onglet introuvable : ' + DISPATCH_SHEET_NAME + ' — créez-le ou modifiez DISPATCH_SHEET_NAME.');
  }
  return sh;
}

function getTraitementSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(TRAITEMENT_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(TRAITEMENT_SHEET_NAME);
  }
  return sh;
}

function styleDispatchHeaderRowMerged_(sh) {
  var r = sh.getRange(1, 1, 1, DISPATCH_COLS);
  r.setFontWeight('bold');
  r.setBackground(DISPATCH_HEADER_BG);
  r.setFontColor(DISPATCH_HEADER_FG);
  r.setFontSize(10);
  r.setVerticalAlignment('middle');
  r.setHorizontalAlignment('center');
  r.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sh.setRowHeight(1, 40);
}

function styleDispatchDataRowsMerged_(sh, fromRow, toRow) {
  if (fromRow > toRow) return;
  for (var r = fromRow; r <= toRow; r++) {
    var rng = sh.getRange(r, 1, 1, DISPATCH_COLS);
    rng.setVerticalAlignment('middle');
    rng.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    rng.setBackground(r % 2 === 0 ? DISPATCH_ROW_ALT : '#ffffff');
  }
}

function ensureDispatchHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, DISPATCH_COLS).setValues([DISPATCH_HEADERS]);
    styleDispatchHeaderRowMerged_(sh);
    sizeDispatchColsMerged_(sh);
    sh.setFrozenRows(1);
    return;
  }
  var first = sh.getRange(1, 1, 1, DISPATCH_COLS).getValues()[0];
  var empty = first.every(function (c) {
    return c === '' || c == null;
  });
  if (empty) {
    sh.getRange(1, 1, 1, DISPATCH_COLS).setValues([DISPATCH_HEADERS]);
    styleDispatchHeaderRowMerged_(sh);
    sizeDispatchColsMerged_(sh);
    sh.setFrozenRows(1);
  }
}

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

function parsePostBody_(e) {
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

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    var token = e && e.parameter ? e.parameter.token : '';

    if (token !== getSecret_()) {
      return jsonOut_({ success: false, error: 'unauthorized' });
    }

    if (action === 'ping') {
      return jsonOut_({
        success: true,
        action: 'ping',
        tokenOk: true,
      });
    }

    if (action === 'read') {
      var sheet = getDispatchSheet_();
      ensureDispatchHeaders_(sheet);
      styleDispatchHeaderRowMerged_(sheet);
      sizeDispatchColsMerged_(sheet);
      var raw = sheet.getDataRange().getValues();
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var row = raw[i];
        var norm = [];
        for (var j = 0; j < row.length; j++) norm.push(normalizeCell_(row[j]));
        out.push(norm);
      }
      return jsonOut_({
        success: true,
        values: out,
      });
    }

    return jsonOut_({
      success: true,
      message: 'doGet ok',
      hint: 'Lecture : ?action=read&token=SECRET — ping : ?action=ping&token=SECRET',
    });
  } catch (err) {
    return jsonOut_({
      success: false,
      error: String(err.message || err),
    });
  }
}

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
    var data;
    try {
      data = parsePostBody_(e);
    } catch (parseErr) {
      return jsonOut_({
        success: false,
        error: 'invalid_body',
        detail: String(parseErr.message || parseErr),
      });
    }

    if (!data.token || data.token !== getSecret_()) {
      return jsonOut_({ success: false, error: 'unauthorized' });
    }

    if (data.action === 'write') {
      var sh = getDispatchSheet_();
      ensureDispatchHeaders_(sh);
      var rows = data.rows;
      if (!rows || !rows.length) {
        var last = sh.getLastRow();
        if (last > 1) sh.deleteRows(2, last - 1);
        styleDispatchHeaderRowMerged_(sh);
        sizeDispatchColsMerged_(sh);
        return jsonOut_({ ok: true, written: 0 });
      }
      var grid = normalizeDispatchRowsForWrite_(rows, DISPATCH_COLS);
      if (!grid.length) {
        var last0 = sh.getLastRow();
        if (last0 > 1) sh.deleteRows(2, last0 - 1);
        styleDispatchHeaderRowMerged_(sh);
        sizeDispatchColsMerged_(sh);
        return jsonOut_({ ok: true, written: 0 });
      }
      var last2 = sh.getLastRow();
      if (last2 > 1) sh.deleteRows(2, last2 - 1);
      var lastDataRow = 1 + grid.length;
      sh.getRange(2, 1).offset(0, 0, grid.length, DISPATCH_COLS).setValues(grid);
      styleDispatchHeaderRowMerged_(sh);
      sizeDispatchColsMerged_(sh);
      styleDispatchDataRowsMerged_(sh, 2, lastDataRow);
      return jsonOut_({ ok: true, written: grid.length });
    }

    var sheet = getTraitementSheet_();
    ensureDossierHeaderRow_(sheet);
    sheet.appendRow([
      dossierDateCell_(data),
      data.dossierNumber != null ? String(data.dossierNumber) : '',
      data.clientName != null ? String(data.clientName) : '',
      data.agency != null ? String(data.agency) : '',
      data.type != null ? String(data.type) : '',
      data.status != null ? String(data.status) : '',
      data.manager != null ? String(data.manager) : '',
      data.comment != null ? String(data.comment) : '',
    ]);
    var dr = sheet.getLastRow();
    sheet.getRange(dr, 1).setNumberFormat('@');
    styleDossierDataRow_(sheet, dr);

    return jsonOut_({
      success: true,
      message: 'Ligne ajoutée',
    });
  } catch (err) {
    return jsonOut_({
      success: false,
      error: String(err.message || err),
    });
  }
}
