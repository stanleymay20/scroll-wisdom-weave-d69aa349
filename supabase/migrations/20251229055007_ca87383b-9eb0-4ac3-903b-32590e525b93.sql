-- Create storage bucket for comic panel images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comic-panels', 'comic-panels', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for comic-panels bucket
CREATE POLICY "Anyone can view comic panel images"
ON storage.objects FOR SELECT
USING (bucket_id = 'comic-panels');

CREATE POLICY "Authenticated users can upload comic panels"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'comic-panels' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own comic panels"
ON storage.objects FOR UPDATE
USING (bucket_id = 'comic-panels' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own comic panels"
ON storage.objects FOR DELETE
USING (bucket_id = 'comic-panels' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add text_in_image setting to books table (true = baked into image, false = overlay in reader)
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS text_in_image boolean DEFAULT true;

-- Add scenes_per_panel setting (1-3)
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS scenes_per_panel integer DEFAULT 1;