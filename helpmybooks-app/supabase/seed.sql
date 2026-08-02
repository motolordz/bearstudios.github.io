-- HelpMyBooks demo seed. Run AFTER schema.sql.
-- Requires the demo organisation from schema.sql.

insert into clients (id, organisation_id, name, email, phone, secure_link_token) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 'Dave''s Plumbing Pty Ltd', 'dave@davesplumbing.com.au', '+61400111222', 'demo-dave'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', 'Luna Cafe', 'hello@lunacafe.com.au', '+61400333444', 'demo-luna')
on conflict do nothing;

insert into transactions
  (organisation_id, client_id, date, amount, merchant, description, status, ai_suggested_category, ai_confidence, final_category, gst_claimable, escalation_stage, bookkeeper_notes)
values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2026-06-28',-187.45,'Bunnings Warehouse','EFTPOS BUNNINGS 4321 BELCONNEN','unanswered','Repairs & Maintenance / Materials',0.90,null,true,'none',null),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2026-06-27',-95.20,'Caltex Fyshwick','CALTEX FYSHWICK AUS','waiting_client','Motor Vehicle — Fuel',0.85,null,true,'first_reminder',null),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2026-06-25',-1450.00,'ATO','ATO PAYMENT 551000123456789','reviewed','Tax Payments (ATO)',0.95,'Tax Payments (ATO)',false,'none','Q4 BAS payment'),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2026-06-22',-68.50,'Woolworths Dickson','WOOLWORTHS 1234 DICKSON','waiting_client','Groceries — possible personal',0.50,null,null,'final_reminder',null),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2026-06-20',2200.00,'Deposit — J Harris','OSKO DEPOSIT J HARRIS INV 1042','answered','Sales Income',0.88,null,null,'none',null),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','2026-06-29',-312.00,'Ordermentum','ORDERMENTUM SYDNEY','unanswered',null,null,null,null,'none',null),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','2026-06-26',-129.00,'Telstra','TELSTRA BILL PAYMENT','reconciled','Telephone & Internet',0.90,'Telephone & Internet',true,'none','Monthly business mobile + NBN'),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','2026-06-24',-84.90,'Officeworks Braddon','OFFICEWORKS 0421 BRADDON','answered','Office Supplies',0.90,null,true,'none',null),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','2026-06-21',-56.70,'Uber Eats','UBER *EATS SYDNEY','waiting_client','Meals — possible entertainment',0.50,null,null,'second_reminder',null),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','2026-06-18',-499.00,'Xero','XERO AUSTRALIA SUBSCRIPTION','reconciled','Software & Subscriptions — Accounting',0.95,'Software & Subscriptions — Accounting',true,'none','Annual plan')
on conflict do nothing;
