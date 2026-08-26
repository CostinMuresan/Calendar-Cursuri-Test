import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addMonths, subMonths, addWeeks, subWeeks, format } from 'date-fns'
import { supabase } from '../../supabaseClient'
import {
  buildMonthGrid,
  buildWeekDays,
  formatMonthTitle,
  toISODate,
  coursesForDay,
} from '../../utils/dateHelpers'
import { getBarStyle, getDurationStyle, DURATION_LEGEND, colorKeyFor, styleFromHex, DEFAULT_NEUTRAL_GRAY } from '../../utils/colors'
import { useAuth } from '../../contexts/AuthContext'
import CourseModal from './CourseModal'
import MonthGrid from './MonthGrid'
import WeekGrid, { DEFAULT_DAYS_BLOCK_WIDTH, DEFAULT_ATTR_COL_WIDTH, DEFAULT_ROW_HEIGHT } from './WeekGrid'
import HelpTooltip from '../HelpTooltip'
import { suppressNextGhostClick } from '../../utils/dragHelpers'

// Cate saptamani afisam stivuite, unele sub altele, in vizualizarea
// saptamanala - "Saptamana anterioara/urmatoare" muta toata fereastra cu o
// saptamana, ca un scroll continuu, la fel ca in modelul Excel.
const WEEKS_VISIBLE = 4
// cheia folosita in legenda/filtru pentru cursurile fara valoare la
// criteriul ales (responsabil TBD/gol, categorie goala)
const UNCLARIFIED_LEGEND_KEY = '__unclarified__'

export default function CalendarPage() {
  const { profile, updatePreferences, bumpTbdRefresh } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week'
  const [anchorDate, setAnchorDate] = useState(new Date())
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalState, setModalState] = useState(null) // { initialDate } | { course } | null
  const [hoverInfo, setHoverInfo] = useState(null) // { course, top, left } | null
  const [hoveredCourseId, setHoveredCourseId] = useState(null) // pentru highlight/glow pe curs in tot calendarul
  const [dayDetail, setDayDetail] = useState(null) // Date | null - ziua pentru care aratam lista completa

  // click pe un curs din alerta TBD (montata global, in App.jsx) navigheaza
  // aici si trimite cursul de editat prin router state - il preluam si
  // deschidem modalul, apoi curatam state-ul, ca sa nu se redeschida la
  // urmatoarea navigare inapoi pe aceasta pagina
  useEffect(() => {
    if (location.state?.editCourse) {
      setModalState({ course: location.state.editCourse })
      navigate('.', { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Latimile coloanelor din vizualizarea saptamanala - comune tuturor
  // blocurilor stivuite (redimensionezi o data, se aplica peste tot).
  // Pornesc din profilul Supabase (persistente, pe orice dispozitiv) si se
  // salveaza automat, la scurt timp dupa ce te opresti din tras un maner.
  const [daysBlockWidth, setDaysBlockWidth] = useState(profile?.week_days_block_width || DEFAULT_DAYS_BLOCK_WIDTH)
  const [attrColWidths, setAttrColWidths] = useState(profile?.week_attr_col_widths || {})
  const [rowHeight, setRowHeight] = useState(profile?.week_row_height || DEFAULT_ROW_HEIGHT)
  const [layoutSaveError, setLayoutSaveError] = useState(null)
  const widthsMounted = useRef(false)

  function handleAttrColWidthChange(key, width) {
    setAttrColWidths((prev) => ({ ...prev, [key]: width }))
  }

  function adjustRowHeight(delta) {
    setRowHeight((prev) => Math.min(72, Math.max(16, (prev || DEFAULT_ROW_HEIGHT) + delta)))
  }

  // Redimensionare inaltime randuri prin tragere verticala - acelasi
  // mecanism (Pointer Events) ca la coloanele redimensionabile.
  function handleRowHeightDrag(e) {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = rowHeight || DEFAULT_ROW_HEIGHT
    let moved = false

    function onPointerMove(moveEvent) {
      moved = true
      const dy = moveEvent.clientY - startY
      setRowHeight(Math.min(72, Math.max(16, startHeight + dy)))
    }
    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      // vezi comentariul din dragHelpers.js - fara asta, daca dai drumul la
      // mouse peste o bara de curs, se deschidea accidental editarea ei
      if (moved) suppressNextGhostClick()
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  useEffect(() => {
    // sare peste salvarea de la incarcarea initiala a paginii - salveaza
    // doar dupa o modificare reala, facuta de user
    if (!widthsMounted.current) {
      widthsMounted.current = true
      return
    }
    const timeout = setTimeout(async () => {
      const { error } = await updatePreferences({
        week_days_block_width: Math.round(daysBlockWidth),
        week_attr_col_widths: attrColWidths,
        week_row_height: Math.round(rowHeight),
      })
      if (error) {
        console.error('Nu am putut salva dimensiunile calendarului:', error.message)
        setLayoutSaveError(error.message)
      } else {
        setLayoutSaveError(null)
      }
    }, 800)
    return () => clearTimeout(timeout)
  }, [daysBlockWidth, attrColWidths, rowHeight])

  // Preferintele de afisare vin din profilul Supabase al userului (aceleasi
  // pe orice dispozitiv), cu valori implicite rezonabile daca nu s-au
  // configurat inca (profil abia creat).
  const barFields = profile?.week_bar_fields || ['time']
  const attrColumns = profile?.week_attribute_columns || ['interval', 'trainer', 'room', 'responsible']
  const colorPrefs = {
    colorMode: profile?.color_mode || 'duration',
    customColors: profile?.custom_colors || {},
  }

  // valorile distincte prezente printre cursurile afisate acum, folosite ca
  // sa desenam legenda cu adevarat (nu doar text) pentru Responsabil/Categorie.
  // "TBD" (responsabil neclarificat) nu e o valoare reala de legenda - vezi
  // hasUnclarified mai jos, care semnaleaza separat cazul acesta.
  const legendValues = useMemo(() => {
    if (colorPrefs.colorMode === 'responsible') {
      return [...new Set(courses.map((c) => c.responsible).filter((r) => r && r !== 'TBD'))].sort((a, b) => a.localeCompare(b, 'ro'))
    }
    if (colorPrefs.colorMode === 'category') {
      return [...new Set(courses.map((c) => c.course_area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro'))
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, colorPrefs.colorMode])

  // true daca exista cursuri fara valoare pentru criteriul ales (responsabil
  // TBD, sau categorie necompletata) - acestea se coloreaza dupa durata, cu
  // bordura punctata (vezi getBarStyle) - legenda explica separat conventia
  const hasUnclarified = useMemo(() => {
    if (colorPrefs.colorMode === 'responsible') return courses.some((c) => !c.responsible || c.responsible === 'TBD')
    if (colorPrefs.colorMode === 'category') return courses.some((c) => !c.course_area)
    return false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, colorPrefs.colorMode])

  // Filtrare prin click pe legenda: fiecare element (durata/responsabil/
  // categorie/neclarificat) e un checkbox - bifat implicit (arata tot),
  // debifarea ascunde acele cursuri din calendar (Lunar + Saptamanal +
  // lista de detalii pe zi). Tine minte doar cheile ASCUNSE, ca sa nu
  // trebuiasca sa cunoastem dinainte toate valorile posibile.
  const [hiddenLegendKeys, setHiddenLegendKeys] = useState(new Set())

  // schimbarea criteriului de colorare reseteaza filtrul - valorile din
  // legenda sunt complet diferite intre Durata/Responsabil/Categorie, deci
  // un filtru vechi nu mai are sens (si ar putea ascunde tot, fara sa fie
  // evident de ce)
  useEffect(() => {
    setHiddenLegendKeys(new Set())
  }, [colorPrefs.colorMode])

  function legendKeyFor(course) {
    if (colorPrefs.colorMode === 'responsible') {
      return course.responsible && course.responsible !== 'TBD' ? course.responsible : UNCLARIFIED_LEGEND_KEY
    }
    if (colorPrefs.colorMode === 'category') {
      return course.course_area || UNCLARIFIED_LEGEND_KEY
    }
    return getDurationStyle(course.start_date, course.end_date).key
  }

  function toggleLegendKey(key) {
    setHiddenLegendKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // toate cheile din legenda curenta (indiferent de mod) - folosite de
  // link-ul "ascunde tot" / "arata tot"
  const allLegendKeys = useMemo(() => {
    if (colorPrefs.colorMode === 'duration') return DURATION_LEGEND.map((l) => l.key)
    return [...(hasUnclarified ? [UNCLARIFIED_LEGEND_KEY] : []), ...legendValues]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorPrefs.colorMode, legendValues, hasUnclarified])

  function hideAllLegend() {
    setHiddenLegendKeys(new Set(allLegendKeys))
  }
  function showAllLegend() {
    setHiddenLegendKeys(new Set())
  }

  // cursurile efectiv afisate in calendar, dupa filtrul din legenda -
  // legendValues/hasUnclarified de mai sus raman calculate din "courses"
  // (nefiltrat), ca butoanele sa nu dispara din legenda cand le debifezi
  const visibleCourses = useMemo(() => {
    if (hiddenLegendKeys.size === 0) return courses
    return courses.filter((c) => !hiddenLegendKeys.has(legendKeyFor(c)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, hiddenLegendKeys, colorPrefs.colorMode])

  // schimbarea modului de colorare direct din Calendar - se salveaza imediat
  // (aceeasi preferinta ca in Setari, profile.color_mode, sincronizata pe
  // orice dispozitiv)
  function handleColorModeChange(e) {
    updatePreferences({ color_mode: e.target.value })
  }

  const monthGrid = useMemo(() => buildMonthGrid(anchorDate), [anchorDate])

  const weeksToShow = useMemo(
    () => Array.from({ length: WEEKS_VISIBLE }, (_, i) => buildWeekDays(addWeeks(anchorDate, i))),
    [anchorDate]
  )

  // intervalul vizibil difera dupa mod: toata grila lunara, sau cele N saptamani stivuite
  const rangeStart = viewMode === 'month' ? toISODate(monthGrid[0].date) : toISODate(weeksToShow[0][0])
  const rangeEnd = viewMode === 'month'
    ? toISODate(monthGrid[monthGrid.length - 1].date)
    : toISODate(weeksToShow[weeksToShow.length - 1][6])

  function showHoverDetails(e, course) {
    const rect = e.currentTarget.getBoundingClientRect()
    const popoverWidth = 250
    let left = rect.left
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10
    }
    let top = rect.bottom + 6
    if (top + 180 > window.innerHeight) {
      top = rect.top - 6 - 180
    }
    setHoverInfo({ course, top, left })
    setHoveredCourseId(course.id)
  }

  function clearHover() {
    setHoverInfo(null)
    setHoveredCourseId(null)
  }

  const loadCourses = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .lte('start_date', rangeEnd)
      .gte('end_date', rangeStart)
      .order('start_time', { ascending: true })
    if (!error) setCourses(data || [])
    setLoading(false)
  }, [rangeStart, rangeEnd])

  useEffect(() => {
    loadCourses()
  }, [loadCourses])

  function goToPrevious() {
    setAnchorDate((d) => (viewMode === 'month' ? subMonths(d, 1) : subWeeks(d, 1)))
  }
  function goToNext() {
    setAnchorDate((d) => (viewMode === 'month' ? addMonths(d, 1) : addWeeks(d, 1)))
  }

  const weekRangeTitle = `${format(weeksToShow[0][0], 'd MMM')} – ${format(weeksToShow[weeksToShow.length - 1][6], 'd MMM yyyy')}`

  return (
    <div className={`calendar-page ${viewMode === 'month' ? 'calendar-page-month' : 'calendar-page-week'}`}>
      <div className="calendar-toolbar">
        <button onClick={goToPrevious}>← {viewMode === 'month' ? 'Luna anterioara' : 'Saptamana anterioara'}</button>
        <h2>{viewMode === 'month' ? formatMonthTitle(anchorDate) : weekRangeTitle}</h2>
        <button onClick={goToNext}>{viewMode === 'month' ? 'Luna urmatoare' : 'Saptamana urmatoare'} →</button>
        <button className="secondary-btn" onClick={() => setAnchorDate(new Date())}>Azi</button>

        <div className="view-mode-toggle">
          <button
            className={viewMode === 'month' ? 'view-mode-active' : ''}
            onClick={() => setViewMode('month')}
          >
            Lunar
          </button>
          <button
            className={viewMode === 'week' ? 'view-mode-active' : ''}
            onClick={() => setViewMode('week')}
          >
            Saptamanal
          </button>
        </div>

        {viewMode === 'week' && (
          <div className="row-height-control">
            <span className="row-height-label">Randuri</span>
            <button className="reorder-btn" onClick={() => adjustRowHeight(-6)} disabled={rowHeight <= 16}>−</button>
            <span
              className="row-height-drag-handle"
              onPointerDown={handleRowHeightDrag}
              onClick={(e) => e.stopPropagation()}
              title="Trage in sus/jos pentru a ajusta inaltimea randurilor"
            >
              ⠿
            </span>
            <button className="reorder-btn" onClick={() => adjustRowHeight(6)} disabled={rowHeight >= 72}>+</button>
            <HelpTooltip text="+/- sau click si drag pe 6 puncte pentru a mari/micsora inaltimea randurilor" />
          </div>
        )}

        <button className="add-course-btn" onClick={() => setModalState({ initialDate: new Date() })}>
          + Adauga curs
        </button>
      </div>

      <div className="legend">
        <label className="legend-mode-select">
          <span>Culoare dupa</span>
          <select value={colorPrefs.colorMode} onChange={handleColorModeChange}>
            <option value="duration">Durata cursului</option>
            <option value="responsible">Responsabil</option>
            <option value="category">Categorie (arie)</option>
          </select>
        </label>

        {allLegendKeys.length > 0 && (
          <label className="legend-item legend-select-all" title="Arata/ascunde tot dintr-o data">
            <input
              type="checkbox"
              checked={hiddenLegendKeys.size === 0}
              onChange={() => (hiddenLegendKeys.size > 0 ? showAllLegend() : hideAllLegend())}
            />
            {hiddenLegendKeys.size > 0 ? 'arată tot' : 'ascunde tot'}
          </label>
        )}

        {colorPrefs.colorMode === 'duration' ? (
          DURATION_LEGEND.map((l) => (
            <label
              key={l.key}
              className="legend-item legend-item-checkbox legend-pill"
              style={{ background: l.bg, borderColor: l.border, color: '#20263a' }}
            >
              <input
                type="checkbox"
                checked={!hiddenLegendKeys.has(l.key)}
                onChange={() => toggleLegendKey(l.key)}
              />
              {l.label}
            </label>
          ))
        ) : (
          <>
            {hasUnclarified && (
              <label
                className="legend-item legend-item-checkbox legend-pill"
                style={{ background: '#8a94a630', borderColor: '#8a94a6' }}
                title="Fundal gri neutru, cu eticheta TBD in rosu, direct pe bara"
              >
                <input
                  type="checkbox"
                  checked={!hiddenLegendKeys.has(UNCLARIFIED_LEGEND_KEY)}
                  onChange={() => toggleLegendKey(UNCLARIFIED_LEGEND_KEY)}
                />
                <span className="unclarified-badge">TBD</span>
              </label>
            )}
            {legendValues.map((value) => {
              const hex = colorPrefs.customColors[colorKeyFor(colorPrefs.colorMode, value)] || DEFAULT_NEUTRAL_GRAY
              const style = styleFromHex(hex)
              return (
                <label
                  key={value}
                  className="legend-item legend-item-checkbox legend-pill"
                  style={{ background: style.bg, borderColor: style.border, color: style.text }}
                >
                  <input
                    type="checkbox"
                    checked={!hiddenLegendKeys.has(value)}
                    onChange={() => toggleLegendKey(value)}
                  />
                  {value}
                </label>
              )
            })}
            {legendValues.length === 0 && !hasUnclarified && (
              <span className="legend-item legend-note">Niciun curs momentan.</span>
            )}
          </>
        )}
      </div>

      {loading && <div className="loading-bar">Se incarca cursurile...</div>}
      {layoutSaveError && (
        <div className="auth-error" style={{ marginBottom: 10 }}>
          Nu am putut salva dimensiunile alese ({layoutSaveError}). Cel mai probabil trebuie rulat
          din nou <code>schema.sql</code> în Supabase (SQL Editor) — vezi coloanele <code>week_days_block_width</code>,
          {' '}<code>week_attr_col_widths</code>, <code>week_row_height</code> din tabelul <code>profiles</code>.
        </div>
      )}

      {viewMode === 'month' ? (
        <MonthGrid
          grid={monthGrid}
          courses={visibleCourses}
          colorPrefs={colorPrefs}
          hoveredCourseId={hoveredCourseId}
          onDayClick={(date) => setModalState({ initialDate: date })}
          onCourseClick={(course) => setModalState({ course })}
          onCourseHover={showHoverDetails}
          onCourseLeave={clearHover}
          onMoreClick={(date) => setDayDetail(date)}
        />
      ) : (
        <div className="week-stack">
          {weeksToShow.map((weekDays) => (
            <WeekGrid
              key={toISODate(weekDays[0])}
              weekDays={weekDays}
              courses={visibleCourses}
              barFields={barFields}
              colorPrefs={colorPrefs}
              attrColumns={attrColumns}
              hoveredCourseId={hoveredCourseId}
              daysBlockWidth={daysBlockWidth}
              attrColWidths={attrColWidths}
              rowHeight={rowHeight}
              onDaysBlockWidthChange={setDaysBlockWidth}
              onAttrColWidthChange={handleAttrColWidthChange}
              onDayHeaderClick={(date) => setModalState({ initialDate: date })}
              onCourseClick={(course) => setModalState({ course })}
              onCourseHover={showHoverDetails}
              onCourseLeave={clearHover}
              filtersActive={hiddenLegendKeys.size > 0}
            />
          ))}
        </div>
      )}

      {hoverInfo && (
        <div className="course-hover-popover" style={{ top: hoverInfo.top, left: hoverInfo.left }}>
          <div className="popover-title">{hoverInfo.course.name}</div>
          <div className="popover-row">
            <strong>Perioada:</strong> {hoverInfo.course.start_date} → {hoverInfo.course.end_date}
          </div>
          {hoverInfo.course.start_time && (
            <div className="popover-row">
              <strong>Interval:</strong> {hoverInfo.course.start_time.slice(0, 5)}-{hoverInfo.course.end_time?.slice(0, 5)}
            </div>
          )}
          {hoverInfo.course.trainers?.length > 0 && (
            <div className="popover-row"><strong>Traineri:</strong> {hoverInfo.course.trainers.join(', ')}</div>
          )}
          {hoverInfo.course.room && (
            <div className="popover-row"><strong>Sala:</strong> {hoverInfo.course.room}</div>
          )}
          {(hoverInfo.course.participants_group || hoverInfo.course.participants_count) && (
            <div className="popover-row">
              <strong>Participanti:</strong> {hoverInfo.course.participants_group || ''}
              {hoverInfo.course.participants_count ? ` (${hoverInfo.course.participants_count})` : ''}
            </div>
          )}
          {hoverInfo.course.course_type && (
            <div className="popover-row"><strong>Tip:</strong> {hoverInfo.course.course_type}</div>
          )}
          {hoverInfo.course.responsible && (
            <div className="popover-row"><strong>Responsabil:</strong> {hoverInfo.course.responsible}</div>
          )}
        </div>
      )}

      {dayDetail && (
        <div className="modal-backdrop" onClick={() => setDayDetail(null)}>
          <div className="modal-card day-detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cursuri – {format(dayDetail, 'dd/MM/yyyy')}</h2>
              <button className="icon-btn" onClick={() => setDayDetail(null)}>✕</button>
            </div>
            <div className="day-detail-list">
              {coursesForDay(visibleCourses, dayDetail).map((c) => {
                const style = getBarStyle(c, colorPrefs)
                return (
                  <div
                    key={c.id}
                    className="day-detail-item"
                    style={{ borderLeft: `4px solid ${style.border}` }}
                    onClick={() => {
                      setDayDetail(null)
                      setModalState({ course: c })
                    }}
                  >
                    <div className="day-detail-item-title" style={style.unclarified ? { color: style.text } : undefined}>
                      <strong>{c.start_time?.slice(0, 5) || ''}</strong> {c.name}
                      {style.unclarified && <span className="unclarified-badge">TBD</span>}
                    </div>
                    <div className="day-detail-item-sub">
                      {(c.trainers || []).join(', ') || '—'} · {c.room || '—'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="modal-actions">
              <div className="spacer" />
              <button
                className="secondary-btn"
                onClick={() => {
                  const clickedDate = dayDetail
                  setDayDetail(null)
                  setModalState({ initialDate: clickedDate })
                }}
              >
                + Adauga curs in aceasta zi
              </button>
            </div>
          </div>
        </div>
      )}

      {modalState && (
        <CourseModal
          initialDate={modalState.initialDate}
          course={modalState.course}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null)
            loadCourses()
            bumpTbdRefresh()
          }}
        />
      )}
    </div>
  )
}
