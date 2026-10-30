-- Répétition générale : traits de la production constatés par l'inventaire public du 30/10/2026
-- (supabase/checks/p1ai_public_probe.mjs) et par son Security Advisor, ajoutés à l'état
-- « production » du banc RLS. Exécuté en postgres, comme le SQL Editor.

-- La table des visites est lisible par n'importe quel visiteur anonyme
create policy "Public read visits" on public.visits for select to anon using (true);

-- function_search_path_mutable : fonctions de déclencheur d'origine (README.md, src/lib/supabase.ts)
alter table public.ailab_projects add column if not exists updatedat timestamptz not null default now();
alter table public.ailab_capabilities add column if not exists updatedat timestamptz not null default now();

create or replace function public.set_updatedat()
returns trigger as $$
begin
  new.updatedat = now();
  return new;
end;
$$ language plpgsql;
create trigger set_ailab_projects_updatedat before update on public.ailab_projects
  for each row execute function public.set_updatedat();
create trigger set_ailab_capabilities_updatedat before update on public.ailab_capabilities
  for each row execute function public.set_updatedat();

create or replace function update_updatedat_column()
returns trigger as $$
begin
  NEW.updatedat = NOW();
  RETURN NEW;
end;
$$ language 'plpgsql';
create trigger update_projects_updatedat before update on public.projects
  for each row execute function update_updatedat_column();

-- public_bucket_allows_listing : le Security Advisor compte DEUX politiques SELECT de listage
-- sur project-images. Nom de la seconde inconnu à ce jour : nom supposé, même condition.
create policy "Public Access project images" on storage.objects for select to public using (bucket_id = 'project-images');
