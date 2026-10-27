-- Backwards-compatible wrapper; legacy reserve_guest signature is preserved.
create function public.reserve_guest_priced(p_court uuid,p_start timestamptz,p_minutes int,p_guest uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare booking record;result jsonb;
begin
 select * into booking from public.reserve_guest(p_court,p_start,p_minutes,p_guest);
 select jsonb_build_array(jsonb_build_object('reservation_id',r.id,'start_at',r.start_at,'end_at',r.end_at,'status',r.status,'quoted_amount',r.quoted_amount,'quoted_currency',r.quoted_currency)) into result from public.reservations r where r.id=booking.reservation_id;
 return result;
end $$;
revoke all on function public.reserve_guest_priced(uuid,timestamptz,int,uuid) from public,anon,authenticated;
grant execute on function public.reserve_guest_priced(uuid,timestamptz,int,uuid) to anon,authenticated;
