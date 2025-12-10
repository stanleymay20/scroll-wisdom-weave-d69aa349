-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Create content_reports table for user reporting
CREATE TABLE public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id),
  content_type TEXT NOT NULL, -- 'book', 'chapter', 'comment'
  content_id UUID NOT NULL,
  reason TEXT NOT NULL, -- 'hate_speech', 'explicit', 'copyright', 'misinformation', 'other'
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'reviewed', 'actioned', 'dismissed'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  action_taken TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
ON public.content_reports
FOR INSERT
WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports"
ON public.content_reports
FOR SELECT
USING (auth.uid() = reporter_id);

CREATE POLICY "Moderators can view all reports"
ON public.content_reports
FOR SELECT
USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Moderators can update reports"
ON public.content_reports
FOR UPDATE
USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

-- Create moderation_queue table
CREATE TABLE public.moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  flagged_reason TEXT NOT NULL,
  auto_flagged BOOLEAN DEFAULT true,
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status TEXT NOT NULL DEFAULT 'pending',
  moderator_id UUID REFERENCES auth.users(id),
  moderated_at TIMESTAMP WITH TIME ZONE,
  action TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Moderators can view queue"
ON public.moderation_queue
FOR SELECT
USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Moderators can update queue"
ON public.moderation_queue
FOR UPDATE
USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert to queue"
ON public.moderation_queue
FOR INSERT
WITH CHECK (true);

-- Create legal_consents table for GDPR
CREATE TABLE public.legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  consent_type TEXT NOT NULL, -- 'terms', 'privacy', 'cookies', 'marketing'
  consented BOOLEAN NOT NULL DEFAULT false,
  version TEXT NOT NULL,
  ip_address TEXT,
  consented_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, consent_type)
);

ALTER TABLE public.legal_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their consents"
ON public.legal_consents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their consents"
ON public.legal_consents
FOR ALL
USING (auth.uid() = user_id);

-- Create data_export_requests table for GDPR
CREATE TABLE public.data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  download_url TEXT,
  expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their export requests"
ON public.data_export_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create export requests"
ON public.data_export_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create publishing_certificates table
CREATE TABLE public.publishing_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  certificate_number TEXT NOT NULL UNIQUE,
  isbn TEXT,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rights_granted TEXT[] DEFAULT ARRAY['publish', 'distribute', 'sell'],
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE public.publishing_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their certificates"
ON public.publishing_certificates
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all certificates"
ON public.publishing_certificates
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));