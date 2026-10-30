-- Banc de test RLS — contrôle du banc lui-même : AVANT migration, l'état simulé
-- doit être réellement vulnérable. Sinon les assertions post-migration ne prouveraient rien.
-- Tout est exécuté dans une transaction annulée : aucune donnée n'est modifiée.

begin;

select pg_temp.check('AVANT : utilisateur ordinaire écrit dans projects',   'user', $q$insert into public.projects (title) values ('pirate')$q$, 'rows:1');
select pg_temp.check('AVANT : utilisateur ordinaire écrit dans skills',     'anon', $q$insert into public.skills (name) values ('pirate')$q$, 'rows:1');
select pg_temp.check('AVANT : utilisateur ordinaire lit les visites',       'user', 'select count(*)::text from public.visits', '3');
select pg_temp.check('AVANT : utilisateur ordinaire lit les messages',      'user', 'select count(*)::text from public.contacts', '1');
select pg_temp.check('AVANT : utilisateur ordinaire téléverse une image',   'user', $q$insert into storage.objects (bucket_id, name) values ('project-images', 'x.jpg')$q$, 'rows:1');
select pg_temp.check('AVANT : admin sans MFA écrit dans projects',          'admin', $q$insert into public.projects (title) values ('sans MFA')$q$, 'rows:1');
select pg_temp.check('AVANT : utilisateur ordinaire devient administrateur','user', $q$insert into public.admin_users (user_id) values ('22222222-2222-4222-8222-222222222222')$q$, 'rows:1');

\echo
\echo '=== État simulé avant migration (doit être vulnérable) ==='
select case when expected = actual then 'VULNÉRABLE (attendu)' else 'NON REPRODUIT' end as statut, label, expected, actual
from results order by id;

do $$
declare failed int;
begin
  select count(*) filter (where expected is distinct from actual) into failed from results;
  if failed > 0 then
    raise exception 'Le banc de test ne reproduit pas l''état vulnérable (% cas)', failed;
  end if;
end $$;

rollback;
