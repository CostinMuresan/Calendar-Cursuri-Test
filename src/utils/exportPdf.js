import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const HEADERS = [
  'Curs', 'Tip', 'Start', 'Sfarsit', 'Interval orar', 'Trainer', 'Sala',
  'Participanti', 'Nr.', 'Responsabil', 'Categorie', 'Public tinta',
]

// pentru fiecare coloana care poate fi "TBD"/neclarificata, o functie care
// verifica exact asta pe cursul brut - trainers e lista, verificarea difera
// de restul (text simplu)
const TBD_CHECKS = {
  1: (c) => !c.course_type || c.course_type === 'TBD',
  5: (c) => !c.trainers || c.trainers.length === 0 || c.trainers.includes('TBD'),
  6: (c) => !c.room || c.room === 'TBD',
  9: (c) => !c.responsible || c.responsible === 'TBD',
}

export function exportCoursesToPdf(courses, { title = 'Raport cursuri', filtersLabel = '' } = {}) {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(14)
  doc.text(title, 14, 15)
  if (filtersLabel) {
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(filtersLabel, 14, 21)
  }

  const rows = courses.map((c) => [
    c.name,
    c.course_type || '-',
    c.start_date,
    c.end_date,
    `${c.start_time?.slice(0, 5) || ''}-${c.end_time?.slice(0, 5) || ''}`,
    c.trainers?.length > 0 ? c.trainers.join(', ') : '-',
    c.room || '-',
    c.participants_group || '-',
    c.participants_count ?? '-',
    c.responsible || '-',
    c.course_area || '-',
    c.target_audience || '-',
  ])

  autoTable(doc, {
    head: [HEADERS],
    body: rows,
    startY: filtersLabel ? 26 : 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 60, 90] },
    // valorile TBD/neclarificate (tip, trainer, sala, responsabil) apar cu
    // rosu si bold, ca sa fie evident dintr-o privire ce mai e de rezolvat
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const check = TBD_CHECKS[data.column.index]
      if (!check) return
      if (check(courses[data.row.index])) {
        data.cell.styles.textColor = [220, 53, 69]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  doc.save(`raport-cursuri-${new Date().toISOString().slice(0, 10)}.pdf`)
}
