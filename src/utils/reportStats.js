import { courseDurationDays } from './colors'

// Explicatia fiecarui raport - aceleasi texte apar si in interfata (sub
// titlul fiecarui card), si in exporturile PDF/Excel, ca oricine deschide
// raportul (chiar daca nu a vazut aplicatia) sa inteleaga ce reprezinta
// fara sa intrebe pe altcineva.
export const REPORT_EXPLANATIONS = {
  trainerLoad: 'Numarul de cursuri si zilele cumulate sustinute de fiecare trainer, in perioada selectata, cu procentul de ocupare din totalul zilelor intervalului. Un curs cu mai multi traineri (co-facilitare) conteaza pentru fiecare dintre ei.',
  roomOccupancy: 'Numarul de cursuri si zilele cumulate in care fiecare sala a fost folosita, in perioada selectata, cu procentul de ocupare din totalul zilelor intervalului.',
  responsibleLoad: 'Numarul de cursuri si zilele cumulate gestionate de fiecare responsabil, in perioada selectata.',
  categoryMix: 'Distributia cursurilor pe categorii/arii (ex: Soft skills, Tehnic, Conformitate), in perioada selectata.',
  courseTypeMix: 'Distributia cursurilor pe tip (live, online, blended, e-learning), in perioada selectata.',
}

// true daca eticheta unui rand de statistica reprezinta valoare
// neclarificata/lipsa (nu un trainer/sala/responsabil/tip real) - folosit ca
// sa marcam acele randuri cu rosu/bold, la fel ca in lista de cursuri
export const MISSING_STAT_LABELS = ['TBD', 'Fără categorie']
export function isMissingStatKey(key) {
  return MISSING_STAT_LABELS.includes(key)
}

// Grupeaza rezultatele dupa un camp (trainer/sala/responsabil/categorie/tip),
// insumand nr. de cursuri, zile cumulate si participanti pentru fiecare
// valoare distincta. Valorile lipsa sau "TBD" (pentru campurile cu acest
// sentinel) sunt grupate sub eticheta indicata, ca sa nu dispara din raport.
function groupBy(results, field, { missingLabel, isTbdSentinel = true } = {}) {
  const map = new Map()
  for (const c of results) {
    let key = c[field]
    if (!key || (isTbdSentinel && key === 'TBD')) key = missingLabel
    if (!map.has(key)) map.set(key, { key, count: 0, days: 0, participants: 0 })
    const entry = map.get(key)
    entry.count += 1
    entry.days += courseDurationDays(c.start_date, c.end_date)
    entry.participants += Number(c.participants_count) || 0
  }
  return [...map.values()].sort((a, b) => b.days - a.days)
}

// Varianta pentru un camp de tip LISTA (ex: "trainers" - un curs poate avea
// mai multi traineri deodata, co-facilitare). Fiecare curs contribuie la
// TOATE valorile din lista lui, nu la o singura valoare - un curs cu 2
// traineri creste "nr. cursuri" pentru amandoi, nu doar pentru primul.
function groupByArray(results, field, { missingLabel }) {
  const map = new Map()
  for (const c of results) {
    const rawList = Array.isArray(c[field]) ? c[field] : []
    const values = rawList.filter((v) => v && v !== 'TBD')
    const keys = values.length > 0 ? values : [missingLabel]
    for (const key of keys) {
      if (!map.has(key)) map.set(key, { key, count: 0, days: 0, participants: 0 })
      const entry = map.get(key)
      entry.count += 1
      entry.days += courseDurationDays(c.start_date, c.end_date)
      entry.participants += Number(c.participants_count) || 0
    }
  }
  return [...map.values()].sort((a, b) => b.days - a.days)
}

export const trainerLoadReport = (results) =>
  groupByArray(results, 'trainers', { missingLabel: 'TBD' })

export const roomOccupancyReport = (results) =>
  groupBy(results, 'room', { missingLabel: 'TBD' })

export const responsibleLoadReport = (results) =>
  groupBy(results, 'responsible', { missingLabel: 'TBD' })

export const categoryMixReport = (results) =>
  groupBy(results, 'course_area', { missingLabel: 'Fără categorie', isTbdSentinel: false })

export const courseTypeMixReport = (results) =>
  groupBy(results, 'course_type', { missingLabel: 'TBD' })

export const totalParticipants = (results) =>
  results.reduce((sum, c) => sum + (Number(c.participants_count) || 0), 0)

// numarul de zile din intervalul selectat (inclusiv capetele) - folosit ca
// numitor pentru procentul de ocupare al traineri/sali
export function periodDays(startDate, endDate) {
  return courseDurationDays(startDate, endDate)
}
