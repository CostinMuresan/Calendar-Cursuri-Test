import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { REPORT_EXPLANATIONS, isMissingStatKey } from './reportStats'

// Definitia comuna a sectiunilor de statistici - aceeasi lista alimenteaza
// atat exportul PDF cat si Excel, ca sa ramana mereu sincronizate (daca se
// adauga un raport nou in stats, se adauga o data aici, apare in ambele).
function statSections(stats) {
  return [
    { key: 'trainerLoad', title: 'Incarcare traineri', rows: stats.trainerLoad, showOccupancy: true },
    { key: 'roomOccupancy', title: 'Ocupare sali', rows: stats.roomOccupancy, showOccupancy: true },
    { key: 'responsibleLoad', title: 'Volum per responsabil', rows: stats.responsibleLoad, showOccupancy: false },
    { key: 'categoryMix', title: 'Mix pe categorii', rows: stats.categoryMix, showOccupancy: false },
    { key: 'courseTypeMix', title: 'Mix pe tip curs', rows: stats.courseTypeMix, showOccupancy: false },
  ]
}

// ---------- PDF ----------

export function exportStatsToPdf(stats, { filtersLabel = '' } = {}) {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(16)
  doc.setTextColor(20, 30, 60)
  doc.text('Raport statistici cursuri', 14, 15)

  let y = 21
  if (filtersLabel) {
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(filtersLabel, 14, y)
    y += 6
  }

  doc.setFontSize(11)
  doc.setTextColor(30)
  doc.text(
    `Total cursuri: ${stats.totalCourses}   |   Total participanti instruiti: ${stats.totalParticipants}   |   Zile in perioada: ${stats.periodDays}`,
    14,
    y
  )
  y += 9

  for (const section of statSections(stats)) {
    if (section.rows.length === 0) continue

    if (y > 175) {
      doc.addPage()
      y = 15
    }

    doc.setFontSize(12)
    doc.setTextColor(20, 30, 60)
    doc.text(section.title, 14, y)
    y += 5

    doc.setFontSize(8.5)
    doc.setTextColor(110)
    const explanationLines = doc.splitTextToSize(REPORT_EXPLANATIONS[section.key], 260)
    doc.text(explanationLines, 14, y)
    y += explanationLines.length * 3.5 + 3

    const max = Math.max(1, ...section.rows.map((r) => r.days))
    const head = [['Nume', 'Nr. cursuri', 'Zile', ...(section.showOccupancy ? ['Ocupare'] : []), 'Participanti']]
    const body = section.rows.map((r) => [
      r.key,
      String(r.count),
      String(r.days),
      ...(section.showOccupancy ? [`${stats.periodDays > 0 ? Math.round((r.days / stats.periodDays) * 100) : 0}%`] : []),
      r.participants ? String(r.participants) : '-',
    ])

    autoTable(doc, {
      head,
      body,
      startY: y,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [40, 60, 90] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0 && isMissingStatKey(section.rows[data.row.index].key)) {
          data.cell.styles.textColor = [220, 53, 69]
          data.cell.styles.fontStyle = 'bold'
        }
      },
      // bara vizuala desenata in fundalul coloanei "Zile", proportionala cu
      // valoarea maxima din acest tabel - willDrawCell ruleaza INAINTE ca
      // autoTable sa deseneze textul, deci bara ramane in spatele cifrei
      willDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const ratio = section.rows[data.row.index].days / max
          doc.setFillColor(222, 233, 255)
          doc.rect(data.cell.x + 0.5, data.cell.y + 0.5, (data.cell.width - 1) * ratio, data.cell.height - 1, 'F')
        }
      },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  doc.save(`statistici-cursuri-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ---------- Excel ----------

// bara "desenata" din caractere pline/goale - simpla, dar surprinzator de
// clara vizual chiar si intr-o celula de Excel obisnuita
function textBar(ratio, width = 16) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export async function exportStatsToXlsx(stats, { filtersLabel = '' } = {}) {
  const workbook = new ExcelJS.Workbook()

  const summarySheet = workbook.addWorksheet('Rezumat')
  summarySheet.columns = [{ width: 32 }, { width: 50 }]
  summarySheet.addRow(['Raport statistici cursuri']).font = { bold: true, size: 14 }
  summarySheet.addRow([filtersLabel])
  summarySheet.addRow([])
  summarySheet.addRow(['Total cursuri', stats.totalCourses])
  summarySheet.addRow(['Total participanti instruiti', stats.totalParticipants])
  summarySheet.addRow(['Zile in perioada selectata', stats.periodDays])

  for (const section of statSections(stats)) {
    if (section.rows.length === 0) continue

    const max = Math.max(1, ...section.rows.map((r) => r.days))
    const header = ['Nume', 'Nr. cursuri', 'Zile', ...(section.showOccupancy ? ['Ocupare'] : []), 'Participanti']
    // Excel limiteaza numele unei foi la 31 de caractere
    const sheet = workbook.addWorksheet(section.title.slice(0, 31))
    sheet.columns = header.map((h) => ({ width: h === 'Ocupare' ? 26 : h === 'Nume' ? 26 : 16 }))

    sheet.addRow([section.title]).font = { bold: true, size: 13 }
    sheet.addRow([REPORT_EXPLANATIONS[section.key]])
    sheet.addRow([])
    sheet.addRow(header).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2A44' } }

    section.rows.forEach((r) => {
      const row = sheet.addRow([
        r.key,
        r.count,
        r.days,
        ...(section.showOccupancy
          ? [`${textBar(r.days / max)}  ${stats.periodDays > 0 ? Math.round((r.days / stats.periodDays) * 100) : 0}%`]
          : []),
        r.participants || '',
      ])
      // randurile neclarificate (TBD/Fara categorie) apar cu rosu si bold,
      // la fel ca in restul aplicatiei si in exportul listei de cursuri
      if (isMissingStatKey(r.key)) {
        row.getCell(1).font = { bold: true, color: { argb: 'FFDC3545' } }
      }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `statistici-cursuri-${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
