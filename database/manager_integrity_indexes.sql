-- Cover composite tenant foreign keys; replace redundant single-key indexes.
create index schedules_court_club on public.court_rate_schedules(court_id,club_id);
create index schedules_rate_club on public.court_rate_schedules(rate_plan_id,club_id);
create index overrides_court_club on public.court_rate_overrides(court_id,club_id);
create index overrides_rate_club on public.court_rate_overrides(rate_plan_id,club_id);
drop index public.schedules_rate;
drop index public.overrides_rate;
create policy capability_no_direct_access on private.manager_capabilities for all to anon,authenticated using(false) with check(false);
-- Numeric modulo avoids accepting fractional seconds through bigint rounding.
alter table public.reservations drop constraint reservations_half_hour_duration;
alter table public.reservations add constraint reservations_half_hour_duration check(mod(extract(epoch from(end_at-start_at)),1800)=0);
