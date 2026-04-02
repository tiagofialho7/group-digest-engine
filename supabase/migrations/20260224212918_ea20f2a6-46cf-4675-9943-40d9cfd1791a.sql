
-- Table for org invites
CREATE TABLE public.org_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(org_id, email)
);

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage invites
CREATE POLICY "Admins can create invites"
  ON public.org_invites FOR INSERT
  WITH CHECK (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can view invites"
  ON public.org_invites FOR SELECT
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can delete invites"
  ON public.org_invites FOR DELETE
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));

-- Allow admins to update member roles
CREATE POLICY "Admins can update member roles"
  ON public.org_members FOR UPDATE
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));

-- Allow admins to remove members
CREATE POLICY "Admins can delete members"
  ON public.org_members FOR DELETE
  USING (has_org_role(auth.uid(), org_id, 'admin'::app_role));
