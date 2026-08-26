import { parseISO } from 'date-fns'

// Numara zilele LUCRATOARE dintr-un interval (inclusiv capetele) - exclude
// doar sambata/duminica (fara sarbatori legale - eliminate la cerere).
// Diferita intentionat de courseDurationDays (utils/colors.js), care
// numara zile calendaristice si ramane neschimbata (folosita pentru
// colorarea dupa durata si statistici - nu se schimba comportamentul acolo
// doar pentru ca "Nr zile" se schimba aici).
export function workingDaysCount(startDate, endDate) {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate
  if (!start || !end || end < start) return 0

  let count = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    const dayOfWeek = cursor.getDay() // 0 = duminica, 6 = sambata
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
