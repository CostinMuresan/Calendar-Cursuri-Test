import { format } from 'date-fns'
import { WEEKDAY_LABELS, coursesForDay } from '../../utils/dateHelpers'
import { getBarStyle } from '../../utils/colors'

const MAX_VISIBLE_PER_DAY = 3

// Componenta pur vizuala pentru grila lunara. Nu tine stare proprie -
// primeste tot ce are nevoie prin props si anunta parintele (CalendarPage)
// prin callback-uri cand se intampla ceva (click pe zi, pe curs, hover etc).
export default function MonthGrid({ grid, courses, colorPrefs, hoveredCourseId, onDayClick, onCourseClick, onCourseHover, onCourseLeave, onMoreClick }) {
  const numWeeks = grid.length / 7

  return (
    <div className="month-grid" style={{ gridTemplateRows: `auto repeat(${numWeeks}, minmax(90px, 1fr))` }}>
      {WEEKDAY_LABELS.map((d) => (
        <div key={d} className="weekday-header">{d}</div>
      ))}

      {grid.map(({ date, inCurrentMonth, isToday }) => {
        const dayCourses = coursesForDay(courses, date)
        const visibleCourses = dayCourses.slice(0, MAX_VISIBLE_PER_DAY)
        const hiddenCount = dayCourses.length - visibleCourses.length
        return (
          <div
            key={date.toISOString()}
            className={`day-cell ${inCurrentMonth ? '' : 'day-outside'} ${isToday ? 'day-today' : ''}`}
            onClick={(e) => {
              // click pe zona libera a zilei => deschide adaugare curs cu data precompletata
              if (e.target === e.currentTarget || e.target.classList.contains('day-number')) {
                onDayClick(date)
              }
            }}
          >
            <div className="day-number">{format(date, 'd')}</div>
            <div className="day-courses">
              {visibleCourses.map((c) => {
                const style = getBarStyle(c, colorPrefs)
                return (
                  <div
                    key={c.id}
                    className={`course-chip ${c.id === hoveredCourseId ? 'course-chip-highlighted' : ''}`}
                    style={{ background: style.bg, borderLeft: `4px solid ${style.border}`, color: style.text }}
                    onMouseEnter={(e) => onCourseHover(e, c)}
                    onMouseLeave={onCourseLeave}
                    onClick={(e) => {
                      e.stopPropagation()
                      onCourseClick(c)
                    }}
                  >
                    <span className="course-chip-time">{c.start_time?.slice(0, 5) || ''}</span>
                    <span className="course-chip-name">{c.name}</span>
                    {style.unclarified && <span className="unclarified-badge">TBD</span>}
                  </div>
                )
              })}
              {hiddenCount > 0 && (
                <div
                  className="more-courses-link"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoreClick(date)
                  }}
                >
                  +{hiddenCount} mai multe
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
