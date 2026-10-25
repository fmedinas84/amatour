-- Explicitly fictional demo catalogue, approved for this prototype.
with new_clubs as (
 insert into public.clubs(name,slug,address,timezone) values
 ('Club Bosque · Demo','demo-bosque','Sector La Dehesa, Lo Barnechea · ubicación ilustrativa','America/Santiago'),
 ('Club Cordillera · Demo','demo-cordillera','Sector San Carlos, Las Condes · ubicación ilustrativa','America/Santiago'),
 ('Club Parque · Demo','demo-parque','Sector Peñalolén · ubicación ilustrativa','America/Santiago')
 returning id,slug
), new_courts as (
 insert into public.courts(club_id,name,court_number,surface_type,is_indoor,description)
 select c.id,'Cancha '||n,n,'Césped sintético',case when c.slug='demo-cordillera' then true when c.slug='demo-bosque' then n=3 else false end,'Cancha panorámica · datos de demostración'
 from new_clubs c cross join generate_series(1,3) n returning club_id
)
insert into public.club_opening_hours(club_id,weekday,opens_at,closes_at)
select c.id,d,'08:00'::time,'23:00'::time from new_clubs c cross join generate_series(0,6) d;
