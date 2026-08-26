import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { toISODate } from '../../utils/dateHelpers'
import { normalizeForCompare, findFuzzyMatch } from '../../utils/fuzzyMatch'
import DateInputRO from '../DateInputRO'

const COURSE_TYPES = ['TBD', 'live', 'online', 'blended', 'e-learning']

// Doar aceste campuri apartin formularului. Cursul incarcat din baza de date
// (prin select('*')) mai contine si alte coloane - id, created_at, created_by,
// si "period" (coloana calculata automat, folosita pentru garantia anti-
// suprapunere) - care nu trebuie niciodata retrimise la salvare: Postgres
// refuza scrierea directa pe coloana calculata, iar restul nu apartin
// formularului editabil.
const FORM_FIELDS = [
  'name', 'course_type', 'start_date', 'end_date', 'start_time', 'end_time',
  'trainers', 'room', 'participants_group', 'participants_count',
  'responsible', 'invite_mail', 'catering', 'notes', 'course_area', 'target_audience',
]

// sala/tip curs/responsabil sunt obligatorii; cursurile mai vechi, salvate
// inainte de aceasta regula, pot avea valoarea goala - le tratam ca "TBD"
// la afisare. "trainers" e o lista (co-facilitare) - la fel, ramane cel
// putin ["TBD"] daca vine goala.
function pickFormFields(source) {
  const result = {}
  for (const key of FORM_FIELDS) {
    result[key] = source[key] ?? ''
  }
  result.trainers = Array.isArray(source.trainers) && source.trainers.length > 0 ? source.trainers : ['TBD']
  if (!result.room) result.room = 'TBD'
  if (!result.course_type) result.course_type = 'TBD'
  if (!result.responsible) result.responsible = 'TBD'
  return result
}

const emptyForm = (startDate, defaultResponsible) => ({
  name: '',
  course_type: 'TBD',
  start_date: startDate,
  end_date: startDate,
  start_time: '09:00',
  end_time: '17:00',
  trainers: ['TBD'],
  room: 'TBD',
  participants_group: '',
  participants_count: '',
  responsible: defaultResponsible || 'TBD',
  invite_mail: '',
  catering: '',
  notes: '',
  course_area: '',
  target_audience: '',
})

// gaseste elementul din lista (traineri/sali/responsabili) a carui nume se
// potriveste cu valoarea data, dupa normalizare (spatii/punctuatie/majuscule)
// - folosit atat pentru afisarea unui indiciu langa camp, cat si la salvare
function findMatch(list, rawValue) {
  const value = normalizeForCompare(rawValue)
  if (!value) return null
  return list.find((item) => normalizeForCompare(item.name) === value) || null
}

// indiciul aratat sub un combobox (Trainer/Sala/Responsabil): fie ca
// valoarea scrisa e noua (va fi creata automat la salvare), fie ca e deja
// in lista dar inactiva, fie (pentru sali) capacitatea, daca exista
function comboHint(rawValue, list, { withCapacity = false } = {}) {
  const value = (rawValue || '').trim()
  if (!value || value === 'TBD') return null
  const existing = findMatch(list, value)
  if (!existing) return `nou — va fi adaugat automat in lista la salvare`
  if (!existing.active) return `inactiv in lista (poate fi folosit oricum)`
  if (withCapacity && existing.capacity) return `${existing.capacity} locuri`
  return null
}

// acelasi indiciu discret, dar pentru campuri text libere, FARA lista
// gestionata in spate (Arie curs/categorie, Public tinta) - nu se "creeaza"
// nimic separat la salvare (valoarea se scrie direct pe curs), deci
// formularea difera de comboHint (care are efect real intr-o lista din
// Administrare)
function freeTextHint(rawValue, options) {
  const value = normalizeForCompare(rawValue)
  if (!value) return null
  const exists = options.some((o) => normalizeForCompare(o) === value)
  return exists ? null : 'valoare noua'
}

// bannerul neblocant "seamana cu X deja existent" - afisat la parasirea
// campului (onBlur), cand valoarea scrisa nu e o potrivire exacta, dar e
// foarte apropiata de una deja existenta (posibil typo). Userul poate
// ignora complet si salva oricum cu ce a scris - nu blocheaza nimic.
function FuzzySuggestion({ suggestion, onAccept, onDismiss }) {
  return (
    <span className="fuzzy-hint">
      seamana cu <strong>„{suggestion}"</strong>, deja existent —{' '}
      <button type="button" className="fuzzy-hint-btn" onClick={onAccept}>foloseste-l</button>
      {' '}·{' '}
      <button type="button" className="fuzzy-hint-btn fuzzy-hint-btn-secondary" onClick={onDismiss}>nu, e nou</button>
    </span>
  )
}

export default function CourseModal({ initialDate, course, onClose, onSaved }) {
  const { user, profile, isAdmin } = useAuth()
  // la un curs nou, implicit responsabilul e chiar userul logat (primul din
  // lista lui, daca are mai multi asociati - vezi Administrare -> Useri) -
  // ramane insa un camp normal, editabil, inclusiv inapoi la TBD, daca de
  // fapt nu userul curent e responsabilul potrivit
  const [form, setForm] = useState(
    course ? pickFormFields(course) : emptyForm(toISODate(initialDate), profile?.responsible_names?.[0])
  )
  const [sameDayCourse, setSameDayCourse] = useState(
    course ? course.start_date === course.end_date : false
  )
  const [trainers, setTrainers] = useState([])
  const [rooms, setRooms] = useState([])
  const [responsiblePersons, setResponsiblePersons] = useState([])
  const [categoryOptions, setCategoryOptions] = useState([])
  const [audienceOptions, setAudienceOptions] = useState([])
  const [error, setError] = useState('')
  const [conflictWarning, setConflictWarning] = useState('')
  const [busy, setBusy] = useState(false)
  // textul din campul "adauga trainer" - separat de form.trainers (lista
  // deja adaugata), ca sa poata fi golit dupa fiecare adaugare
  const [trainerInput, setTrainerInput] = useState('')
  // { field, suggestion } | null - un singur banner de similaritate activ
  // odata, pentru campul pe care userul tocmai l-a parasit (onBlur)
  const [fuzzyHint, setFuzzyHint] = useState(null)

  const isEditing = Boolean(course?.id)
  const canEdit = !isEditing || isAdmin || course.created_by === user?.id

  useEffect(() => {
    supabase.from('trainers').select('*').order('name').then(({ data }) => setTrainers(data || []))
    supabase.from('rooms').select('*').order('name').then(({ data }) => setRooms(data || []))
    supabase.from('responsible_persons').select('*').order('name').then(({ data }) => setResponsiblePersons(data || []))
    // "Arie curs" si "Public tinta" sunt campuri libere, fara lista gestionata
    // in Administrare - le oferim totusi ca sugestii (datalist), din ce s-a
    // mai scris deja pe alte cursuri, ca sa nu apara variante gen "Soft
    // skills" / "soft-skills" din greseala de tastare
    supabase.from('courses').select('course_area, target_audience').then(({ data }) => {
      const rows = data || []
      setCategoryOptions([...new Set(rows.map((r) => r.course_area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')))
      setAudienceOptions([...new Set(rows.map((r) => r.target_audience).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')))
    })
  }, [])

  const trainerNames = ['TBD', ...trainers.filter((t) => t.active).map((t) => t.name)]
  const roomNames = ['TBD', ...rooms.filter((r) => r.active).map((r) => r.name)]
  const responsibleNames = ['TBD', ...responsiblePersons.filter((r) => r.active).map((r) => r.name)]

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    // daca userul reincepe sa scrie in campul pentru care era afisat un
    // banner de similaritate, il ascundem - nu mai e relevant pentru noua valoare
    setFuzzyHint((h) => (h?.field === field ? null : h))
  }

  // la parasirea campului (onBlur): daca valoarea scrisa nu e o potrivire
  // exacta, dar e foarte apropiata de una deja existenta, aratam bannerul.
  // Complet neblocant - daca userul nu raspunde si apasa Salveaza, se
  // foloseste ce a scris el, ca si cum bannerul n-ar fi aparut.
  //
  // IMPORTANT: daca valoarea se potriveste deja EXACT cu ceva existent (ex:
  // a fost aleasa direct din lista), nu mai verificam similaritatea deloc -
  // nu s-ar crea nimic nou, deci n-are sens sa intrebam "seamana cu X?" cand
  // userul tocmai a ales ceva deja existent (chiar daca acel ceva seamana,
  // la randul lui, cu alta intrare din lista - nu e vina userului acum).
  function checkFuzzy(field, value, existingNames) {
    const alreadyExists = existingNames.some((n) => normalizeForCompare(n) === normalizeForCompare(value))
    if (alreadyExists) {
      setFuzzyHint(null)
      return
    }
    const suggestion = findFuzzyMatch(value, existingNames)
    setFuzzyHint(suggestion ? { field, suggestion } : null)
  }

  // Trainer/Sala/Responsabil pornesc cu "TBD" ca valoare implicita - fara
  // sa o golim la click, sugestiile din datalist raman filtrate dupa "TBD"
  // (nu se potriveste cu nimic altceva), deci userul trebuie sa stearga
  // manual inainte sa vada lista completa. La focus, daca valoarea e chiar
  // "TBD" (nemodificata), o golim automat - lista completa apare imediat.
  function clearDefaultOnFocus(field, currentValue) {
    if (currentValue === 'TBD') update(field, '')
  }
  // daca userul a deschis campul (l-a golit) dar a plecat fara sa aleaga
  // nimic, revenim la "TBD" - e un camp obligatoriu, nu poate ramane gol
  function restoreDefaultOnBlur(field, currentValue) {
    if (!currentValue.trim()) update(field, 'TBD')
  }
  // adauga un nume in lista de traineri a cursului - scoate "TBD" daca era
  // acolo ca placeholder (nu are sens sa ramana amestecat cu nume reale),
  // si nu adauga duplicate (comparatie dupa normalizare, nu text exact)
  function addTrainerToArray(rawName) {
    const raw = (rawName || '').trim()
    if (!raw) return
    setForm((f) => {
      const withoutTBD = f.trainers.filter((t) => t !== 'TBD')
      const already = withoutTBD.some((t) => normalizeForCompare(t) === normalizeForCompare(raw))
      const next = already ? withoutTBD : [...withoutTBD, raw]
      return { ...f, trainers: next.length > 0 ? next : ['TBD'] }
    })
  }
  function removeTrainer(name) {
    setForm((f) => {
      const next = f.trainers.filter((t) => t !== name)
      return { ...f, trainers: next.length > 0 ? next : ['TBD'] }
    })
  }
  // click pe "+" (sau Enter) langa campul de adaugare trainer - daca
  // valoarea scrisa nu exista si nu seamana cu nimic, o adauga direct; daca
  // seamana cu ceva existent, arata bannerul si ASTEAPTA raspunsul userului
  // inainte sa adauge orice (evita sa adauge apoi sa mai schimbe)
  function handleAddTrainer() {
    const raw = trainerInput.trim()
    if (!raw) return
    const existingNames = trainers.map((t) => t.name)
    const alreadyExists = existingNames.some((n) => normalizeForCompare(n) === normalizeForCompare(raw))
    if (!alreadyExists) {
      const suggestion = findFuzzyMatch(raw, existingNames)
      if (suggestion) {
        setFuzzyHint({ field: 'trainer', suggestion, pendingValue: raw })
        return
      }
    }
    addTrainerToArray(raw)
    setTrainerInput('')
  }
  // pentru Trainer, "accepta"/"respinge" adauga in lista (numele sugerat,
  // respectiv ce a scris userul) - pentru celelalte campuri (Sala/
  // Responsabil/Categorie/Public tinta), suprascrie valoarea, ca pana acum
  function acceptFuzzy() {
    if (!fuzzyHint) return
    if (fuzzyHint.field === 'trainer') {
      addTrainerToArray(fuzzyHint.suggestion)
      setTrainerInput('')
    } else {
      update(fuzzyHint.field, fuzzyHint.suggestion)
    }
    setFuzzyHint(null)
  }
  function dismissFuzzy() {
    if (fuzzyHint?.field === 'trainer' && fuzzyHint.pendingValue) {
      addTrainerToArray(fuzzyHint.pendingValue)
      setTrainerInput('')
    }
    setFuzzyHint(null)
  }

  // "Curs de o zi" (bifat implicit): tine data de sfarsit sincronizata cu
  // cea de start, ca sa nu mai fie nevoie sa completezi manual amandoua
  // pentru cazul cel mai comun. Debifat, cele doua date devin independente.
  function updateStartDate(value) {
    setForm((f) => ({ ...f, start_date: value, end_date: sameDayCourse ? value : f.end_date }))
  }
  function toggleSameDayCourse(checked) {
    setSameDayCourse(checked)
    if (checked) setForm((f) => ({ ...f, end_date: f.start_date }))
  }

  async function findFieldConflict(field, value) {
    if (!value || value === 'TBD') return null

    let query = supabase
      .from('courses')
      .select('id, name, start_date, end_date, start_time, end_time')
      // ilike (nu eq) - case-insensitive, ca "arad" scris cu minuscule sa
      // gaseasca la fel de bine conflictul cu "Arad" deja existent in baza
      // de date, indiferent cum a fost scrisa valoarea in formular
      .ilike(field, value)
      .lte('start_date', form.end_date)
      .gte('end_date', form.start_date)

    if (isEditing) query = query.neq('id', course.id)

    const { data, error } = await query
    if (error) throw error

    return (data || []).find((c) => {
      // fara ora precizata pe una din cele doua programari => consideram conflict pe toata ziua
      if (!form.start_time || !form.end_time || !c.start_time || !c.end_time) return true
      return c.start_time < form.end_time && form.start_time < c.end_time
    }) || null
  }

  // varianta pentru lista de traineri (co-facilitare) - semnaleaza conflict
  // daca ORICARE dintre trainerii selectati e deja programat in acest
  // interval, la alt curs (aceeasi regula ca in trigger-ul din baza de date)
  async function findTrainersConflict(trainerNames) {
    const real = (trainerNames || []).filter((t) => t && t !== 'TBD')
    if (real.length === 0) return null

    let query = supabase
      .from('courses')
      .select('id, name, start_date, end_date, start_time, end_time')
      .overlaps('trainers', real)
      .lte('start_date', form.end_date)
      .gte('end_date', form.start_date)

    if (isEditing) query = query.neq('id', course.id)

    const { data, error } = await query
    if (error) throw error

    return (data || []).find((c) => {
      if (!form.start_time || !form.end_time || !c.start_time || !c.end_time) return true
      return c.start_time < form.end_time && form.start_time < c.end_time
    }) || null
  }

  // verificare de conflict in timp real, cat userul completeaza formularul -
  // pur informativa (nu blocheaza nimic), ca sa afle DINAINTE sa apese
  // Salveaza, nu dupa ce a completat tot restul formularului. Verificarea
  // definitiva, care chiar blocheaza salvarea, ramane cea din handleSubmit.
  useEffect(() => {
    if (!canEdit || form.end_date < form.start_date) {
      setConflictWarning('')
      return
    }
    const timeout = setTimeout(async () => {
      try {
        const messages = []
        const roomConflict = await findFieldConflict('room', form.room)
        if (roomConflict) {
          messages.push(`Sala "${form.room}" e deja rezervata in aceasta perioada de cursul "${roomConflict.name}".`)
        }
        const trainerConflict = await findTrainersConflict(form.trainers)
        if (trainerConflict) {
          messages.push(`Cel putin unul dintre trainerii alesi e deja programat in aceasta perioada la cursul "${trainerConflict.name}".`)
        }
        setConflictWarning(messages.join('\n'))
      } catch {
        // esec silentios aici - verificarea definitiva e cea din handleSubmit
      }
    }, 500)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(form.trainers), form.room, form.start_date, form.end_date, form.start_time, form.end_time])

  // "Ion popescu" / "ION POPESCU" / "ion POPESCU" -> "Ion Popescu" - fiecare
  // cuvant incepe cu majuscula, restul literelor mici. Aplicata doar la
  // Trainer, doar cand se creeaza efectiv o valoare noua (nu schimba
  // ortografia unei valori deja existente in lista).
  function toProperCase(value) {
    return (value || '')
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
      .join(' ')
  }

  // daca valoarea scrisa in combobox (Trainer/Sala/Responsabil) nu exista
  // inca in lista gestionata din Administrare, o creeaza automat (activa)
  // inainte de salvare, si intoarce numele "canonic" (ortografia deja
  // existenta, daca s-a potrivit dupa litere mari/mici, evitand duplicate).
  // "transform" (optional) formateaza valoarea NOUA inainte de a o crea -
  // nu se aplica peste o valoare deja existenta, gasita in lista.
  async function ensureListValue(table, list, rawValue, { transform } = {}) {
    const value = (rawValue || '').trim()
    if (!value || value === 'TBD') return value
    const existing = findMatch(list, value)
    if (existing) return existing.name
    const nameToInsert = transform ? transform(value) : value
    const { data, error } = await supabase.from(table).insert({ name: nameToInsert, active: true }).select().single()
    if (error) throw error
    return data.name
  }

  // aplica ensureListValue (auto-creare + normalizare canonica) pe FIECARE
  // trainer din lista - returneaza numele canonice, fara duplicate, si fara
  // sa amestece "TBD" cu nume reale
  async function ensureTrainersList(rawTrainers) {
    const canonical = []
    for (const raw of rawTrainers) {
      if (!raw || raw === 'TBD') continue
      const name = await ensureListValue('trainers', trainers, raw, { transform: toProperCase })
      if (!canonical.some((n) => normalizeForCompare(n) === normalizeForCompare(name))) canonical.push(name)
    }
    return canonical.length > 0 ? canonical : ['TBD']
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (form.end_date < form.start_date) {
      setError('Data de sfarsit nu poate fi inainte de data de start.')
      return
    }

    setBusy(true)

    let trainerNames, roomName, responsibleName
    try {
      trainerNames = await ensureTrainersList(form.trainers)
      roomName = await ensureListValue('rooms', rooms, form.room)
      responsibleName = await ensureListValue('responsible_persons', responsiblePersons, form.responsible)
    } catch (err) {
      setError(err.message || 'Nu am putut adauga automat valoarea noua in lista.')
      setBusy(false)
      return
    }

    try {
      const conflictMessages = []

      const roomConflict = await findFieldConflict('room', roomName)
      if (roomConflict) {
        conflictMessages.push(
          `Sala "${roomName}" este deja rezervata in aceasta perioada de cursul "${roomConflict.name}" ` +
          `(${roomConflict.start_date} - ${roomConflict.end_date}${roomConflict.start_time ? `, ${roomConflict.start_time.slice(0, 5)}-${roomConflict.end_time?.slice(0, 5)}` : ''}).`
        )
      }

      const trainerConflict = await findTrainersConflict(trainerNames)
      if (trainerConflict) {
        conflictMessages.push(
          `Cel putin unul dintre trainerii "${trainerNames.join(', ')}" este deja programat in aceasta perioada la cursul "${trainerConflict.name}" ` +
          `(${trainerConflict.start_date} - ${trainerConflict.end_date}${trainerConflict.start_time ? `, ${trainerConflict.start_time.slice(0, 5)}-${trainerConflict.end_time?.slice(0, 5)}` : ''}).`
        )
      }

      if (conflictMessages.length > 0) {
        setError(conflictMessages.join('\n') + '\nAlege alta sala/trainer sau alt interval.')
        setBusy(false)
        return
      }
    } catch (err) {
      setError(err.message || 'Nu am putut verifica disponibilitatea salii/trainerului.')
      setBusy(false)
      return
    }

    const payload = {
      ...form,
      trainers: trainerNames,
      room: roomName,
      responsible: responsibleName,
      participants_count: form.participants_count ? Number(form.participants_count) : null,
    }

    try {
      if (isEditing) {
        const { error } = await supabase.from('courses').update(payload).eq('id', course.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('courses').insert({ ...payload, created_by: user.id })
        if (error) throw error
      }
      onSaved()
    } catch (err) {
      const rawMessage = err.message || ''
      const isRoomRace = err.code === '23P01' && rawMessage.includes('courses_no_room_overlap')
      const isTrainerRace = err.code === '23P01' && rawMessage.includes('trainerii alesi')
      if (isRoomRace) {
        setError(
          'Sala tocmai a fost rezervata de altcineva, chiar in acest interval (coliziune detectata la salvare, ' +
          'din doua programari simultane). Inchide fereastra, reincarca calendarul si alege alta sala sau alt interval.'
        )
      } else if (isTrainerRace) {
        setError(
          'Trainerul tocmai a fost programat de altcineva, chiar in acest interval (coliziune detectata la salvare, ' +
          'din doua programari simultane). Inchide fereastra, reincarca calendarul si alege alt trainer sau alt interval.'
        )
      } else {
        setError(rawMessage || 'Nu am putut salva cursul.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Sigur vrei sa stergi acest curs?')) return
    setBusy(true)
    const { error } = await supabase.from('courses').delete().eq('id', course.id)
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Editeaza curs' : 'Adauga curs'}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="course-form">
          <label className="span-2">
            Denumire curs *
            <input required disabled={!canEdit} value={form.name} onChange={(e) => update('name', e.target.value)} />
          </label>

          <label>
            Data + ora start *
            <div className="datetime-row">
              <DateInputRO required disabled={!canEdit} value={form.start_date} onChange={updateStartDate} />
              <input type="time" disabled={!canEdit} value={form.start_time || ''} onChange={(e) => update('start_time', e.target.value)} />
            </div>
          </label>
          <label className="same-day-toggle">
            <span>&nbsp;</span>
            <span className="same-day-toggle-inner">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={sameDayCourse}
                onChange={(e) => toggleSameDayCourse(e.target.checked)}
              />
              curs de o zi
            </span>
          </label>
          <label>
            Traineri *
            <div className="trainer-tags">
              {form.trainers.map((t) => (
                <span key={t} className="trainer-tag">
                  {t}
                  {canEdit && (
                    <button type="button" onClick={() => removeTrainer(t)} aria-label={`Elimina ${t}`}>×</button>
                  )}
                </span>
              ))}
            </div>
            <div className="combo-field trainer-add-row">
              <input
                list="trainer-options"
                disabled={!canEdit}
                autoComplete="off"
                value={trainerInput}
                onChange={(e) => setTrainerInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTrainer() } }}
                placeholder="adauga trainer..."
              />
              <button type="button" className="secondary-btn" onClick={handleAddTrainer} disabled={!canEdit || !trainerInput.trim()}>
                +
              </button>
            </div>
            <datalist id="trainer-options">
              {trainerNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            {fuzzyHint?.field === 'trainer' && (
              <FuzzySuggestion suggestion={fuzzyHint.suggestion} onAccept={acceptFuzzy} onDismiss={dismissFuzzy} />
            )}
          </label>

          <label>
            Data + ora sfarsit *
            <div className="datetime-row">
              <DateInputRO
                required
                disabled={!canEdit || sameDayCourse}
                value={form.end_date}
                onChange={(v) => update('end_date', v)}
              />
              <input type="time" disabled={!canEdit} value={form.end_time || ''} onChange={(e) => update('end_time', e.target.value)} />
            </div>
          </label>
          <div className="same-day-spacer" />
          <label>
            Sala *
            <div className="combo-field">
              <input
                list="room-options"
                required
                disabled={!canEdit}
                autoComplete="off"
                value={form.room || ''}
                onChange={(e) => update('room', e.target.value)}
                onFocus={() => clearDefaultOnFocus('room', form.room)}
                onBlur={() => {
                  restoreDefaultOnBlur('room', form.room)
                  checkFuzzy('room', form.room, rooms.map((r) => r.name))
                }}
              />
            </div>
            <datalist id="room-options">
              {roomNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            {fuzzyHint?.field === 'room' ? (
              <FuzzySuggestion suggestion={fuzzyHint.suggestion} onAccept={acceptFuzzy} onDismiss={dismissFuzzy} />
            ) : comboHint(form.room, rooms, { withCapacity: true }) && (
              <span className="combo-hint">{comboHint(form.room, rooms, { withCapacity: true })}</span>
            )}
          </label>

          <label>
            Tip curs *
            <select required disabled={!canEdit} value={form.course_type || 'TBD'} onChange={(e) => update('course_type', e.target.value)}>
              {COURSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>
            Nr. participanti
            <input type="number" min="0" disabled={!canEdit} value={form.participants_count || ''} onChange={(e) => update('participants_count', e.target.value)} />
          </label>

          <label>
            Grup participanti
            <input disabled={!canEdit} value={form.participants_group || ''} onChange={(e) => update('participants_group', e.target.value)} />
          </label>

          <label>
            Responsabil *
            <div className="combo-field">
              <input
                list="responsible-options"
                required
                disabled={!canEdit}
                autoComplete="off"
                value={form.responsible || ''}
                onChange={(e) => update('responsible', e.target.value)}
                onFocus={() => clearDefaultOnFocus('responsible', form.responsible)}
                onBlur={() => {
                  restoreDefaultOnBlur('responsible', form.responsible)
                  checkFuzzy('responsible', form.responsible, responsiblePersons.map((r) => r.name))
                }}
              />
            </div>
            <datalist id="responsible-options">
              {responsibleNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            {fuzzyHint?.field === 'responsible' ? (
              <FuzzySuggestion suggestion={fuzzyHint.suggestion} onAccept={acceptFuzzy} onDismiss={dismissFuzzy} />
            ) : comboHint(form.responsible, responsiblePersons) && (
              <span className="combo-hint">{comboHint(form.responsible, responsiblePersons)}</span>
            )}
          </label>

          <label>
            Mail invitare
            <input disabled={!canEdit} value={form.invite_mail || ''} onChange={(e) => update('invite_mail', e.target.value)} />
          </label>

          <label>
            Catering
            <input disabled={!canEdit} value={form.catering || ''} onChange={(e) => update('catering', e.target.value)} />
          </label>

          <label>
            Arie curs / categorie
            <div className="combo-field">
              <input
                list="category-options"
                disabled={!canEdit}
                autoComplete="off"
                value={form.course_area || ''}
                onChange={(e) => update('course_area', e.target.value)}
                onBlur={() => checkFuzzy('course_area', form.course_area, categoryOptions)}
                placeholder="ex: Soft skills, Tehnic, Conformitate"
              />
            </div>
            <datalist id="category-options">
              {categoryOptions.map((c) => <option key={c} value={c} />)}
            </datalist>
            {fuzzyHint?.field === 'course_area' ? (
              <FuzzySuggestion suggestion={fuzzyHint.suggestion} onAccept={acceptFuzzy} onDismiss={dismissFuzzy} />
            ) : freeTextHint(form.course_area, categoryOptions) && (
              <span className="combo-hint">{freeTextHint(form.course_area, categoryOptions)}</span>
            )}
          </label>

          <label>
            Public tinta
            <div className="combo-field">
              <input
                list="audience-options"
                disabled={!canEdit}
                autoComplete="off"
                value={form.target_audience || ''}
                onChange={(e) => update('target_audience', e.target.value)}
                onBlur={() => checkFuzzy('target_audience', form.target_audience, audienceOptions)}
                placeholder="ex: Manageri, Noi angajati"
              />
            </div>
            <datalist id="audience-options">
              {audienceOptions.map((a) => <option key={a} value={a} />)}
            </datalist>
            {fuzzyHint?.field === 'target_audience' ? (
              <FuzzySuggestion suggestion={fuzzyHint.suggestion} onAccept={acceptFuzzy} onDismiss={dismissFuzzy} />
            ) : freeTextHint(form.target_audience, audienceOptions) && (
              <span className="combo-hint">{freeTextHint(form.target_audience, audienceOptions)}</span>
            )}
          </label>

          <label className="span-2">
            Observatii
            <textarea disabled={!canEdit} value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} rows={2} />
          </label>

          {conflictWarning && !error && <div className="form-warning span-2">⚠ {conflictWarning}</div>}
          {error && <div className="auth-error span-2">{error}</div>}

          <div className="modal-actions span-2">
            {isEditing && canEdit && (
              <button type="button" className="danger-btn" onClick={handleDelete} disabled={busy}>
                Sterge
              </button>
            )}
            <div className="spacer" />
            <button type="button" className="secondary-btn" onClick={onClose}>Anuleaza</button>
            {canEdit && (
              <button type="submit" disabled={busy}>{busy ? 'Se salveaza...' : 'Salveaza'}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
