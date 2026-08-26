import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: schimba '/programator-cursuri/' cu '/<numele-repo-ului-tau-github>/'
// Daca site-ul e publicat la un domeniu propriu sau la <user>.github.io (repo de tip "user page"), pune base: '/'
export default defineConfig({
  plugins: [react()],
  base: '/Calendar-Cursuri-Test/',
})
