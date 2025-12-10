-- Create categories enum
CREATE TYPE public.book_category AS ENUM (
  'theology',
  'prophecy',
  'science',
  'technology',
  'business',
  'finance',
  'economics',
  'medicine',
  'law',
  'governance',
  'history',
  'african_studies',
  'culture',
  'philosophy',
  'arts',
  'fiction',
  'non_fiction',
  'poetry'
);

-- Create user plan enum
CREATE TYPE public.user_plan AS ENUM ('free', 'premium', 'prophet_tier');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  plan user_plan DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create books table
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category book_category NOT NULL,
  cover_image_url TEXT,
  author_ai_agent TEXT DEFAULT 'ScrollAuthorGPT',
  total_chapters INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on books
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Books are public for reading
CREATE POLICY "Anyone can view published books" ON public.books
  FOR SELECT USING (is_published = true);

-- Create chapters table
CREATE TABLE public.chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  word_count INTEGER DEFAULT 0,
  is_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(book_id, chapter_number)
);

-- Enable RLS on chapters
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- Chapters are public for reading if book is published
CREATE POLICY "Anyone can view chapters of published books" ON public.chapters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.books 
      WHERE books.id = chapters.book_id 
      AND books.is_published = true
    )
  );

-- Create user_library table (saved books)
CREATE TABLE public.user_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  last_read_chapter INTEGER DEFAULT 1,
  progress_percent INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

-- Enable RLS on user_library
ALTER TABLE public.user_library ENABLE ROW LEVEL SECURITY;

-- User library policies
CREATE POLICY "Users can view their library" ON public.user_library
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add to library" ON public.user_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their library" ON public.user_library
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can remove from library" ON public.user_library
  FOR DELETE USING (auth.uid() = user_id);

-- Create highlights table
CREATE TABLE public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE NOT NULL,
  excerpt TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on highlights
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

-- Highlights policies
CREATE POLICY "Users can view their highlights" ON public.highlights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create highlights" ON public.highlights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their highlights" ON public.highlights
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;

-- Create trigger for auto-creating profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_chapters_updated_at
  BEFORE UPDATE ON public.chapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();