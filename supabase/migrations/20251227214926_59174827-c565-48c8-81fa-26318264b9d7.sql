-- Add book type fields for workbook and comic generation
ALTER TABLE public.books 
ADD COLUMN IF NOT EXISTS workbook_density text,
ADD COLUMN IF NOT EXISTS comic_style_id text,
ADD COLUMN IF NOT EXISTS palette_hint text,
ADD COLUMN IF NOT EXISTS line_weight_hint text,
ADD COLUMN IF NOT EXISTS character_sheet jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS layout_template integer DEFAULT 5;

-- Add comments for documentation
COMMENT ON COLUMN public.books.workbook_density IS 'Workbook interactive density: low, medium, high';
COMMENT ON COLUMN public.books.comic_style_id IS 'Comic style preset: modern_superhero, african_superhero, manga, children_book, graphic_novel';
COMMENT ON COLUMN public.books.palette_hint IS 'Color palette hint for comic generation';
COMMENT ON COLUMN public.books.line_weight_hint IS 'Line weight style for comic generation';
COMMENT ON COLUMN public.books.character_sheet IS 'JSON object with character consistency data';
COMMENT ON COLUMN public.books.layout_template IS 'Number of panels per page for comics (3-6)';