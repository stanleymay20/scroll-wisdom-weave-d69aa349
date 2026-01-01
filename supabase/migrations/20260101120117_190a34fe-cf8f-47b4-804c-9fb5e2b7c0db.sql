-- Add user_locked and content_ownership columns to chapters table
ALTER TABLE public.chapters 
ADD COLUMN IF NOT EXISTS user_locked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_ai_content text,
ADD COLUMN IF NOT EXISTS content_ownership jsonb DEFAULT '{"isUserAuthored": false, "isAIGenerated": true, "isHybrid": false, "differencePercentage": 0}'::jsonb;

-- Add index for efficient querying of user-locked chapters
CREATE INDEX IF NOT EXISTS idx_chapters_user_locked ON public.chapters(user_locked) WHERE user_locked = true;

-- Add comment for documentation
COMMENT ON COLUMN public.chapters.user_locked IS 'True when user has pasted/edited content significantly, blocking full regeneration';
COMMENT ON COLUMN public.chapters.last_ai_content IS 'Stores the last AI-generated content for comparison when detecting user modifications';
COMMENT ON COLUMN public.chapters.content_ownership IS 'JSON tracking whether content is user-authored, AI-generated, or hybrid';