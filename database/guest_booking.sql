-- Prototype guest booking. No synthetic auth.users account is created.
alter table public.reservations alter column booked_by_user_id drop not null;
alter table public.reservations add column guest_id uuid;
alter table public.reservations add constraint reservation_identity check (
  (booked_by_user_id is not null)::int + (guest_id is not null)::int = 1
);
create index reservations_guest_start_idx on public.reservations(guest_id,start_at) where guest_id is not null;

grant select on public.clubs, public.courts, public.club_opening_hours to anon;
create policy clubs_public_catalog on public.clubs for select to anon using(is_active);
create policy courts_public_catalog on public.courts for select to anon using(exists(select 1 from public.clubs c where c.id=club_id and c.is_active));
create policy hours_public_catalog on public.club_opening_hours for select to anon using(exists(select 1 from public.clubs c where c.id=club_id and c.is_active));

-- Only occupancy is public, never the identity or reservation identifier.
create function public.court_availability(p_club uuid,p_date date,p_minutes integer default 60)
returns table(court_id uuid,start_at timestamptz,end_at timestamptz,local_time text,availability text)
language plpgsql security definer set search_path='' as $$
begin
 if p_minutes is null or p_minutes<30 or p_minutes>180 or p_minutes%30<>0 then raise exception 'La duración debe ser de 30 a 180 minutos, en bloques de 30.' using errcode='22023'; end if;
 if p_date is null or not exists(select 1 from public.clubs c where c.id=p_club and c.is_active and p_date between (now() at time zone c.timezone)::date and (now() at time zone c.timezone)::date+30) then raise exception 'Selecciona una fecha dentro de los próximos 30 días.' using errcode='22023'; end if;
 return query
 select ct.id,s.t,s.t+make_interval(mins=>p_minutes),to_char(s.t at time zone cl.timezone,'HH24:MI'),
 case when ct.status<>'ACTIVE' or exists(select 1 from public.court_blocks b where b.court_id=ct.id and b.block_period && tstzrange(s.t,s.t+make_interval(mins=>p_minutes),'[)')) then 'BLOCKED'
 when exists(select 1 from public.reservations r where r.court_id=ct.id and (r.status='CONFIRMED' or(r.status='PENDING' and r.expires_at>now())) and r.booking_period && tstzrange(s.t,s.t+make_interval(mins=>p_minutes),'[)')) then 'RESERVED'
 else 'AVAILABLE' end
 from public.clubs cl join public.courts ct on ct.club_id=cl.id
 join public.club_opening_hours h on h.club_id=cl.id and h.weekday=extract(isodow from p_date)::int-1
 cross join lateral generate_series((p_date+h.opens_at) at time zone cl.timezone,((p_date+h.closes_at) at time zone cl.timezone)-make_interval(mins=>p_minutes),interval '30 minutes') s(t)
 where cl.id=p_club and cl.is_active and s.t>now()
 order by ct.court_number,s.t;
end $$;

-- Intentionally public, narrowly scoped write API. Tables remain unwritable.
create function public.reserve_guest(p_court uuid,p_start timestamptz,p_minutes integer,p_guest uuid)
returns table(reservation_id uuid,start_at timestamptz,end_at timestamptz,status text)
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_end timestamptz; v_timezone text;
begin
 if p_guest is null or p_start is null or p_minutes is null or p_minutes<30 or p_minutes>180 or p_minutes%30<>0 then raise exception 'Reserva inválida: selecciona entre 30 minutos y 3 horas.' using errcode='22023'; end if;
 select cl.timezone into v_timezone from public.courts ct join public.clubs cl on cl.id=ct.club_id where ct.id=p_court and cl.is_active;
 if not found or p_start<=now() or (p_start at time zone v_timezone)::date>(now() at time zone v_timezone)::date+30 then raise exception 'La fecha de reserva no es válida.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_guest::text,1));
 if (select count(*) from public.reservations r where r.guest_id=p_guest and r.status='CONFIRMED' and r.end_at>now())>=5 then raise exception 'Puedes mantener hasta cinco reservas futuras en este prototipo.' using errcode='22023'; end if;
 v_end:=p_start+make_interval(mins=>p_minutes);
 insert into public.reservations(court_id,guest_id,start_at,end_at,status) values(p_court,p_guest,p_start,v_end,'CONFIRMED') returning id into v_id;
 return query select v_id,p_start,v_end,'CONFIRMED'::text;
exception when exclusion_violation then raise exception 'Ese horario acaba de ser reservado. Elige otro horario.' using errcode='23P01';
end $$;
revoke all on function public.court_availability(uuid,date,integer),public.reserve_guest(uuid,timestamptz,integer,uuid) from public,anon,authenticated;
grant execute on function public.court_availability(uuid,date,integer),public.reserve_guest(uuid,timestamptz,integer,uuid) to anon,authenticated;
comment on function public.reserve_guest(uuid,timestamptz,integer,uuid) is 'Public prototype guest booking API. Requires abuse protection before public production launch.';
