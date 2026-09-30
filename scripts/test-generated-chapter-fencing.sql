\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  u uuid := '00000000-0000-4000-a000-00000000fe01';
  other_u uuid := '00000000-0000-4000-a000-00000000fe02';
  b uuid; c uuid; j uuid; cat text;
  token_a uuid := gen_random_uuid(); token_b uuid := gen_random_uuid();
  body text;
BEGIN
  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
  VALUES (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fence@example.test','x',now(),now(),now(),'{}','{}');
  SELECT e.enumlabel INTO cat FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='book_category' ORDER BY e.enumsortorder LIMIT 1;
  INSERT INTO public.books(title,category,creator_id,user_id) VALUES('fence fixture',cat::public.book_category,u,u) RETURNING id INTO b;
  INSERT INTO public.chapters(book_id,chapter_number,title,content,is_generated) VALUES(b,1,'one','outline',false) RETURNING id INTO c;
  INSERT INTO public.generation_jobs(user_id,book_id,status,total_chapters) VALUES(u,b,'generating',1) RETURNING id INTO j;

  IF has_function_privilege('anon','public.save_generated_chapter_fenced(uuid,uuid,text,jsonb,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.save_generated_chapter_fenced(uuid,uuid,text,jsonb,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'browser roles can execute fenced service writer';
  END IF;
  IF NOT public.claim_generation_job_step(j,token_a,300) THEN RAISE EXCEPTION 'claim failed'; END IF;
  IF public.claim_generation_job_step(j,token_b,300) THEN RAISE EXCEPTION 'duplicate claim succeeded'; END IF;

  -- A newer editor revision must survive the older provider response.
  UPDATE public.chapters SET content='editor revision' WHERE id=c;
  IF public.save_generated_chapter_fenced(c,u,'outline','{"content":"stale provider"}',j,token_a) THEN RAISE EXCEPTION 'overwrote newer revision'; END IF;
  UPDATE public.chapters SET content='outline' WHERE id=c;
  UPDATE public.generation_jobs SET worker_lease_until=now()-interval '1 second' WHERE id=j;
  IF public.save_generated_chapter_fenced(c,u,'outline','{"content":"expired worker"}',j,token_a) THEN RAISE EXCEPTION 'expired worker saved'; END IF;
  IF NOT public.claim_generation_job_step(j,token_b,300) THEN RAISE EXCEPTION 'retry claim failed'; END IF;
  IF public.save_generated_chapter_fenced(c,u,'outline','{"content":"old token"}',j,token_a) THEN RAISE EXCEPTION 'old worker saved'; END IF;
  IF public.save_generated_chapter_fenced(c,other_u,'outline','{"content":"wrong owner"}',j,token_b) THEN RAISE EXCEPTION 'owner spoof saved'; END IF;
  IF NOT public.save_generated_chapter_fenced(c,u,'outline','{"content":"current worker","word_count":2}',j,token_b) THEN RAISE EXCEPTION 'current owner worker could not save'; END IF;
  IF public.save_generated_chapter_fenced(c,u,'current worker','{"content":"duplicate"}',j,token_b) THEN RAISE EXCEPTION 'duplicate invocation overwrote generated chapter'; END IF;
  IF public.save_generated_chapter_fenced(c,other_u,'current worker','{"content":"horizontal attack"}') THEN RAISE EXCEPTION 'unauthorized direct caller saved'; END IF;
  SELECT content INTO body FROM public.chapters WHERE id=c;
  IF body <> 'current worker' THEN RAISE EXCEPTION 'content was lost'; END IF;
END;
$$;
ROLLBACK;
