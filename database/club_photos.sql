-- Small, optimized club covers for the experimental manager. No anonymous writes.
create function private.valid_club_photo(value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare bytes bytea;
begin
 if value is null then return true;end if;
 if length(value)>60023 or value !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' then return false;end if;
 bytes:=decode(split_part(value,',',2),'base64');
 return octet_length(bytes) between 4 and 45000
 and substring(bytes from 1 for 3)=decode('ffd8ff','hex')
 and substring(bytes from octet_length(bytes)-1 for 2)=decode('ffd9','hex');
exception when others then return false;
end $$;
revoke all on function private.valid_club_photo(text) from public,anon,authenticated;
alter table public.clubs add column photo_data_url text;
alter table public.clubs add constraint clubs_photo_valid check(private.valid_club_photo(photo_data_url));
comment on column public.clubs.photo_data_url is 'Single optimized JPEG cover, max 45 KB decoded. Public photo, written only through protected demo manager.';
CREATE OR REPLACE FUNCTION public.manager_gateway(p_token text, p_action text, p_club uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.clubs;ct public.courts;rid uuid;cid uuid;d int;w jsonb;x jsonb;old public.court_rate_schedules;
 rp public.rate_plans;st timestamptz;en timestamptz;n int;sm int;em int;ids uuid[];days int[];
begin
 if p_token is null or not exists(select 1 from private.manager_capabilities where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now()) then raise exception 'Sesión de gestión no autorizada o vencida.' using errcode='42501';end if;
 if p_action='clubs' then
 return(select coalesce(jsonb_agg(to_jsonb(cl)||jsonb_build_object('courts',(select coalesce(jsonb_agg(to_jsonb(cc) order by cc.court_number),'[]') from public.courts cc where cc.club_id=cl.id)) order by cl.name),'[]') from public.clubs cl);
 end if;
 select * into c from public.clubs where id=p_club;
 if not found then raise exception 'Club inexistente.';end if;
 if p_action='snapshot' then
 return jsonb_build_object('club',to_jsonb(c),
 'courts',(select coalesce(jsonb_agg(to_jsonb(t) order by t.court_number),'[]') from public.courts t where t.club_id=c.id),
 'windows',(select coalesce(jsonb_agg(to_jsonb(ww)),'[]') from public.court_operating_windows ww join public.courts t on t.id=ww.court_id where t.club_id=c.id),
 'club_hours',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from public.club_opening_hours h where h.club_id=c.id),
 'rates',(select coalesce(jsonb_agg(to_jsonb(r) order by r.alias),'[]') from public.rate_plans r where r.club_id=c.id),
 'schedules',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.court_rate_schedules s where s.club_id=c.id),
 'overrides',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from public.court_rate_overrides o where o.club_id=c.id),
 'reservations',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('payments',(select coalesce(jsonb_agg(jsonb_build_object('status',p.status,'amount',p.amount,'currency',p.currency,'paid_by_user_id',p.paid_by_user_id)),'[]') from public.payments p where p.reservation_id=r.id)) order by r.start_at),'[]') from public.reservations r join public.courts t on t.id=r.court_id where t.club_id=c.id),
 'blocks',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from public.court_blocks b join public.courts t on t.id=b.court_id where t.club_id=c.id),
 'calendar',private.calendar(c.id,coalesce((p_data->>'date')::date,(now() at time zone c.timezone)::date)));
 end if;
 if not c.is_demo then raise exception 'La sesión de prueba solo permite modificar clubes Demo.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text,20));
 if p_data ? 'court_id' then
 select * into ct from public.courts where id=(p_data->>'court_id')::uuid and club_id=c.id;
 if not found then raise exception 'La cancha no pertenece al club.' using errcode='42501';end if;
 end if;
 case p_action
 when 'court.save' then
 if ct.id is null then
 insert into public.courts(club_id,name,court_number,description,surface_type,is_indoor,status)
 values(c.id,trim(p_data->>'name'),coalesce(nullif(p_data->>'court_number','')::int,(select coalesce(max(court_number),0)+1 from public.courts where club_id=c.id)),p_data->>'description',p_data->>'surface_type',coalesce((p_data->>'is_indoor')::bool,false),coalesce((p_data->>'status')::public.court_operational_status,'ACTIVE')) returning id into rid;
 else
 update public.courts set name=trim(p_data->>'name'),court_number=coalesce(nullif(p_data->>'court_number','')::int,court_number),description=p_data->>'description',surface_type=p_data->>'surface_type',is_indoor=coalesce((p_data->>'is_indoor')::bool,false),status=(p_data->>'status')::public.court_operational_status where id=ct.id returning id into rid;
 end if;
 when 'court.delete' then
 if ct.id is null then raise exception 'Selecciona una cancha.';end if;
 if exists(select 1 from public.reservations where court_id=ct.id) or exists(select 1 from public.court_blocks where court_id=ct.id) then
 update public.courts set status='INACTIVE' where id=ct.id;
 return jsonb_build_object('message','Cancha desactivada: se conserva su historial.');
 end if;
 delete from public.courts where id=ct.id;
 when 'hours.save' then
 if ct.id is null then raise exception 'Selecciona una cancha.';end if;
 select array_agg(value::int) into days from jsonb_array_elements_text(p_data->'days');
 if days is null or not(days <@ array[0,1,2,3,4,5,6]) then raise exception 'Días inválidos.';end if;
 perform pg_advisory_xact_lock(hashtextextended(ct.id::text,0));
 -- First customization copies the club baseline, so unedited days retain hours.
 if not ct.custom_hours then
 insert into public.court_operating_windows(court_id,weekday,start_min,end_min)
 select ct.id,h.weekday,(extract(epoch from h.opens_at)/60)::int,(extract(epoch from h.closes_at)/60)::int from public.club_opening_hours h where h.club_id=c.id;
 update public.courts set custom_hours=true where id=ct.id;
 end if;
 delete from public.court_operating_windows where court_id=ct.id and weekday=any(days);
 foreach d in array days loop
 for w in select value from jsonb_array_elements(p_data->'windows') loop
 insert into public.court_operating_windows(court_id,weekday,start_min,end_min) values(ct.id,d,(w->>'start_min')::int,(w->>'end_min')::int);
 end loop;end loop;
 if exists(select 1 from public.reservations r where r.court_id=ct.id and r.end_at>now() and (r.status='CONFIRMED' or(r.status='PENDING' and r.expires_at>now())) and not exists(select 1 from private.operating_periods(ct.id,(r.start_at at time zone c.timezone)::date) p where p @> r.booking_period)) then raise exception 'Hay reservas activas fuera del nuevo horario. Conserva la ventana o cancela explícitamente esas reservas.';end if;
 when 'block.save' then
 if ct.id is null then raise exception 'Selecciona una cancha.';end if;
 st:=(p_data->>'start_local')::timestamp at time zone c.timezone;en:=(p_data->>'end_local')::timestamp at time zone c.timezone;
 if p_data ? 'id' then
 update public.court_blocks set start_at=st,end_at=en,reason=p_data->>'reason',observation=p_data->>'observation'
 where id=(p_data->>'id')::uuid and court_id=ct.id returning id into rid;
 if rid is null then raise exception 'Bloqueo inexistente.';end if;
 else insert into public.court_blocks(court_id,start_at,end_at,reason,observation,demo_source) values(ct.id,st,en,p_data->>'reason',p_data->>'observation',true) returning id into rid;end if;
 when 'block.delete' then
 delete from public.court_blocks b using public.courts cc where b.id=(p_data->>'id')::uuid and b.court_id=cc.id and cc.club_id=c.id returning b.id into rid;
 if rid is null then raise exception 'Bloqueo inexistente.';end if;
 when 'reservation.create' then
 if ct.id is null then raise exception 'Selecciona una cancha.';end if;
 st:=(p_data->>'start_local')::timestamp at time zone c.timezone;n:=(p_data->>'minutes')::int;
 if n is null or n not between 30 and 180 or n%30<>0 or st<=now() then raise exception 'Elige una fecha futura y una duración de 30 a 180 minutos.';end if;
 insert into public.reservations(court_id,guest_id,customer_label,start_at,end_at,status,expires_at)
 values(ct.id,gen_random_uuid(),left(coalesce(nullif(trim(p_data->>'customer_label'),''),'Invitado Demo'),100),st,st+make_interval(mins=>n),
 case when p_data->>'status'='PENDING' then 'PENDING'::public.reservation_status else 'CONFIRMED'::public.reservation_status end,
 case when p_data->>'status'='PENDING' then now()+interval '15 minutes' else null end) returning id into rid;
 when 'reservation.cancel' then
 update public.reservations r set status='CANCELLED',cancelled_at=now() from public.courts cc where r.id=(p_data->>'id')::uuid and r.court_id=cc.id and cc.club_id=c.id returning r.id into rid;
 if rid is null then raise exception 'Reserva inexistente.';end if;
 when 'rate.save' then
 if coalesce((p_data->>'is_default')::bool,false) then update public.rate_plans set is_default=false where club_id=c.id;end if;
 if p_data ? 'id' then
 update public.rate_plans set alias=trim(p_data->>'alias'),amount=(p_data->>'amount')::numeric,currency=upper(p_data->>'currency'),is_active=(p_data->>'is_active')::bool,is_default=(p_data->>'is_default')::bool,description=p_data->>'description'
 where id=(p_data->>'id')::uuid and club_id=c.id returning id into rid;
 if rid is null then raise exception 'Tarifa inexistente.';end if;
 else insert into public.rate_plans(club_id,alias,amount,currency,is_active,is_default,description) values(c.id,trim(p_data->>'alias'),(p_data->>'amount')::numeric,upper(p_data->>'currency'),(p_data->>'is_active')::bool,(p_data->>'is_default')::bool,p_data->>'description') returning id into rid;end if;
 when 'schedule.apply' then
 select * into rp from public.rate_plans where id=(p_data->>'rate_plan_id')::uuid and club_id=c.id and is_active;
 if not found then raise exception 'Tarifa inválida para este club.';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'court_ids');
 select array_agg(value::int) into days from jsonb_array_elements_text(p_data->'days');
 sm:=(p_data->>'start_min')::int;em:=(p_data->>'end_min')::int;
 if ids is null or days is null or sm is null or em is null or sm<0 or em>1440 or sm>=em or sm%30<>0 or em%30<>0 or not(days<@array[0,1,2,3,4,5,6]) then raise exception 'Selecciona canchas, días y un rango válido.';end if;
 foreach cid in array ids loop
 if not exists(select 1 from public.courts where id=cid and club_id=c.id) then raise exception 'Cancha fuera del club.';end if;
 foreach d in array days loop
 for old in delete from public.court_rate_schedules where court_id=cid and weekday=d and int4range(start_min,end_min,'[)') && int4range(sm,em,'[)') returning * loop
 if old.start_min<sm then insert into public.court_rate_schedules(club_id,court_id,rate_plan_id,weekday,start_min,end_min)values(c.id,cid,old.rate_plan_id,d,old.start_min,sm);end if;
 if old.end_min>em then insert into public.court_rate_schedules(club_id,court_id,rate_plan_id,weekday,start_min,end_min)values(c.id,cid,old.rate_plan_id,d,em,old.end_min);end if;
 end loop;
 insert into public.court_rate_schedules(club_id,court_id,rate_plan_id,weekday,start_min,end_min)values(c.id,cid,rp.id,d,sm,em);
 end loop;end loop;
 when 'schedule.copy' then
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'court_ids');
 if ct.id is null or ids is null then raise exception 'Selecciona origen y destinos.';end if;
 foreach cid in array ids loop
 if cid=ct.id then continue;end if;
 if not exists(select 1 from public.courts where id=cid and club_id=c.id) then raise exception 'Cancha fuera del club.';end if;
 delete from public.court_rate_schedules where court_id=cid;
 insert into public.court_rate_schedules(club_id,court_id,rate_plan_id,weekday,start_min,end_min) select c.id,cid,rate_plan_id,weekday,start_min,end_min from public.court_rate_schedules where court_id=ct.id;
 end loop;
 when 'schedule.copy_day' then
 if ct.id is null then raise exception 'Selecciona una cancha.';end if;
 d:=(p_data->>'source_day')::int;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') into w from public.court_rate_schedules s where s.court_id=ct.id and s.weekday=d;
 select array_agg(value::int) into days from jsonb_array_elements_text(p_data->'days');
 foreach d in array days loop
 delete from public.court_rate_schedules where court_id=ct.id and weekday=d;
 for x in select value from jsonb_array_elements(w) loop
 insert into public.court_rate_schedules(club_id,court_id,rate_plan_id,weekday,start_min,end_min) values(c.id,ct.id,(x->>'rate_plan_id')::uuid,d,(x->>'start_min')::int,(x->>'end_min')::int);
 end loop;end loop;
 when 'override.save' then
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'court_ids');
 if ids is null then raise exception 'Selecciona canchas.';end if;
 foreach cid in array ids loop
 insert into public.court_rate_overrides(club_id,court_id,rate_plan_id,date_from,date_to,weekdays,start_min,end_min,priority)
 values(c.id,cid,(p_data->>'rate_plan_id')::uuid,(p_data->>'date_from')::date,(p_data->>'date_to')::date,
 array(select value::smallint from jsonb_array_elements_text(p_data->'days')),(p_data->>'start_min')::int,(p_data->>'end_min')::int,coalesce((p_data->>'priority')::int,100));
 end loop;
 when 'override.delete' then delete from public.court_rate_overrides where id=(p_data->>'id')::uuid and club_id=c.id;
 when 'club.photo' then
 update public.clubs set photo_data_url=p_data->>'photo_data_url',updated_at=now() where id=c.id;
 when 'club.save' then
 update public.clubs set name=trim(p_data->>'name'),address=p_data->>'address',is_active=(p_data->>'is_active')::bool where id=c.id;
 else raise exception 'Operación desconocida.' using errcode='22023';
 end case;
 return jsonb_build_object('id',rid,'message','Cambios guardados en Supabase.');
end $function$
