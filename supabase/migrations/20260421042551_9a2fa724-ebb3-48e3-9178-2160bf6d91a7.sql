-- Mark uploaded tracks as ready
UPDATE public.study_music_tracks
SET storage_path = track_key || '.mp3',
    status = 'ready',
    duration_seconds = COALESCE(duration_seconds, 3600)
WHERE track_key IN (
  'jazz-cafe', 'bach-cello-suite', 'symphony-adagio', 'vivaldi-seasons',
  'debussy-clair-de-lune', 'forest-morning', 'spa-meditation', 'rain-piano'
);

-- Add the two new tracks (rainy-forest-pomodoro, forest-ambience)
INSERT INTO public.study_music_tracks (track_key, label, prompt, storage_path, status, duration_seconds)
VALUES
  ('rainy-forest-pomodoro', 'rainy-forest-pomodoro', 'Rainy forest pomodoro ambience', 'rainy-forest-pomodoro.mp3', 'ready', 7200),
  ('forest-ambience', 'forest-ambience', 'Calm morning forest ambience', 'forest-ambience.mp3', 'ready', 3600)
ON CONFLICT (track_key) DO UPDATE
SET storage_path = EXCLUDED.storage_path,
    status = 'ready',
    duration_seconds = EXCLUDED.duration_seconds;

-- Reset the 4 still-missing tracks to a clean pending state
UPDATE public.study_music_tracks
SET status = 'pending', storage_path = NULL
WHERE track_key IN ('beethoven-moonlight', 'chopin-nocturne', 'lofi-study', 'ambient-focus');

-- Remove the test row
DELETE FROM public.study_music_tracks WHERE track_key = 'test-key-check';