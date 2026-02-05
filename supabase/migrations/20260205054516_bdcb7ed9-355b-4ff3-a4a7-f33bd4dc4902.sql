-- Transfer all books from old admin to new user account (bypass RLS)
UPDATE public.books 
SET creator_id = '607b86cf-c9cd-4ce3-bf4a-e60e6da09fcf'
WHERE creator_id = '39003e95-8f10-4dd4-a513-862fdd928dd1';

-- Transfer all library entries from old admin to new user
UPDATE public.user_library 
SET user_id = '607b86cf-c9cd-4ce3-bf4a-e60e6da09fcf'
WHERE user_id = '39003e95-8f10-4dd4-a513-862fdd928dd1';

-- Grant admin role to new user account
INSERT INTO public.user_roles (user_id, role) 
VALUES ('607b86cf-c9cd-4ce3-bf4a-e60e6da09fcf', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Update profile for new account
UPDATE public.profiles 
SET plan = 'prophet_tier', full_name = 'Stanley May'
WHERE id = '607b86cf-c9cd-4ce3-bf4a-e60e6da09fcf';