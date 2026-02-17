-- Add comic_metadata column to chapters table for storing comic panel data
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS comic_metadata jsonb DEFAULT NULL;