-- Centre d'administration multi-IA : données initiales.
-- NON APPLIQUÉE EN PRODUCTION.
--
-- Tout ici est modifiable depuis le dashboard. Les modèles sont marqués « seed » et
-- « Non vérifié » : relevés dans les documentations officielles le 30/10/2026, ils sont
-- remplacés dès la première synchronisation. Tarifs indicatifs, à contrôler avant activation.
-- Toutes les fonctionnalités démarrent désactivées : rien ne s'exécute avant un test réussi.
-- Réexécutable : aucune donnée déjà modifiée n'est écrasée.

insert into public.ai_providers (id, display_name) values
  ('openai',     'OpenAI'),
  ('groq',       'Groq'),
  ('xai',        'xAI (Grok)'),
  ('gemini',     'Google Gemini'),
  ('openrouter', 'OpenRouter'),
  ('anthropic',  'Anthropic')
on conflict (id) do nothing;

insert into public.ai_features
  (id, section, required_capabilities, output_format, personal_data, prompt_version, default_max_output_tokens, default_timeout_ms)
values
  ('cv.generate',         'CV Generator',       '{text,json}',   'json', true,  'cv.v1',         4500, 85000),
  ('cv.review',           'CV Generator',       '{text,json}',   'json', true,  'cv.v1',          800, 30000),
  ('cv.import.structure', 'CV Generator',       '{text}',        'text', true,  'cv.v1',         2000, 45000),
  ('cv.import.ocr',       'CV Generator',       '{text,vision}', 'text', true,  'cv.v1',         2000, 60000),
  ('latex.generate',      'Éditeur LaTeX',      '{text}',        'text', true,  'latex.v1',      3000, 85000),
  ('latex.improve',       'Éditeur LaTeX',      '{text}',        'text', true,  'latex.v1',      1800, 60000),
  ('agent.chat',          'Assistant Clone IA', '{text}',        'text', false, 'assistants.v1', 1000, 30000),
  ('inkspace.generate',   'InkSpace',           '{text,json}',   'json', false, 'assistants.v1', 1200, 30000),
  ('novamind.diagram',    'NovaMind',           '{text,json}',   'json', false, 'assistants.v1', 2400, 45000)
on conflict (id) do nothing;

insert into public.ai_models (provider_id, model_id, origin, status, vision) values
  ('openai',     'gpt-6-astra',                       'seed', 'unverified', true),
  ('openai',     'gpt-6.1-sol',                       'seed', 'unverified', true),
  ('openai',     'gpt-6.1-terra',                     'seed', 'unverified', true),
  ('openai',     'gpt-6-luna',                        'seed', 'unverified', true),
  ('groq',       'openai/gpt-oss-120b',               'seed', 'unverified', false),
  ('groq',       'openai/gpt-oss-20b',                'seed', 'unverified', false),
  ('xai',        'grok-4.7',                          'seed', 'unverified', null),
  ('xai',        'grok-4.6',                          'seed', 'unverified', null),
  ('xai',        'grok-4.5',                          'seed', 'unverified', null),
  ('xai',        'grok-4.3',                          'seed', 'unverified', null),
  ('gemini',     'gemini-4-argon',                    'seed', 'unverified', null),
  ('gemini',     'gemini-3.8-flash',                  'seed', 'unverified', null),
  ('gemini',     'gemini-3.6-flash',                  'seed', 'unverified', null),
  ('gemini',     'gemini-3.5-flash-lite',             'seed', 'unverified', null),
  ('gemini',     'gemini-3.1-flash-lite',             'seed', 'unverified', null),
  ('openrouter', 'openai/gpt-6.1-terra',              'seed', 'unverified', true),
  ('openrouter', 'anthropic/claude-sonnet-5.5',       'seed', 'unverified', true),
  ('openrouter', 'anthropic/claude-haiku-5.5',        'seed', 'unverified', true),
  ('openrouter', 'google/gemini-4-argon',             'seed', 'unverified', true),
  ('openrouter', 'deepseek/deepseek-v4.1-flash-1017', 'seed', 'unverified', true),
  ('anthropic',  'claude-fable-5-1',                  'seed', 'unverified', true),
  ('anthropic',  'claude-opus-5-5',                   'seed', 'unverified', true),
  ('anthropic',  'claude-sonnet-5-5',                 'seed', 'unverified', true),
  ('anthropic',  'claude-haiku-5-5',                  'seed', 'unverified', true)
on conflict (provider_id, model_id) do nothing;

-- Micro-USD par million de tokens. Sans tarif publié (gemini-4-argon en direct), pas de ligne :
-- le modèle n'est pas activable tant qu'un tarif n'est pas saisi.
insert into public.ai_model_pricing (provider_id, model_id, input_per_mtok_micro_usd, output_per_mtok_micro_usd, source) values
  ('openai',     'gpt-6-astra',                       10000000, 50000000, 'seed'),
  ('openai',     'gpt-6.1-sol',                        2000000, 10000000, 'seed'),
  ('openai',     'gpt-6.1-terra',                      1000000,  5000000, 'seed'),
  ('openai',     'gpt-6-luna',                          100000,   500000, 'seed'),
  ('groq',       'openai/gpt-oss-120b',                 150000,   600000, 'seed'),
  ('groq',       'openai/gpt-oss-20b',                   75000,   300000, 'seed'),
  ('xai',        'grok-4.7',                           2000000,  6000000, 'seed'),
  ('xai',        'grok-4.6',                           2000000,  6000000, 'seed'),
  ('xai',        'grok-4.5',                           2000000,  6000000, 'seed'),
  ('xai',        'grok-4.3',                           1250000,  2500000, 'seed'),
  ('gemini',     'gemini-3.8-flash',                    750000,  3750000, 'seed'),
  ('gemini',     'gemini-3.6-flash',                    750000,  3750000, 'seed'),
  ('gemini',     'gemini-3.5-flash-lite',               300000,  2500000, 'seed'),
  ('gemini',     'gemini-3.1-flash-lite',               250000,  1500000, 'seed'),
  ('openrouter', 'openai/gpt-6.1-terra',               1000000,  5000000, 'seed'),
  ('openrouter', 'anthropic/claude-sonnet-5.5',        2000000, 10000000, 'seed'),
  ('openrouter', 'anthropic/claude-haiku-5.5',          100000,   500000, 'seed'),
  ('openrouter', 'google/gemini-4-argon',              2000000, 10000000, 'seed'),
  ('openrouter', 'deepseek/deepseek-v4.1-flash-1017',   150000,   600000, 'seed'),
  ('anthropic',  'claude-fable-5-1',                  10000000, 50000000, 'seed'),
  ('anthropic',  'claude-opus-5-5',                    4000000, 20000000, 'seed'),
  ('anthropic',  'claude-sonnet-5-5',                  2000000, 10000000, 'seed'),
  ('anthropic',  'claude-haiku-5-5',                    100000,   500000, 'seed')
on conflict (provider_id, model_id) do nothing;

-- Affectations initiales : indépendantes, modifiables, désactivées
insert into public.ai_feature_assignments (feature_id, provider_id, model_id, params, max_output_tokens, timeout_ms) values
  ('agent.chat',          'groq',   'openai/gpt-oss-120b', '{"reasoning_effort":"low","temperature":0.6}', 1000, 30000),
  ('novamind.diagram',    'groq',   'openai/gpt-oss-120b', '{"reasoning_effort":"low","temperature":0.7}', 2400, 45000),
  ('inkspace.generate',   'openai', 'gpt-6-astra',         '{"reasoning_effort":"low"}',                   1200, 30000),
  ('cv.generate',         'openai', 'gpt-6-astra',         '{"reasoning_effort":"low"}',                   4500, 85000),
  ('cv.review',           'openai', 'gpt-6-astra',         '{"reasoning_effort":"low"}',                    800, 30000),
  ('cv.import.structure', 'openai', 'gpt-6-astra',         '{"reasoning_effort":"low"}',                   2000, 45000),
  ('cv.import.ocr',       'openai', 'gpt-6-astra',         '{"reasoning_effort":"low"}',                   2000, 60000),
  ('latex.generate',      'openai', 'gpt-6-astra',         '{"reasoning_effort":"low"}',                   3000, 85000),
  ('latex.improve',       'openai', 'gpt-6-astra',         '{"reasoning_effort":"low"}',                   1800, 60000)
on conflict (feature_id) do nothing;

-- Quotas + sous-budgets (micro-USD) : une fonction coûteuse ne peut pas vider le budget commun
insert into public.ai_quota_rules
  (feature_id, per_subject_per_day, global_per_day, per_minute, concurrency, daily_budget_micro_usd, monthly_budget_micro_usd)
values
  ('agent.chat',          40, 2000, 12, 6, 1000000, 6000000),
  ('inkspace.generate',   20,  500,  8, 3,  500000, 3000000),
  ('novamind.diagram',    15,  400,  6, 3,  500000, 3000000),
  ('cv.generate',          3,  150,  6, 3, 1500000, 9000000),
  ('cv.review',            5,  200,  6, 4,  500000, 3000000),
  ('cv.import.structure',  3,  150,  6, 3,  500000, 3000000),
  ('cv.import.ocr',        1,   50,  6, 2,  500000, 3000000),
  ('latex.generate',       3,  100,  6, 2,  750000, 4500000),
  ('latex.improve',       15,  400,  6, 4,  500000, 3000000)
on conflict (feature_id) do nothing;

-- 5 USD par jour et 30 USD par mois : limites internes estimées, pas un plafond de facturation
insert into public.ai_settings (key, value) values
  ('daily_budget_micro_usd',   '5000000'),
  ('monthly_budget_micro_usd', '30000000'),
  ('global_concurrency',       '8')
on conflict (key) do nothing;
