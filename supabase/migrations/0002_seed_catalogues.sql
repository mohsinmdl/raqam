-- Global catalogue seed — ids must match src/store/seed.js exactly so that
-- imported legacy data and client-side references resolve without remapping.
-- Runs as the migration role (bypasses RLS by design); clients can never write these.

insert into public.institutions (id, user_id, name, kind) values
  ('hbl',        null, 'HBL',                               'Conventional'),
  ('ubl',        null, 'UBL',                               'Conventional'),
  ('mcb',        null, 'MCB Bank',                          'Conventional'),
  ('alfalah',    null, 'Bank Alfalah',                      'Conventional'),
  ('meezan',     null, 'Meezan Bank',                       'Islamic'),
  ('faysal',     null, 'Faysal Bank',                       'Islamic'),
  ('bankislami', null, 'BankIslami',                        'Islamic'),
  ('scb',        null, 'Standard Chartered Pakistan',       'Foreign'),
  ('mmbl',       null, 'Mobilink Microfinance (JazzCash)',  'Microfinance'),
  ('tmb',        null, 'Telenor Microfinance (easypaisa)',  'Microfinance'),
  ('raqami',     null, 'Raqami Islamic Digital Bank',       'Digital')
on conflict (id) do nothing;

-- Demo catalogue — generic labels, NOT verified product claims.
insert into public.card_products (id, inst_id, name, type, network, tier) values
  ('p1', 'hbl',     'Debit Card (demo)',          'debit',  'Visa',       'Classic'),
  ('p2', 'hbl',     'Gold Credit Card (demo)',    'credit', 'Visa',       'Gold'),
  ('p3', 'hbl',     'Platinum Credit Card (demo)','credit', 'Visa',       'Platinum'),
  ('p4', 'meezan',  'Titanium Debit (demo)',      'debit',  'Mastercard', 'Titanium'),
  ('p5', 'ubl',     'PayPak Debit (demo)',        'debit',  'PayPak',     'Classic'),
  ('p6', 'alfalah', 'Credit Card (demo)',         'credit', 'Mastercard', 'Gold'),
  ('p7', 'scb',     'Credit Card (demo)',         'credit', 'Visa',       'Platinum')
on conflict (id) do nothing;
