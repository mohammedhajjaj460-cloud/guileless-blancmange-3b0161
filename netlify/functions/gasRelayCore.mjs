/**
 * Relais serveur Netlify → Web App Google Apps Script (/exec).
 * Les secrets et URLs /exec restent dans les variables d’environnement Netlify (pas dans le bundle JS).
 */

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Dispatch-DT-NetlifyRelay/1.0)',
  Accept: 'application/json, text/plain, */*',
}

function isValidExecUrl(u) {
  const s = String(u || '')
    .trim()
    .replace(/\/$/, '')
  return s.startsWith('https://script.google.com/macros/s/') && /\/exec$/i.test(s)
}

function isProbablyHtml(text) {
  return /^\s*</.test(String(text || ''))
}

function htmlToJsonErrorPayload(text, googleHttpStatus) {
  const t = String(text || '')
  const title = (t.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim() || 'Erreur'
  return {
    error: 'gas_html_response',
    detail: `HTML « ${title} » (HTTP ${googleHttpStatus}) au lieu de JSON.`,
    htmlTitle: title,
    httpFromGoogle: googleHttpStatus,
  }
}

function readEnv(name) {
  const v = process.env[name]
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function resolveTarget({ defaultUrl, override }) {
  const o = String(override || '')
    .trim()
    .replace(/\/$/, '')
  if (o && isValidExecUrl(o)) return o
  const d = String(defaultUrl || '')
    .trim()
    .replace(/\/$/, '')
  if (d && isValidExecUrl(d)) return d
  return ''
}

function injectTokenToSearchParams(sp, secret) {
  if (!secret) return
  if (!sp.get('token')) sp.set('token', secret)
}

function injectTokenToJsonObject(obj, secret) {
  if (!secret) return
  if (obj.token == null || String(obj.token).trim() === '') obj.token = secret
}

/**
 * @param {import('@netlify/functions').HandlerEvent} event
 * @param {{ defaultExecUrlEnv: string, secretEnv: string }} opts
 */
export async function handleGasRelay(event, { defaultExecUrlEnv, secretEnv }) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  const defaultUrl = readEnv(defaultExecUrlEnv)
  const secret = readEnv(secretEnv)

  if (event.httpMethod === 'GET') {
    const url = new URL(event.rawUrl)
    const gasBase = url.searchParams.get('_gasBase')
    url.searchParams.delete('_gasBase')
    const target = resolveTarget({ defaultUrl, override: gasBase })
    if (!target) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
        body: JSON.stringify({
          error: 'relay_target_missing',
          detail: `Définissez ${defaultExecUrlEnv} dans Netlify (Environment variables).`,
        }),
      }
    }
    injectTokenToSearchParams(url.searchParams, secret)
    const upstream = `${target}?${url.searchParams.toString()}`

    const r = await fetch(upstream, { method: 'GET', redirect: 'follow', headers: UPSTREAM_HEADERS })
    const text = await r.text()
    if (isProbablyHtml(text)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
        body: JSON.stringify(htmlToJsonErrorPayload(text, r.status)),
      }
    }
    return {
      statusCode: r.status,
      headers: { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8', ...corsHeaders() },
      body: text,
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' }
  }

  const raw = event.body || ''
  const trimmed = String(raw).trim()
  let target = ''
  let forwardBody = raw
  let forwardContentType = 'application/json;charset=UTF-8'

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed
    try {
      parsed = JSON.parse(trimmed)
    } catch (e) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
        body: JSON.stringify({ error: 'relay_bad_json', detail: String(e?.message || e) }),
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
        body: JSON.stringify({ error: 'relay_bad_json', detail: 'Corps JSON attendu : objet.' }),
      }
    }
    const gasBase = String(parsed._gasBase || '')
      .trim()
      .replace(/\/$/, '')
    delete parsed._gasBase
    target = resolveTarget({ defaultUrl, override: gasBase })
    injectTokenToJsonObject(parsed, secret)
    forwardBody = JSON.stringify(parsed)
  } else {
    const params = new URLSearchParams(raw)
    const gasBase = params.get('_gasBase')
    params.delete('_gasBase')
    target = resolveTarget({ defaultUrl, override: gasBase })
    injectTokenToSearchParams(params, secret)
    forwardBody = params.toString()
    forwardContentType = 'application/x-www-form-urlencoded;charset=UTF-8'
  }

  if (!target) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
      body: JSON.stringify({
        error: 'relay_target_missing',
        detail: `Définissez ${defaultExecUrlEnv} dans Netlify (Environment variables), ou envoyez _gasBase (URL /exec) depuis le client.`,
      }),
    }
  }

  const r = await fetch(target, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      ...UPSTREAM_HEADERS,
      'Content-Type': forwardContentType,
    },
    body: forwardBody,
  })
  const text = await r.text()
  if (isProbablyHtml(text)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
      body: JSON.stringify(htmlToJsonErrorPayload(text, r.status)),
    }
  }
  return {
    statusCode: r.status,
    headers: { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8', ...corsHeaders() },
    body: text,
  }
}
