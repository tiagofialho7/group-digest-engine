
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Org members
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- User roles helper function
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id AND role = _role
  )
$$;

-- Function to check membership
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id
  )
$$;

-- Org policies
CREATE POLICY "Members can view their orgs" ON public.organizations
  FOR SELECT USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Admins can update orgs" ON public.organizations
  FOR UPDATE USING (public.has_org_role(auth.uid(), id, 'admin'));
CREATE POLICY "Auth users can create orgs" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Org members policies
CREATE POLICY "Members can view org members" ON public.org_members
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage org members" ON public.org_members
  FOR INSERT WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin') OR auth.uid() = user_id);
CREATE POLICY "Admins can delete org members" ON public.org_members
  FOR DELETE USING (public.has_org_role(auth.uid(), org_id, 'admin'));

-- Auto add creator as admin
CREATE OR REPLACE FUNCTION public.handle_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_org_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_org();

-- Instance configs (for Evolution API connections)
CREATE TABLE public.instance_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_type TEXT NOT NULL CHECK (instance_type IN ('master', 'user')),
  server_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  instance_name TEXT NOT NULL DEFAULT '',
  is_connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instance_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org instances" ON public.instance_configs
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Users can manage own instances" ON public.instance_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id AND instance_type = 'user' AND public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Users can update own instances" ON public.instance_configs
  FOR UPDATE USING (
    (auth.uid() = user_id AND instance_type = 'user') OR 
    (instance_type = 'master' AND public.has_org_role(auth.uid(), org_id, 'admin'))
  );
CREATE POLICY "Admins can manage master instances" ON public.instance_configs
  FOR INSERT WITH CHECK (instance_type = 'master' AND public.has_org_role(auth.uid(), org_id, 'admin'));

-- Monitored groups
CREATE TABLE public.monitored_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  whatsapp_group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  participant_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, whatsapp_group_id)
);
ALTER TABLE public.monitored_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view monitored groups" ON public.monitored_groups
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage monitored groups" ON public.monitored_groups
  FOR INSERT WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can update monitored groups" ON public.monitored_groups
  FOR UPDATE USING (public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can delete monitored groups" ON public.monitored_groups
  FOR DELETE USING (public.has_org_role(auth.uid(), org_id, 'admin'));

-- Messages from WhatsApp
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.monitored_groups(id) ON DELETE CASCADE NOT NULL,
  whatsapp_message_id TEXT,
  sender_name TEXT NOT NULL,
  sender_phone TEXT,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Members can view messages of groups in their org
CREATE POLICY "Members can view group messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.monitored_groups mg
      WHERE mg.id = group_id AND public.is_org_member(auth.uid(), mg.org_id)
    )
  );

-- Analyses
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.monitored_groups(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view analyses" ON public.analyses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.monitored_groups mg
      WHERE mg.id = group_id AND public.is_org_member(auth.uid(), mg.org_id)
    )
  );
CREATE POLICY "Members can create analyses" ON public.analyses
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND EXISTS (
      SELECT 1 FROM public.monitored_groups mg
      WHERE mg.id = group_id AND public.is_org_member(auth.uid(), mg.org_id)
    )
  );

-- Context blocks (AI-generated groupings)
CREATE TABLE public.context_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  message_count INT NOT NULL DEFAULT 0,
  is_answered BOOLEAN NOT NULL DEFAULT false,
  answered_by TEXT,
  answer_summary TEXT,
  message_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.context_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view context blocks" ON public.context_blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.analyses a
      JOIN public.monitored_groups mg ON mg.id = a.group_id
      WHERE a.id = analysis_id AND public.is_org_member(auth.uid(), mg.org_id)
    )
  );

-- Analysis rules per org
CREATE TABLE public.analysis_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  rule_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.analysis_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view analysis rules" ON public.analysis_rules
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage analysis rules" ON public.analysis_rules
  FOR INSERT WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can update analysis rules" ON public.analysis_rules
  FOR UPDATE USING (public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can delete analysis rules" ON public.analysis_rules
  FOR DELETE USING (public.has_org_role(auth.uid(), org_id, 'admin'));

-- Chat sessions for context-based chat
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_block_id UUID REFERENCES public.context_blocks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create chat sessions" ON public.chat_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Chat messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat messages" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs WHERE cs.id = session_id AND cs.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create chat messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs WHERE cs.id = session_id AND cs.user_id = auth.uid()
    )
  );

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_instance_configs_updated_at BEFORE UPDATE ON public.instance_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
