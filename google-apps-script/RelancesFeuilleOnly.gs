/**
 * Web App — Relances : ajoute une ligne dans un onglet "Relances" (créé si absent).
 *
 * Corps POST (JSON) :
 * { token, action:"relance_append", date:"YYYY-MM-DD", manager:"Zineb", affaire:"...", documentManquant:"..." }
 *
 * GET ping : ?action=ping&token=SECRET
 * GET read : ?action=read&token=SECRET → { success:true, values:[[headers],[rows]...] }
 */

var SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A';
var SHEET_NAME = 'Relances';

var HEADERS = ['Date', 'Gestionnaire', 'Affaire', 'Document manquant'];

function getSecret_() {
  var p = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (p) return p;
  return 'REMPLACEZ_PAR_UN_JETON_LONG_ET_SECRET';
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function relancesSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function ensureHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
}

function parseBody_(e) {
  e = e || {};
  if (e.parameter && e.parameter.payload) return JSON.parse(String(e.parameter.payload));
  if (e.postData && e.postData.contents) return JSON.parse(String(e.postData.contents));
  throw new Error('no_body');
}

function doGet(e) {
  e = e || {};
  var p = e.parameter || {};
  if (p.action === 'ping' && p.token === getSecret_()) {
    return jsonOut_({ ok: true, ping: 'Relances', sheet: SHEET_NAME });
  }
  if (p.action === 'read' && p.token === getSecret_()) {
    try {
      var sh = relancesSheet_();
      ensureHeaders_(sh);
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
      return jsonOut_({ success: true, values: out });
    } catch (err) {
      return jsonOut_({ success: false, error: 'sheet_error', detail: String(err.message || err) });
    }
  }
  return jsonOut_({ ok: true, hint: 'POST {token,action:relance_append,date,manager,affaire,documentManquant}' });
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!body || body.token !== getSecret_()) return jsonOut_({ success: false, error: 'unauthorized' });
    if (body.action !== 'relance_append') return jsonOut_({ success: false, error: 'unknown_action' });

    var sh = relancesSheet_();
    ensureHeaders_(sh);

    var date = body.date != null ? String(body.date) : '';
    var manager = body.manager != null ? String(body.manager) : '';
    var affaire = body.affaire != null ? String(body.affaire) : '';
    var doc = body.documentManquant != null ? String(body.documentManquant) : '';

    sh.appendRow([date, manager, affaire, doc]);
    return jsonOut_({ success: true, message: 'Relance ajoutée' });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err.message || err) });
  }
}

