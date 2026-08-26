import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { SECURITY_FEATURES, PASSWORD_MAX_AGE_DAYS } from '../../config/securityFeatures'
import { validatePassword } from '../../utils/passwordValidation'

// Blocheaza accesul la restul aplicatiei pana userul isi schimba parola,
// aratat doar cand SECURITY_FEATURES.passwordExpiry e activ si parola
// curenta e mai veche decat PASSWORD_MAX_AGE_DAYS zile.
export default function ForcedPasswordChange() {
  const { signOut, updatePreferences } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (SECURITY_FEATURES.passwordPolicy) {
      const { valid, errors } = validatePassword(newPassword)
      if (!valid) {
        setError('Parola trebuie sa aiba: ' + errors.join(', ') + '.')
        return
      }
    }
    if (newPassword !== confirmPassword) {
      setError('Parolele introduse nu coincid.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setBusy(false)
      setError(updateError.message || 'Nu am putut schimba parola.')
      return
    }
    await updatePreferences({ password_changed_at: new Date().toISOString() })
    setBusy(false)
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Parola a expirat</h1>
        <p className="auth-subtitle">
          Din motive de securitate, parola trebuie schimbata cel putin o data la {PASSWORD_MAX_AGE_DAYS}{' '}
          zile. Alege o parola noua ca sa continui.
        </p>

        <label>
          Parola noua
          <input
            type="password"
            required
            autoFocus
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        <label>
          Confirma parola noua
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? 'Se salveaza...' : 'Schimba parola si continua'}
        </button>

        <p className="auth-hint">
          <button type="button" className="link-btn" onClick={signOut} style={{ padding: 0 }}>
            Deconecteaza-te
          </button>
        </p>
      </form>
    </div>
  )
}
