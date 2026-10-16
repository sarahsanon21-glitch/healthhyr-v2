-- HealthHyr v2, migration 0002: CHECK constraints on every user-editable text column.
--
-- Why: since the Data API went on (step 9), a signed-in person holding their own token can write the
-- columns they are allowed to update straight through the Data API, skipping the HealthHyr API and
-- its validation. Row-level security and column privileges still stop other people's rows and the
-- server-decided columns, but length limits and formats that only the API enforced could be bypassed
-- (a `javascript:` website, a 100,000-character description). These constraints make the database
-- refuse them too, whoever writes. The API keeps its zod validation for good error messages; the
-- limits below mirror it.
--
-- Rules, for every table a user can write through the Data API (see docs/ARCHITECTURE.md):
--   * every text column has a maximum length
--   * free text has no control characters (new lines and tabs are allowed where text is multi-line)
--   * a web address must start with http:// or https:// (so no javascript:, data:, vbscript: ...)
--   * formatted values (ZIP, phone, company size) match their format
-- Blank checks ("a title is required") stay in the API and in job_missing_fields(): a draft may be
-- incomplete in the database, and publishing is gated separately.
--
-- Applied to the LOCAL database only by `npm run db:reset`. Never applied to the production project
-- from a development session.

-- ───────── helpers (private schema: not reachable through the Data API) ─────────
-- Control characters other than tab (09), line feed (0A) and carriage return (0D).
create function private.clean_text(v text, max_len integer) returns boolean
  language sql immutable parallel safe as
$$ select v is null or (char_length(v) <= max_len and v !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') $$;

-- A single line: no control characters at all, tabs and new lines included.
create function private.clean_line(v text, max_len integer) returns boolean
  language sql immutable parallel safe as
$$ select v is null or (char_length(v) <= max_len and v !~ '[\x01-\x1f\x7f]') $$;

-- http:// or https:// followed by a host, no spaces, no control characters, at most 2048 characters.
create function private.http_url(v text) returns boolean
  language sql immutable parallel safe as
$$ select v is null or (
     char_length(v) <= 2048
     and v ~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
     and v !~ '[\x01-\x1f\x7f]') $$;

create function private.us_zip(v text) returns boolean
  language sql immutable parallel safe as
$$ select v is null or v ~ '^[0-9]{5}(-[0-9]{4})?$' $$;

create function private.phone(v text) returns boolean
  language sql immutable parallel safe as
$$ select v is null or v ~ '^[0-9()+.[:blank:]-]{7,20}$' $$;

-- A storage path, never an address: no scheme such as javascript: or https:, no control characters.
create function private.storage_path(v text) returns boolean
  language sql immutable parallel safe as
$$ select v is null or (char_length(v) <= 512
     and v !~ '^[A-Za-z][A-Za-z0-9+.-]*:'
     and v !~ '[\x01-\x1f\x7f]') $$;

-- ───────── profiles (writable: full_name) ─────────
alter table profiles add constraint profiles_full_name_ok check (private.clean_line(full_name, 100));

-- ───────── employer_profiles (writable: company_name, description, website, logo_url, industry,
--                               company_size, city, state) ─────────
alter table employer_profiles
  add constraint employer_profiles_company_name_ok check (private.clean_line(company_name, 120)),
  add constraint employer_profiles_description_ok  check (private.clean_text(description, 5000)),
  add constraint employer_profiles_website_ok      check (private.http_url(website)),
  add constraint employer_profiles_logo_url_ok     check (private.http_url(logo_url)),
  add constraint employer_profiles_industry_ok     check (private.clean_line(industry, 100)),
  add constraint employer_profiles_company_size_ok
    check (company_size is null or company_size in ('1-10','11-50','51-200','201-500','501-1000','1000+')),
  add constraint employer_profiles_city_ok         check (private.clean_line(city, 100)),
  add constraint employer_profiles_state_ok        check (private.clean_line(state, 50));

-- ───────── seeker_profiles (writable: display_name, headline, summary, city, state, avatar_url, ...) ─────────
alter table seeker_profiles
  add constraint seeker_profiles_display_name_ok check (private.clean_line(display_name, 100)),
  add constraint seeker_profiles_headline_ok     check (private.clean_line(headline, 150)),
  add constraint seeker_profiles_summary_ok      check (private.clean_text(summary, 3000)),
  add constraint seeker_profiles_city_ok         check (private.clean_line(city, 100)),
  add constraint seeker_profiles_state_ok        check (private.clean_line(state, 50)),
  add constraint seeker_profiles_avatar_url_ok   check (private.http_url(avatar_url));

-- ───────── seeker_private (writable: phone, zip, resume_url) ─────────
alter table seeker_private
  add constraint seeker_private_phone_ok      check (private.phone(phone)),
  add constraint seeker_private_zip_ok        check (private.us_zip(zip)),
  add constraint seeker_private_resume_url_ok check (private.storage_path(resume_url));

-- ───────── seeker_experience, seeker_certifications, seeker_languages (writable: all text) ─────────
alter table seeker_experience
  add constraint seeker_experience_title_ok       check (private.clean_line(title, 120)),
  add constraint seeker_experience_employer_ok    check (private.clean_line(employer, 120)),
  add constraint seeker_experience_city_ok        check (private.clean_line(city, 100)),
  add constraint seeker_experience_state_ok       check (private.clean_line(state, 50)),
  add constraint seeker_experience_description_ok check (private.clean_text(description, 2000));

alter table seeker_certifications
  add constraint seeker_certifications_name_ok   check (private.clean_line(name, 120)),
  add constraint seeker_certifications_issuer_ok check (private.clean_line(issuer, 120));

alter table seeker_languages
  add constraint seeker_languages_language_ok check (private.clean_line(language, 60));

-- ───────── jobs (writable: title, description, city, state, zip, pay) ─────────
alter table jobs
  add constraint jobs_title_ok       check (private.clean_line(title, 120)),
  add constraint jobs_description_ok check (private.clean_text(description, 10000)),
  add constraint jobs_city_ok        check (private.clean_line(city, 100)),
  add constraint jobs_state_ok       check (private.clean_line(state, 50)),
  add constraint jobs_zip_ok         check (private.us_zip(zip)),
  add constraint jobs_pay_ok         check ((pay_min is null or pay_min >= 0) and (pay_max is null or pay_max >= 0));

-- ───────── messages (writable: body; it already has a 1 to 4000 length check) ─────────
alter table messages add constraint messages_body_ok check (private.clean_text(body, 4000));

-- ───────── contact_messages (written only through the API, but kept consistent) ─────────
alter table contact_messages
  add constraint contact_messages_name_ok    check (private.clean_line(name, 120)),
  add constraint contact_messages_email_ok   check (private.clean_line(email, 254)),
  add constraint contact_messages_message_ok check (private.clean_text(message, 4000));

-- ───────── signup must keep working with any name a client sends ─────────
-- The name comes from the signup metadata, which the Supabase Auth endpoint accepts from anyone.
-- Cut it to the limit and drop control characters, so a long or odd name cannot make signup fail
-- against the constraints above.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare r user_role; v_name text;
begin
  r := case new.raw_user_meta_data->>'role'
         when 'employer' then 'employer'::user_role
         else 'seeker'::user_role end;                  -- never 'admin' from client input
  v_name := nullif(left(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '[\x01-\x1f\x7f]', '', 'g')), 100), '');
  insert into profiles (id, role, email, full_name)
  values (new.id, r, new.email, v_name);
  if r = 'employer' then
    insert into employer_profiles (id) values (new.id);  -- company_name stays the default until edited
  else
    insert into seeker_profiles (id, display_name)
    values (new.id, coalesce(v_name, 'New seeker'));
    insert into seeker_private (id) values (new.id);
  end if;
  return new;
end $$;
