
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS accepted_terms boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS accepted_terms_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS newsletter_subscribed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS consent_ip text;
