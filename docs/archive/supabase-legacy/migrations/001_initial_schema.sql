-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users profile table (extends Supabase auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  role text not null default 'member' check (role in ('admin', 'family_admin', 'member')),
  preferences jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Gmail accounts
create table public.gmail_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  last_scan_at timestamptz,
  scan_config jsonb default '{"frequency": "manual", "window": "since_last"}',
  created_at timestamptz default now()
);

-- Topics (folder structure)
create table public.topics (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  parent_id uuid references public.topics(id) on delete set null,
  icon text default 'folder',
  color text default '#2B579A',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Scanned emails
create table public.emails_scanned (
  id uuid primary key default uuid_generate_v4(),
  gmail_account_id uuid not null references public.gmail_accounts(id) on delete cascade,
  message_id text not null,
  thread_id text,
  from_address text,
  from_name text,
  subject text,
  date timestamptz,
  classification text not null check (classification in ('actionable', 'informational', 'noise')),
  confidence_score float default 0,
  ai_summary text,
  raw_snippet text,
  gmail_labels text[] default '{}',
  created_at timestamptz default now(),
  unique(gmail_account_id, message_id)
);

-- Tasks
create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting', 'done', 'dismissed')),
  priority text not null default 'medium' check (priority in ('urgent', 'high', 'medium', 'low')),
  due_date timestamptz,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  topic_id uuid references public.topics(id) on delete set null,
  source_email_id uuid references public.emails_scanned(id) on delete set null,
  gmail_link text,
  is_recurring boolean default false,
  recurrence_rule text,
  snoozed_until timestamptz,
  dismissed_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Comments
create table public.comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz default now()
);

-- Subtasks
create table public.subtasks (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  is_complete boolean default false,
  sort_order int default 0
);

-- AI Feedback
create table public.ai_feedback (
  id uuid primary key default uuid_generate_v4(),
  email_id uuid references public.emails_scanned(id) on delete cascade,
  field text not null,
  ai_value text,
  user_correction text,
  created_at timestamptz default now()
);

-- AI Skill Versions
create table public.ai_skill_versions (
  id uuid primary key default uuid_generate_v4(),
  version int not null,
  prompt_text text not null,
  accuracy_score float,
  is_active boolean default false,
  created_at timestamptz default now()
);

-- Scan Runs
create table public.scan_runs (
  id uuid primary key default uuid_generate_v4(),
  gmail_account_id uuid not null references public.gmail_accounts(id) on delete cascade,
  started_at timestamptz default now(),
  completed_at timestamptz,
  emails_scanned int default 0,
  actionable_count int default 0,
  informational_count int default 0,
  noise_count int default 0,
  status text default 'running' check (status in ('running', 'completed', 'failed'))
);

-- Indexes
create index idx_tasks_assignee on public.tasks(assignee_id);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_topic on public.tasks(topic_id);
create index idx_tasks_due_date on public.tasks(due_date);
create index idx_emails_gmail_account on public.emails_scanned(gmail_account_id);
create index idx_emails_classification on public.emails_scanned(classification);
create index idx_comments_task on public.comments(task_id);
create index idx_subtasks_task on public.subtasks(task_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    case
      when not exists (select 1 from public.profiles) then 'admin'
      else 'member'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated at trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.update_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.gmail_accounts enable row level security;
alter table public.topics enable row level security;
alter table public.emails_scanned enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.subtasks enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_skill_versions enable row level security;
alter table public.scan_runs enable row level security;

-- RLS Policies (allow all authenticated users to see all data - family app)
create policy "Users can view all profiles" on public.profiles for select to authenticated using (true);
create policy "Users can update own profile" on public.profiles for update to authenticated using (id = auth.uid());

create policy "Users can view all gmail accounts" on public.gmail_accounts for select to authenticated using (true);
create policy "Users can manage own gmail accounts" on public.gmail_accounts for all to authenticated using (user_id = auth.uid());

create policy "Anyone can view topics" on public.topics for select to authenticated using (true);
create policy "Admins can manage topics" on public.topics for all to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'family_admin'))
);

create policy "Users can view all emails" on public.emails_scanned for select to authenticated using (true);
create policy "Users can insert emails" on public.emails_scanned for insert to authenticated with check (true);

create policy "Users can view all tasks" on public.tasks for select to authenticated using (true);
create policy "Users can create tasks" on public.tasks for insert to authenticated with check (true);
create policy "Users can update tasks" on public.tasks for update to authenticated using (true);
create policy "Users can delete tasks" on public.tasks for delete to authenticated using (true);

create policy "Users can view comments" on public.comments for select to authenticated using (true);
create policy "Users can create comments" on public.comments for insert to authenticated with check (user_id = auth.uid());

create policy "Users can view subtasks" on public.subtasks for select to authenticated using (true);
create policy "Users can manage subtasks" on public.subtasks for all to authenticated using (true);

create policy "Users can view feedback" on public.ai_feedback for select to authenticated using (true);
create policy "Users can create feedback" on public.ai_feedback for insert to authenticated with check (true);

create policy "Users can view skill versions" on public.ai_skill_versions for select to authenticated using (true);
create policy "Admins can manage skill versions" on public.ai_skill_versions for all to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'family_admin'))
);

create policy "Users can view scan runs" on public.scan_runs for select to authenticated using (true);
create policy "Users can create scan runs" on public.scan_runs for insert to authenticated with check (true);
create policy "Users can update scan runs" on public.scan_runs for update to authenticated using (true);
