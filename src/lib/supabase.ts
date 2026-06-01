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

export interface Visit {
  id: number
  page: string
  referrer: string | null
  user_agent: string | null
  country: string | null
  city: string | null
  language: string | null
  screen: string | null
  created_at: string
}

export interface Stats {
  total: number
  today: number
  pages: Record<string, number>
  countries: Record<string, number>
  referrers: Record<string, number>
  screens: Record<string, number>
  byHour: number[]
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



export interface AILabCapability {
  id: string
  slug: string
  icon: string
  title: string
  description: string
  sortorder: number
  active: boolean
  createdat: string
  updatedat: string
}

export interface AILabProject {
  id: string
  slug: string
  icon: string
  title: string
  description: string
  technologies: string[]
  color: string
  imageurl?: string | null
  githuburl?: string | null
  liveurl?: string | null
  demourl?: string | null
  demoavailable: boolean
  featured: boolean
  active: boolean
  sortorder: number
  createdat: string
  updatedat: string
  capabilities: AILabCapability[]
}

interface AILabProjectRow extends Omit<AILabProject, 'capabilities'> {
  ailab_project_capabilities?: {
    ailab_capabilities: AILabCapability | null
  }[]
}

const AILAB_PROJECT_SELECT = `
  id,
  slug,
  icon,
  title,
  description,
  technologies,
  color,
  imageurl,
  githuburl,
  liveurl,
  demourl,
  demoavailable,
  featured,
  active,
  sortorder,
  createdat,
  updatedat,
  ailab_project_capabilities (
    ailab_capabilities (
      id,
      slug,
      icon,
      title,
      description,
      sortorder,
      active,
      createdat,
      updatedat
    )
  )
`

const normalizeAILabProject = (row: AILabProjectRow): AILabProject => {
  const { ailab_project_capabilities, ...project } = row

  return {
    ...project,
    capabilities: (ailab_project_capabilities ?? [])
      .map((item) => item.ailab_capabilities)
      .filter((capability): capability is AILabCapability => Boolean(capability)),
  }
}

export const fetchAILabCapabilities = async () => {
  const { data, error } = await supabase
    .from('ailab_capabilities')
    .select('*')
    .eq('active', true)
    .order('sortorder', { ascending: true })

  if (error) throw error
  return data as AILabCapability[]
}

export const fetchAILabProjects = async (capabilitySlug?: string) => {
  let projectIds: string[] | null = null

  if (capabilitySlug && capabilitySlug !== 'all') {
    const { data: links, error: linksError } = await supabase
      .from('ailab_project_capabilities')
      .select('project_id, ailab_capabilities!inner(slug)')
      .eq('ailab_capabilities.slug', capabilitySlug)

    if (linksError) throw linksError

    projectIds = (links ?? []).map((link) => link.project_id)

    if (projectIds.length === 0) {
      return []
    }
  }

  let query = supabase
    .from('ailab_projects')
    .select(AILAB_PROJECT_SELECT)
    .eq('active', true)
    .order('sortorder', { ascending: true })
    .order('createdat', { ascending: false })

  if (projectIds) {
    query = query.in('id', projectIds)
  }

  const { data, error } = await query

  if (error) throw error

  return ((data ?? []) as unknown as AILabProjectRow[]).map(normalizeAILabProject)
}

export const fetchAILabProjectBySlug = async (slug: string) => {
  const { data, error } = await supabase
    .from('ailab_projects')
    .select(AILAB_PROJECT_SELECT)
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (error) throw error

  return normalizeAILabProject(data as unknown as AILabProjectRow)
}






















/*
create table visits (
  id          bigserial primary key,
  page        text not null,
  referrer    text,
  user_agent  text,
  country     text,
  city        text,
  language    text,
  screen      text,
  created_at  timestamptz default now()
);

-- Index pour les requêtes fréquentes
create index visits_created_at_idx on visits(created_at desc);
create index visits_page_idx on visits(page);

-- Autoriser les insertions anonymes (visiteurs non connectés)
alter table visits enable row level security;

create policy "Anyone can insert visits"
  on visits for insert
  with check (true);

create policy "Only authenticated can read visits"
  on visits for select
  using (auth.role() = 'authenticated');   
  
  
  
  



create extension if not exists pgcrypto;

create table if not exists public.ailab_capabilities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  icon text not null,
  title text not null,
  description text not null,
  sortorder integer not null default 0,
  active boolean not null default true,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create table if not exists public.ailab_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  icon text not null,
  title text not null,
  description text not null,
  technologies text[] not null default '{}',
  color text not null default 'from-blue-500 to-cyan-500',
  imageurl text,
  githuburl text,
  liveurl text,
  demourl text,
  demoavailable boolean not null default false,
  featured boolean not null default false,
  active boolean not null default true,
  sortorder integer not null default 0,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create table if not exists public.ailab_project_capabilities (
  project_id uuid not null references public.ailab_projects(id) on delete cascade,
  capability_id uuid not null references public.ailab_capabilities(id) on delete cascade,
  primary key (project_id, capability_id)
);

create or replace function public.set_updatedat()
returns trigger as $$
begin
  new.updatedat = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_ailab_capabilities_updatedat on public.ailab_capabilities;
create trigger set_ailab_capabilities_updatedat
before update on public.ailab_capabilities
for each row execute function public.set_updatedat();

drop trigger if exists set_ailab_projects_updatedat on public.ailab_projects;
create trigger set_ailab_projects_updatedat
before update on public.ailab_projects
for each row execute function public.set_updatedat();

alter table public.ailab_capabilities enable row level security;
alter table public.ailab_projects enable row level security;
alter table public.ailab_project_capabilities enable row level security;

grant select on public.ailab_capabilities to anon, authenticated;
grant select on public.ailab_projects to anon, authenticated;
grant select on public.ailab_project_capabilities to anon, authenticated;

drop policy if exists "Public read active AI capabilities" on public.ailab_capabilities;
create policy "Public read active AI capabilities"
on public.ailab_capabilities
for select
to anon, authenticated
using (active = true);

drop policy if exists "Public read active AI projects" on public.ailab_projects;
create policy "Public read active AI projects"
on public.ailab_projects
for select
to anon, authenticated
using (active = true);

drop policy if exists "Public read AI project capability links" on public.ailab_project_capabilities;
create policy "Public read AI project capability links"
on public.ailab_project_capabilities
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.ailab_projects p
    where p.id = project_id and p.active = true
  )
  and exists (
    select 1
    from public.ailab_capabilities c
    where c.id = capability_id and c.active = true
  )
);




insert into public.ailab_capabilities
  (slug, icon, title, description, sortorder)
values
  (
    'deep-learning',
    'Brain',
    'Deep Learning',
    'Réseaux de neurones profonds pour des tâches complexes',
    1
  ),
  (
    'nlp-avance',
    'Code',
    'NLP Avancé',
    'Traitement du langage naturel et compréhension contextuelle',
    2
  ),
  (
    'big-data',
    'Database',
    'Big Data',
    'Traitement et analyse de grandes quantités de données',
    3
  ),
  (
    'real-time-ai',
    'Zap',
    'Real-time AI',
    'Inférence en temps réel pour applications critiques',
    4
  )
on conflict (slug) do update set
  icon = excluded.icon,
  title = excluded.title,
  description = excluded.description,
  sortorder = excluded.sortorder,
  active = true;

insert into public.ailab_projects
  (
    slug,
    icon,
    title,
    description,
    technologies,
    color,
    demoavailable,
    featured,
    sortorder
  )
values
  (
    'chatbot',
    'MessageSquare',
    'Chatbot IA Multilingue',
    'Assistant conversationnel intelligent supportant plusieurs langues africaines',
    array['GPT-4', 'Python', 'FastAPI', 'TensorFlow'],
    'from-blue-500 to-cyan-500',
    true,
    true,
    1
  ),
  (
    'image-recognition',
    'ImageIcon',
    'Reconnaissance d''Images',
    'Système de classification et détection d''objets en temps réel',
    array['PyTorch', 'YOLO', 'OpenCV', 'React'],
    'from-purple-500 to-pink-500',
    true,
    true,
    2
  ),
  (
    'text-analysis',
    'FileText',
    'Analyse de Sentiments',
    'Analyse automatique des sentiments dans les textes et avis clients',
    array['BERT', 'Transformers', 'scikit-learn', 'Flask'],
    'from-green-500 to-emerald-500',
    true,
    false,
    3
  ),
  (
    'data-prediction',
    'TrendingUp',
    'Prédiction de Données',
    'Modèles de machine learning pour la prédiction et l''optimisation',
    array['XGBoost', 'LightGBM', 'Pandas', 'Plotly'],
    'from-orange-500 to-red-500',
    true,
    false,
    4
  )
on conflict (slug) do update set
  icon = excluded.icon,
  title = excluded.title,
  description = excluded.description,
  technologies = excluded.technologies,
  color = excluded.color,
  demoavailable = excluded.demoavailable,
  featured = excluded.featured,
  sortorder = excluded.sortorder,
  active = true;

with links(project_slug, capability_slug) as (
  values
    ('chatbot', 'nlp-avance'),
    ('chatbot', 'real-time-ai'),

    ('image-recognition', 'deep-learning'),
    ('image-recognition', 'real-time-ai'),

    ('text-analysis', 'nlp-avance'),
    ('text-analysis', 'deep-learning'),

    ('data-prediction', 'big-data'),
    ('data-prediction', 'deep-learning')
)
insert into public.ailab_project_capabilities (project_id, capability_id)
select p.id, c.id
from links l
join public.ailab_projects p on p.slug = l.project_slug
join public.ailab_capabilities c on c.slug = l.capability_slug
on conflict do nothing;





create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  createdat timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

grant execute on function public.is_portfolio_admin() to authenticated;

grant select, insert, update, delete on public.ailab_projects to authenticated;
grant select, insert, update, delete on public.ailab_capabilities to authenticated;
grant select, insert, update, delete on public.ailab_project_capabilities to authenticated;

drop policy if exists "Admins read all AI projects" on public.ailab_projects;
create policy "Admins read all AI projects"
on public.ailab_projects
for select
to authenticated
using (public.is_portfolio_admin());

drop policy if exists "Admins insert AI projects" on public.ailab_projects;
create policy "Admins insert AI projects"
on public.ailab_projects
for insert
to authenticated
with check (public.is_portfolio_admin());

drop policy if exists "Admins update AI projects" on public.ailab_projects;
create policy "Admins update AI projects"
on public.ailab_projects
for update
to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

drop policy if exists "Admins delete AI projects" on public.ailab_projects;
create policy "Admins delete AI projects"
on public.ailab_projects
for delete
to authenticated
using (public.is_portfolio_admin());

drop policy if exists "Admins read all AI capabilities" on public.ailab_capabilities;
create policy "Admins read all AI capabilities"
on public.ailab_capabilities
for select
to authenticated
using (public.is_portfolio_admin());

drop policy if exists "Admins insert AI capabilities" on public.ailab_capabilities;
create policy "Admins insert AI capabilities"
on public.ailab_capabilities
for insert
to authenticated
with check (public.is_portfolio_admin());

drop policy if exists "Admins update AI capabilities" on public.ailab_capabilities;
create policy "Admins update AI capabilities"
on public.ailab_capabilities
for update
to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

drop policy if exists "Admins delete AI capabilities" on public.ailab_capabilities;
create policy "Admins delete AI capabilities"
on public.ailab_capabilities
for delete
to authenticated
using (public.is_portfolio_admin());

drop policy if exists "Admins read AI project capability links" on public.ailab_project_capabilities;
create policy "Admins read AI project capability links"
on public.ailab_project_capabilities
for select
to authenticated
using (public.is_portfolio_admin());

drop policy if exists "Admins insert AI project capability links" on public.ailab_project_capabilities;
create policy "Admins insert AI project capability links"
on public.ailab_project_capabilities
for insert
to authenticated
with check (public.is_portfolio_admin());

drop policy if exists "Admins delete AI project capability links" on public.ailab_project_capabilities;
create policy "Admins delete AI project capability links"
on public.ailab_project_capabilities
for delete
to authenticated
using (public.is_portfolio_admin());



insert into public.admin_users (user_id, email)
select id, email
from auth.users
where email = 'contact@adjoumani-koffi.com'
on conflict (user_id) do update set email = excluded.email;





drop policy if exists "Public read project images" on storage.objects;
create policy "Public read project images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'project-images');

drop policy if exists "Admins upload project images" on storage.objects;
create policy "Admins upload project images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-images'
  and public.is_portfolio_admin()
);

drop policy if exists "Admins update project images" on storage.objects;
create policy "Admins update project images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-images'
  and public.is_portfolio_admin()
)
with check (
  bucket_id = 'project-images'
  and public.is_portfolio_admin()
);

drop policy if exists "Admins delete project images" on storage.objects;
create policy "Admins delete project images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-images'
  and public.is_portfolio_admin()
);
  
*/