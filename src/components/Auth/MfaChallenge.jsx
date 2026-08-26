import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'

// Aratat dupa logarea cu email+parola, DOAR daca userul are deja un factor
// TOTP inrolat si confirmat (vezi MfaSection din Setari) - cere codul de
// 6 cifre din aplicatia de autentificare, ca sa termine logarea (aal2).
export default function MfaChallenge() {
  const { signOut, refreshMfaLevel } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) throw factorsError
      const factor = factors?.totp?.[0]
      if (!factor) throw new Error('Nu am gasit niciun factor 2FA inrolat.')

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (verifyError) throw verifyError

      await refreshMfaLevel()
    } catch (err) {
      setError(err.message || 'Cod incorect. Incearca din nou.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Verificare in doi pasi</h1>
        <p className="auth-subtitle">
          Introdu codul de 6 cifre din aplicatia de autentificare (Google Authenticator,
          Microsoft Authenticator, Authy etc.)
        </p>

        <label>
          Cod
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
            style={{ letterSpacing: 4, fontSize: 20, textAlign: 'center' }}
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Se verifica...' : 'Confirma'}
        </button>

        <p className="auth-hint">
          Nu mai ai acces la aplicatia de autentificare?{' '}
          <button type="button" className="link-btn" onClick={signOut} style={{ padding: 0 }}>
            Deconecteaza-te
          </button>{' '}
          si cere unui admin sa-ti reseteze factorul 2FA.
        </p>
      </form>
    </div>
  )
}
