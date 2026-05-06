ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS publishing_settings jsonb NOT NULL DEFAULT jsonb_build_object(
    'transparency_mode', 'invisible',
    'show_scrolllibrary_branding', false,
    'show_ai_assistance_notice', false,
    'show_powered_by', false,
    'publisher_name', null,
    'publisher_imprint', null,
    'sanitize_metadata', true,
    'confidential_mode', false
  );