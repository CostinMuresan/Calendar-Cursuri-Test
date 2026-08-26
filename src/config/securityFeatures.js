// ============================================================
// Comutatoare centrale pentru functiile de securitate cont.
//
// TOATE SUNT DEZACTIVATE IMPLICIT ("false"). Codul din spatele lor e
// complet construit si functional, dar nu se activeaza in interfata
// pana cand cineva schimba manual valoarea aici in "true" si redeployeaza.
// Asta e intentionat: schimbarile astea se activeaza doar la cerere
// explicita, nu automat odata cu restul aplicatiei.
//
// Cum activezi o functie: schimba valoarea corespunzatoare din
// SECURITY_FEATURES in "true" mai jos, salveaza, incarca fisierul din nou
// pe GitHub (ca la orice alta modificare de cod).
// ============================================================

export const SECURITY_FEATURES = {
  // 1. Complexitate minima parola - valideaza pe loc, in formularul de
  //    schimbare a parolei din Setari (lungime + tipuri de caractere,
  //    configurabile mai jos in PASSWORD_POLICY)
  passwordPolicy: false,

  // 2. Expirare parola - dupa PASSWORD_MAX_AGE_DAYS zile de la ultima
  //    schimbare, userul e obligat sa-si schimbe parola inainte sa mai
  //    poata folosi aplicatia
  passwordExpiry: false,

  // 4. Autentificare in doi pasi (2FA / TOTP - Google Authenticator,
  //    Microsoft Authenticator, Authy etc.) - inrolare optionala din
  //    Setari; odata inrolat, codul e cerut la fiecare logare
  mfa: false,
}

// ------------------------------------------------------------
// Politica de complexitate a parolei (folosita doar daca
// SECURITY_FEATURES.passwordPolicy === true)
//
// IMPORTANT: aceasta e o validare CLIENT-SIDE (feedback imediat in
// formular). Nu inlocuieste nevoia de a seta ACELEASI reguli si in
// Supabase Dashboard -> Authentication -> Providers -> Email -> Password
// Requirements, care e singurul loc unde regula e cu adevarat impusa,
// indiferent pe unde s-ar incerca schimbarea parolei (inclusiv direct din
// Supabase, ocolind aplicatia).
// ------------------------------------------------------------
export const PASSWORD_POLICY = {
  minLength: 10,
  requireLowercase: true,
  requireUppercase: true,
  requireDigit: true,
  requireSymbol: true,
}

// ------------------------------------------------------------
// Expirare parola (folosita doar daca SECURITY_FEATURES.passwordExpiry === true)
// ------------------------------------------------------------
export const PASSWORD_MAX_AGE_DAYS = 90
