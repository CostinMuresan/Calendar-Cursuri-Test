import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  parseISO,
  isWithinInterval,
  addDays,
} from 'date-fns'
import { ro } from 'date-fns/locale'

// Grid saptamana Luni -> Duminica pentru luna data
export function buildMonthGrid(monthDate) {
  const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end }).map((date) => ({
    date,
    inCurrentMonth: isSameMonth(date, monthDate),
    isToday: isToday(date),
  }))
}

export function formatMonthTitle(date) {
  const label = format(date, 'LLLL yyyy', { locale: ro })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// cele 7 zile (Luni -> Duminica) ale saptamanii care contine data data
export function buildWeekDays(date) {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function formatWeekRangeTitle(weekDays) {
  const start = weekDays[0]
  const end = weekDays[6]
  const sameMonth = format(start, 'MM') === format(end, 'MM')
  const startLabel = format(start, sameMonth ? 'd' : 'd MMM', { locale: ro })
  const endLabel = format(end, 'd MMM yyyy', { locale: ro })
  return `${startLabel} - ${endLabel}`
}

export const WEEKDAY_LABELS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica']

export function toISODate(date) {
  return format(date, 'yyyy-MM-dd')
}

// cursurile care ating ziua respectiva (start_date <= zi <= end_date),
// sortate dupa ora de start, iar la ore egale, alfabetic dupa denumire
export function coursesForDay(courses, date) {
  const iso = toISODate(date)
  return courses
    .filter((c) => c.start_date <= iso && c.end_date >= iso)
    .sort((a, b) => {
      const ta = a.start_time || '00:00'
      const tb = b.start_time || '00:00'
      if (ta !== tb) return ta.localeCompare(tb)
      return (a.name || '').localeCompare(b.name || '', 'ro')
    })
}

export function isDateWithin(date, startISO, endISO) {
  return isWithinInterval(date, { start: parseISO(startISO), end: parseISO(endISO) })
}
