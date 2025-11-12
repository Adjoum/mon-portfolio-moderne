import { createClient } from '@supabase/supabase-js'

// Types pour la base de données
export interface Project {
  id: string
  title: string
  description: string
  technologies: string[]
  imageurl: string
  githuburl?: string
  liveurl?: string
  category: 'web' | 'mobile' | 'ai' | 'data'
  featured: boolean
  createdat: string
  updatedat: string
}

export interface Skill {
  id: string
  name: string
  category: 'frontend' | 'backend' | 'mobile' | 'ai' | 'data' | 'tools'
  level: number // 0-100
  icon?: string
}

export interface Experience {
  id: string
  company: string
  position: string
  description: string
  startDate: string
  endDate?: string
  technologies: string[]
  achievements: string[]
}

export interface Education {
  id: string
  institution: string
  degree: string
  field: string
  startDate: string
  endDate?: string
  description?: string
}

export interface Contact {
  id: string
  name: string
  email: string
  subject: string
  message: string
  createdat: string
}

// Configuration Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Fonctions utilitaires
export const fetchProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('createdat', { ascending: false })
  
  if (error) throw error
  return data as Project[]
}

export const fetchFeaturedProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('featured', true)
    .order('createdat', { ascending: false })
  
  if (error) throw error
  return data as Project[]
}

export const fetchSkills = async () => {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .order('level', { ascending: false })
  
  if (error) throw error
  return data as Skill[]
}

export const submitContact = async (contact: Omit<Contact, 'id' | 'createdat'>) => {
  const { data, error } = await supabase
    .from('contacts')
    .insert([contact])
  
  if (error) throw error
  return data
}

