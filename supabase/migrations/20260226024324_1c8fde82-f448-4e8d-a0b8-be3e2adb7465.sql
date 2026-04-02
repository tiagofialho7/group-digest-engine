
ALTER TABLE public.org_members 
ADD COLUMN can_clone_instance boolean NOT NULL DEFAULT false;
