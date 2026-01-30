-- Change font_size from INTEGER to TEXT
ALTER TABLE public.profiles ALTER COLUMN font_size TYPE TEXT USING font_size::TEXT;
ALTER TABLE public.profiles ALTER COLUMN font_size SET DEFAULT 'medium';