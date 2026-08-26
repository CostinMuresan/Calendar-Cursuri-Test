// Alias-urile acceptate pentru fiecare coloana - antetul din Excel e
// potrivit flexibil (fara diacritice, fara majuscule/minuscule, fara
// puncte), ca userul sa nu trebuiasca sa scrie EXACT un anumit text.
export const COLUMN_ALIASES = {
  name: ['denumire curs', 'denumire', 'nume curs', 'curs', 'name', 'titlu'],
  start_date: ['data start', 'data inceput', 'data de inceput', 'start date', 'data'],
  end_date: ['data sfarsit', 'data final', 'data de sfarsit', 'end date'],
  start_time: ['ora start', 'ora inceput', 'ora de inceput', 'start time'],
  end_time: ['ora sfarsit', 'ora final', 'ora de sfarsit', 'end time'],
  course_type: ['tip curs', 'tip', 'course type'],
  trainer: ['trainer', 'traineri', 'trainers'],
  room: ['sala', 'room'],
  responsible: ['responsabil', 'responsible'],
  participants_group: ['grup participanti', 'grup', 'participants group'],
  participants_count: ['nr participanti', 'nr. participanti', 'numar participanti', 'participanti', 'nr part'],
  course_area: ['categorie', 'arie curs', 'arie', 'categorie curs', 'arie/categorie'],
  target_audience: ['public tinta', 'public'],
  invite_mail: ['mail invitare', 'email invitare', 'mail'],
  catering: ['catering'],
  notes: ['observatii', 'note', 'notes', 'obs'],
}

// Coloanele fara de care un rand nu poate fi importat
export const REQUIRED_FIELDS = ['name', 'start_date', 'end_date']

// scoate diacriticele (ă/â/î/ș/ț etc.), majusculele si punctuatia minora,
// ca sa poata fi comparat un antet scris in orice varianta rezonabila
function normalizeHeader(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
}

// pentru un antet de coloana din Excel, gaseste campul din baza de date
// caruia ii corespunde (sau null, daca nu recunoaste coloana - in acel caz,
// coloana e pur si simplu ignorata la import, nu opreste nimic)
export function matchHeaderToField(header) {
  const normalized = normalizeHeader(header)
  if (!normalized) return null
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((a) => normalizeHeader(a) === normalized)) return field
  }
  return null
}

// Excel poate reprezenta o data in 3 feluri: obiect Date (daca celula era
// formatata ca data si am citit cu {cellDates:true}), numar serial (zile de
// la 30 dec 1899 - conventia Excel, daca celula n-a fost recunoscuta ca
// data), sau text simplu (DD/LL/AAAA, scris manual). Tratam toate trei.
//
// IMPORTANT: xlsx construieste obiectul Date (ramura 1) ANCORAT LA FUSUL
// ORAR LOCAL al calculatorului, nu UTC - deci toate ramurile de mai jos
// construiesc local, si dateToISO() citeste tot local, consecvent. (O
// versiune anterioara presupunea gresit ca xlsx ancoreaza UTC, ceea ce
// provoca exact alunecarea datei cu o zi in urma, pe orice fus orar cu
// offset pozitiv fata de UTC, ca Romania.)
export function parseExcelDate(value) {
  if (value instanceof Date && !isNaN(value)) return value
  if (typeof value === 'number') {
    // calculam CE zi calendaristica reprezinta numarul serial, folosind
    // aritmetica UTC doar ca sa numaram zilele fara ambiguitate (nu conteaza
    // fusul orar cand doar numeri zile intregi) - apoi reconstruim data
    // LOCAL, pentru consecventa cu celelalte ramuri si cu dateToISO()
    const epochUTC = Date.UTC(1899, 11, 30)
    const utc = new Date(epochUTC + Math.round(value) * 86400000)
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  }
  return null
}

// converteste o data JS (ancorata local, vezi mai sus) in text "AAAA-LL-ZZ"
// (formatul folosit in Supabase) - cu metode locale, consecvent cu modul in
// care a fost construita data mai sus
export function dateToISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ora poate fi obiect Date (cu ora/minut relevante), fractiune de zi (Excel
// stocheaza orele tot ca numar, ex: 0.375 = 09:00), sau text "HH:MM" - la
// fel ca la data, xlsx da obiectul Date ancorat local, deci citim local
export function parseExcelTime(value) {
  if (value instanceof Date && !isNaN(value)) {
    const h = String(value.getHours()).padStart(2, '0')
    const m = String(value.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60)
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')
    const m = String(totalMinutes % 60).padStart(2, '0')
    return `${h}:${m}`
  }
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{1,2}):(\d{2})/)
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  }
  return null
}

// celula "Trainer" poate avea mai multi traineri, separati prin virgula
// (co-facilitare) - ex: "Ion Popescu, Maria Ionescu". Textul e impartit,
// fiecare bucata curatata de spatii; celula goala/lipsa -> ["TBD"].
export function parseTrainersList(rawValue) {
  const text = (rawValue ?? '').toString().trim()
  if (!text) return ['TBD']
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 ? parts : ['TBD']
}
