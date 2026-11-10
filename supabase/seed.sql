-- Local development seed. NOT for production.
-- Users are inserted into auth.users so the handle_new_user trigger creates their profiles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'eier@test.local', '', now(), '{"provider":"email","providers":["email"],"role":"owner"}',
   '{"full_name":"Eva Eier"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'plukker@test.local', '', now(), '{"provider":"email","providers":["email"],"role":"picker"}',
   '{"full_name":"Per Plukker"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'selger@test.local', '', now(), '{"provider":"email","providers":["email"],"role":"seller"}',
   '{"full_name":"Sara Selger"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email in ('eier@test.local', 'plukker@test.local', 'selger@test.local');

insert into public.harvest_areas (name) values ('Bekken'), ('Skogen nord');

insert into public.products (name, net_weight_g, unit_kind, gtin, shelf_life_days) values
  ('Ramsløk 100 g pose', 100, 'consumer', '07038010055690', 6),
  ('Ramsløk 1 kg kasse', 1000, 'trade', '17038010055703', 6);
