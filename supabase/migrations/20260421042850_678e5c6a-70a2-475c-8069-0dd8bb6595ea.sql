-- Activate the 4 previously-pending tracks now that their MP3s are uploaded
UPDATE public.study_music_tracks
SET storage_path = track_key || '.mp3',
    status = 'ready',
    duration_seconds = COALESCE(duration_seconds, 3600)
WHERE track_key IN ('beethoven-moonlight', 'chopin-nocturne', 'lofi-study', 'ambient-focus');

-- Add the new Christian Study Mix track
INSERT INTO public.study_music_tracks (track_key, label, prompt, storage_path, status, duration_seconds)
VALUES
  ('christian-study', 'christian-study', 'Late night Christian study background music', 'christian-study.mp3', 'ready', 7200)
ON CONFLICT (track_key) DO UPDATE
SET storage_path = EXCLUDED.storage_path,
    status = 'ready',
    duration_seconds = EXCLUDED.duration_seconds;