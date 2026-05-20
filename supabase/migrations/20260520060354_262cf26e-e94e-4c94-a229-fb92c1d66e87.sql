
ALTER TABLE public.public_listings
  ADD CONSTRAINT public_listings_book_id_fkey
  FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;
