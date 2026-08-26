import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { user, isAdmin, signOut } = useAuth()

  return (
    <nav className="navbar">
      <div className="navbar-brand">Programator Cursuri</div>
      <div className="navbar-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Calendar</NavLink>
        <NavLink to="/rapoarte" className={({ isActive }) => (isActive ? 'active' : '')}>Rapoarte</NavLink>
        <NavLink to="/setari" className={({ isActive }) => (isActive ? 'active' : '')}>Setari</NavLink>
        {isAdmin && <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>Administrare</NavLink>}
      </div>
      <div className="navbar-user">
        <span>{user?.email}</span>
        <button className="link-btn" onClick={signOut}>Deconectare</button>
      </div>
    </nav>
  )
}
