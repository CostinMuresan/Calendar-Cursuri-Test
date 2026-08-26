import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import useNavbarOffset from '../../hooks/useNavbarOffset'
import { normalizeForCompare } from '../../utils/fuzzyMatch'
import { matchHeaderToField, parseExcelDate, parseExcelTime, dateToISO, parseTrainersList } from '../../utils/courseImport'

// Nume de coloana acceptate in Excel pentru randul de antet (daca exista) -
// orice alt text de pe prima coloana e tratat ca fiind chiar o valoare de
// importat, nu un antet.
const HEADER_ALIASES = ['nume', 'name', 'denumire', 'trainer', 'sala', 'responsabil', 'capacitate', 'capacity']

function ListManager({ title, table, extraColumns = [], importHint }) {
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [extra, setExtra] = useState({})
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const fileInputRef = useRef(null)
  // id-ul randului aflat in editare (nume/coloane extra) - null = niciunul
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ name: '', extra: {} })

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order('name')
    if (error) setError(error.message)
    else setItems(data || [])
  }

  useEffect(() => { load() }, [])

  async function addItem(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    const { error } = await supabase.from(table).insert({ name: name.trim(), ...extra })
    if (error) setError(error.message)
    else {
      setName('')
      setExtra({})
      load()
    }
  }

  async function toggleActive(item) {
    await supabase.from(table).update({ active: !item.active }).eq('id', item.id)
    load()
  }

  async function removeItem(item) {
    if (!confirm(`Stergi "${item.name}"?`)) return
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) setError(error.message)
    else load()
  }

  // Editare inline nume (+ coloane extra, ex: capacitate la sali). Doar
  // aceasta lista se schimba - cursurile deja salvate raman cu numele
  // vechi, neschimbate (istoricul e text, nu legatura catre acest rand -
  // decizie intentionata, ca stergerea/redenumirea unui element sa nu
  // strice cursurile trecute). Redenumirea afecteaza doar ce se alege de
  // acum incolo in formularul de curs.
  function startEdit(item) {
    setEditingId(item.id)
    setEditDraft({
      name: item.name,
      extra: Object.fromEntries(extraColumns.map((c) => [c.key, item[c.key] ?? ''])),
    })
    setError('')
  }
  function cancelEdit() {
    setEditingId(null)
  }
  async function saveEdit(item) {
    if (!editDraft.name.trim()) return
    const payload = { name: editDraft.name.trim() }
    for (const col of extraColumns) {
      const raw = editDraft.extra[col.key]
      payload[col.key] = raw === '' || raw === undefined ? null : (col.type === 'number' ? Number(raw) : raw)
    }
    const { error } = await supabase.from(table).update(payload).eq('id', item.id)
    if (error) setError(error.message)
    else {
      setEditingId(null)
      load()
    }
  }
  function handleEditKeyDown(e, item) {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(item) }
    if (e.key === 'Escape') cancelEdit()
  }

  // Import dintr-un fisier Excel: citeste prima coloana din prima foaie ca
  // nume, si (daca lista are o coloana "capacity") a doua coloana ca numar.
  // Randul de antet (ex: "Nume"/"Sala"/"Capacitate") e detectat si ignorat
  // automat. Numele duplicate (dupa cele deja existente) sunt sarite, nu
  // dau eroare.
  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError('')
    setImportResult('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })

      const hasCapacity = extraColumns.some((c) => c.key === 'capacity')
      const seen = new Map() // name -> row de inserat

      for (const row of rows) {
        const rawName = row[0]
        if (rawName === undefined || rawName === null) continue
        const name = String(rawName).trim()
        if (!name) continue
        if (HEADER_ALIASES.includes(name.toLowerCase())) continue // sare randul de antet

        const record = { name }
        if (hasCapacity && row[1] !== undefined && row[1] !== '') {
          const capacity = Number(row[1])
          if (!Number.isNaN(capacity)) record.capacity = capacity
        }
        seen.set(name, record)
      }

      const toInsert = [...seen.values()]

      if (toInsert.length === 0) {
        setError('Nu am gasit niciun nume valid in fisier (prima coloana, prima foaie).')
      } else {
        const { data, error } = await supabase
          .from(table)
          .upsert(toInsert, { onConflict: 'name', ignoreDuplicates: true })
          .select()
        if (error) throw error
        setImportResult(`Import reusit: ${data?.length ?? 0} adaugate din ${toInsert.length} gasite in fisier (restul existau deja).`)
        load()
      }
    } catch (err) {
      setError('Eroare la citirea fisierului: ' + (err.message || 'format neasteptat. Foloseste un fisier .xlsx sau .csv.'))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="admin-section">
      <h3>{title}</h3>
      <p className="admin-hint">
        Redenumirea afecteaza doar ce alegi de acum incolo in formularul de curs - cursurile
        deja salvate raman cu numele vechi, neschimbate (istoricul e text, nu legatura catre
        acest rand).
      </p>
      {error && <div className="auth-error">{error}</div>}
      {importResult && <div className="auth-info">{importResult}</div>}

      <form className="admin-add-form" onSubmit={addItem}>
        <input placeholder="Nume" value={name} onChange={(e) => setName(e.target.value)} required />
        {extraColumns.map((col) => (
          <input
            key={col.key}
            type={col.type || 'text'}
            placeholder={col.label}
            value={extra[col.key] || ''}
            onChange={(e) => setExtra((x) => ({ ...x, [col.key]: e.target.value }))}
          />
        ))}
        <button type="submit">Adauga</button>
      </form>

      <div className="admin-import-row">
        <label className="secondary-btn admin-import-label">
          {importing ? 'Se importa...' : 'Importa din Excel'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            disabled={importing}
            style={{ display: 'none' }}
          />
        </label>
        <span className="admin-hint admin-import-hint">
          {importHint || 'Fisier cu o coloana de nume (prima foaie, prima coloana). Randul de antet, daca exista, e ignorat automat.'}
        </span>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nume</th>
            {extraColumns.map((c) => <th key={c.key}>{c.label}</th>)}
            <th>Activ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.active ? '' : 'row-inactive'}>
              {editingId === item.id ? (
                <>
                  <td>
                    <input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      onKeyDown={(e) => handleEditKeyDown(e, item)}
                      autoFocus
                    />
                  </td>
                  {extraColumns.map((c) => (
                    <td key={c.key}>
                      <input
                        type={c.type || 'text'}
                        value={editDraft.extra[c.key] ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, extra: { ...d.extra, [c.key]: e.target.value } }))}
                        onKeyDown={(e) => handleEditKeyDown(e, item)}
                      />
                    </td>
                  ))}
                  <td>
                    <input type="checkbox" checked={item.active} onChange={() => toggleActive(item)} />
                  </td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => saveEdit(item)}>salveaza</button>
                    {' · '}
                    <button type="button" className="link-btn" onClick={cancelEdit}>anuleaza</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{item.name}</td>
                  {extraColumns.map((c) => <td key={c.key}>{item[c.key] ?? '-'}</td>)}
                  <td>
                    <input type="checkbox" checked={item.active} onChange={() => toggleActive(item)} />
                  </td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => startEdit(item)}>editeaza</button>
                    {' · '}
                    <button type="button" className="link-btn danger-text" onClick={() => removeItem(item)}>sterge</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Listeaza toti userii inregistrati (tabelul "profiles", creat automat de
// Supabase la fiecare cont nou) si lasa adminul sa editeze central, pentru
// fiecare: rolul, si mai ales corespondenta cu lista "Responsabili" - ce
// nume din acea lista apartine userului respectiv (folosita pentru alerta
// TBD personalizata: la logare, userul e atentionat daca EL, ca responsabil,
// are cursuri apropiate cu trainer/sala inca nedecise). Userii nu se pot
// crea de aici - raman creati manual din Supabase (fara inregistrare din
// aplicatie), asa cum e stabilit deja.
function UsersManager() {
  const { user: currentUser } = useAuth()
  const [items, setItems] = useState([])
  const [responsibleOptions, setResponsibleOptions] = useState([])
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = await supabase.from('profiles').select('*').order('email')
    if (error) setError(error.message)
    else setItems(data || [])
  }

  useEffect(() => {
    load()
    supabase
      .from('responsible_persons')
      .select('*')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setResponsibleOptions(data || []))
  }, [])

  async function saveField(id, field, value) {
    setError('')
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  // userul poate fi legat de mai multi responsabili deodata (ex: cineva
  // care acopera si rolul altcuiva) - bifarea/debifarea unui nume actualizeaza
  // direct lista din baza de date
  function toggleResponsibleName(item, name) {
    const current = item.responsible_names || []
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    saveField(item.id, 'responsible_names', next)
  }

  function handleRoleChange(item, newRole) {
    if (item.id === currentUser?.id && newRole !== 'admin') {
      if (!confirm('Iti retragi singur rolul de admin. Nu vei mai putea reveni aici fara ajutorul altui admin. Esti sigur?')) return
    }
    saveField(item.id, 'role', newRole)
  }

  return (
    <div className="admin-section">
      <h3>Useri</h3>
      <p className="admin-hint">
        Userii se creeaza in continuare manual, din Supabase (fara inregistrare din
        aplicatie). Aici legi fiecare user de numele lui din lista "Responsabili" de mai
        jos - astfel, la logare, alerta TBD ii arata userului cursurile unde EL e
        responsabilul si mai are trainer sau sala nedecise.
      </p>
      {error && <div className="auth-error">{error}</div>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol</th>
            <th>Responsabili corespunzatori</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.email}</td>
              <td>
                <select value={item.role} onChange={(e) => handleRoleChange(item, e.target.value)}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td>
                {responsibleOptions.length === 0 ? (
                  <span className="admin-hint">Niciun responsabil activ in lista.</span>
                ) : (
                  <div className="user-responsible-checks">
                    {responsibleOptions.map((r) => (
                      <label key={r.id} className="user-responsible-check">
                        <input
                          type="checkbox"
                          checked={(item.responsible_names || []).includes(r.name)}
                          onChange={() => toggleResponsibleName(item, r.name)}
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BackupSettingsPanel({ onDirtyChange }) {
  const [settings, setSettings] = useState(null)
  const [frequency, setFrequency] = useState('weekly')
  const [emails, setEmails] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const { height: navbarHeight } = useNavbarOffset()

  async function load() {
    const { data, error } = await supabase.from('backup_settings').select('*').eq('id', 1).single()
    if (error) setError(error.message)
    else {
      setSettings(data)
      setFrequency(data.frequency)
      setEmails(data.recipient_emails || '')
    }
  }

  useEffect(() => { load() }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('backup_settings')
      .update({ frequency, recipient_emails: emails.trim(), updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSaving(false)
    if (error) setError(error.message)
    else {
      setSaved(true)
      setDirty(false)
      onDirtyChange?.(false)
      load()
    }
  }

  function handleDiscard() {
    if (settings) {
      setFrequency(settings.frequency)
      setEmails(settings.recipient_emails || '')
    }
    setError('')
    setSaved(false)
    setDirty(false)
    onDirtyChange?.(false)
  }

  function markDirty() {
    setSaved(false)
    setDirty(true)
    onDirtyChange?.(true)
  }

  return (
    <div className="admin-section">
      <h3>Backup automat (export xlsx pe email)</h3>
      <p className="admin-hint">
        Trimite periodic, automat, tot calendarul de cursuri, ca fisier Excel, la adresa
        (adresele) de mai jos. Necesita o configurare unica in GitHub (secretele Brevo) —
        vezi README-ul proiectului, sectiunea "Backup automat".
      </p>

      {error && <div className="auth-error">{error}</div>}

      <label className="settings-checkbox-row" style={{ display: 'block', marginBottom: 10 }}>
        Frecventa
        <select value={frequency} onChange={(e) => { setFrequency(e.target.value); markDirty() }} style={{ marginLeft: 10 }}>
          <option value="daily">Zilnic</option>
          <option value="weekly">Saptamanal</option>
          <option value="monthly">Lunar</option>
          <option value="disabled">Fara backup (dezactivat)</option>
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 10 }}>
        <div className="admin-hint" style={{ marginBottom: 4 }}>Adresa (sau adrese, separate prin virgula)</div>
        <input
          style={{ width: '100%', maxWidth: 420 }}
          placeholder="ex: costin.muresan@yahoo.com, altcineva@exemplu.com"
          value={emails}
          onChange={(e) => { setEmails(e.target.value); markDirty() }}
        />
      </label>

      {settings?.last_sent_at && (
        <p className="admin-hint">
          Ultimul backup trimis: {new Date(settings.last_sent_at).toLocaleString('ro-RO')}
        </p>
      )}

      <div className="modal-actions">
        <div className="spacer" />
        {saved && <span className="auth-info" style={{ marginRight: 10 }}>Salvat</span>}
        {dirty && (
          <button className="secondary-btn" onClick={handleDiscard} disabled={saving}>Renunta la modificari</button>
        )}
        <button onClick={handleSave} disabled={saving}>{saving ? 'Se salveaza...' : 'Salveaza'}</button>
      </div>

      {dirty && (
        <div className="floating-save-bar" style={{ top: navbarHeight }}>
          <span>Ai modificari nesalvate</span>
          <div className="floating-save-bar-actions">
            <button className="floating-discard-btn" onClick={handleDiscard} disabled={saving}>Renunta la modificari</button>
            <button onClick={handleSave} disabled={saving}>{saving ? 'Se salveaza...' : 'Salveaza'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Import in bloc de cursuri dintr-un fisier Excel - spre deosebire de
// ListManager (import simplu, o coloana), aici fiecare rand devine un curs
// intreg, trecut prin ACELEASI reguli ca la adaugarea manuala: trainer/sala/
// responsabil necunoscute se creeaza automat, iar suprapunerile de sala/
// trainer sunt respinse (nu opresc tot importul - doar randul respectiv).
// Randurile se trimit UNUL CATE UNUL (nu toate deodata), ca un rand cu
// probleme sa nu blocheze restul, si ca sa putem raporta exact ce a mers.
function ImportCoursesPanel() {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total } | null
  const [results, setResults] = useState(null) // { successCount, failures: [{row, reason}] } | null

  function downloadTemplate() {
    const headers = [
      'Denumire curs', 'Data start', 'Data sfarsit', 'Ora start', 'Ora sfarsit',
      'Tip curs', 'Trainer', 'Sala', 'Responsabil', 'Grup participanti',
      'Nr participanti', 'Categorie', 'Public tinta', 'Mail invitare', 'Catering', 'Observatii',
    ]
    const example = [
      'Curs exemplu', '01/09/2026', '01/09/2026', '09:00', '17:00',
      'live', 'Ion Popescu, Maria Ionescu', 'TBD', 'TBD', '', '', '', '', '', '', '',
    ]
    const sheet = XLSX.utils.aoa_to_sheet([headers, example])
    sheet['!cols'] = headers.map(() => ({ wch: 18 }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Cursuri')
    XLSX.writeFile(workbook, 'model-import-cursuri.xlsx')
  }

  // gaseste (potrivire dupa normalizare) sau creeaza automat un nume nou in
  // lista respectiva (Traineri/Sali/Responsabili) - "cache" e lista deja
  // incarcata o singura data la inceputul importului, actualizata pe masura
  // ce se creeaza nume noi, ca sa nu interogam baza de date la fiecare rand
  async function ensureListValue(table, cache, rawValue) {
    const value = (rawValue ?? '').toString().trim()
    if (!value || value.toUpperCase() === 'TBD') return 'TBD'
    const norm = normalizeForCompare(value)
    const existing = cache.find((item) => normalizeForCompare(item.name) === norm)
    if (existing) return existing.name
    const { data, error } = await supabase.from(table).insert({ name: value, active: true }).select().single()
    if (error) throw new Error(`nu am putut adauga "${value}" in lista: ${error.message}`)
    cache.push(data)
    return data.name
  }

  async function findConflict(field, value, startDate, endDate) {
    // "Online" nu e o sala fizica - la fel ca "TBD", exclusa din verificare
    if (!value || value === 'TBD' || (field === 'room' && value === 'Online')) return null
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, start_date, end_date')
      .ilike(field, value)
      .lte('start_date', endDate)
      .gte('end_date', startDate)
    if (error) throw new Error(error.message)
    return (data || [])[0] || null
  }

  // varianta pentru lista de traineri (co-facilitare) - semnaleaza conflict
  // daca ORICARE dintre trainerii randului e deja programat in acel interval
  async function findTrainersConflict(trainerNames, startDate, endDate) {
    const real = (trainerNames || []).filter((t) => t && t !== 'TBD')
    if (real.length === 0) return null
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, start_date, end_date')
      .overlaps('trainers', real)
      .lte('start_date', endDate)
      .gte('end_date', startDate)
    if (error) throw new Error(error.message)
    return (data || [])[0] || null
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setResults(null)
    setProgress(null)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })

      if (rows.length < 2) {
        setResults({ successCount: 0, failures: [{ row: '-', reason: 'Fisierul nu are randuri de date sub antet.' }] })
        return
      }

      const headerRow = rows[0]
      const fieldByColumn = headerRow.map((h) => matchHeaderToField(h))
      const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== '' && cell != null))

      // listele existente, incarcate o singura data (nu cate una per rand)
      const [{ data: trainersData }, { data: roomsData }, { data: respData }] = await Promise.all([
        supabase.from('trainers').select('*'),
        supabase.from('rooms').select('*'),
        supabase.from('responsible_persons').select('*'),
      ])
      const trainersCache = trainersData || []
      const roomsCache = roomsData || []
      const respCache = respData || []

      const failures = []
      let successCount = 0

      for (let i = 0; i < dataRows.length; i++) {
        setProgress({ done: i, total: dataRows.length })
        const rawRow = dataRows[i]
        const excelRowNumber = rows.indexOf(rawRow) + 1 // +1: randul 1 din Excel e antetul

        const record = {}
        headerRow.forEach((h, idx) => {
          const field = fieldByColumn[idx]
          if (field) record[field] = rawRow[idx]
        })

        try {
          if (!record.name || !String(record.name).trim()) throw new Error('lipseste denumirea cursului')

          const startDateObj = parseExcelDate(record.start_date)
          if (!startDateObj) throw new Error('data de start lipseste sau nu e recunoscuta (foloseste ZZ/LL/AAAA)')
          const endDateObj = parseExcelDate(record.end_date) || startDateObj
          if (endDateObj < startDateObj) throw new Error('data de sfarsit e inainte de data de start')

          const startDateIso = dateToISO(startDateObj)
          const endDateIso = dateToISO(endDateObj)
          const startTime = parseExcelTime(record.start_time) || '09:00'
          const endTime = parseExcelTime(record.end_time) || '17:00'
          const courseType = (record.course_type ?? '').toString().trim() || 'TBD'

          const trainerNames = []
          for (const rawTrainer of parseTrainersList(record.trainer)) {
            const name = await ensureListValue('trainers', trainersCache, rawTrainer)
            if (!trainerNames.includes(name)) trainerNames.push(name)
          }
          const roomName = await ensureListValue('rooms', roomsCache, record.room)
          const responsibleName = await ensureListValue('responsible_persons', respCache, record.responsible)

          const roomConflict = await findConflict('room', roomName, startDateIso, endDateIso)
          if (roomConflict) throw new Error(`sala "${roomName}" e deja rezervata de cursul "${roomConflict.name}" in acest interval`)
          const trainerConflict = await findTrainersConflict(trainerNames, startDateIso, endDateIso)
          if (trainerConflict) throw new Error(`cel putin unul dintre trainerii "${trainerNames.join(', ')}" e deja programat la cursul "${trainerConflict.name}" in acest interval`)

          const payload = {
            name: String(record.name).trim(),
            start_date: startDateIso,
            end_date: endDateIso,
            start_time: startTime,
            end_time: endTime,
            course_type: courseType,
            trainers: trainerNames,
            room: roomName,
            responsible: responsibleName,
            participants_group: (record.participants_group ?? '').toString().trim() || null,
            participants_count: record.participants_count ? Number(record.participants_count) : null,
            course_area: (record.course_area ?? '').toString().trim() || null,
            target_audience: (record.target_audience ?? '').toString().trim() || null,
            invite_mail: (record.invite_mail ?? '').toString().trim() || null,
            catering: (record.catering ?? '').toString().trim() || null,
            notes: (record.notes ?? '').toString().trim() || null,
            created_by: user.id,
          }

          const { error } = await supabase.from('courses').insert(payload)
          if (error) throw new Error(error.message)
          successCount++
        } catch (err) {
          failures.push({ row: excelRowNumber, reason: err.message })
        }
      }

      setResults({ successCount, failures })
    } catch (err) {
      setResults({ successCount: 0, failures: [{ row: '-', reason: err.message }] })
    } finally {
      setImporting(false)
      setProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="admin-section">
      <h3>Import cursuri din Excel</h3>
      <p className="admin-hint">
        Incarca un fisier Excel cu cursuri (un curs pe rand) - se importa direct in calendar.
        Descarca mai intai modelul de mai jos, ca sa fii sigur ca fisierul are coloanele potrivite.
      </p>

      <div className="admin-import-format-help">
        <strong>Format asteptat</strong>
        <ul>
          <li><strong>Obligatorii</strong>: Denumire curs, Data start, Data sfarsit</li>
          <li><strong>Format data</strong>: ZZ/LL/AAAA (ex: 24/08/2026) - functioneaza si daca celula e formatata ca data in Excel</li>
          <li><strong>Format ora</strong>: HH:MM (ex: 09:00) - optional, implicit 09:00-17:00</li>
          <li><strong>Tip curs</strong>: live / online / blended / e-learning / TBD - optional, implicit TBD</li>
          <li><strong>Trainer</strong> - optional, implicit TBD. Poti pune mai multi traineri intr-o singura celula, separati prin virgula (ex: "Ion Popescu, Maria Ionescu") - pentru cursuri cu co-facilitare.</li>
          <li><strong>Sala, Responsabil</strong> - optionale, implicit TBD.</li>
          <li>Un nume (trainer/sala/responsabil) care nu exista deja in lista se creeaza automat, exact ca la adaugarea manuala a unui curs.</li>
          <li>Restul coloanelor (Grup participanti, Nr. participanti, Categorie, Public tinta, Mail invitare, Catering, Observatii) sunt optionale.</li>
          <li><strong>Ordinea coloanelor nu conteaza</strong> - fiecare e recunoscuta dupa denumirea din antet (primul rand al fisierului), nu dupa pozitie.</li>
          <li>Randurile cu sala sau trainer deja ocupate in acel interval sunt respinse automat (aceeasi regula ca la adaugarea manuala) - restul randurilor se importa normal; vezi raportul de mai jos, dupa import.</li>
        </ul>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="secondary-btn" onClick={downloadTemplate}>
          Descarca model Excel
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? 'Se importa...' : 'Incarca fisier Excel'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

      {importing && progress && (
        <p className="admin-hint">Se proceseaza randul {progress.done + 1} din {progress.total}...</p>
      )}

      {results && (
        <div className={results.failures.length > 0 ? 'form-warning' : 'auth-info'} style={{ marginTop: 12 }}>
          <strong>
            {results.successCount} {results.successCount === 1 ? 'curs importat' : 'cursuri importate'} cu succes.
          </strong>
          {results.failures.length > 0 && (
            <>
              <div style={{ marginTop: 6 }}>
                {results.failures.length} {results.failures.length === 1 ? 'rand respins' : 'randuri respinse'}:
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {results.failures.map((f, i) => (
                  <li key={i}>randul {f.row}: {f.reason}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminPanel() {
  const [backupDirty, setBackupDirty] = useState(false)

  return (
    <div className={`admin-page ${backupDirty ? 'admin-page-with-floating-bar' : ''}`}>
      <h2>Administrare</h2>
      <p className="admin-hint">
        Aici gestionezi listele care alimenteaza dropdown-urile din formularul de curs.
        Debifarea "Activ" ascunde elementul din formulare fara sa stearga cursurile existente.
        Poti adauga elemente unul cate unul, sau importa in bloc dintr-un fisier Excel.
      </p>
      <ListManager title="Traineri" table="trainers" />
      <ListManager
        title="Sali"
        table="rooms"
        extraColumns={[{ key: 'capacity', label: 'Capacitate', type: 'number' }]}
        importHint="Fisier cu doua coloane: nume sala, capacitate (optional)."
      />
      <ListManager title="Responsabili" table="responsible_persons" />
      <ImportCoursesPanel />
      <UsersManager />
      <BackupSettingsPanel onDirtyChange={setBackupDirty} />
    </div>
  )
}
