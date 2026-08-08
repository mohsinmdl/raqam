-- moveAssigned writes action 'move'; 0010's CHECK predates it.
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('create','update','delete','archive','restore',
                    'adjust-balance','adjust-outstanding','reassign-delete','skip',
                    'undo','redo','move'));
