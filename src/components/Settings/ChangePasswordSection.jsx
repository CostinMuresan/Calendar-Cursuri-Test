import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { SECURITY_FEATURES, PASSWORD_POLICY } from '../../config/securityFeatures'
import { validatePassword } from '../../utils/passwordValidation'

// Formular de schimbare a parolei, disponibil in Setari pentru orice user
// (functie de baza, mereu vizibila). Daca SECURITY_FEATURES.passwordPolicy
// e activ, adauga si validarea de complexitate (PASSWORD_POLICY) - altfel,
// accepta orice parola noua (limitata doar de regulile din Supabase Dashboard).
export default function ChangePasswordSection() {
  const { updatePreferences } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  const { errors: policyErrors } = SECURITY_FEATURES.passwordPolicy
    ? validatePassword(newPassword)
    : { errors: [] }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (SECURITY_FEATURES.passwordPolicy && policyErrors.length > 0) {
      setError('Parola trebuie sa aiba: ' + policyErrors.join(', ') + '.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Parolele introduse nu coincid.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setBusy(false)
    if (updateError) {
      setError(updateError.message || 'Nu am putut schimba parola.')
      return
    }
    await updatePreferences({ password_changed_at: new Date().toISOString() })
    setNewPassword('')
    setConfirmPassword('')
    setSuccess(true)
  }

  return (
    <div className="admin-section">
      <h3>Schimba parola</h3>

      {SECURITY_FEATURES.passwordPolicy && (
        <p className="admin-hint">
          Parola noua trebuie sa aiba minim {PASSWORD_POLICY.minLength} caractere, cu litere mari,
          litere mici, cifre si simboluri.
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 320 }}>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div className="admin-hint" style={{ marginBottom: 4 }}>Parola noua</div>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setSuccess(false) }}
            placeholder="••••••••"
            style={{ width: '100%' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <div className="admin-hint" style={{ marginBottom: 4 }}>Confirma parola noua</div>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setSuccess(false) }}
            placeholder="••••••••"
            style={{ width: '100%' }}
          />
        </label>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-info">Parola a fost schimbata.</div>}

        <button type="submit" disabled={busy} style={{ marginTop: 4 }}>
          {busy ? 'Se salveaza...' : 'Schimba parola'}
        </button>
      </form>
    </div>
  )
}
