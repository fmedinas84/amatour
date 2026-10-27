-- Only explicitly marked demo clubs. Does not create paid transactions.
insert into public.rate_plans(club_id,alias,amount,currency,is_default,description)
select id,'Estándar Demo',5000,'CLP',true,'Importe ilustrativo por 30 minutos' from public.clubs c where is_demo and not exists(select 1 from public.rate_plans r where r.club_id=c.id and r.alias='Estándar Demo');
insert into public.rate_plans(club_id,alias,amount,currency,description)
select id,'Hora punta Demo',8000,'CLP','Tarifa ilustrativa por 30 minutos' from public.clubs c where is_demo and not exists(select 1 from public.rate_plans r where r.club_id=c.id and r.alias='Hora punta Demo');
insert into public.rate_plans(club_id,alias,amount,currency,description)
select id,'Cyber Demo',3500,'CLP','Promoción de prueba, sin pagos reales' from public.clubs c where is_demo and not exists(select 1 from public.rate_plans r where r.club_id=c.id and r.alias='Cyber Demo');
insert into public.court_rate_schedules(club_id,court_id,rate_plan_id,weekday,start_min,end_min)
select ct.club_id,ct.id,r.id,d,1080,1380 from public.courts ct join public.clubs c on c.id=ct.club_id and c.is_demo join public.rate_plans r on r.club_id=c.id and r.alias='Hora punta Demo' cross join generate_series(0,6)d
where not exists(select 1 from public.court_rate_schedules s where s.court_id=ct.id);
insert into public.court_rate_overrides(club_id,court_id,rate_plan_id,date_from,date_to,start_min,end_min,priority)
select ct.club_id,ct.id,r.id,'2026-11-02','2026-11-08',480,1080,100 from public.courts ct join public.clubs c on c.id=ct.club_id and c.is_demo join public.rate_plans r on r.club_id=c.id and r.alias='Cyber Demo'
where not exists(select 1 from public.court_rate_overrides o where o.court_id=ct.id);
-- Give one demo court two windows, and late-night Friday/Saturday hours.
insert into public.court_operating_windows(court_id,weekday,start_min,end_min)
select ct.id,d,480,case when d=0 then 780 when d in(4,5) then 1500 else 1380 end from public.courts ct join public.clubs c on c.id=ct.club_id and c.slug='demo-bosque' cross join generate_series(0,6)d
where ct.court_number=3 and not ct.custom_hours;
insert into public.court_operating_windows(court_id,weekday,start_min,end_min)
select ct.id,0,900,1380 from public.courts ct join public.clubs c on c.id=ct.club_id and c.slug='demo-bosque' where ct.court_number=3 and not ct.custom_hours;
update public.courts ct set custom_hours=true from public.clubs c where c.id=ct.club_id and c.slug='demo-bosque' and ct.court_number=3;
