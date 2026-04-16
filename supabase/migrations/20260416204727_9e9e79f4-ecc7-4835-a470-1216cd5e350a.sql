-- =====================================================
-- PHASE 3: ENTERPRISE OPS — Orgs, Memberships, Audit Log
-- =====================================================

-- 1. Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  verbose_audit boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Organization members
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_by uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 3. Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  resource_type text,
  resource_id text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error','critical')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON public.audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON public.audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Add organization_id to books (optional, backward compatible)
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_books_organization ON public.books(organization_id);

-- =====================================================
-- SECURITY DEFINER HELPERS (avoid RLS recursion)
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('owner','admin')
  )
$$;

-- Safe audit logger (callable from edge functions + triggers)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _event_type text,
  _actor_id uuid DEFAULT NULL,
  _organization_id uuid DEFAULT NULL,
  _resource_type text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _severity text DEFAULT 'info',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.audit_log (
    event_type, actor_id, organization_id,
    resource_type, resource_id, severity, metadata
  )
  VALUES (
    _event_type, _actor_id, _organization_id,
    _resource_type, _resource_id, _severity, _metadata
  )
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- =====================================================
-- RLS POLICIES — organizations
-- =====================================================

CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Org admins can update their organization"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), id))
  WITH CHECK (public.is_org_admin(auth.uid(), id));

CREATE POLICY "Org owners can delete their organization"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = organizations.id
      AND user_id = auth.uid()
      AND role = 'owner'
  ));

-- =====================================================
-- RLS POLICIES — organization_members
-- =====================================================

CREATE POLICY "Members can view co-members"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Org admins can add members"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org admins can update members"
  ON public.organization_members FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org admins can remove members; users can leave"
  ON public.organization_members FOR DELETE
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
    OR user_id = auth.uid()
  );

-- Auto-add creator as owner
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

-- =====================================================
-- RLS POLICIES — audit_log
-- =====================================================

CREATE POLICY "Platform admins can view all audit events"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can view their org audit events"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_org_admin(auth.uid(), organization_id)
  );

CREATE POLICY "Users can view their own audit events"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid());

-- Inserts go through log_audit_event() (security definer). Block direct client inserts.
-- (No INSERT policy = no direct insert allowed.)

-- =====================================================
-- updated_at triggers
-- =====================================================

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();