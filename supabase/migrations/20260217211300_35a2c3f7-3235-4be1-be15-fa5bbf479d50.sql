-- Create a public storage bucket for book illustrations
INSERT INTO storage.buckets (id, name, public) VALUES ('book-images', 'book-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view book images (public bucket)
CREATE POLICY "Book images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'book-images');

-- Allow authenticated users to upload book images
CREATE POLICY "Authenticated users can upload book images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'book-images' AND auth.uid() IS NOT NULL);

-- Allow users to delete their own book images
CREATE POLICY "Users can delete own book images"
ON storage.objects FOR DELETE
USING (bucket_id = 'book-images' AND auth.uid()::text = (storage.foldername(name))[1]);