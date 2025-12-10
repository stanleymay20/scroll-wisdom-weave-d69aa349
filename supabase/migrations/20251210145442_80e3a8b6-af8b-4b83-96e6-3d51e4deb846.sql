-- Add additional profile fields for user preferences
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS learning_preferences JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_voice_preference TEXT DEFAULT 'natural',
ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'dark',
ADD COLUMN IF NOT EXISTS font_size TEXT DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS reader_theme TEXT DEFAULT 'default',
ADD COLUMN IF NOT EXISTS tts_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS animations_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_updates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS new_book_alerts BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS course_reminders BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS writing_tone TEXT DEFAULT 'scholarly',
ADD COLUMN IF NOT EXISTS spiritual_strictness TEXT DEFAULT 'balanced',
ADD COLUMN IF NOT EXISTS complexity_level TEXT DEFAULT 'intermediate',
ADD COLUMN IF NOT EXISTS study_speed TEXT DEFAULT 'normal';

-- Create FAQ table for help/support pages
CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  order_index INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Anyone can view published FAQs
CREATE POLICY "Anyone can view published FAQs" 
ON public.faqs 
FOR SELECT 
USING (is_published = true);

-- Create contact_submissions table for support
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Users can create contact submissions
CREATE POLICY "Anyone can create contact submissions" 
ON public.contact_submissions 
FOR INSERT 
WITH CHECK (true);

-- Users can view their own submissions
CREATE POLICY "Users can view their own submissions" 
ON public.contact_submissions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Insert initial FAQ data
INSERT INTO public.faqs (question, answer, category, order_index) VALUES
('What is ScrollLibrary?', 'ScrollLibrary™ is an AI-powered book generation platform that creates comprehensive, scroll-aligned books across theology, science, business, medicine, law, history, and more. Each book features 6-30 chapters with a minimum of 8,000 words per chapter.', 'general', 1),
('How does AI book generation work?', 'Our multi-agent AI system (ScrollResearchGPT, ScrollAuthorGPT, ScrollEditorGPT, ScrollProphetGPT) works together to generate deeply researched, well-structured content that maintains academic rigor while ensuring scroll alignment.', 'generation', 2),
('What export formats are available?', 'You can export your generated books in PDF, EPUB, DOCX (RTF), and Markdown formats. All formats include proper metadata, chapter formatting, and table of contents.', 'export', 3),
('Can I sell books generated on ScrollLibrary?', 'Yes! All books generated on ScrollLibrary are yours to keep, publish, and sell. You retain full rights to your generated content.', 'rights', 4),
('How long does it take to generate a book?', 'Book outline generation takes about 30-60 seconds. Each chapter (8,000+ words) takes approximately 2-5 minutes to generate depending on complexity.', 'generation', 5),
('Is my content secure?', 'Yes, all your books are stored securely in your personal library. Only you can access your saved books unless you choose to publish them.', 'security', 6);