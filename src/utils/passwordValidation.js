import { PASSWORD_POLICY, PASSWORD_MAX_AGE_DAYS } from '../config/securityFeatures'

// Verifica parola noua fata de PASSWORD_POLICY si intoarce lista de reguli
// nerespectate (goala = parola e ok). Folosita in formularul de schimbare
// a parolei, pentru feedback imediat.
export function validatePassword(password) {
  const errors = []
  if (!password || password.length < PASSWORD_POLICY.minLength) {
    errors.push(`cel putin ${PASSWORD_POLICY.minLength} caractere`)
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password || '')) {
    errors.push('cel putin o litera mica')
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password || '')) {
    errors.push('cel putin o litera mare')
  }
  if (PASSWORD_POLICY.requireDigit && !/[0-9]/.test(password || '')) {
    errors.push('cel putin o cifra')
  }
  if (PASSWORD_POLICY.requireSymbol && !/[^A-Za-z0-9]/.test(password || '')) {
    errors.push('cel putin un simbol (!@#$% etc.)')
  }
  return { valid: errors.length === 0, errors }
}

// True daca parola userului a "expirat" (mai veche de PASSWORD_MAX_AGE_DAYS
// zile) sau daca nu are inca inregistrata o data de schimbare (userii
// existenti, dinainte de aceasta functie).
export function isPasswordExpired(passwordChangedAt) {
  if (!passwordChangedAt) return true
  const changedAt = new Date(passwordChangedAt).getTime()
  const ageMs = Date.now() - changedAt
  const maxAgeMs = PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  return ageMs > maxAgeMs
}
