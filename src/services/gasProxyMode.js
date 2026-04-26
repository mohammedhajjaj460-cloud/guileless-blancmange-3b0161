/**
 * Même origine que l’app : chemins `/__gas-*-proxy` (Vite dev + `vite preview`, ou tout serveur qui expose ces routes).
 * Active aussi en prod si `VITE_GAS_USE_SAME_ORIGIN_PROXY=true` (recommandé avec `npm run build && npm run start`).
 */
function truthyEnv(v) {
  const s = String(v || '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

export function gasUsesNetlifyRelay() {
  return truthyEnv(import.meta.env.VITE_GAS_NETLIFY_RELAY) || truthyEnv(import.meta.env.VITE_NETLIFY)
}

export function gasUsesSameOriginProxy() {
  if (import.meta.env.DEV) return true
  if (gasUsesNetlifyRelay()) return true
  if (truthyEnv(import.meta.env.VITE_GAS_USE_SAME_ORIGIN_PROXY)) return true
  // Netlify / prod : sans relais same-origin, les appels navigateur → script.google.com échouent (CORS).
  // Désactivation explicite : VITE_GAS_DIRECT=true
  if (import.meta.env.PROD && !truthyEnv(import.meta.env.VITE_GAS_DIRECT)) return true
  return false
}

export function gasDispatchRelayPath() {
  return gasUsesNetlifyRelay() ? '/.netlify/functions/gas-dispatch' : '/__gas-dispatch-proxy'
}

export function gasDossierRelayPath() {
  return gasUsesNetlifyRelay() ? '/.netlify/functions/gas-dossier' : '/__gas-dossier-proxy'
}

export function gasRelancesRelayPath() {
  return gasUsesNetlifyRelay() ? '/.netlify/functions/gas-relances' : '/__gas-relances-proxy'
}
