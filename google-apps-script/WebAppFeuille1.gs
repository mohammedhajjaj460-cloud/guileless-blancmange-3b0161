/**
 * Web App — Feuille 1 : lecture page Dossiers ({ values }), saisie dossier (append), écriture Dispatch (write).
 * SECRET = même valeur que VITE_GAS_DISPATCH_TOKEN dans .env.local
 *
 * Attention : « write » (page Dossiers) efface les lignes 2+ puis réécrit les affaires.
 * Les lignes « dossier » ajoutées par append sur la même feuille seront supprimées au prochain write.
 * Idéal : onglet dédié Dispatch + onglet dossier (voir MergedDispatchDossierWebApp.gs).
 */
var SECRET = '123456';

var SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A';
var SHEET_NAME = 'Feuille 1';

/** Ligne 1 = tableau des affaires (même ordre que l’app / affairesToSheetRows). */
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
var DISPATCH_COL_WIDTHS = [140, 120, 140, 120, 150, 220, 130, 220, 180, 160];

function sizeDispatchColumns_(sh) {
  for (var c = 0; c < DISPATCH_COLS; c++) {
    var w = DISPATCH_COL_WIDTHS[c] != null ? DISPATCH_COL_WIDTHS[c] : 120;
    if (w > 400) w = 400;
    sh.setColumnWidth(c + 1, w);
  }
}

/** En-têtes saisie dossier (ligne 1) — alignées sur le formulaire React. */
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
/** Palette proche de l’app (index.css --color-primary / surface). */
var DOSSIER_HEADER_BG = '#0a4d9e';
var DOSSIER_HEADER_FG = '#ffffff';
var DOSSIER_ROW_ALT = '#f4f7fb';

/** Date en colonne A : champ « date » du formulaire (ISO → jj/mm/aaaa), sinon aujourd’hui sans heure. */
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

/** Ligne 1 = titres dossier si la feuille est vide ; sinon ré-applique le style si A1 = « Date ». */
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

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('sheet_not_found: ' + SHEET_NAME);
  return sh;
}

function ensureDispatchHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, DISPATCH_COLS).setValues([DISPATCH_HEADERS]);
    styleDispatchHeaderRow_(sh);
    sizeDispatchColumns_(sh);
    sh.setFrozenRows(1);
    return;
  }
  var first = sh.getRange(1, 1, 1, DISPATCH_COLS).getValues()[0];
  var empty = first.every(function (c) {
    return c === '' || c == null;
  });
  if (empty) {
    sh.getRange(1, 1, 1, DISPATCH_COLS).setValues([DISPATCH_HEADERS]);
    styleDispatchHeaderRow_(sh);
    sizeDispatchColumns_(sh);
    sh.setFrozenRows(1);
  }
}

function styleDispatchHeaderRow_(sh) {
  var r = sh.getRange(1, 1, 1, DISPATCH_COLS);
  r.setFontWeight('bold');
  r.setBackground(DOSSIER_HEADER_BG);
  r.setFontColor(DOSSIER_HEADER_FG);
  r.setFontSize(10);
  r.setVerticalAlignment('middle');
  r.setHorizontalAlignment('center');
  r.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sh.setRowHeight(1, 40);
}

function styleDispatchDataRows_(sh, fromRow, toRow) {
  if (fromRow > toRow) return;
  for (var r = fromRow; r <= toRow; r++) {
    var rng = sh.getRange(r, 1, 1, DISPATCH_COLS);
    rng.setVerticalAlignment('middle');
    rng.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    if (r % 2 === 0) {
      rng.setBackground(DOSSIER_ROW_ALT);
    } else {
      rng.setBackground('#ffffff');
    }
  }
}

function normalizeCell_(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
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

/** JSON brut, ou formulaire avec champ payload= (ancien client). */
function parsePostJson_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('empty_body');
  }
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(String(e.parameter.payload));
  }
  var raw = String(e.postData.contents).trim();
  if (!raw) throw new Error('empty_body');
  var z = raw.charAt(0);
  if (z === '{' || z === '[') {
    return JSON.parse(raw);
  }
  if (raw.indexOf('payload=') === 0 || raw.indexOf('&payload=') !== -1) {
    var form = parseFormUrlEncoded_(raw);
    if (form.payload) {
      return JSON.parse(form.payload);
    }
  }
  return JSON.parse(raw);
}

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    var token = e && e.parameter ? e.parameter.token : '';

    if (token !== SECRET) {
      return jsonOut_({ success: false, error: 'unauthorized' });
    }

    var sheet = getSheet_();

    if (action === 'ping') {
      return jsonOut_({
        success: true,
        action: 'ping',
        tokenOk: true,
      });
    }

    if (action === 'read') {
      ensureDispatchHeaders_(sheet);
      styleDispatchHeaderRow_(sheet);
      sizeDispatchColumns_(sheet);
      var raw = sheet.getDataRange().getValues();
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var row = raw[i];
        var norm = [];
        for (var j = 0; j < row.length; j++) norm.push(normalizeCell_(row[j]));
        out.push(norm);
      }
      // L’app React exige la clé « values », pas « rows ».
      return jsonOut_({
        success: true,
        values: out,
      });
    }

    return jsonOut_({
      success: true,
      message: 'doGet ok',
      hint: '?action=read&token=… ou ?action=ping&token=…',
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
      data = parsePostJson_(e);
    } catch (parseErr) {
      return jsonOut_({
        success: false,
        error: 'invalid_body',
        detail: String(parseErr.message || parseErr),
      });
    }

    if (!data.token || data.token !== SECRET) {
      return jsonOut_({ success: false, error: 'unauthorized' });
    }

    var sheet = getSheet_();

    if (data.action === 'write') {
      ensureDispatchHeaders_(sheet);
      var rows = data.rows;
      if (!rows || !rows.length) {
        var last = sheet.getLastRow();
        if (last > 1) sheet.deleteRows(2, last - 1);
        styleDispatchHeaderRow_(sheet);
        sizeDispatchColumns_(sheet);
        return jsonOut_({ ok: true, written: 0 });
      }
      var grid = normalizeDispatchRowsForWrite_(rows, DISPATCH_COLS);
      if (!grid.length) {
        var last0 = sheet.getLastRow();
        if (last0 > 1) sheet.deleteRows(2, last0 - 1);
        styleDispatchHeaderRow_(sheet);
        sizeDispatchColumns_(sheet);
        return jsonOut_({ ok: true, written: 0 });
      }
      var last2 = sheet.getLastRow();
      if (last2 > 1) sheet.deleteRows(2, last2 - 1);
      var lastDataRow = 1 + grid.length;
      sheet.getRange(2, 1).offset(0, 0, grid.length, DISPATCH_COLS).setValues(grid);
      styleDispatchHeaderRow_(sheet);
      sizeDispatchColumns_(sheet);
      styleDispatchDataRows_(sheet, 2, lastDataRow);
      return jsonOut_({ ok: true, written: grid.length });
    }

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

    var newRow = sheet.getLastRow();
    // Texte brut : évite que Sheets affiche 19/04/2026 14:35:25 (objet Date serveur).
    sheet.getRange(newRow, 1).setNumberFormat('@');
    styleDossierDataRow_(sheet, newRow);

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

function authorize_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  return sheet ? sheet.getLastRow() : 'sheet_not_found';
}
