
-- Add suspicious input detection and coding exercise fields to learning_progress
ALTER TABLE public.learning_progress 
  ADD COLUMN IF NOT EXISTS suspicious_input_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coding_pass_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS execution_error text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS integrity_flags jsonb DEFAULT '{}'::jsonb;

-- Add institutional_mode to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institutional_mode boolean DEFAULT false;
