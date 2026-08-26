import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SECURITY_FEATURES } from '../config/securityFeatures'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // AAL = "Authenticator Assurance Level" - aal1 (doar parola) sau aal2
  // (parola + al doilea factor confirmat). Relevant doar daca SECURITY_
  // FEATURES.mfa e activat - altfel ramane mereu null si nu are niciun
  // efect (niciun user nu poate avea un factor 2FA inrolat daca
  // functia a fost tot timpul dezactivata in interfata).
  const [mfaLevel, setMfaLevel] = useState(null) // { currentLevel, nextLevel } | null
  // incrementat de oriunde se salveaza un curs (CourseModal, prin CalendarPage),
  // ca alerta TBD (montata o singura data, in App.jsx, cat timp userul e
  // logat) sa reverifice lista de cursuri neclarificate
  const [tbdRefreshKey, setTbdRefreshKey] = useState(0)
  // Tine minte ce user era deja logat, ca sa distingem o logare noua (adevarata)
  // de un eveniment "fals pozitiv" al Supabase - vezi comentariul de mai jos
  const loadedUserId = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadedUserId.current = session?.user?.id ?? null
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase re-emite un eveniment de sesiune (de multe ori SIGNED_IN,
      // uneori TOKEN_REFRESHED) de fiecare data cand tab-ul redevine vizibil,
      // chiar daca userul ramane acelasi de la inceput - e comportament
      // documentat oficial ("including on user sign in and when refocusing
      // a tab"), deci NU ne putem baza pe numele evenimentului. Singurul
      // semnal de incredere e daca s-a schimbat efectiv userul logat.
      // Daca am trata orice eveniment ca logare noua, am pune loading=true,
      // ceea ce demonteaza complet <CalendarPage> (App.jsx randeaza doar
      // ecranul de loading cat timp loading e true) si orice stare locala
      // din ea se pierde - de exemplu alerta TBD minimizata reapare intreaga.
      const newUserId = session?.user?.id ?? null

      if (newUserId === loadedUserId.current) {
        // acelasi user (sau tot delogat) - doar actualizam sesiunea (poate
        // avea token nou), fara sa atingem loading/profilul
        setSession(session)
        return
      }

      loadedUserId.current = newUserId
      setSession(session)
      if (session) {
        // reseteaza "loading", ca ecranul sa astepte profilul nou, nu doar
        // sesiunea - altfel pagina se poate afisa o clipa cu profilul vechi
        // (sau gol), inainte sa soseasca cel corect de la Supabase
        setLoading(true)
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
    refreshMfaLevel()
  }

  // Verifica daca sesiunea curenta a trecut deja de al doilea factor (aal2)
  // sau mai are nevoie de el (aal1 cu un factor verificat inrolat). Complet
  // inert daca functia 2FA e dezactivata din config.
  async function refreshMfaLevel() {
    if (!SECURITY_FEATURES.mfa) {
      setMfaLevel(null)
      return
    }
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!error) setMfaLevel(data)
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  // Salveaza preferintele personale ale userului (campuri afisate pe bara,
  // mod de colorare, culori alese) direct in profilul lui din Supabase -
  // astfel raman aceleasi indiferent de dispozitivul de pe care se logheaza.
  async function updatePreferences(partial) {
    if (!session?.user) return { error: new Error('Nu esti autentificat.') }
    const { data, error } = await supabase
      .from('profiles')
      .update(partial)
      .eq('id', session.user.id)
      .select()
      .single()
    if (!error) setProfile(data)
    return { data, error }
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === 'admin',
    loading,
    signIn,
    signOut,
    updatePreferences,
    // 2FA (TOTP) - vezi src/config/securityFeatures.js. Cand SECURITY_
    // FEATURES.mfa e false, needsMfaChallenge e mereu false (mfaLevel
    // ramane null), deci ecranul de verificare cod nu apare niciodata.
    needsMfaChallenge: mfaLevel?.currentLevel === 'aal1' && mfaLevel?.nextLevel === 'aal2',
    refreshMfaLevel,
    tbdRefreshKey,
    bumpTbdRefresh: () => setTbdRefreshKey((k) => k + 1),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
