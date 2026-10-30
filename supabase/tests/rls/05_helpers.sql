-- Banc de test RLS — fonctions d'aide communes (chargées au début de chaque session psql)
-- Chaque cas s'exécute avec le rôle et les claims JWT qu'utiliserait PostgREST
-- (set_config('role') + request.jwt.claims), comme pour une vraie requête de l'API Supabase.

\set ON_ERROR_STOP 1

create temp table results (id serial, label text, expected text, actual text);
grant all on results to anon, authenticated;
grant all on sequence results_id_seq to anon, authenticated;

create function pg_temp.claims(who text) returns jsonb language sql immutable as $$
  select case who
    when 'anon'   then '{"role":"anon"}'::jsonb
    when 'user'   then '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}'::jsonb
    when 'user2'  then '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}'::jsonb
    when 'admin'  then '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}'::jsonb
    when 'admin2' then '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}'::jsonb
  end
$$;

-- Exécute p_sql sous l'identité p_who.
-- SELECT → valeur renvoyée ; INSERT/UPDATE/DELETE → « rows:N » ; refus → « denied »
create function pg_temp.run_as(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v text;
  n bigint;
begin
  begin
    perform set_config('request.jwt.claims', pg_temp.claims(p_who)::text, true);
    perform set_config('role', case when p_who = 'anon' then 'anon' else 'authenticated' end, true);
    if p_sql ~* '^\s*(select|with)\s' then
      execute p_sql into v;
      v := coalesce(v, 'null');
    else
      execute p_sql;
      get diagnostics n = row_count;
      v := 'rows:' || n;
    end if;
    execute 'reset role';
    return v;
  exception when insufficient_privilege then
    return 'denied';
  end;
end $$;

create function pg_temp.check(p_label text, p_who text, p_sql text, p_expected text) returns void language plpgsql as $$
begin
  insert into results (label, expected, actual) values (p_label || ' [' || p_who || ']', p_expected, pg_temp.run_as(p_who, p_sql));
end $$;
