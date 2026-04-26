import { Buffer } from 'node:buffer'
import { loadEnv } from 'vite'

const DISPATCH_PROXY = '/__gas-dispatch-proxy'
const DOSSIER_PROXY = '/__gas-dossier-proxy'
const RELANCES_PROXY = '/__gas-relances-proxy'

function isValidExecUrl(u) {
  const s = String(u || '')
    .trim()
    .replace(/\/$/, '')
  return s.startsWith('https://script.google.com/macros/s/') && /\/exec$/i.test(s)
}

function readDispatchEnvUrl(mode, root) {
  return (loadEnv(mode, root, '').VITE_GAS_DISPATCH_URL || '').trim().replace(/\/$/, '')
}

function readDossierEnvUrl(mode, root) {
  const env = loadEnv(mode, root, '')
  const dedicated = (env.VITE_DOSSIER_WEBAPP_URL || '').trim().replace(/\/$/, '')
  if (dedicated) return dedicated
  return (env.VITE_GAS_DISPATCH_URL || '').trim().replace(/\/$/, '')
}

function resolveDossierTarget(mode, root, gasBaseParam) {
  const fromEnv = readDossierEnvUrl(mode, root)
  if (fromEnv && isValidExecUrl(fromEnv)) return fromEnv
  const fromClient = String(gasBaseParam || '')
    .trim()
    .replace(/\/$/, '')
  if (fromClient && isValidExecUrl(fromClient)) return fromClient
  return ''
}

function resolveDispatchTarget(mode, root, gasBaseParam) {
  const fromEnv = readDispatchEnvUrl(mode, root)
  if (fromEnv && isValidExecUrl(fromEnv)) return fromEnv
  const fromClient = String(gasBaseParam || '').trim().replace(/\/$/, '')
  if (fromClient && isValidExecUrl(fromClient)) return fromClient
  return ''
}

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

/** Google renvoie souvent du HTML (page « Erreur ») si le script plante, si doGet/doPost manque, ou si l’accès n’est pas « Tous » pour un appel serveur sans cookie. */
function isProbablyHtml(text) {
  return /^\s*</.test(String(text || ''))
}

function htmlToJsonErrorPayload(text, googleHttpStatus) {
  const t = String(text || '')
  const title = (t.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim() || 'Erreur'
  return {
    error: 'gas_html_response',
    detail:
      `HTML « ${title} » (HTTP ${googleHttpStatus}) au lieu de JSON — Google n’exécute pas le script (souvent avant doGet). ` +
      'Vérifiez que .env.local contient exactement la même URL …/exec que celle qui ouvre du JSON dans le navigateur, puis redémarrez npm run dev. ' +
      'Dans Apps Script : autorisations (exécuter une fois une fonction), accès « Tout le monde », nouvelle version du déploiement. ' +
      'Page Dossiers de l’app : cette requête utilise ?action=read — il faut DispatchSync.gs (doGet/doPost) sur cette Web App. ' +
      'Si votre /exec ne contient que l’enregistrement dossier (sans DispatchSync), utilisez la page Traitement dispatch ou fusionnez les deux scripts dans un seul projet.',
    htmlTitle: title,
    httpFromGoogle: googleHttpStatus,
  }
}

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Dispatch-DT-ViteProxy/1.0; +https://developers.google.com/apps-script)',
  Accept: 'application/json, text/plain, */*',
}

function handleDispatchProxy(req, res, _next, mode, root) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method === 'GET') {
    const fake = new URL(req.url || '/', 'http://localhost')
    const gasBase = fake.searchParams.get('_gasBase')
    fake.searchParams.delete('_gasBase')
    const target = resolveDispatchTarget(mode, root, gasBase)
    if (!target) {
      sendJson(res, 503, {
        error: 'proxy_target_missing',
        detail:
          'Définissez VITE_GAS_DISPATCH_URL dans .env.local ou enregistrez l’URL Web App dans l’app (paramètre _gasBase).',
      })
      return
    }
    const qs = fake.searchParams.toString()
    const upstream = qs ? `${target}?${qs}` : target

    fetch(upstream, { method: 'GET', redirect: 'follow', headers: UPSTREAM_HEADERS })
      .then(async (r) => {
        const text = await r.text()
        if (isProbablyHtml(text)) {
          console.warn(
            '[gas-proxy] GET → HTML au lieu de JSON. Upstream (token masqué) :',
            upstream.replace(/token=[^&]+/gi, 'token=[REDACTÉ]'),
          )
          sendJson(res, 200, htmlToJsonErrorPayload(text, r.status))
          return
        }
        res.statusCode = r.status
        res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
        res.end(text)
      })
      .catch((err) => {
        sendJson(res, 502, { error: 'proxy_upstream', detail: String(err?.message || err) })
      })
    return
  }

  if (req.method === 'POST') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const trimmed = raw.trim()
      let target = ''
      let forwardBody = raw
      let forwardContentType = 'application/json;charset=UTF-8'

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        let parsed
        try {
          parsed = JSON.parse(trimmed)
        } catch (e) {
          sendJson(res, 400, {
            error: 'proxy_bad_json',
            detail: String(e?.message || e),
          })
          return
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const gasBase = String(parsed._gasBase || '')
            .trim()
            .replace(/\/$/, '')
          delete parsed._gasBase
          target = resolveDispatchTarget(mode, root, gasBase)
          forwardBody = JSON.stringify(parsed)
        } else {
          sendJson(res, 400, {
            error: 'proxy_bad_json',
            detail: 'Corps JSON attendu : objet avec token, action, rows (et _gasBase en dev).',
          })
          return
        }
      } else {
        const params = new URLSearchParams(raw)
        const gasBase = params.get('_gasBase')
        params.delete('_gasBase')
        target = resolveDispatchTarget(mode, root, gasBase)
        forwardBody = params.toString()
        forwardContentType = 'application/x-www-form-urlencoded;charset=UTF-8'
      }

      if (!target) {
        sendJson(res, 503, {
          error: 'proxy_target_missing',
          detail:
            'Définissez VITE_GAS_DISPATCH_URL dans .env.local, ou le corps doit contenir _gasBase (URL /exec) en développement.',
        })
        return
      }

      fetch(target, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          ...UPSTREAM_HEADERS,
          'Content-Type': forwardContentType,
        },
        body: forwardBody,
      })
        .then(async (r) => {
          const text = await r.text()
          if (isProbablyHtml(text)) {
            console.warn('[gas-proxy] POST Dispatch → HTML au lieu de JSON. Cible :', target.slice(0, 80) + '…')
            sendJson(res, 200, htmlToJsonErrorPayload(text, r.status))
            return
          }
          res.statusCode = r.status
          res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
          res.end(text)
        })
        .catch((err) => {
          sendJson(res, 502, { error: 'proxy_upstream', detail: String(err?.message || err) })
        })
    })
    return
  }

  res.statusCode = 405
  res.end('Method Not Allowed')
}

function handleDossierProxy(req, res, next, mode, root) {
  const defaultTarget = resolveDossierTarget(mode, root, '')
  if (!defaultTarget) {
    sendJson(res, 503, {
      success: false,
      error: 'proxy_target_missing',
        detail: 'Définissez VITE_GAS_DISPATCH_URL (ou VITE_DOSSIER_WEBAPP_URL) dans .env.local puis redémarrez le serveur.',
    })
    return
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method === 'GET') {
    const fake = new URL(req.url || '/', 'http://localhost')
    const gasBase = fake.searchParams.get('_gasBase')
    fake.searchParams.delete('_gasBase')
    const target = resolveDossierTarget(mode, root, gasBase) || defaultTarget
    const qs = fake.searchParams.toString()
    const upstream = qs ? `${target}?${qs}` : target
    fetch(upstream, { method: 'GET', redirect: 'follow', headers: UPSTREAM_HEADERS })
      .then(async (r) => {
        const text = await r.text()
        if (isProbablyHtml(text)) {
          console.warn('[gas-proxy] GET Dossier → HTML au lieu de JSON.')
          sendJson(res, 200, { success: false, ...htmlToJsonErrorPayload(text, r.status) })
          return
        }
        res.statusCode = r.status
        res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
        res.end(text)
      })
      .catch((err) => {
        sendJson(res, 502, { success: false, error: 'proxy_upstream', detail: String(err?.message || err) })
      })
    return
  }

  if (req.method !== 'POST') {
    next()
    return
  }

  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    const trimmed = raw.trim()
    let target = ''
    let forwardBody = raw
    let forwardContentType = 'application/json;charset=UTF-8'

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsed
      try {
        parsed = JSON.parse(trimmed)
      } catch (e) {
        sendJson(res, 400, { success: false, error: 'proxy_bad_json', detail: String(e?.message || e) })
        return
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const gasBase = String(parsed._gasBase || '')
          .trim()
          .replace(/\/$/, '')
        delete parsed._gasBase
        target = resolveDossierTarget(mode, root, gasBase) || defaultTarget
        forwardBody = JSON.stringify(parsed)
      } else {
        sendJson(res, 400, { success: false, error: 'proxy_bad_json', detail: 'Corps JSON attendu : objet.' })
        return
      }
    } else {
      const params = new URLSearchParams(raw)
      const gasBase = params.get('_gasBase')
      params.delete('_gasBase')
      target = resolveDossierTarget(mode, root, gasBase) || defaultTarget
      forwardBody = params.toString()
      forwardContentType = 'application/x-www-form-urlencoded;charset=UTF-8'
    }

    if (!target) {
      sendJson(res, 503, {
        success: false,
        error: 'proxy_target_missing',
        detail:
          'Définissez VITE_GAS_DISPATCH_URL (ou VITE_DOSSIER_WEBAPP_URL) dans .env.local, ou le corps doit contenir `_gasBase` (URL /exec).',
      })
      return
    }

    fetch(target, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        ...UPSTREAM_HEADERS,
        'Content-Type': forwardContentType,
      },
      body: forwardBody,
    })
      .then(async (r) => {
        const text = await r.text()
        if (isProbablyHtml(text)) {
          console.warn('[gas-proxy] POST Dossier → HTML au lieu de JSON.')
          sendJson(res, 200, { success: false, ...htmlToJsonErrorPayload(text, r.status) })
          return
        }
        res.statusCode = r.status
        res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
        res.end(text)
      })
      .catch((err) => {
        sendJson(res, 502, {
          success: false,
          error: 'proxy_upstream',
          detail: String(err?.message || err),
        })
      })
  })
}

function attachGasProxy(server) {
  const { mode, root } = server.config

  server.middlewares.use((req, res, next) => {
    const pathname = (req.url || '').split('?')[0]
    if (pathname === DISPATCH_PROXY) {
      handleDispatchProxy(req, res, next, mode, root)
      return
    }
    if (pathname === DOSSIER_PROXY) {
      handleDossierProxy(req, res, next, mode, root)
      return
    }
    if (pathname === RELANCES_PROXY) {
      handleRelancesProxy(req, res, next, mode, root)
      return
    }
    next()
  })
}

function readRelancesEnvUrl(mode, root) {
  const env = loadEnv(mode, root, '')
  return (env.VITE_RELANCES_WEBAPP_URL || '').trim().replace(/\/$/, '')
}

function resolveRelancesTarget(mode, root, gasBaseParam) {
  const fromEnv = readRelancesEnvUrl(mode, root)
  if (fromEnv && isValidExecUrl(fromEnv)) return fromEnv
  const fromClient = String(gasBaseParam || '')
    .trim()
    .replace(/\/$/, '')
  if (fromClient && isValidExecUrl(fromClient)) return fromClient
  return ''
}

function handleRelancesProxy(req, res, next, mode, root) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method === 'GET') {
    const fake = new URL(req.url || '/', 'http://localhost')
    const gasBase = fake.searchParams.get('_gasBase')
    fake.searchParams.delete('_gasBase')
    const target = resolveRelancesTarget(mode, root, gasBase)
    if (!target) {
      sendJson(res, 503, {
        success: false,
        error: 'proxy_target_missing',
        detail:
          'Définissez VITE_RELANCES_WEBAPP_URL dans .env.local, ou passez `_gasBase` (URL /exec) dans la requête proxy.',
      })
      return
    }
    const qs = fake.searchParams.toString()
    const upstream = qs ? `${target}?${qs}` : target
    fetch(upstream, { method: 'GET', redirect: 'follow', headers: UPSTREAM_HEADERS })
      .then(async (r) => {
        const text = await r.text()
        if (isProbablyHtml(text)) {
          console.warn('[gas-proxy] GET Relances → HTML au lieu de JSON.')
          sendJson(res, 200, { success: false, ...htmlToJsonErrorPayload(text, r.status) })
          return
        }
        res.statusCode = r.status
        res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
        res.end(text)
      })
      .catch((err) => {
        sendJson(res, 502, { success: false, error: 'proxy_upstream', detail: String(err?.message || err) })
      })
    return
  }

  if (req.method !== 'POST') {
    next()
    return
  }

  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    const trimmed = raw.trim()
    let target = ''
    let forwardBody = raw
    let forwardContentType = 'application/json;charset=UTF-8'

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsed
      try {
        parsed = JSON.parse(trimmed)
      } catch (e) {
        sendJson(res, 400, { success: false, error: 'proxy_bad_json', detail: String(e?.message || e) })
        return
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const gasBase = String(parsed._gasBase || '')
          .trim()
          .replace(/\/$/, '')
        delete parsed._gasBase
        target = resolveRelancesTarget(mode, root, gasBase)
        forwardBody = JSON.stringify(parsed)
      } else {
        sendJson(res, 400, { success: false, error: 'proxy_bad_json', detail: 'Corps JSON attendu : objet.' })
        return
      }
    } else {
      const params = new URLSearchParams(raw)
      const gasBase = params.get('_gasBase')
      params.delete('_gasBase')
      target = resolveRelancesTarget(mode, root, gasBase)
      forwardBody = params.toString()
      forwardContentType = 'application/x-www-form-urlencoded;charset=UTF-8'
    }

    if (!target) {
      sendJson(res, 503, {
        success: false,
        error: 'proxy_target_missing',
        detail:
          'Définissez VITE_RELANCES_WEBAPP_URL dans .env.local, ou le corps doit contenir `_gasBase` (URL /exec).',
      })
      return
    }

    fetch(target, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        ...UPSTREAM_HEADERS,
        'Content-Type': forwardContentType,
      },
      body: forwardBody,
    })
      .then(async (r) => {
        const text = await r.text()
        if (isProbablyHtml(text)) {
          console.warn('[gas-proxy] POST Relances → HTML au lieu de JSON.')
          sendJson(res, 200, { success: false, ...htmlToJsonErrorPayload(text, r.status) })
          return
        }
        res.statusCode = r.status
        res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
        res.end(text)
      })
      .catch((err) => {
        sendJson(res, 502, { success: false, error: 'proxy_upstream', detail: String(err?.message || err) })
      })
  })
}

export function gasProxyPlugin() {
  return {
    name: 'gas-webapp-proxy',
    configureServer(server) {
      attachGasProxy(server)
    },
    /** Même proxy en `vite preview` (après `vite build`) — nécessaire hors dev car Google /exec bloque souvent le CORS navigateur. */
    configurePreviewServer(server) {
      attachGasProxy(server)
    },
  }
}
