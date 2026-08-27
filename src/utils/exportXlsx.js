import ExcelJS from 'exceljs'

const HEADERS = [
  'Denumire curs', 'Tip curs', 'Data start', 'Data sfarsit', 'Ora start', 'Ora sfarsit',
  'Trainer', 'Sala', 'Participanti (grup)', 'Nr. participanti', 'Responsabil',
  'Categorie', 'Public tinta', 'Mail invitare', 'Catering', 'Observatii',
]

// coloanele care pot fi "TBD" (neclarificate) - fiecare cu propria functie
// de verificare pe cursul brut (trainers e lista, restul sunt text simplu)
const TBD_CHECKS = {
  2: (c) => !c.course_type || c.course_type === 'TBD',
  7: (c) => !c.trainers || c.trainers.length === 0 || c.trainers.includes('TBD'),
  8: (c) => !c.room || c.room === 'TBD',
  11: (c) => !c.responsible || c.responsible === 'TBD',
}

export async function exportCoursesToXlsx(courses) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Cursuri')

  sheet.columns = HEADERS.map((header) => ({ header, width: header.length < 14 ? 16 : 20 }))
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2A44' } }

  courses.forEach((c) => {
    const row = sheet.addRow([
      c.cancelled ? `${c.name} (ANULAT)` : c.name,
      c.course_type || '',
      c.start_date,
      c.end_date,
      c.start_time?.slice(0, 5) || '',
      c.end_time?.slice(0, 5) || '',
      c.trainers?.length > 0 ? c.trainers.join(', ') : '',
      c.room || '',
      c.participants_group || '',
      c.participants_count ?? '',
      c.responsible || '',
      c.course_area || '',
      c.target_audience || '',
      c.invite_mail || '',
      c.catering || '',
      c.notes || '',
    ])

    if (c.cancelled) {
      // spre deosebire de PDF, Excel suporta strikethrough real - il aplicam
      // pe tot randul, ca sa fie evident dintr-o privire ca nu se mai tine
      row.eachCell((cell) => {
        cell.font = { ...(cell.font || {}), strike: true, color: { argb: 'FF6C757D' } }
      })
      return
    }

    // valorile TBD/neclarificate (tip, trainer, sala, responsabil) apar cu
    // rosu si bold, ca sa fie evident dintr-o privire ce mai e de rezolvat
    for (const [colIndex, check] of Object.entries(TBD_CHECKS)) {
      if (check(c)) {
        row.getCell(Number(colIndex)).font = { bold: true, color: { argb: 'FFDC3545' } }
      }
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `raport-cursuri-${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
