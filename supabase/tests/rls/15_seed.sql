-- Banc de test RLS — données factices (supabase_admin, contourne la RLS)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'user@example.test');

insert into public.admin_users (user_id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin@example.test');

insert into public.projects (title) values ('Projet A'), ('Projet B');
insert into public.skills (name, level) values ('React', 90), ('Python', 80);
insert into public.visits (page, city) values ('/', 'Abidjan'), ('/about', 'San-Pedro'), ('/cv', 'Paris');
insert into public.contacts (name, email, message) values ('Visiteur', 'visiteur@example.test', 'Bonjour');
insert into public.ailab_projects (slug, title, active) values ('actif', 'Projet actif', true), ('brouillon', 'Projet inactif', false);

insert into storage.buckets (id, name, public) values ('project-images', 'project-images', true), ('avatars', 'avatars', false);
insert into storage.objects (bucket_id, name) values ('project-images', 'projects/existant.jpg');
