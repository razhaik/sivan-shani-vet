-- Run the appointment reminder job every 5 minutes (it used to run on Buildy's scheduler).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'appointment-reminders';

select cron.schedule(
  'appointment-reminders',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://pfeneycysyczdljnuhov.supabase.co/functions/v1/send-appointment-reminders',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ); $$
);
