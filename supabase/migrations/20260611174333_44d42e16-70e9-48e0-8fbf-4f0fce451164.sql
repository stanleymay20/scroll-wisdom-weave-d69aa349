-- Storage policies for creator-assets bucket.
-- Path convention: <creator_user_id>/<asset_id>/<filename>
create policy "Creators read own asset files"
  on storage.objects for select to authenticated
  using (bucket_id = 'creator-assets' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "Creators upload own asset files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'creator-assets' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "Creators update own asset files"
  on storage.objects for update to authenticated
  using (bucket_id = 'creator-assets' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "Creators delete own asset files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'creator-assets' and (auth.uid())::text = (storage.foldername(name))[1]);

-- Emit asset_created / asset_published / asset_paused / asset_archived events.
create or replace function public.emit_creator_asset_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.creator_business_events (creator_user_id, asset_id, event_type, metadata)
    values (new.creator_user_id, new.id, 'asset_created',
            jsonb_build_object('asset_type', new.asset_type, 'status', new.status));
    if new.status = 'live' then
      insert into public.creator_business_events (creator_user_id, asset_id, event_type, metadata)
      values (new.creator_user_id, new.id, 'asset_published',
              jsonb_build_object('asset_type', new.asset_type));
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'live' then
      insert into public.creator_business_events (creator_user_id, asset_id, event_type, metadata)
      values (new.creator_user_id, new.id, 'asset_published',
              jsonb_build_object('asset_type', new.asset_type, 'previous_status', old.status));
    elsif new.status = 'paused' then
      insert into public.creator_business_events (creator_user_id, asset_id, event_type, metadata)
      values (new.creator_user_id, new.id, 'asset_paused',
              jsonb_build_object('asset_type', new.asset_type, 'previous_status', old.status));
    elsif new.status = 'archived' then
      insert into public.creator_business_events (creator_user_id, asset_id, event_type, metadata)
      values (new.creator_user_id, new.id, 'asset_archived',
              jsonb_build_object('asset_type', new.asset_type, 'previous_status', old.status));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_creator_assets_emit_event on public.creator_assets;
create trigger trg_creator_assets_emit_event
  after insert or update on public.creator_assets
  for each row execute function public.emit_creator_asset_event();
