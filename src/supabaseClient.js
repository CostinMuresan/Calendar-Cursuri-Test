import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Lipsesc variabilele VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Verifica fisierul .env (local) sau secretele din GitHub Actions (productie).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
