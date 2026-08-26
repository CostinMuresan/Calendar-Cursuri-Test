import { differenceInCalendarDays, parseISO } from 'date-fns'

// Scala implicita de culori dupa durata cursului, gandita pentru contrast
// maxim intre categorii (nu un gradient de nuante apropiate, greu de
// distins): 1 zi -> albastru | 2-3 zile -> verde | 4-7 zile -> portocaliu |
// >7 zile -> rosu. Fiecare bucket are un "key" stabil, folosit ca sa poata
// fi suprascris cu o culoare aleasa manual de user (vezi getBarStyle).
const SCALE = [
  { key: 'oneDay', max: 1, bg: '#d9e6ff', border: '#2f6fed', text: '#1a3f91', label: '1 zi' },
  { key: 'twoThree', max: 3, bg: '#d3f2df', border: '#1f9d55', text: '#146c3a', label: '2-3 zile' },
  { key: 'fourSeven', max: 7, bg: '#ffe3bd', border: '#f2900c', text: '#a35c00', label: '4-7 zile' },
  { key: 'overWeek', max: Infinity, bg: '#ffd6da', border: '#e0293f', text: '#a30f22', label: '> 1 saptamana' },
]

export function courseDurationDays(startDate, endDate) {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate
  return differenceInCalendarDays(end, start) + 1
}

export function getDurationStyle(startDate, endDate) {
  const days = courseDurationDays(startDate, endDate)
  return SCALE.find((s) => days <= s.max)
}

export const DURATION_LEGEND = SCALE.map((s) => ({
  key: s.key,
  label: s.label,
  bg: s.bg,
  border: s.border,
}))

// ------------------------------------------------------------------
// Culori personalizate: durata (implicit), responsabil, sau categorie
// (arie curs). Userul isi alege modul + culorile din pagina de Setari,
// salvate in profilul lui din Supabase (profile.color_mode / custom_colors).
// ------------------------------------------------------------------

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

// tinta bg-ul (opacitate redusa peste fundal alb), pastreaza culoarea aleasa
// intacta pe bordura, si foloseste text inchis - lizibil pe orice tinta deschisa
export function styleFromHex(hex) {
  return { bg: `${hex}30`, border: hex, text: '#20263a' }
}

// culoare implicita, neutra, pentru orice valoare (responsabil/categorie)
// care nu a fost inca personalizata manual de user - un gri echilibrat, nici
// prea deschis, nici prea inchis.
export const DEFAULT_NEUTRAL_GRAY = '#8a94a6'

// text rosu pentru cursurile neclarificate (responsabil/categorie lipsa) -
// acelasi rosu ca --danger din index.css, ca sa fie evident dintr-o privire
// ca acel curs are nevoie de atentie, nu doar eticheta "TBD" separat
const UNCLARIFIED_TEXT_COLOR = '#dc3545'

// Cheia sub care se salveaza o culoare personalizata in profile.custom_colors
export function colorKeyFor(mode, value) {
  return `${mode}:${value}`
}

// Functia unica folosita de calendar (lunar + saptamanal) pentru stilul unui
// curs: alege modul (durata / responsabil / categorie) si aplica orice
// culoare personalizata gasita, cu fallback sensibil daca nu exista una.
//
// Regula UNITARA pentru toate trei criteriile: cand valoarea aleasa lipseste
// sau e "TBD" (responsabil neclarificat inca), cursul primeste fundal gri
// neutru si flag-ul "unclarified" - componentele de randare (MonthGrid,
// WeekGrid, day-detail-list) afiseaza atunci un text "TBD" in rosu, direct
// pe bara, ca semnal clar "inca de clarificat".
export function getBarStyle(course, prefs = {}) {
  const { colorMode = 'duration', customColors = {} } = prefs

  if (colorMode === 'responsible') {
    if (course.responsible && course.responsible !== 'TBD') {
      const key = colorKeyFor('responsible', course.responsible)
      return { ...styleFromHex(customColors[key] || DEFAULT_NEUTRAL_GRAY), unclarified: false }
    }
    return { ...styleFromHex(DEFAULT_NEUTRAL_GRAY), unclarified: true, text: UNCLARIFIED_TEXT_COLOR }
  }

  if (colorMode === 'category') {
    if (course.course_area) {
      const key = colorKeyFor('category', course.course_area)
      return { ...styleFromHex(customColors[key] || DEFAULT_NEUTRAL_GRAY), unclarified: false }
    }
    return { ...styleFromHex(DEFAULT_NEUTRAL_GRAY), unclarified: true, text: UNCLARIFIED_TEXT_COLOR }
  }

  const bucket = getDurationStyle(course.start_date, course.end_date)
  const durationKey = colorKeyFor('duration', bucket.key)
  const customDurationHex = customColors[durationKey]
  return { ...(customDurationHex ? styleFromHex(customDurationHex) : bucket), unclarified: false }
}
