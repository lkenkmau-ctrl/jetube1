import { createClient } from '@supabase/supabase-js'

// Замените на ваши данные из Supabase Dashboard
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper для получения текущего пользователя
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user || null
}

// Helper для получения токена
export async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}
