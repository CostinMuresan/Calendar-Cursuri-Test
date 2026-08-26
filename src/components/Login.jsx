import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await signIn(email, password)
      if (error) throw error
    } catch (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Email sau parola incorecte.'
          : err.message || 'A aparut o eroare.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Programator Cursuri</h1>
        <p className="auth-subtitle">Autentificare</p>

        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nume@companie.ro"
            autoFocus
          />
        </label>

        <label>
          Parola
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? 'Se conecteaza...' : 'Intra in cont'}
        </button>

        <p className="auth-hint">
          Nu ai cont? Contacteaza administratorul pentru a-ti crea unul.
        </p>
      </form>
    </div>
  )
}
