-- Undo/redo writes its own audit rows, so the trail records that a change was
-- reversed rather than losing the fact it ever happened. Two CHECKs must widen:
-- `action` gains undo/redo, and `entity_type` gains 'app' (an undo is an act on
-- the application, not on one entity).
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('create','update','delete','archive','restore',
                    'adjust-balance','adjust-outstanding','reassign-delete','skip',
                    'undo','redo'));

alter table public.audit_log drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('transaction','account','card','category','budget','recurring','app'));
