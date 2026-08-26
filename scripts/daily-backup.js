// Script rulat automat de GitHub Actions (.github/workflows/backup.yml).
// Exporta intregul calendar de cursuri intr-un fisier .xlsx si il trimite
// prin email (Brevo), DAR doar daca a trecut destul timp fata de ultima
// trimitere, conform frecventei alese de admin din aplicatie (pagina
// Administrare -> "Backup automat", salvata in tabelul backup_settings).
//
// Ruleaza doar pe serverele GitHub Actions, niciodata in browser-ul
// userilor - foloseste in siguranta cheia "service role" din Supabase.

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BREVO_API_KEY,
  BREVO_SENDER_EMAIL,
  FORCE_SEND,
} = process.env

function requireEnv(name, value) {
  if (!value) {
    console.error(`Lipseste variabila de mediu ${name} (secret GitHub neconfigurat?).`)
    process.exit(1)
  }
}
requireEnv('SUPABASE_URL', SUPABASE_URL)
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY)
requireEnv('BREVO_API_KEY', BREVO_API_KEY)
requireEnv('BREVO_SENDER_EMAIL', BREVO_SENDER_EMAIL)

const FREQUENCY_DAYS = { daily: 1, weekly: 7, monthly: 30 }

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: settings, error: settingsError } = await supabase
    .from('backup_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (settingsError) {
    console.error('Nu am putut citi setarile de backup:', settingsError.message)
    process.exit(1)
  }

  if (settings.frequency === 'disabled') {
    console.log('Backup dezactivat din Administrare -> Backup automat. Se sare peste trimitere (inclusiv la rulare manuala).')
    return
  }

  const recipients = (settings.recipient_emails || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  if (recipients.length === 0) {
    console.log('Nicio adresa de email configurata in Administrare -> Backup automat. Se sare peste trimitere.')
    return
  }

  const daysNeeded = FREQUENCY_DAYS[settings.frequency] ?? 7
  const daysSinceLast = settings.last_sent_at
    ? (Date.now() - new Date(settings.last_sent_at).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  const isDue = daysSinceLast >= daysNeeded
  const forceSend = FORCE_SEND === 'true'

  if (!isDue && !forceSend) {
    console.log(
      `Frecventa aleasa: ${settings.frequency} (la ${daysNeeded} zile). ` +
      `Au trecut doar ${daysSinceLast.toFixed(1)} zile de la ultima trimitere - se sare peste azi.`
    )
    return
  }

  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('*')
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (coursesError) {
    console.error('Eroare la citirea cursurilor din Supabase:', coursesError.message)
    process.exit(1)
  }

  const todayLabel = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest' }).format(new Date())

  const rows = (courses || []).map((c) => ({
    'Denumire curs': c.name,
    'Tip curs': c.course_type || '',
    'Data start': c.start_date,
    'Data sfarsit': c.end_date,
    'Ora start': c.start_time?.slice(0, 5) || '',
    'Ora sfarsit': c.end_time?.slice(0, 5) || '',
    'Trainer': c.trainer || '',
    'Sala': c.room || '',
    'Participanti (grup)': c.participants_group || '',
    'Nr. participanti': c.participants_count ?? '',
    'Responsabil': c.responsible || '',
    'Mail invitare': c.invite_mail || '',
    'Catering': c.catering || '',
    'Arie curs': c.course_area || '',
    'Public tinta': c.target_audience || '',
    'Observatii': c.notes || '',
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = Object.keys(rows[0] || { a: 1 }).map(() => ({ wch: 18 }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cursuri')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const base64 = buffer.toString('base64')

  const fileName = `backup-cursuri-${new Date().toISOString().slice(0, 10)}.xlsx`
  const frequencyLabel = { daily: 'zilnic', weekly: 'saptamanal', monthly: 'lunar' }[settings.frequency] || settings.frequency

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Programator Cursuri', email: BREVO_SENDER_EMAIL },
      to: recipients.map((email) => ({ email })),
      subject: `Backup calendar cursuri (${frequencyLabel}) – ${todayLabel}`,
      htmlContent: `
        <p>Buna,</p>
        <p>Atasat, backup-ul complet al calendarului de cursuri, generat automat in data de ${todayLabel}.</p>
        <p>Frecventa configurata in Administrare: <strong>${frequencyLabel}</strong></p>
        <p>Total cursuri: <strong>${rows.length}</strong></p>
        <p style="color:#888;font-size:12px;">Email trimis automat de aplicatia Programator Cursuri.</p>
      `,
      attachment: [{ content: base64, name: fileName }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error('Eroare la trimiterea email-ului prin Brevo:', response.status, text)
    process.exit(1)
  }

  const { error: updateError } = await supabase
    .from('backup_settings')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('id', 1)

  if (updateError) {
    console.error('Email trimis, dar nu am putut actualiza data ultimei trimiteri:', updateError.message)
  }

  console.log(`Backup trimis cu succes catre: ${recipients.join(', ')} (${rows.length} cursuri).`)
}

main()
