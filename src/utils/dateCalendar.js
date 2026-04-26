export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function dayKeyFromParts(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}
