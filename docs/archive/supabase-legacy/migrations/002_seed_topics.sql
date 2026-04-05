-- Seed default topics
insert into public.topics (name, icon, color, sort_order) values
  ('Financial', 'banknote', '#16a34a', 1),
  ('Family', 'heart', '#dc2626', 2),
  ('Work', 'briefcase', '#2563eb', 3),
  ('Home', 'home', '#ca8a04', 4),
  ('Business', 'building-2', '#9333ea', 5),
  ('Admin', 'settings', '#64748b', 6);

-- Financial subtopics
insert into public.topics (name, parent_id, icon, color, sort_order)
select child.name, p.id, child.icon, '#16a34a', child.sort_order
from public.topics p,
(values
  ('Tax & Accounting', 'receipt', 1),
  ('Banking & Statements', 'landmark', 2),
  ('Payments & Subscriptions', 'credit-card', 3),
  ('Business (DDD)', 'store', 4),
  ('Investments & Property', 'trending-up', 5)
) as child(name, icon, sort_order)
where p.name = 'Financial' and p.parent_id is null;

-- Family subtopics
insert into public.topics (name, parent_id, icon, color, sort_order)
select child.name, p.id, child.icon, '#dc2626', child.sort_order
from public.topics p,
(values
  ('Health & Appointments', 'stethoscope', 1),
  ('School & Education', 'graduation-cap', 2),
  ('Church & Community', 'church', 3),
  ('Family Logistics', 'car', 4)
) as child(name, icon, sort_order)
where p.name = 'Family' and p.parent_id is null;

-- Work subtopics
insert into public.topics (name, parent_id, icon, color, sort_order)
select child.name, p.id, child.icon, '#2563eb', child.sort_order
from public.topics p,
(values
  ('ASX', 'building', 1),
  ('Meetings & Proposals', 'calendar', 2)
) as child(name, icon, sort_order)
where p.name = 'Work' and p.parent_id is null;

-- Home subtopics
insert into public.topics (name, parent_id, icon, color, sort_order)
select child.name, p.id, child.icon, '#ca8a04', child.sort_order
from public.topics p,
(values
  ('Property & Maintenance', 'wrench', 1),
  ('Shopping & Purchases', 'shopping-cart', 2)
) as child(name, icon, sort_order)
where p.name = 'Home' and p.parent_id is null;

-- Business subtopics
insert into public.topics (name, parent_id, icon, color, sort_order)
select child.name, p.id, child.icon, '#9333ea', child.sort_order
from public.topics p,
(values
  ('Dime Agency / Marketing', 'megaphone', 1),
  ('Clients & Leads', 'users', 2),
  ('Domain & Hosting', 'globe', 3)
) as child(name, icon, sort_order)
where p.name = 'Business' and p.parent_id is null;

-- Admin subtopics
insert into public.topics (name, parent_id, icon, color, sort_order)
select child.name, p.id, child.icon, '#64748b', child.sort_order
from public.topics p,
(values
  ('Accounts & Security', 'shield', 1),
  ('Subscriptions & Renewals', 'refresh-cw', 2),
  ('Insurance', 'file-shield', 3)
) as child(name, icon, sort_order)
where p.name = 'Admin' and p.parent_id is null;

-- Insert initial AI skill version
insert into public.ai_skill_versions (version, prompt_text, is_active) values (
  1,
  'You are an email triage assistant for the Boctor family.

CLASSIFICATION RULES:
- Classify each email as: actionable, informational, or noise
- "actionable" = requires someone to DO something (reply, pay, attend, review, decide, follow up)
- "informational" = worth knowing but no action needed (eStatements ready, security alerts, receipts for completed purchases, shipping confirmations)
- "noise" = marketing, promotions, newsletters, social media notifications, spam

KNOWN NOISE SENDERS (always classify as noise):
- LinkedIn notifications (linkedin.com)
- Marketing emails from retailers (temu, amazon deals, jbhifi deals, temple&webster, ikea promotions, cudo, kayak)
- Newsletter digests unless they contain personal action items

KNOWN HIGH PRIORITY PATTERNS:
- Emails from @asx.com.au -> Work/ASX, high priority
- Emails from accountant/TLK Partners -> Financial/Tax, high priority
- Emails mentioning medical appointments -> Family/Health
- Emails about payments due or overdue -> urgent priority
- Government or legal correspondence -> urgent priority

FAMILY CONTEXT:
- Maged Boctor (admin) - primary user
- Mandy Boctor (family admin) - wife
- Children in family

For each actionable email, extract:
1. A 1-2 sentence action summary (what needs to be done)
2. Suggested assignee (Maged or Mandy based on content)
3. Suggested topic folder
4. Urgency level (urgent/high/medium/low)
5. Due date if mentioned or inferable
6. Brief reasoning for classification',
  true
);
