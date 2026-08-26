import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'

// Gestionare 2FA (TOTP) in Setari - randata doar cand SECURITY_FEATURES.mfa
// e activ (verificat in SettingsPage, inainte de a monta aceasta componenta).
// Compatibila cu orice aplicatie TOTP standard: Google Authenticator,
// Microsoft Authenticator (adaugat ca "Other account"), Authy, 1Password etc.
export default function MfaSection() {
  const { refreshMfaLevel } = useAuth()
  const [factors, setFactors] = useState([])
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [enrolling, setEnrolling] = useState(null) // { factorId, qrCode, secret } | null
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadFactors() {
    setLoadingFactors(true)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (!error) setFactors(data?.totp || [])
    setLoadingFactors(false)
  }

  useEffect(() => { loadFactors() }, [])

  async function startEnroll() {
    setError('')
    setBusy(true)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setBusy(false)
    if (error) { setError(error.message); return }
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirmEnroll(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrolling.factorId,
      })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (verifyError) throw verifyError

      setEnrolling(null)
      setCode('')
      await loadFactors()
      await refreshMfaLevel()
    } catch (err) {
      setError(err.message || 'Cod incorect. Incearca din nou.')
    } finally {
      setBusy(false)
    }
  }

  function cancelEnroll() {
    // dezinroleaza factorul neconfirmat, ca sa nu ramana "pe jumatate" configurat
    if (enrolling?.factorId) supabase.auth.mfa.unenroll({ factorId: enrolling.factorId })
    setEnrolling(null)
    setCode('')
    setError('')
  }

  async function removeFactor(factor) {
    if (!confirm(`Dezactivezi 2FA (${factor.friendly_name || 'TOTP'})? Vei intra cu doar parola.`)) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    setBusy(false)
    if (error) setError(error.message)
    else {
      await loadFactors()
      await refreshMfaLevel()
    }
  }

  return (
    <div className="admin-section">
      <h3>Autentificare in doi pasi (2FA)</h3>
      <p className="admin-hint">
        Adauga un cod suplimentar, generat de o aplicatie de autentificare (Google
        Authenticator, Microsoft Authenticator, Authy, 1Password etc.), cerut la fiecare logare
        pe langa parola.
      </p>

      {error && <div className="auth-error">{error}</div>}

      {loadingFactors ? (
        <p className="admin-hint">Se incarca...</p>
      ) : enrolling ? (
        <form onSubmit={confirmEnroll} style={{ maxWidth: 320 }}>
          <p className="admin-hint">
            Scaneaza codul QR cu aplicatia de autentificare, apoi introdu codul de 6 cifre generat.
          </p>
          {enrolling.qrCode && (
            <img src={enrolling.qrCode} alt="Cod QR 2FA" style={{ width: 180, height: 180, marginBottom: 8 }} />
          )}
          <p className="admin-hint" style={{ wordBreak: 'break-all' }}>
            Nu poti scana codul? Introdu manual cheia: <strong>{enrolling.secret}</strong>
          </p>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <div className="admin-hint" style={{ marginBottom: 4 }}>Cod de verificare</div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              style={{ width: 140, letterSpacing: 3, fontSize: 18, textAlign: 'center' }}
            />
          </label>

          <div className="modal-actions">
            <div className="spacer" />
            <button type="button" className="secondary-btn" onClick={cancelEnroll} disabled={busy}>
              Renunta
            </button>
            <button type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Se verifica...' : 'Confirma'}
            </button>
          </div>
        </form>
      ) : factors.length === 0 ? (
        <button onClick={startEnroll} disabled={busy}>
          {busy ? 'Se pregateste...' : 'Activeaza 2FA'}
        </button>
      ) : (
        <table className="admin-table" style={{ maxWidth: 420 }}>
          <thead>
            <tr><th>Factor</th><th></th></tr>
          </thead>
          <tbody>
            {factors.map((f) => (
              <tr key={f.id}>
                <td>{f.friendly_name || 'Aplicatie de autentificare (TOTP)'}</td>
                <td>
                  <button className="link-btn danger-text" onClick={() => removeFactor(f)} disabled={busy}>
                    dezactiveaza
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
