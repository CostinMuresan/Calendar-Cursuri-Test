import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import Login from './components/Login'
import MfaChallenge from './components/Auth/MfaChallenge'
import ForcedPasswordChange from './components/Auth/ForcedPasswordChange'
import CalendarPage from './components/Calendar/CalendarPage'
import AdminPanel from './components/Admin/AdminPanel'
import ReportsPage from './components/Reports/ReportsPage'
import SettingsPage from './components/Settings/SettingsPage'
import TbdAlertModal from './components/Calendar/TbdAlertModal'
import { SECURITY_FEATURES } from './config/securityFeatures'
import { isPasswordExpired } from './utils/passwordValidation'

function AppShell() {
  const { user, profile, isAdmin, loading, needsMfaChallenge, tbdRefreshKey } = useAuth()
  const navigate = useNavigate()

  if (loading) return <div className="loading-screen">Se incarca...</div>
  if (!user) return <Login />
  // 2FA - inert daca SECURITY_FEATURES.mfa e oprit (needsMfaChallenge e
  // mereu false in acel caz, vezi AuthContext)
  if (needsMfaChallenge) return <MfaChallenge />
  // expirare parola - inert daca SECURITY_FEATURES.passwordExpiry e oprit
  if (SECURITY_FEATURES.passwordExpiry && isPasswordExpired(profile?.password_changed_at)) {
    return <ForcedPasswordChange />
  }

  return (
    <div className="app-shell">
      <Navbar />
      {/* Montata aici (nu in CalendarPage), ca sa nu se remonteze - si sa nu-si
          piarda starea (minimizata sau inchisa) - de fiecare data cand userul
          navigheaza la alta pagina si se intoarce. Apare o singura data pe
          sesiune de logare; daca a fost minimizata, doar pastila ramane
          vizibila pe bara de meniu, pe orice pagina. */}
      <TbdAlertModal
        profile={profile}
        refreshKey={tbdRefreshKey}
        onEditCourse={(course) => navigate('/', { state: { editCourse: course } })}
      />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/rapoarte" element={<ReportsPage />} />
          <Route path="/setari" element={<SettingsPage />} />
          <Route
            path="/admin"
            element={isAdmin ? <AdminPanel /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </AuthProvider>
  )
}
