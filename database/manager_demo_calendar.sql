-- Examples only on demo clubs. No payments are fabricated.
insert into public.reservations(court_id,guest_id,customer_label,start_at,end_at,status)
select ct.id,gen_random_uuid(),'Reserva ejemplo · Demo',t.st,t.st+interval '90 minutes','CONFIRMED'
from public.clubs c join public.courts ct on ct.club_id=c.id and ct.court_number=1
cross join lateral(select (((now() at time zone c.timezone)::date+1)+time '10:00') at time zone c.timezone as st)t
where c.is_demo and not exists(select 1 from public.reservations r where r.court_id=ct.id and r.booking_period && tstzrange(t.st,t.st+interval '90 minutes','[)'));
insert into public.court_blocks(court_id,start_at,end_at,reason,observation,demo_source)
select ct.id,t.st,t.st+interval '2 hours','MAINTENANCE','Bloqueo de ejemplo · Demo',true
from public.clubs c join public.courts ct on ct.club_id=c.id and ct.court_number=2
cross join lateral(select (((now() at time zone c.timezone)::date+1)+time '15:00') at time zone c.timezone as st)t
where c.is_demo and not exists(select 1 from public.court_blocks b where b.court_id=ct.id and b.block_period && tstzrange(t.st,t.st+interval '2 hours','[)')) and not exists(select 1 from public.reservations r where r.court_id=ct.id and r.status='CONFIRMED' and r.booking_period && tstzrange(t.st,t.st+interval '2 hours','[)'));
