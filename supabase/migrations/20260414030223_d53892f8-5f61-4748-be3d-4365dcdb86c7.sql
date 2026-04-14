INSERT INTO storage.buckets (id, name, public) VALUES ('study-music', 'study-music', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for study music" ON storage.objects
  FOR SELECT USING (bucket_id = 'study-music');

CREATE POLICY "Service role can upload study music" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'study-music');

CREATE TABLE IF NOT EXISTS public.study_music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_key text UNIQUE NOT NULL,
  label text NOT NULL,
  prompt text NOT NULL,
  storage_path text,
  duration_seconds integer DEFAULT 120,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.study_music_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read study music tracks" ON public.study_music_tracks FOR SELECT USING (true);