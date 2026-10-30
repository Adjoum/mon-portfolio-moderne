-- Répétition générale : traits de la production constatés par l'inventaire public du 30/10/2026
-- (supabase/checks/p1ai_public_probe.mjs), ajoutés à l'état « production » du banc RLS.
-- Exécuté en postgres, comme le SQL Editor.

-- La table des visites est lisible par n'importe quel visiteur anonyme
create policy "Public read visits" on public.visits for select to anon using (true);
