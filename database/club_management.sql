-- Additive club manager MVP. Existing reservations and prices are preserved.
alter table public.clubs add column is_demo boolean not null default false;
update public.clubs set is_demo=true where slug in ('demo-bosque','demo-parque','demo-cordillera');
alter table public.courts add column custom_hours boolean not null default false;
alter table public.reservations add column customer_label text;
alter table public.reservations add column quoted_amount numeric(12,2) check(quoted_amount>=0);
alter table public.reservations add column quoted_currency text check(quoted_currency ~ '^[A-Z]{3}$');
alter table public.reservations add column quote_details jsonb;
alter table public.court_blocks alter column created_by_user_id drop not null;
alter table public.court_blocks add column demo_source boolean not null default false;
alter table public.court_blocks add column observation text;
alter table public.court_blocks add constraint blocks_actor check(created_by_user_id is not null or demo_source);

create table public.court_operating_windows(
 id uuid primary key default gen_random_uuid(),court_id uuid not null references public.courts(id) on delete cascade,
 weekday smallint not null check(weekday between 0 and 6),
 start_min integer not null check(start_min>=0 and start_min<1440 and start_min%30=0),
 end_min integer not null check(end_min%30=0),
 check(end_min>start_min and end_min<=start_min+1440),
 unique(court_id,weekday,start_min)
);
create table public.rate_plans(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),
 alias text not null check(length(trim(alias)) between 1 and 80),amount numeric(12,2) not null check(amount>=0),
 currency text not null default 'CLP' check(currency ~ '^[A-Z]{3}$'),is_active boolean not null default true,
 is_default boolean not null default false,description text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(club_id,alias),unique(id,club_id),check(not is_default or is_active)
);
create unique index rate_default_club on public.rate_plans(club_id) where is_default;
-- Composite FK guarantees the court and rate plan belong to the same club.
alter table public.courts add constraint court_id_club_unique unique(id,club_id);
create table public.court_rate_schedules(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),
 court_id uuid not null,rate_plan_id uuid not null,
 weekday smallint not null check(weekday between 0 and 6),
 start_min integer not null check(start_min>=0 and start_min<1440 and start_min%30=0),
 end_min integer not null check(end_min%30=0),check(end_min>start_min and end_min<=1440),
 foreign key(court_id,club_id) references public.courts(id,club_id) on delete cascade,
 foreign key(rate_plan_id,club_id) references public.rate_plans(id,club_id) on delete restrict,
 exclude using gist(court_id with =,weekday with =,int4range(start_min,end_min,'[)') with &&)
);
create table public.court_rate_overrides(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),
 court_id uuid not null,rate_plan_id uuid not null,
 date_from date not null,date_to date not null check(date_to>=date_from),
 weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
 start_min integer not null check(start_min>=0 and start_min<1440 and start_min%30=0),
 end_min integer not null check(end_min>start_min and end_min<=1440 and end_min%30=0),
 priority integer not null default 100,
 created_at timestamptz not null default now(),
 foreign key(court_id,club_id) references public.courts(id,club_id) on delete cascade,
 foreign key(rate_plan_id,club_id) references public.rate_plans(id,club_id),
 check(cardinality(weekdays)>0 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);
create index overrides_court_dates on public.court_rate_overrides(court_id,date_from,date_to);
create index schedules_rate on public.court_rate_schedules(rate_plan_id);
create index overrides_rate on public.court_rate_overrides(rate_plan_id);
create index schedules_club on public.court_rate_schedules(club_id);
create index overrides_club on public.court_rate_overrides(club_id);
create trigger rate_touch before update on public.rate_plans for each row execute function private.touch_updated_at();

-- Private expiring capability: the raw value only exists on the local server.
create table private.manager_capabilities(token_hash text primary key,expires_at timestamptz not null);
alter table private.manager_capabilities enable row level security;
revoke all on private.manager_capabilities from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['court_operating_windows','rate_plans','court_rate_schedules','court_rate_overrides'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('create policy manager_no_direct_access on public.%I for all to anon,authenticated using(false) with check(false)',t);
 end loop;
end $$;

create function private.validate_window() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.court_id::text,0));
 if exists(select 1 from public.court_operating_windows w cross join (values(-10080),(0),(10080)) shift(n)
 where w.court_id=new.court_id and w.id<>new.id and
 int4range(w.weekday*1440+w.start_min+shift.n,w.weekday*1440+w.end_min+shift.n,'[)') &&
 int4range(new.weekday*1440+new.start_min,new.weekday*1440+new.end_min,'[)')) then
 raise exception 'Las ventanas se superponen, incluso después de medianoche.' using errcode='23P01'; end if;
 return new;
end $$;
create trigger validate_windows before insert or update on public.court_operating_windows for each row execute function private.validate_window();

-- Includes the preceding day's overnight tail. No available slots are stored.
create function private.operating_periods(p_court uuid,p_date date) returns setof tstzrange
language sql stable set search_path='' as $$
 select tstzrange((d.day::date+w.start_min*interval '1 minute') at time zone cl.timezone,
                 (d.day::date+w.end_min*interval '1 minute') at time zone cl.timezone,'[)')
 from public.courts ct join public.clubs cl on cl.id=ct.club_id
 cross join lateral (values(p_date),(p_date-1)) d(day)
 join public.court_operating_windows w on w.court_id=ct.id and w.weekday=extract(isodow from d.day)::int-1
 where ct.id=p_court and ct.custom_hours
 union all
 select tstzrange((p_date+h.opens_at) at time zone cl.timezone,(p_date+h.closes_at) at time zone cl.timezone,'[)')
 from public.courts ct join public.clubs cl on cl.id=ct.club_id
 join public.club_opening_hours h on h.club_id=ct.club_id and h.weekday=extract(isodow from p_date)::int-1
 where ct.id=p_court and not ct.custom_hours;
$$;

create function private.quote_court(p_court uuid,p_start timestamptz,p_minutes int) returns jsonb
language plpgsql stable set search_path='' as $$
declare cl uuid;tz text;t timestamptz;l timestamp;rp public.rate_plans;total numeric:=0;cur text;items jsonb:='[]';n int;
begin
 select c.club_id,b.timezone into cl,tz from public.courts c join public.clubs b on b.id=c.club_id where c.id=p_court;
 if not found or p_start is null or p_minutes is null or p_minutes<30 or p_minutes>180 or p_minutes%30<>0 then raise exception 'Duración o cancha inválida.'; end if;
 for n in 0..(p_minutes/30-1) loop
 t:=p_start+n*interval '30 minutes';l:=t at time zone tz;
 select r.* into rp from public.court_rate_overrides o join public.rate_plans r on r.id=o.rate_plan_id
 where o.court_id=p_court and r.is_active and l::date between o.date_from and o.date_to
 and (extract(isodow from l)::int-1)=any(o.weekdays)
 and (extract(hour from l)*60+extract(minute from l))>=o.start_min
 and (extract(hour from l)*60+extract(minute from l))+30<=o.end_min
 order by o.priority desc,o.date_from desc,o.created_at desc,o.id desc limit 1;
 if not found then
 select r.* into rp from public.court_rate_schedules s join public.rate_plans r on r.id=s.rate_plan_id
 where s.court_id=p_court and r.is_active and s.weekday=extract(isodow from l)::int-1
 and (extract(hour from l)*60+extract(minute from l))>=s.start_min
 and (extract(hour from l)*60+extract(minute from l))+30<=s.end_min limit 1;
 end if;
 if not found then select r.* into rp from public.rate_plans r where r.club_id=cl and r.is_default and r.is_active;end if;
 if rp.id is null then return jsonb_build_object('amount',null,'currency',null,'complete',false,'blocks',items);end if;
 if cur is not null and cur<>rp.currency then raise exception 'La reserva mezcla monedas incompatibles.';end if;
 cur:=rp.currency;total:=total+rp.amount;
 items:=items||jsonb_build_array(jsonb_build_object('start_at',t,'rate_id',rp.id,'alias',rp.alias,'amount',rp.amount,'currency',rp.currency));
 end loop;
 return jsonb_build_object('amount',total,'currency',cur,'complete',true,'blocks',items);
end $$;

create or replace function private.prepare_reservation_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare tz text;cs text;active bool;q jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.court_id::text,0));
 -- Terminal updates must remain possible after court/club deactivation.
 if new.status not in ('PENDING','CONFIRMED') then return new;end if;
 select cl.timezone,c.status::text,cl.is_active into tz,cs,active from public.courts c join public.clubs cl on cl.id=c.club_id where c.id=new.court_id;
 if cs is distinct from 'ACTIVE' or not active then raise exception 'La cancha o el club no está activo.' using errcode='23514';end if;
 update public.reservations set status='EXPIRED',updated_at=now() where court_id=new.court_id and status='PENDING' and expires_at<=now() and id<>new.id;
 if new.status='PENDING' and (new.expires_at is null or new.expires_at<=now()) then raise exception 'El hold debe vencer en el futuro.';end if;
 if date_trunc('minute',new.start_at at time zone tz)<>new.start_at at time zone tz
 or extract(minute from new.start_at at time zone tz)::int not in (0,30) then raise exception 'El inicio debe ser :00 o :30 en hora local.' using errcode='23514';end if;
 if not exists(select 1 from private.operating_periods(new.court_id,(new.start_at at time zone tz)::date) p where p @> tstzrange(new.start_at,new.end_at,'[)')) then raise exception 'La reserva queda fuera de las ventanas de utilización.' using errcode='23514';end if;
 if exists(select 1 from public.court_blocks b where b.court_id=new.court_id and b.block_period && tstzrange(new.start_at,new.end_at,'[)')) then raise exception 'Hay un bloqueo administrativo en este período.' using errcode='23P01';end if;
 if tg_op='INSERT' then
 q:=private.quote_court(new.court_id,new.start_at,(extract(epoch from(new.end_at-new.start_at))/60)::int);
 new.quoted_amount:=(q->>'amount')::numeric;new.quoted_currency:=q->>'currency';new.quote_details:=q;
 end if;
 return new;
end $$;

-- Snapshot amount/currency/line items cannot be rewritten by later edits.
create function private.protect_quote() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.quoted_amount,new.quoted_currency,new.quote_details) is distinct from (old.quoted_amount,old.quoted_currency,old.quote_details)
 or (new.court_id,new.start_at,new.end_at) is distinct from(old.court_id,old.start_at,old.end_at) then raise exception 'La cotización y el intervalo histórico son inmutables; cancela y crea otra reserva.';end if;
 return new;
end $$;
create trigger reservation_quote_immutable before update on public.reservations for each row execute function private.protect_quote();

create function private.calendar(p_club uuid,p_date date) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('court_id',ct.id,'start_at',s.t,'end_at',s.t+interval '30 minutes',
 'local_time',to_char(s.t at time zone cl.timezone,'HH24:MI'),
 'reservation_id',r.id,'block_id',b.id,
 'state',case when ct.status<>'ACTIVE' or not cl.is_active then 'CLOSED' when b.id is not null then 'BLOCKED'
 when r.id is not null then case when r.status='PENDING' then 'PENDING' else 'RESERVED' end
 when exists(select 1 from private.operating_periods(ct.id,p_date) p where p @> tstzrange(s.t,s.t+interval '30 minutes','[)')) then 'AVAILABLE' else 'CLOSED' end) order by s.t,ct.court_number),'[]')
 from public.clubs cl join public.courts ct on ct.club_id=cl.id
 cross join lateral generate_series(p_date::timestamp at time zone cl.timezone,(p_date+1)::timestamp at time zone cl.timezone-interval '30 minutes',interval '30 minutes') s(t)
 left join lateral(select rr.id,rr.status from public.reservations rr where rr.court_id=ct.id and (rr.status='CONFIRMED' or(rr.status='PENDING' and rr.expires_at>now())) and rr.booking_period && tstzrange(s.t,s.t+interval '30 minutes','[)') limit 1) r on true
 left join lateral(select bb.id from public.court_blocks bb where bb.court_id=ct.id and bb.block_period && tstzrange(s.t,s.t+interval '30 minutes','[)') limit 1)b on true
 where cl.id=p_club;
$$;

create or replace function public.court_availability(p_club uuid,p_date date,p_minutes int default 60)
returns table(court_id uuid,start_at timestamptz,end_at timestamptz,local_time text,availability text)
language plpgsql security definer set search_path='' as $$
declare tz text;
begin
 select timezone into tz from public.clubs where id=p_club and is_active;
 if tz is null or p_date is null or p_date<(now() at time zone tz)::date or p_date>(now() at time zone tz)::date+30 or p_minutes is null or p_minutes not between 30 and 180 or p_minutes%30<>0 then raise exception 'Fecha o duración inválida.';end if;
 return query select ct.id,s.t,s.t+make_interval(mins=>p_minutes),to_char(s.t at time zone tz,'HH24:MI'),
 case when exists(select 1 from public.court_blocks b where b.court_id=ct.id and b.block_period && tstzrange(s.t,s.t+make_interval(mins=>p_minutes),'[)')) then 'BLOCKED'
 when exists(select 1 from public.reservations r where r.court_id=ct.id and(r.status='CONFIRMED' or(r.status='PENDING' and r.expires_at>now())) and r.booking_period && tstzrange(s.t,s.t+make_interval(mins=>p_minutes),'[)')) then 'RESERVED' else 'AVAILABLE' end
 from public.courts ct cross join lateral private.operating_periods(ct.id,p_date) p
 cross join lateral generate_series(greatest(lower(p),p_date::timestamp at time zone tz),least(upper(p)-make_interval(mins=>p_minutes),(p_date+1)::timestamp at time zone tz-interval '30 minutes'),interval '30 minutes') s(t)
 where ct.club_id=p_club and ct.status='ACTIVE' and s.t>now() order by ct.court_number,s.t;
end $$;

create function public.reservation_quote(p_court uuid,p_start timestamptz,p_minutes int) returns jsonb
language sql security definer set search_path='' as $$select private.quote_court(p_court,p_start,p_minutes)$$;
revoke all on function public.reservation_quote(uuid,timestamptz,int) from public;
grant execute on function public.reservation_quote(uuid,timestamptz,int) to anon,authenticated;
