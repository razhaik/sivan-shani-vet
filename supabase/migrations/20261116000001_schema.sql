-- Schema for sivan-shani-vet (migrated from Buildy) – generated 2026-11-16
create extension if not exists pgcrypto;

create table if not exists public.appointment (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "appointment_type" text,
  "duration_minutes" bigint,
  "date" text,
  "start_time" text,
  "end_time" text,
  "client_name" text,
  "phone" text,
  "email" text,
  "pet_name" text,
  "pet_species" text,
  "notes" text,
  "status" text,
  "sms_consent" boolean,
  "sms_consent_language" text,
  "google_event_id" text,
  "cancel_token" text,
  "cancelled_by" text,
  "client_cancellation_email_sent_at" text,
  "day_before_reminder_sent_at" text,
  "hour_before_reminder_sent_at" text,
  "inbox_handled_at" text,
  "inbox_archived_at" text,
  "arrived_at" text,
  "inbox_deleted_at" text,
  "browser_push_notified_at" text,
  "owner_new_appointment_notified_at" text,
  "owner_appointment_changed_notified_at" text,
  "owner_appointment_no_show_notified_at" text
);
alter table public.appointment enable row level security;

create table if not exists public.appointment_block (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "date" text,
  "start_time" text,
  "end_time" text,
  "reason" text
);
alter table public.appointment_block enable row level security;

create table if not exists public.appointment_note (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "appointment_id" text,
  "body" text,
  "author_name" text
);
alter table public.appointment_note enable row level security;

create table if not exists public.appointment_reschedule_request (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "appointment_id" text,
  "old_appointment_date" text,
  "old_start_time" text,
  "old_end_time" text,
  "proposed_appointment_date" text,
  "proposed_start_time" text,
  "proposed_end_time" text,
  "service_identifier" text,
  "service_duration_minutes" bigint,
  "status" text,
  "idempotency_key" text,
  "inbox_handled_at" text,
  "inbox_archived_at" text,
  "inbox_deleted_at" text,
  "processing_started_at" text,
  "processing_attempts" bigint,
  "decision_at" text,
  "decision_by_user_id" text,
  "decision_note" text,
  "customer_notification_sent_at" text,
  "manager_notification_sent_at" text,
  "customer_notification_error" text,
  "manager_notification_error" text,
  "recovery_required_at" text,
  "recovery_detail" text,
  "last_error" text,
  "last_error_at" text
);
alter table public.appointment_reschedule_request enable row level security;

create table if not exists public.appointment_window (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "appointment_type_id" text,
  "weekday" bigint,
  "start_time" text,
  "end_time" text
);
alter table public.appointment_window enable row level security;

create table if not exists public.business_client (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "name" text,
  "first_name" text,
  "last_name" text,
  "national_id" text,
  "phone" text,
  "mobile_phone" text,
  "home_phone" text,
  "email" text,
  "address" text,
  "city" text,
  "postal_code" text,
  "pet_name" text,
  "pet_species" text,
  "pet_details" jsonb,
  "additional_fields" jsonb,
  "notes" text,
  "sms_consent" boolean,
  "sms_consent_language" text,
  "import_source" text,
  "linked_client_key" text,
  "linked_client_keys" jsonb
);
alter table public.business_client enable row level security;

create table if not exists public.client_archive (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "client_key" text,
  "display_name" text,
  "phone" text,
  "email" text,
  "archived_at" text,
  "source_status" text
);
alter table public.client_archive enable row level security;

create table if not exists public.client_list_preference (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "visible_columns" jsonb,
  "rows_per_page" double precision,
  "sort_key" text,
  "sort_direction" text
);
alter table public.client_list_preference enable row level security;

create table if not exists public.client_reminder (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "client_id" text,
  "client_name" text,
  "title" text,
  "notes" text,
  "due_at" text,
  "status" text,
  "completed_at" text,
  "author_name" text
);
alter table public.client_reminder enable row level security;

create table if not exists public.clinic_notification_settings (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "email_recipients" jsonb,
  "sms_recipients" jsonb,
  "new_appointment_enabled" boolean,
  "new_appointment_channels" jsonb,
  "new_inquiry_enabled" boolean,
  "new_inquiry_channels" jsonb,
  "appointment_changed_enabled" boolean,
  "appointment_changed_channels" jsonb,
  "appointment_no_show_enabled" boolean,
  "appointment_no_show_channels" jsonb,
  "appointment_reschedule_requested_enabled" boolean,
  "appointment_reschedule_requested_channels" jsonb
);
alter table public.clinic_notification_settings enable row level security;

create table if not exists public.clinic_service (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "name" text,
  "duration_minutes" bigint,
  "meeting_type" text,
  "description" text,
  "is_paid" boolean,
  "payment_notes" text,
  "sort_order" bigint,
  "is_active" boolean,
  "weekly_availability" jsonb
);
alter table public.clinic_service enable row level security;

create table if not exists public.clinic_settings (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "auto_confirm_appointments" boolean,
  "min_hours_before_booking" bigint,
  "weekly_availability" jsonb,
  "booking_note_vaccine" text,
  "booking_note_general" text,
  "booking_note_surgery" text,
  "booking_note_dental" text,
  "enable_email_reminders" boolean,
  "reminder_day_before_hours" bigint,
  "reminder_hour_before_hours" bigint,
  "reminder_day_before_subject" text,
  "reminder_day_before_title" text,
  "reminder_day_before_subtitle" text,
  "reminder_day_before_status_label" text,
  "reminder_hour_before_subject" text,
  "reminder_hour_before_title" text,
  "reminder_hour_before_subtitle" text,
  "reminder_hour_before_status_label" text,
  "enable_sms_reminders" boolean,
  "reminder_sms_day_before_template" text,
  "reminder_sms_hour_before_template" text,
  "customer_email_template_selections" jsonb,
  "self_service_appointment_management_enabled" boolean,
  "self_service_cancellation_min_hours" bigint,
  "self_service_reschedule_min_hours" bigint,
  "self_service_cancellation_cutoff_message" text
);
alter table public.clinic_settings enable row level security;

create table if not exists public.contact_inquiry (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "name" text,
  "phone" text,
  "email" text,
  "message" text,
  "inbox_handled_at" text,
  "inbox_archived_at" text,
  "inbox_deleted_at" text,
  "browser_push_notified_at" text,
  "owner_new_inquiry_notified_at" text
);
alter table public.contact_inquiry enable row level security;

create table if not exists public.dashboard_layout (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "user_id" text,
  "items" jsonb
);
alter table public.dashboard_layout enable row level security;

create table if not exists public.dashboard_layout_preference (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "widget_order" jsonb,
  "widget_layout" jsonb
);
alter table public.dashboard_layout_preference enable row level security;

create table if not exists public.marketing_broadcast_draft (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "broadcast_name" text,
  "broadcast_type" text,
  "status" text,
  "channel" text,
  "email_subject" text,
  "message_body" text,
  "audience_key" text,
  "audience_label" text,
  "selected_client_ids" jsonb,
  "cta_key" text,
  "cta_label" text,
  "cta_url" text,
  "sms_consent_acknowledged" boolean,
  "last_sent_at" text,
  "last_send_status" text,
  "last_sent_count" bigint,
  "last_skipped_count" bigint,
  "last_failed_count" bigint
);
alter table public.marketing_broadcast_draft enable row level security;

create table if not exists public.marketing_campaign (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "campaign_name" text,
  "campaign_type" text,
  "status" text,
  "channel" text,
  "template_key" text,
  "trigger_type" text,
  "trigger_value" bigint,
  "timing_relation" text,
  "timing_unit" text,
  "timing_value" bigint,
  "email_subject" text,
  "message_body" text,
  "audience_description" text,
  "sms_consent_acknowledged" boolean,
  "enabled" boolean
);
alter table public.marketing_campaign enable row level security;

create table if not exists public.marketing_recipient_status (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "send_log_id" text,
  "recipient_label" text,
  "destination_masked" text,
  "channel" text,
  "status" text,
  "sent_at" text,
  "delivered_at" text,
  "failure_reason" text
);
alter table public.marketing_recipient_status enable row level security;

create table if not exists public.marketing_send_log (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "campaign_name" text,
  "campaign_type" text,
  "source_id" text,
  "channel" text,
  "email_subject" text,
  "message_preview" text,
  "audience_label" text,
  "sent_at" text,
  "status" text,
  "recipient_count" bigint,
  "delivered_count" bigint,
  "failed_count" bigint,
  "skipped_count" bigint,
  "opened_count" bigint,
  "clicked_count" bigint
);
alter table public.marketing_send_log enable row level security;

create table if not exists public.pet_medical_record (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  "client_key" text,
  "pet_id" text,
  "pet_name" text,
  "record_type" text,
  "record_date" text,
  "title" text,
  "details" text,
  "author_name" text
);
alter table public.pet_medical_record enable row level security;
