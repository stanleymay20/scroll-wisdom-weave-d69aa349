
-- Storage bucket for document uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 20971520); -- 20MB limit

-- RLS: Users can upload their own documents
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: Users can read their own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: Users can delete their own documents
CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add source tracking to books
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'generated';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS source_document_url text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS source_document_name text;
