/**
 * Web App MINIMALE — uniquement enregistrement Traitement dispatch → 2ᵉ feuille du classeur.
 *
 * À utiliser quand votre déploiement actuel (feuille 1 / dispatch) est une ancienne version qui
 * renvoie « unknown_action » pour le POST Traitement : vous ne touchez pas à ce déploiement.
 *
 * INSTALLATION (nouveau projet Apps Script, ex. script.google.com/create) :
 * 1. Fichier > Paramètres du projet : ajouter une bibliothèque si besoin — pas nécessaire.
 * 2. Coller CE fichier comme seul code (supprimer function myFunction par défaut).
 * 3. Renseigner SPREADSHEET_ID (même classeur que la feuille dispatch) et SECRET (propriété ou fallback).
 * 4. Exécuter une fois la fonction autoriserOuvertureClasseur_() depuis l’éditeur → accepter les autorisations.
 * 5. Déployer > Nouveau déploiement > Application Web : Moi, Accès « Tous ».
 * 6. Copier l’URL …/exec dans .env.local :
 *    VITE_DOSSIER_WEBAPP_URL=https://script.google.com/macros/s/…/exec
 *    VITE_DOSSIER_WEBAPP_TOKEN=même jeton que SECRET (si vous utilisez un jeton différent du dispatch).
 * 7. npm run dev redémarré.
 *
 * Test GET : …/exec?action=ping&token=VOTRE_SECRET → JSON avec deployTag « traitement-fe2-only ».
 */

var SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A';
var TRAITEMENT_SHEET_INDEX = 1;
var TRAITEMENT_INSERT_NAME = 'Feuille 2';

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

var DEPLOY_TAG = 'traitement-fe2-only-2026-04';

function getSecret_() {
  var p = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (p) return p;
  return 'REMPLACEZ_PAR_UN_JETON_LONG_ET_SECRET';
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

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

/** À lancer UNE FOIS depuis l’éditeur (▶) pour les autorisations sur le classeur. */
function autoriserOuvertureClasseur_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return 'OK : ' + ss.getName() + ' — vous pouvez déployer la Web App.';
}

function doGet(e) {
  try {
    e = e || {};
    var params = e.parameter || {};
    if (params.action === 'ping' && params.token === getSecret_()) {
      return jsonOut_({
        ok: true,
        deployTag: DEPLOY_TAG,
        message: 'Traitement feuille 2 uniquement — Web App OK.',
      });
    }

    // Lecture historique (pour que l’app continue le dispatch à partir des anciens enregistrements).
    if (params.action === 'read_traitement' && params.token === getSecret_()) {
      try {
        var sh = traitementSheet_();
        ensureDossierHeaderRow_(sh);
        var raw = sh.getDataRange().getValues();
        var out = [];
        for (var i = 0; i < raw.length; i++) {
          var row = raw[i];
          var norm = [];
          for (var j = 0; j < row.length; j++) {
            var v = row[j];
            norm.push(v instanceof Date ? v.toISOString() : v);
          }
          out.push(norm);
        }
        return jsonOut_({ success: true, values: out, deployTag: DEPLOY_TAG });
      } catch (errR) {
        return jsonOut_({ success: false, error: 'sheet_error', detail: String(errR.message || errR) });
      }
    }

    return jsonOut_({
      ok: true,
      hint:
        'Test : ?action=ping&token=SECRET — Lecture : ?action=read_traitement&token=SECRET — POST JSON : token + champs dossier (voir DispatchSync côté app).',
      deployTag: DEPLOY_TAG,
    });
  } catch (fatal) {
    return jsonOut_({ error: 'doget_fatal', detail: String(fatal.message || fatal) });
  }
}

function doPost(e) {
  try {
    var body;
    try {
      body = parseBody_(e);
    } catch (err) {
      return jsonOut_({
        success: false,
        error: 'invalid_json',
        detail: String(err.message || err),
      });
    }

    if (!body || body.token !== getSecret_()) {
      return jsonOut_({ success: false, error: 'unauthorized' });
    }

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
    return jsonOut_({ success: false, error: 'dopost_fatal', detail: String(fatal.message || fatal) });
  }
}
