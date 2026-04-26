/**
 * Web App unique — 3 feuilles (onglets) dans le même classeur :
 * - Feuille 1 (index 0) : Dossiers Dispatch (GET read + POST write rows)
 * - Feuille "Feuille 2" : Traitement dispatch (POST dossier_append + GET read_traitement)
 * - Feuille "Relances" : Relances (POST relance_append + GET read_relances)
 *
 * Endpoints :
 * GET  ?action=ping&token=SECRET
 * GET  ?action=read&token=SECRET                → Dispatch feuille 1
 * GET  ?action=read_traitement&token=SECRET     → Traitement feuille "Feuille 2"
 * GET  ?action=read_relances&token=SECRET       → Relances feuille "Relances"
 *
 * POST JSON :
 * - { token, action:"write", rows:[[...],[...]] } → remplace les lignes de Dispatch (feuille 1)
 * - { token, action:"dossier_append", date, dossierNumber, type, manager, comment, ... } → append Traitement (feuille "Feuille 2")
 * - { token, action:"relance_append", date, manager, affaire, documentManquant } → append Relances (feuille "Relances")
 * - { token, action:"relance_delete", items:[{date,manager,affaire,documentManquant}, ...] } → supprime des relances
 *
 * IMPORTANT : après modification → Déployer → Gérer les déploiements → Modifier → Nouvelle version.
 */

var SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A';

// --- Feuille 1 : Dispatch ---
var DISPATCH_SHEET_INDEX = 0;
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

// --- Traitement dispatch : onglet nommé "Feuille 2" ---
var TRAITEMENT_SHEET_NAME = 'Feuille 2';
var DOSSIER_HEADERS = ['Date', 'N° dossier', 'Client', 'Agence', 'Type', 'Statut', 'Gestionnaire', 'Commentaire'];
var DOSSIER_COLS = DOSSIER_HEADERS.length;

// --- Relances : onglet nommé "Relances" ---
var RELANCES_SHEET_NAME = 'Relances';
var RELANCES_HEADERS = ['Date', 'Gestionnaire', 'Affaire', 'Document manquant', 'Validé'];
var RELANCES_COLS = RELANCES_HEADERS.length;

function getSecret_() {
  var p = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (p) return p;
  return 'REMPLACEZ_PAR_UN_JETON_LONG_ET_SECRET';
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normalizeCell_(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function dispatchSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheets()[DISPATCH_SHEET_INDEX];
}

function traitementSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(TRAITEMENT_SHEET_NAME);
  if (sh) return sh;
  return ss.insertSheet(TRAITEMENT_SHEET_NAME);
}

function relancesSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var sh = ss.getSheetByName(RELANCES_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(RELANCES_SHEET_NAME);
  return sh;
}

// Debug helpers (ne créent pas de feuilles)
function sheetNames_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheets().map(function (s) {
    return s.getName();
  });
}

function firstRow_(sh, cols) {
  if (!sh) return [];
  var lastCol = cols || sh.getLastColumn();
  if (!lastCol || lastCol < 1) return [];
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var out = [];
  for (var i = 0; i < row.length; i++) out.push(normalizeCell_(row[i]));
  return out;
}

function traitementSheetMaybe_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(TRAITEMENT_SHEET_NAME);
}

function relancesSheetMaybe_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(RELANCES_SHEET_NAME);
}

function sizeDispatchColumns_(sh) {
  for (var c = 0; c < DISPATCH_COLS; c++) {
    var w = DISPATCH_COL_WIDTHS[c] != null ? DISPATCH_COL_WIDTHS[c] : 120;
    if (w > 400) w = 400;
    sh.setColumnWidth(c + 1, w);
  }
}

function styleDispatchHeader_(sh) {
  var r = sh.getRange(1, 1, 1, DISPATCH_COLS);
  r.setFontWeight('bold');
  r.setBackground(DISPATCH_HEADER_BG);
  r.setFontColor(DISPATCH_HEADER_FG);
  r.setFontSize(10);
  r.setVerticalAlignment('middle');
  r.setHorizontalAlignment('center');
  r.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
}

function styleDispatchDataRows_(sh, fromRow, toRow) {
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
    styleDispatchHeader_(sh);
    sizeDispatchColumns_(sh);
    return;
  }
  var first = sh.getRange(1, 1, 1, DISPATCH_COLS).getValues()[0];
  var empty = true;
  for (var i = 0; i < DISPATCH_COLS; i++) {
    if (first[i] !== '' && first[i] != null) { empty = false; break; }
  }
  if (empty) {
    sh.getRange(1, 1, 1, DISPATCH_COLS).setValues([DISPATCH_HEADERS]);
    styleDispatchHeader_(sh);
    sizeDispatchColumns_(sh);
  }
}

function ensureDossierHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, DOSSIER_COLS).setValues([DOSSIER_HEADERS]);
    sh.setFrozenRows(1);
    return;
  }
  var a1 = String(sh.getRange(1, 1).getValue() || '').trim().toLowerCase();
  if (a1 !== 'date') {
    // on ne force pas (au cas où onglet différent) ; mais si vide, on pourrait.
  }
}

function ensureRelancesHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, RELANCES_COLS).setValues([RELANCES_HEADERS]);
    sh.setFrozenRows(1);
    return;
  }
  // Migration simple : si l’onglet existe sans colonne "Validé", on l’ajoute en E1.
  var first = sh.getRange(1, 1, 1, RELANCES_COLS).getValues()[0];
  if (String(first[0] || '').trim().toLowerCase() === 'date' && String(first[4] || '').trim() === '') {
    sh.getRange(1, 1, 1, RELANCES_COLS).setValues([RELANCES_HEADERS]);
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

function parseBody_(e) {
  e = e || {};
  if (e.parameter && e.parameter.payload) return JSON.parse(String(e.parameter.payload));
  if (e.postData && e.postData.contents) {
    var contents = String(e.postData.contents).trim();
    if (!contents) throw new Error('no_body');
    if (contents.charAt(0) === '{' || contents.charAt(0) === '[') return JSON.parse(contents);
    if (contents.indexOf('payload=') === 0 || contents.indexOf('&payload=') !== -1) {
      var form = parseFormUrlEncoded_(contents);
      if (form.payload) return JSON.parse(form.payload);
    }
    return JSON.parse(contents);
  }
  throw new Error('no_body');
}

function normalizeRows2D_(rows, numCols) {
  var out = [];
  if (!rows) return out;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
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

function doGet(e) {
  try {
    e = e || {};
    var p = e.parameter || {};
    var action = p.action;
    var token = p.token;

    if (action === 'ping' && token === getSecret_()) {
      var tsh = traitementSheetMaybe_();
      var rsh = relancesSheetMaybe_();
      return jsonOut_({
        ok: true,
        ping: 'MergedDispatchTraitementRelances',
        traitementTarget: TRAITEMENT_SHEET_NAME,
        relancesTarget: RELANCES_SHEET_NAME,
        sheetNames: sheetNames_(),
        traitementHeader: firstRow_(tsh, DOSSIER_COLS),
        relancesHeader: firstRow_(rsh, RELANCES_COLS),
      });
    }

    if (action === 'read' && token === getSecret_()) {
      var sh = dispatchSheet_();
      ensureDispatchHeaders_(sh);
      styleDispatchHeader_(sh);
      sizeDispatchColumns_(sh);
      var raw = sh.getDataRange().getValues();
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var row = raw[i];
        var norm = [];
        for (var j = 0; j < row.length; j++) norm.push(normalizeCell_(row[j]));
        out.push(norm);
      }
      return jsonOut_({ values: out });
    }

    if (action === 'read_traitement' && token === getSecret_()) {
      var tsh = traitementSheet_();
      ensureDossierHeaders_(tsh);
      var rawT = tsh.getDataRange().getValues();
      var outT = [];
      for (var ii = 0; ii < rawT.length; ii++) {
        var rowT = rawT[ii];
        var normT = [];
        for (var jj = 0; jj < rowT.length; jj++) normT.push(normalizeCell_(rowT[jj]));
        outT.push(normT);
      }
      return jsonOut_({ success: true, values: outT });
    }

    if (action === 'read_relances' && token === getSecret_()) {
      var rsh = relancesSheet_();
      ensureRelancesHeaders_(rsh);
      var rawR = rsh.getDataRange().getValues();
      var outR = [];
      for (var ri = 0; ri < rawR.length; ri++) {
        var rowR = rawR[ri];
        var normR = [];
        for (var rj = 0; rj < rowR.length; rj++) normR.push(normalizeCell_(rowR[rj]));
        outR.push(normR);
      }
      return jsonOut_({ success: true, values: outR });
    }

    return jsonOut_({
      ok: true,
      hint:
        'ping/read/read_traitement/read_relances + POST write/dossier_append/relance_append',
    });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!body || body.token !== getSecret_()) return jsonOut_({ success: false, error: 'unauthorized' });

    // --- Dispatch feuille 1 ---
    if (body.action === 'write') {
      var sh = dispatchSheet_();
      ensureDispatchHeaders_(sh);
      var rows = normalizeRows2D_(body.rows, DISPATCH_COLS);
      var last = sh.getLastRow();
      if (last > 1) sh.deleteRows(2, last - 1);
      if (rows.length) {
        sh.getRange(2, 1).offset(0, 0, rows.length, DISPATCH_COLS).setValues(rows);
        styleDispatchHeader_(sh);
        sizeDispatchColumns_(sh);
        styleDispatchDataRows_(sh, 2, 1 + rows.length);
        return jsonOut_({ ok: true, written: rows.length });
      }
      styleDispatchHeader_(sh);
      sizeDispatchColumns_(sh);
      return jsonOut_({ ok: true, written: 0 });
    }

    // --- Traitement feuille 2 ---
    if (body.action === 'dossier_append' || body.action === 'dossierAppend' || body.action === 'dossier_append_row') {
      var tsh = traitementSheet_();
      ensureDossierHeaders_(tsh);
      tsh.appendRow([
        body.date != null ? String(body.date) : '',
        body.dossierNumber != null ? String(body.dossierNumber) : '',
        body.clientName != null ? String(body.clientName) : '',
        body.agency != null ? String(body.agency) : '',
        body.type != null ? String(body.type) : '',
        body.status != null ? String(body.status) : '',
        body.manager != null ? String(body.manager) : '',
        body.comment != null ? String(body.comment) : '',
      ]);
      return jsonOut_({ success: true, message: 'Ligne ajoutée' });
    }

    // --- Relances feuille 3 ---
    if (body.action === 'relance_append') {
      var rsh = relancesSheet_();
      ensureRelancesHeaders_(rsh);
      rsh.appendRow([
        body.date != null ? String(body.date) : '',
        body.manager != null ? String(body.manager) : '',
        body.affaire != null ? String(body.affaire) : '',
        body.documentManquant != null ? String(body.documentManquant) : '',
        '', // Validé
      ]);
      return jsonOut_({ success: true, message: 'Relance ajoutée' });
    }

    if (body.action === 'relance_validate') {
      var rshVal = relancesSheet_();
      ensureRelancesHeaders_(rshVal);
      var itemsV = body.items;
      if (!(itemsV instanceof Array) || itemsV.length === 0) {
        return jsonOut_({ success: true, validated: 0 });
      }
      var rawV = rshVal.getDataRange().getValues();
      var validated = 0;
      for (var iv = 1; iv < rawV.length; iv++) {
        var rowV = rawV[iv];
        // si déjà validé → on laisse
        if (String(rowV[4] || '').toLowerCase() === 'oui' || rowV[4] === true) continue;
        for (var kv = 0; kv < itemsV.length; kv++) {
          var itV = itemsV[kv] || {};
          if (
            String(normalizeCell_(rowV[0]) || '') === String(itV.date || '') &&
            String(normalizeCell_(rowV[1]) || '') === String(itV.manager || '') &&
            String(normalizeCell_(rowV[2]) || '') === String(itV.affaire || '') &&
            String(normalizeCell_(rowV[3]) || '') === String(itV.documentManquant || '')
          ) {
            rshVal.getRange(iv + 1, 5).setValue('Oui');
            validated += 1;
            break;
          }
        }
      }
      return jsonOut_({ success: true, validated: validated });
    }

    if (body.action === 'relance_delete') {
      var rshDel = relancesSheet_();
      ensureRelancesHeaders_(rshDel);
      var items = body.items;
      if (!(items instanceof Array) || items.length === 0) {
        return jsonOut_({ success: true, deleted: 0 });
      }
      // Supprime en scannant du bas vers le haut (pour ne pas décaler les index).
      var raw = rshDel.getDataRange().getValues();
      var deleted = 0;
      for (var i = raw.length - 1; i >= 1; i--) {
        var row = raw[i];
        for (var k = 0; k < items.length; k++) {
          var it = items[k] || {};
          if (
            String(normalizeCell_(row[0]) || '') === String(it.date || '') &&
            String(normalizeCell_(row[1]) || '') === String(it.manager || '') &&
            String(normalizeCell_(row[2]) || '') === String(it.affaire || '') &&
            String(normalizeCell_(row[3]) || '') === String(it.documentManquant || '')
          ) {
            rshDel.deleteRow(i + 1);
            deleted += 1;
            break;
          }
        }
      }
      return jsonOut_({ success: true, deleted: deleted });
    }

    // Compat : si aucune action, on traite comme “Traitement dispatch” (ancien comportement)
    var tsh0 = traitementSheet_();
    ensureDossierHeaders_(tsh0);
    tsh0.appendRow([
      body.date != null ? String(body.date) : '',
      body.dossierNumber != null ? String(body.dossierNumber) : '',
      body.clientName != null ? String(body.clientName) : '',
      body.agency != null ? String(body.agency) : '',
      body.type != null ? String(body.type) : '',
      body.status != null ? String(body.status) : '',
      body.manager != null ? String(body.manager) : '',
      body.comment != null ? String(body.comment) : '',
    ]);
    return jsonOut_({ success: true, message: 'Ligne ajoutée' });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err.message || err) });
  }
}

