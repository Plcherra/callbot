-- Mark existing receptionists as business mode when they already have
-- related staff, services, or locations. Others remain personal.

UPDATE public.receptionists r
SET mode = 'business'
WHERE mode = 'personal'
  AND (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.receptionist_id = r.id) OR
    EXISTS (SELECT 1 FROM public.services sv WHERE sv.receptionist_id = r.id) OR
    EXISTS (SELECT 1 FROM public.locations l WHERE l.receptionist_id = r.id)
  );

