import { Fragment } from 'react'
import { format, isToday as checkIsToday } from 'date-fns'
import { ro } from 'date-fns/locale'
import { toISODate, formatWeekRangeTitle } from '../../utils/dateHelpers'
import { getBarStyle } from '../../utils/colors'
import { workingDaysCount } from '../../utils/workingDays'
import { suppressNextGhostClick } from '../../utils/dragHelpers'

// Gaseste in ce coloane (0-6, Luni-Duminica) ar trebui desenata bara unui
// curs in aceasta saptamana, "taiata" la marginile saptamanii daca cursul
// incepe inainte sau se termina dupa aceasta saptamana. Semnaleaza si daca
// bara e o continuare (nu chiar inceputul/sfarsitul real al cursului), ca
// sa putem desena sagetile de continuare.
function courseSpanInWeek(course, weekDays) {
  const weekStartIso = toISODate(weekDays[0])
  const weekEndIso = toISODate(weekDays[6])
  const continuesFromPrevious = course.start_date < weekStartIso
  const continuesToNext = course.end_date > weekEndIso
  const clippedStart = continuesFromPrevious ? weekStartIso : course.start_date
  const clippedEnd = continuesToNext ? weekEndIso : course.end_date
  const startIdx = weekDays.findIndex((d) => toISODate(d) === clippedStart)
  const endIdx = weekDays.findIndex((d) => toISODate(d) === clippedEnd)
  return {
    startIdx: Math.max(startIdx, 0),
    endIdx: Math.max(endIdx, 0),
    continuesFromPrevious,
    continuesToNext,
  }
}

// Etichetele si sursa de date pentru fiecare camp optional, afisabil pe bara
// (pe langa denumire, care e mereu vizibila). Folosit si de pagina de
// Setari, ca sa ramana o singura sursa de adevar pentru lista de campuri.
export const BAR_FIELD_OPTIONS = [
  { key: 'time', label: 'Ora', getValue: (c) => (c.start_time ? c.start_time.slice(0, 5) : '') },
  { key: 'trainer', label: 'Trainer', getValue: (c) => (c.trainers || []).join(', ') },
  { key: 'room', label: 'Sala', getValue: (c) => c.room || '' },
  { key: 'responsible', label: 'Responsabil', getValue: (c) => c.responsible || '' },
  { key: 'course_type', label: 'Tip curs', getValue: (c) => c.course_type || '' },
  { key: 'participants_count', label: 'Nr. participanti', getValue: (c) => (c.participants_count ? String(c.participants_count) : '') },
  { key: 'start_date', label: 'Data start', getValue: (c) => c.start_date || '' },
]

// Coloanele de atribute afisate in dreapta zilelor, dupa modelul din Excel
// (Interval orar, Trainer, Nr zile training, Participanti, etc). Spre
// deosebire de BAR_FIELD_OPTIONS (configurabile din Setari, afisate IN bara),
// astea sunt un tabel separat, un rand per curs - dar la fel, userul alege
// din Setari pe care le vrea vizibile (implicit doar cateva, ca sa incapa pe
// ecran fara scroll orizontal).
export const ATTRIBUTE_COLUMN_OPTIONS = [
  { key: 'interval', label: 'Interval orar', getValue: (c) => (c.start_time ? `${c.start_time.slice(0, 5)}-${c.end_time?.slice(0, 5) || ''}` : '') },
  { key: 'trainer', label: 'Trainer', getValue: (c) => (c.trainers || []).join(', ') },
  {
    key: 'days',
    label: 'Zile lucr.',
    getValue: (c) => String(workingDaysCount(c.start_date, c.end_date)),
  },
  { key: 'participants_group', label: 'Participanti', getValue: (c) => c.participants_group || '' },
  { key: 'participants_count', label: 'Nr. participanti', getValue: (c) => (c.participants_count ? String(c.participants_count) : '') },
  { key: 'room', label: 'Sala', getValue: (c) => c.room || '' },
  { key: 'responsible', label: 'Responsabil', getValue: (c) => c.responsible || '' },
  { key: 'invite_mail', label: 'Mail invitare', getValue: (c) => c.invite_mail || '' },
  { key: 'catering', label: 'Catering', getValue: (c) => c.catering || '' },
  { key: 'notes', label: 'Observatii', getValue: (c) => c.notes || '' },
]

export const DEFAULT_ATTRIBUTE_COLUMNS = ['interval', 'trainer', 'room', 'responsible']

export const DAY_COLS = 7
export const DEFAULT_DAYS_BLOCK_WIDTH = 42 * DAY_COLS
export const DEFAULT_ATTR_COL_WIDTH = 100
export const DEFAULT_ROW_HEIGHT = 22
const MIN_DAYS_BLOCK_WIDTH = 24 * DAY_COLS
const MIN_ATTR_COL_WIDTH = 50

// Pointer Events (nu HTML5 drag) - functioneaza identic cu mouse-ul si cu
// degetul. onDrag primeste diferenta orizontala (px) fata de punctul de
// pornire, la fiecare miscare.
function startColumnResize(e, onDrag) {
  e.preventDefault()
  e.stopPropagation()
  const startX = e.clientX
  let moved = false

  function onPointerMove(moveEvent) {
    moved = true
    onDrag(moveEvent.clientX - startX)
  }
  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    if (moved) suppressNextGhostClick()
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function CourseBar({ course, weekDays, barFields, colorPrefs, rowIndex, hoveredCourseId, onCourseClick, onCourseHover, onCourseLeave }) {
  const { startIdx, endIdx, continuesFromPrevious, continuesToNext } = courseSpanInWeek(course, weekDays)
  const style = getBarStyle(course, colorPrefs)
  const isHighlighted = course.id === hoveredCourseId

  const extraFieldsText = BAR_FIELD_OPTIONS
    .filter((f) => barFields.includes(f.key) && f.key !== 'time')
    .map((f) => f.getValue(course))
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`week-course-bar ${isHighlighted ? 'week-course-bar-highlighted' : ''} ${style.cancelled ? 'week-course-bar-cancelled' : ''}`}
      style={{
        gridColumn: `${startIdx + 1} / ${endIdx + 2}`,
        gridRow: rowIndex + 2, // +2: randul 1 e antetul
        background: style.bg,
        borderLeft: continuesFromPrevious ? 'none' : `4px solid ${style.border}`,
        color: style.text,
      }}
      onMouseEnter={(e) => onCourseHover(e, course)}
      onMouseLeave={onCourseLeave}
      onClick={() => onCourseClick(course)}
    >
      {continuesFromPrevious && <span className="week-course-bar-arrow" title="Continua din saptamana anterioara">◀</span>}
      <span className="week-course-bar-text">
        {barFields.includes('time') && course.start_time && (
          <span className="week-course-bar-time">{course.start_time.slice(0, 5)}</span>
        )}
        {' '}
        <span className="week-course-bar-name">{course.name}</span>
        {extraFieldsText && <span className="week-course-bar-extra"> — {extraFieldsText}</span>}
      </span>
      {style.cancelled && <span className="cancelled-badge">ANULAT</span>}
      {style.unclarified && <span className="unclarified-badge">TBD</span>}
      {continuesToNext && <span className="week-course-bar-arrow" title="Continua saptamana urmatoare">▶</span>}
    </div>
  )
}

// Un singur "bloc" saptamanal: un grid unificat (antet + bare Gantt pe zile
// inguste + coloane de atribute in dreapta, dupa modelul Excel), cu scroll
// orizontal propriu si coloane redimensionabile. CalendarPage stivuieste mai
// multe astfel de blocuri, unul sub altul, pentru derulare verticala
// continua - latimile sunt comune tuturor blocurilor (redimensionezi o
// data, se aplica peste tot).
export default function WeekGrid({
  weekDays, courses, barFields, colorPrefs, attrColumns, hoveredCourseId, rowHeight,
  daysBlockWidth, attrColWidths, onDaysBlockWidthChange, onAttrColWidthChange,
  onDayHeaderClick, onCourseClick, onCourseHover, onCourseLeave, filtersActive,
}) {
  // ordinea coloanelor respecta exact ordinea salvata de user in Setari
  // (nu ordinea "implicita" din ATTRIBUTE_COLUMN_OPTIONS)
  const activeAttrColumns = (attrColumns || DEFAULT_ATTRIBUTE_COLUMNS)
    .map((key) => ATTRIBUTE_COLUMN_OPTIONS.find((c) => c.key === key))
    .filter(Boolean)

  const dayColWidth = (daysBlockWidth || DEFAULT_DAYS_BLOCK_WIDTH) / DAY_COLS
  // textul din bare/celule se scaleaza odata cu inaltimea randului (overview
  // mic = font mic, detalii mari = font mai mare), intre limite lizibile
  const dynamicFontSize = Math.min(20, Math.max(9, Math.round((rowHeight || DEFAULT_ROW_HEIGHT) * 0.5)))
  const gridTemplateColumns = [
    ...Array(DAY_COLS).fill(`${dayColWidth}px`),
    ...activeAttrColumns.map((c) => `${attrColWidths?.[c.key] ?? DEFAULT_ATTR_COL_WIDTH}px`),
  ].join(' ')

  const weekStartIso = toISODate(weekDays[0])
  const weekEndIso = toISODate(weekDays[6])
  const weekCourses = courses
    .filter((c) => c.start_date <= weekEndIso && c.end_date >= weekStartIso)
    .sort((a, b) => {
      if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date)
      const ta = a.start_time || '00:00'
      const tb = b.start_time || '00:00'
      if (ta !== tb) return ta.localeCompare(tb)
      return (a.name || '').localeCompare(b.name || '', 'ro')
    })

  function handleBlockDividerDrag(e) {
    const startWidth = daysBlockWidth || DEFAULT_DAYS_BLOCK_WIDTH
    startColumnResize(e, (dx) => {
      onDaysBlockWidthChange(Math.max(MIN_DAYS_BLOCK_WIDTH, startWidth + dx))
    })
  }

  function handleAttrColumnDrag(e, key) {
    const startWidth = attrColWidths?.[key] ?? DEFAULT_ATTR_COL_WIDTH
    startColumnResize(e, (dx) => {
      onAttrColWidthChange(key, Math.max(MIN_ATTR_COL_WIDTH, startWidth + dx))
    })
  }

  return (
    <div className="week-grid-wrapper">
      <div className="week-block-label">{formatWeekRangeTitle(weekDays)}</div>

      {weekCourses.length === 0 ? (
        <>
          <div className="week-grid-header" style={{ gridTemplateColumns: `repeat(${DAY_COLS}, 1fr)` }}>
            {weekDays.map((date) => (
              <div
                key={date.toISOString()}
                className={`week-day-header ${checkIsToday(date) ? 'week-day-header-today' : ''}`}
                onClick={() => onDayHeaderClick(date)}
              >
                <div className="week-day-header-name">{format(date, 'EEEE', { locale: ro })}</div>
                <div className="week-day-header-date">{format(date, 'd MMM', { locale: ro })}</div>
              </div>
            ))}
          </div>
          <div className="week-grid-empty">
            {filtersActive
              ? 'Niciun curs vizibil aici — verifică dacă ai filtre active în legenda de mai sus ("arată tot" le anulează).'
              : 'Niciun curs programat in aceasta saptamana.'}
          </div>
        </>
      ) : (
        <div className="week-grid-scroll">
          <div
            className="week-grid-unified"
            style={{
              gridTemplateColumns,
              gridTemplateRows: `auto repeat(${weekCourses.length}, minmax(${rowHeight || DEFAULT_ROW_HEIGHT}px, auto))`,
              '--row-font-size': `${dynamicFontSize}px`,
            }}
          >
            {weekDays.map((date, i) => (
              <div
                key={date.toISOString()}
                className={`week-day-header ${checkIsToday(date) ? 'week-day-header-today' : ''} ${i === DAY_COLS - 1 ? 'week-day-header-last' : ''}`}
                style={{ gridColumn: i + 1, gridRow: 1 }}
                onClick={() => onDayHeaderClick(date)}
              >
                <div className="week-day-header-name">{format(date, 'EEEEE', { locale: ro })}</div>
                <div className="week-day-header-date">{format(date, 'd MMM', { locale: ro })}</div>
                {i === DAY_COLS - 1 && activeAttrColumns.length > 0 && (
                  <span
                    className="col-resize-handle col-resize-handle-block"
                    onPointerDown={handleBlockDividerDrag}
                    onClick={(e) => e.stopPropagation()}
                    title="Trage pentru a redimensiona proportional zilele vs. detaliile"
                  />
                )}
              </div>
            ))}

            {activeAttrColumns.map((col, i) => (
              <div key={col.key} className="week-attr-header" style={{ gridColumn: DAY_COLS + i + 1, gridRow: 1 }}>
                {col.label}
                <span
                  className="col-resize-handle"
                  onPointerDown={(e) => handleAttrColumnDrag(e, col.key)}
                  onClick={(e) => e.stopPropagation()}
                  title="Trage pentru a redimensiona aceasta coloana"
                />
              </div>
            ))}

            {weekCourses.map((c, rowIndex) => (
              <Fragment key={c.id}>
                <CourseBar
                  course={c}
                  weekDays={weekDays}
                  barFields={barFields}
                  colorPrefs={colorPrefs}
                  rowIndex={rowIndex}
                  hoveredCourseId={hoveredCourseId}
                  onCourseClick={onCourseClick}
                  onCourseHover={onCourseHover}
                  onCourseLeave={onCourseLeave}
                />
                {activeAttrColumns.map((col, colIndex) => {
                  const value = col.getValue(c)
                  return (
                    <div
                      key={`${c.id}-${col.key}`}
                      className={`week-attr-cell ${c.id === hoveredCourseId ? 'week-attr-cell-highlighted' : ''} ${c.cancelled ? 'week-attr-cell-cancelled' : ''}`}
                      style={{ gridColumn: DAY_COLS + colIndex + 1, gridRow: rowIndex + 2 }}
                      title={value || undefined}
                      onClick={() => onCourseClick(c)}
                      onMouseEnter={(e) => onCourseHover(e, c)}
                      onMouseLeave={onCourseLeave}
                    >
                      {value}
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
