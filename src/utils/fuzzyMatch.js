// Normalizare "mecanica" - spatii multiple, spatii la capete, punctuatie
// nesemnificativa la final, majuscule/minuscule. NU e o comparatie fuzzy -
// e doar curatarea variatiilor de formatare care inseamna, de fapt, exact
// aceeasi valoare (ex: "Ion   Popescu" / "Ion Popescu." / "ION POPESCU" sunt
// toate acelasi "ion popescu" dupa normalizare). Folosita silentios, fara
// sa intrebe userul nimic - o potrivire exacta dupa normalizare foloseste
// direct numele deja existent.
export function normalizeForCompare(value) {
  return (value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .toLowerCase()
}

// Distanta Levenshtein - numarul minim de editari (inserare/stergere/
// inlocuire de caracter) necesare ca sa transformi un string in altul.
export function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    prev = curr
  }
  return prev[n]
}

// Gaseste, dintr-o lista de nume existente, cea mai apropiata potrivire de
// "rawValue" - DOAR daca nu e deja o potrivire exacta (dupa normalizare, in
// care caz nu e "asemanator", e identic) si distanta e sub un prag RELATIV
// la lungime: nume scurte tolereaza mai putine diferente decat nume lungi,
// ca sa nu semnalizam fals-pozitiv intre nume scurte, diferite dar
// accidental apropiate (ex: "Ion" / "Ian" - 4 caractere, prag strict de 1).
export function findFuzzyMatch(rawValue, existingNames) {
  const value = normalizeForCompare(rawValue)
  if (!value || value === 'tbd') return null

  let best = null
  let bestDist = Infinity
  for (const name of existingNames) {
    const normalized = normalizeForCompare(name)
    if (!normalized || normalized === value) continue
    const dist = levenshtein(value, normalized)
    const maxLen = Math.max(value.length, normalized.length)
    const threshold = maxLen <= 4 ? 1 : Math.ceil(maxLen * 0.2)
    if (dist <= threshold && dist < bestDist) {
      best = name
      bestDist = dist
    }
  }
  return best
}
