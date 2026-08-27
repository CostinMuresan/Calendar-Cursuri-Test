import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { exportCoursesToPdf } from '../../utils/exportPdf'
import { exportCoursesToXlsx } from '../../utils/exportXlsx'
import { exportStatsToPdf, exportStatsToXlsx } from '../../utils/exportStats'
import { toISODate } from '../../utils/dateHelpers'
import {
  trainerLoadReport,
  roomOccupancyReport,
  responsibleLoadReport,
  categoryMixReport,
  courseTypeMixReport,
  totalParticipants,
  periodDays,
  REPORT_EXPLANATIONS,
  isMissingStatKey,
} from '../../utils/reportStats'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import DateInputRO from '../DateInputRO'

export default function ReportsPage() {
  const [trainers, setTrainers] = useState([])
  const [rooms, setRooms] = useState([])
  const [responsibles, setResponsibles] = useState([])
  const [categories, setCategories] = useState([])
  const [targetAudiences, setTargetAudiences] = useState([])

  const [filters, setFilters] = useState({
    startDate: toISODate(startOfMonth(new Date())),
    endDate: toISODate(endOfMonth(new Date())),
    trainer: '',
    room: '',
    courseType: '',
    responsible: '',
    category: '',
    targetAudience: '',
    search: '',
    onlyTbd: false,
    hideCancelled: false,
  })
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('list') // 'list' | 'stats'

  useEffect(() => {
    supabase.from('trainers').select('name').order('name').then(({ data }) => setTrainers(data || []))
    supabase.from('rooms').select('name').order('name').then(({ data }) => setRooms(data || []))
    supabase.from('responsible_persons').select('name').eq('active', true).order('name')
      .then(({ data }) => setResponsibles(data || []))
    // categorie/arie si public tinta sunt campuri libere pe curs (nu au o
    // lista gestionata in Administrare), deci luam valorile distincte deja
    // folosite, ca optiuni de filtrare
    supabase.from('courses').select('course_area, target_audience').then(({ data }) => {
      const rows = data || []
      setCategories([...new Set(rows.map((r) => r.course_area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')))
      setTargetAudiences([...new Set(rows.map((r) => r.target_audience).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')))
    })
  }, [])

  function updateFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  function resetFilters() {
    setFilters({
      startDate: toISODate(startOfMonth(new Date())),
      endDate: toISODate(endOfMonth(new Date())),
      trainer: '',
      room: '',
      courseType: '',
      responsible: '',
      category: '',
      targetAudience: '',
      search: '',
      onlyTbd: false,
      hideCancelled: false,
    })
    // rezultatele afisate nu mai corespund filtrelor (acum goale) - le
    // ascundem, ca sa nu para ca lista de mai jos reflecta filtrele resetate
    setResults(null)
    setError('')
  }

  async function runSearch(e) {
    e?.preventDefault()
    setLoading(true)
    setError('')
    let query = supabase
      .from('courses')
      .select('*')
      .lte('start_date', filters.endDate)
      .gte('end_date', filters.startDate)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (filters.trainer) query = query.contains('trainers', [filters.trainer])
    if (filters.room) query = query.eq('room', filters.room)
    if (filters.courseType) query = query.eq('course_type', filters.courseType)
    if (filters.responsible) query = query.eq('responsible', filters.responsible)
    if (filters.category) query = query.eq('course_area', filters.category)
    if (filters.targetAudience) query = query.eq('target_audience', filters.targetAudience)
    if (filters.search.trim()) {
      // scapam caracterele speciale pentru ilike, ca sa nu strice sintaxa filtrului
      const term = filters.search.trim().replace(/[%,]/g, '')
      query = query.or(`name.ilike.%${term}%,notes.ilike.%${term}%`)
    }
    if (filters.onlyTbd) {
      // orice curs cu cel putin un atribut obligatoriu inca nedecis -
      // responsible poate fi si gol/null (nu doar literal "TBD"), vezi
      // acelasi rationament ca la alerta de la logare
      query = query.or('trainers.cs.{TBD},room.eq.TBD,responsible.eq.TBD,responsible.is.null')
    }
    if (filters.hideCancelled) query = query.eq('cancelled', false)

    const { data, error } = await query
    setLoading(false)
    if (error) setError(error.message)
    else setResults(data || [])
  }

  function filtersLabel() {
    const parts = [`Perioada: ${filters.startDate} - ${filters.endDate}`]
    if (filters.trainer) parts.push(`Trainer: ${filters.trainer}`)
    if (filters.room) parts.push(`Sala: ${filters.room}`)
    if (filters.courseType) parts.push(`Tip: ${filters.courseType}`)
    if (filters.responsible) parts.push(`Responsabil: ${filters.responsible}`)
    if (filters.category) parts.push(`Categorie: ${filters.category}`)
    if (filters.targetAudience) parts.push(`Public tinta: ${filters.targetAudience}`)
    if (filters.search) parts.push(`Cauta: "${filters.search}"`)
    if (filters.onlyTbd) parts.push('Doar neclarificate (TBD)')
    if (filters.hideCancelled) parts.push('Fara cursuri anulate')
    return parts.join('  |  ')
  }

  // statisticile se calculeaza direct din rezultatele curente (acelasi
  // filtru ca lista), fara interogari suplimentare. Cursurile ANULATE sunt
  // excluse explicit din statistici (indiferent de filtrul "ascunde
  // cursurile anulate" de mai sus, care afecteaza doar lista) - un curs
  // anulat nu s-a mai tinut, n-ar trebui sa umfle cifrele de incarcare/
  // ocupare/participanti.
  const stats = useMemo(() => {
    if (!results) return null
    const activeResults = results.filter((c) => !c.cancelled)
    return {
      totalCourses: activeResults.length,
      trainerLoad: trainerLoadReport(activeResults),
      roomOccupancy: roomOccupancyReport(activeResults),
      responsibleLoad: responsibleLoadReport(activeResults),
      categoryMix: categoryMixReport(activeResults),
      courseTypeMix: courseTypeMixReport(activeResults),
      totalParticipants: totalParticipants(activeResults),
      periodDays: periodDays(filters.startDate, filters.endDate),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  return (
    <div className="reports-page">
      <h2>Rapoarte</h2>

      <form className="reports-filters" onSubmit={runSearch}>
        <label>
          De la data
          <DateInputRO value={filters.startDate} onChange={(v) => updateFilter('startDate', v)} />
        </label>
        <label>
          Pana la data
          <DateInputRO value={filters.endDate} onChange={(v) => updateFilter('endDate', v)} />
        </label>
        <label>
          Trainer
          <select value={filters.trainer} onChange={(e) => updateFilter('trainer', e.target.value)}>
            <option value="">Toti</option>
            {trainers.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </label>
        <label>
          Sala
          <select value={filters.room} onChange={(e) => updateFilter('room', e.target.value)}>
            <option value="">Toate</option>
            {rooms.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </label>
        <label>
          Tip curs
          <select value={filters.courseType} onChange={(e) => updateFilter('courseType', e.target.value)}>
            <option value="">Toate</option>
            <option value="live">live</option>
            <option value="online">online</option>
            <option value="blended">blended</option>
            <option value="e-learning">e-learning</option>
          </select>
        </label>
        <label>
          Responsabil
          <select value={filters.responsible} onChange={(e) => updateFilter('responsible', e.target.value)}>
            <option value="">Toti</option>
            {responsibles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </label>
        <label>
          Categorie
          <select value={filters.category} onChange={(e) => updateFilter('category', e.target.value)}>
            <option value="">Toate</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Public tinta
          <select value={filters.targetAudience} onChange={(e) => updateFilter('targetAudience', e.target.value)}>
            <option value="">Toate</option>
            {targetAudiences.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Cauta (nume / observatii)
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder="ex: onboarding"
          />
        </label>
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={filters.onlyTbd}
            onChange={(e) => updateFilter('onlyTbd', e.target.checked)}
          />
          Doar neclarificate (TBD)
        </label>
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={filters.hideCancelled}
            onChange={(e) => updateFilter('hideCancelled', e.target.checked)}
          />
          Ascunde cursurile anulate
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Se cauta...' : 'Cauta'}</button>
        <button type="button" className="secondary-btn" onClick={resetFilters} disabled={loading}>
          Reseteaza filtre
        </button>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {results && (
        <div className="reports-results">
          <div className="reports-results-header">
            <span>{results.length} curs(uri) gasite</span>
            <div className="view-mode-toggle">
              <button className={view === 'list' ? 'view-mode-active' : ''} onClick={() => setView('list')}>
                Lista cursuri
              </button>
              <button className={view === 'stats' ? 'view-mode-active' : ''} onClick={() => setView('stats')}>
                Statistici
              </button>
            </div>
            <div className="reports-actions">
              {view === 'list' ? (
                <>
                  <button
                    disabled={results.length === 0}
                    onClick={() => exportCoursesToPdf(results, { filtersLabel: filtersLabel() })}
                  >
                    Descarca PDF
                  </button>
                  <button
                    disabled={results.length === 0}
                    className="secondary-btn"
                    onClick={() => exportCoursesToXlsx(results)}
                  >
                    Descarca Excel
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={!stats}
                    onClick={() => exportStatsToPdf(stats, { filtersLabel: filtersLabel() })}
                  >
                    Descarca PDF
                  </button>
                  <button
                    disabled={!stats}
                    className="secondary-btn"
                    onClick={() => exportStatsToXlsx(stats, { filtersLabel: filtersLabel() })}
                  >
                    Descarca Excel
                  </button>
                </>
              )}
              <button className="secondary-btn" onClick={() => window.print()}>
                🖨️ Printeaza
              </button>
            </div>
          </div>

          {view === 'list' ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Curs</th><th>Tip</th><th>Start</th><th>Sfarsit</th><th>Interval</th>
                  <th>Trainer</th><th>Sala</th><th>Nr. part.</th><th>Responsabil</th>
                  <th>Categorie</th><th>Public tinta</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) => {
                  // clasa "report-tbd-cell" (rosu + bold) pentru orice valoare
                  // neclarificata (TBD sau lipsa) - acelasi criteriu ca in
                  // exporturile PDF/Excel, ca sa fie consecvent peste tot
                  const tbd = (v) => (!v || v === 'TBD' ? 'report-tbd-cell' : undefined)
                  const trainersMissing = !c.trainers || c.trainers.length === 0 || c.trainers.includes('TBD')
                  return (
                    <tr key={c.id} className={c.cancelled ? 'report-row-cancelled' : undefined}>
                      <td>
                        {c.name}
                        {c.cancelled && <span className="cancelled-badge">ANULAT</span>}
                      </td>
                      <td className={tbd(c.course_type)}>{c.course_type}</td>
                      <td>{c.start_date}</td>
                      <td>{c.end_date}</td>
                      <td>{c.start_time?.slice(0, 5)}-{c.end_time?.slice(0, 5)}</td>
                      <td className={trainersMissing ? 'report-tbd-cell' : undefined}>
                        {c.trainers?.length > 0 ? c.trainers.join(', ') : 'TBD'}
                      </td>
                      <td className={tbd(c.room)}>{c.room}</td>
                      <td>{c.participants_count}</td>
                      <td className={tbd(c.responsible)}>{c.responsible}</td>
                      <td>{c.course_area || '—'}</td>
                      <td>{c.target_audience || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <StatsView stats={stats} />
          )}
        </div>
      )}
    </div>
  )
}

// Paleta ciclica de culori pentru distributii (mix categorii/tip curs) -
// contrast suficient intre segmente consecutive, aceleasi nuante ca restul
// aplicatiei acolo unde se suprapun (albastru/verde/portocaliu/rosu, plus
// cateva in completare pentru liste mai lungi).
const PALETTE = ['#2f6fed', '#1f9d55', '#f2900c', '#e0293f', '#8b5cf6', '#0ea5e9', '#d946ef', '#64748b']

// Card cu bare orizontale - o valoare pe rand, latimea barei proportionala
// cu maximul din lista (nu cu un total fix), ca sa se vada clar cine are
// cel mai mult/putin, chiar si cu doar 2-3 valori in lista.
function StatBarSection({ title, explanation, rows, periodDays, showOccupancy, color }) {
  const max = Math.max(1, ...rows.map((r) => r.days))
  return (
    <div className="stats-card">
      <h3>{title}</h3>
      <p className="admin-hint">{explanation}</p>
      {rows.length === 0 ? (
        <p className="admin-hint">Niciun rezultat pentru filtrele curente.</p>
      ) : (
        <div className="stats-bar-list">
          {rows.map((r) => {
            const ratio = r.days / max
            const occupancyPct = showOccupancy && periodDays > 0 ? Math.round((r.days / periodDays) * 100) : null
            return (
              <div className="stats-bar-row" key={r.key}>
                <div className="stats-bar-label">
                  <span className={`stats-bar-name ${isMissingStatKey(r.key) ? 'report-tbd-cell' : ''}`}>
                    {r.key}
                  </span>
                  <span className="stats-bar-meta">
                    {r.count} {r.count === 1 ? 'curs' : 'cursuri'} · {r.days} {r.days === 1 ? 'zi' : 'zile'}
                    {occupancyPct !== null && ` · ${occupancyPct}% ocupare`}
                    {r.participants > 0 && ` · ${r.participants} participanți`}
                  </span>
                </div>
                <div className="stats-bar-track">
                  <div className="stats-bar-fill" style={{ width: `${ratio * 100}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Card cu bara stivuita (100% latime, segmente colorate proportional) +
// legenda - potrivit pentru rapoarte de tip "distributie/mix" (categorii,
// tip curs), unde intereseaza proportia din total, nu valori individuale.
function StatDistributionSection({ title, explanation, rows }) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1
  return (
    <div className="stats-card">
      <h3>{title}</h3>
      <p className="admin-hint">{explanation}</p>
      {rows.length === 0 ? (
        <p className="admin-hint">Niciun rezultat pentru filtrele curente.</p>
      ) : (
        <>
          <div className="stats-stacked-bar">
            {rows.map((r, i) => (
              <div
                key={r.key}
                className="stats-stacked-segment"
                style={{ width: `${(r.count / total) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                title={`${r.key}: ${r.count} (${Math.round((r.count / total) * 100)}%)`}
              />
            ))}
          </div>
          <div className="stats-legend">
            {rows.map((r, i) => (
              <span key={r.key} className="stats-legend-item">
                <span className="stats-legend-swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className={isMissingStatKey(r.key) ? 'report-tbd-cell' : ''}>{r.key}</span>
                {' '}— {r.count} ({Math.round((r.count / total) * 100)}%)
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatsView({ stats }) {
  if (!stats) return null
  return (
    <div className="reports-stats">
      <p className="admin-hint">Cursurile anulate sunt excluse din toate cifrele de mai jos.</p>
      <div className="stats-summary-row">
        <div className="stats-summary-card">
          <div className="stats-summary-value">{stats.totalCourses}</div>
          <div className="stats-summary-label">Cursuri</div>
        </div>
        <div className="stats-summary-card">
          <div className="stats-summary-value">{stats.totalParticipants}</div>
          <div className="stats-summary-label">Participanți instruiți</div>
        </div>
        <div className="stats-summary-card">
          <div className="stats-summary-value">{stats.periodDays}</div>
          <div className="stats-summary-label">Zile în perioadă</div>
        </div>
      </div>

      <StatBarSection
        title="Încărcare traineri"
        explanation={REPORT_EXPLANATIONS.trainerLoad}
        rows={stats.trainerLoad}
        periodDays={stats.periodDays}
        showOccupancy
        color="#2f6fed"
      />
      <StatBarSection
        title="Ocupare săli"
        explanation={REPORT_EXPLANATIONS.roomOccupancy}
        rows={stats.roomOccupancy}
        periodDays={stats.periodDays}
        showOccupancy
        color="#1f9d55"
      />
      <StatBarSection
        title="Volum per responsabil"
        explanation={REPORT_EXPLANATIONS.responsibleLoad}
        rows={stats.responsibleLoad}
        periodDays={stats.periodDays}
        color="#8b5cf6"
      />
      <StatDistributionSection
        title="Mix pe categorii (arie curs)"
        explanation={REPORT_EXPLANATIONS.categoryMix}
        rows={stats.categoryMix}
      />
      <StatDistributionSection
        title="Mix pe tip curs"
        explanation={REPORT_EXPLANATIONS.courseTypeMix}
        rows={stats.courseTypeMix}
      />
    </div>
  )
}
