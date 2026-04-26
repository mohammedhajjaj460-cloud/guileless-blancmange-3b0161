/**
 * Web App — ajoute une ligne sur la feuille indiquée (POST JSON + token).
 *
 * 1. SPREADSHEET_ID = ID du classeur ; SHEET_NAME = nom de l’onglet (ex. Feuille 1).
 * 2. SECRET = même valeur que VITE_DOSSIER_WEBAPP_TOKEN (ou VITE_GAS_DISPATCH_TOKEN) dans .env.local
 * 3. Déployer > Application Web > Accès : Tous — copier l’URL …/exec dans VITE_DOSSIER_WEBAPP_URL.
 *
 * Corps POST (JSON) : token, date (YYYY-MM-DD depuis le formulaire), dossierNumber, clientName, …
 */

var SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A';
var SHEET_NAME = 'Feuille 1';

/** À aligner avec .env.local — idéalement une longue chaîne aléatoire ou PropertiesService.getScriptProperties().getProperty('SECRET') */
var SECRET = 'CHANGE_ME';

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
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Lit le JSON envoyé par le client (text/plain, application/json, ou champ form « json »).
 * Si vous voyez empty_body alors que le client envoie bien du JSON, changez le Content-Type côté app.
 */
function parseJsonBody_(e) {
  if (!e) throw new Error('no_event');

  if (e.postData && e.postData.contents && String(e.postData.contents).trim()) {
    var raw = String(e.postData.contents).trim();
    var z = raw.charAt(0);
    if (z === '{' || z === '[') {
      return JSON.parse(raw);
    }
    if (raw.indexOf('payload=') === 0 || raw.indexOf('&payload=') !== -1) {
      var pairs = raw.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        var eq = p.indexOf('=');
        if (eq < 0) continue;
        var k = decodeURIComponent(p.substring(0, eq).replace(/\+/g, ' '));
        if (k === 'payload') {
          var v = decodeURIComponent(p.substring(eq + 1).replace(/\+/g, ' '));
          return JSON.parse(v);
        }
      }
    }
    return JSON.parse(raw);
  }

  if (e.parameter && e.parameter.json) {
    return JSON.parse(String(e.parameter.json));
  }

  if (e.parameter && e.parameter.payload) {
    return JSON.parse(String(e.parameter.payload));
  }

  var ct = e.postData ? String(e.postData.type || '') : '';
  throw new Error('no_body (postData.contents vide ; type=' + ct + ')');
}

/**
 * À lancer UNE FOIS depuis l’éditeur (▶) : accepte les autorisations Sheets et vérifie l’onglet.
 * Sans cette étape, la Web App peut renvoyer une page HTML « Erreur ».
 */
function autoriserEtTester() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    throw new Error('Onglet introuvable : ' + SHEET_NAME + ' — renommez l’onglet ou modifiez SHEET_NAME.');
  }
  ensureDossierHeaderRow_(sh);
  sh.appendRow([
    Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yyyy'),
    'test',
    'script',
    'ok',
    '',
    '',
    '',
    'ligne de test autoriserEtTester',
  ]);
  var lr = sh.getLastRow();
  sh.getRange(lr, 1).setNumberFormat('@');
  styleDossierDataRow_(sh, lr);
  return 'OK : autorisations + écriture sur ' + SHEET_NAME;
}

/** Web App : fonction globale obligatoire */
function doPost(e) {
  try {
    var data = parseJsonBody_(e);

    if (!data.token || data.token !== SECRET) {
      return jsonOut_({ success: false, error: 'unauthorized' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return jsonOut_({
        success: false,
        error: 'sheet_not_found',
        detail: SHEET_NAME
      });
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
    sheet.getRange(newRow, 1).setNumberFormat('@');
    styleDossierDataRow_(sheet, newRow);

    return jsonOut_({
      success: true,
      message: 'Ligne ajoutée'
    });
  } catch (err) {
    var msg = String(err.message || err);
    if (msg.indexOf('no_body') !== -1 || msg.indexOf('no_event') !== -1) {
      return jsonOut_({ success: false, error: 'empty_body', detail: msg });
    }
    return jsonOut_({
      success: false,
      error: 'exception',
      detail: msg
    });
  }
}

/** Test dans le navigateur sur l’URL /exec */
function doGet() {
  return jsonOut_({
    ok: true,
    hint: 'POST JSON avec token + champs dossier',
    checklist: [
      '1) Menu Exécuter > autoriserEtTester une fois pour les autorisations',
      '2) SECRET identique au jeton .env.local',
      '3) Déployer > Nouvelle version après chaque changement',
      '4) Onglet "' + SHEET_NAME + '" existe dans le classeur'
    ]
  });
}
