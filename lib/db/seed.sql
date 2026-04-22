-- =============================================================================
--  seed.sql — Time Tracker initial data
--
--  Idempotent: all inserts use fixed UUIDs + ON CONFLICT DO NOTHING so this
--  file can safely be re-run any number of times without duplicating rows.
--
--  Seeded data:
--    * Settings  : client = "Tom Lam", hourly rate = $7.50
--    * Task      : "Next.js migration of booking platform"
--    * Time entries totalling 41.5 billable hours across 4 days,
--      split into realistic working segments with breaks in between.
--    * Two no-charge entries (SSR layer + SEO HTML page generator).
-- =============================================================================

-- ── Settings ────────────────────────────────────────────────────────────────
INSERT INTO settings (id, client_name, hourly_rate)
VALUES (1, 'Tom Lam', 7.50)
ON CONFLICT (id) DO UPDATE
    SET client_name = EXCLUDED.client_name,
        hourly_rate = EXCLUDED.hourly_rate;

-- ── Main task ───────────────────────────────────────────────────────────────
INSERT INTO tasks (id, title, description, status, created_at)
VALUES (
    'a1111111-1111-4111-8111-111111111111',
    'Next.js migration of booking platform',
    'Full Next.js migration of a booking platform currently developed in React/Vite. '
        || 'Large, mature codebase: 4,500+ lines of API routes, custom auth with Passport.js, '
        || 'WebSockets, sessions, Drizzle ORM, and a POS system.',
    'active',
    '2026-04-19 18:40:00-07'
)
ON CONFLICT (id) DO NOTHING;

-- ── Billable time entries (total: 41.5 h) ───────────────────────────────────
-- Span 1: 4/19 18:40 → 4/20 21:30  (20.0 h work, breaks for sleep/meals)
INSERT INTO time_entries (id, task_id, description, started_at, ended_at, no_charge) VALUES
    ('b1000001-0000-4000-8000-000000000001',
     'a1111111-1111-4111-8111-111111111111',
     'Codebase audit and migration planning (mapping React/Vite routes to Next.js App Router)',
     '2026-04-19 18:40:00-07', '2026-04-19 23:40:00-07', false),

    ('b1000001-0000-4000-8000-000000000002',
     'a1111111-1111-4111-8111-111111111111',
     'Scaffold Next.js app, set up project structure and port routing layout',
     '2026-04-20 01:00:00-07', '2026-04-20 05:30:00-07', false),

    ('b1000001-0000-4000-8000-000000000003',
     'a1111111-1111-4111-8111-111111111111',
     'Migrate API routes to Next.js route handlers (~4,500 lines)',
     '2026-04-20 09:00:00-07', '2026-04-20 13:30:00-07', false),

    ('b1000001-0000-4000-8000-000000000004',
     'a1111111-1111-4111-8111-111111111111',
     'Port Passport.js auth strategies to Next.js middleware',
     '2026-04-20 14:30:00-07', '2026-04-20 18:30:00-07', false),

    ('b1000001-0000-4000-8000-000000000005',
     'a1111111-1111-4111-8111-111111111111',
     'Migrate session handling and cookie-based auth flow',
     '2026-04-20 19:30:00-07', '2026-04-20 21:30:00-07', false),

-- Span 2: 4/21 02:25 → 4/21 19:12  (12.5 h work)
    ('b1000002-0000-4000-8000-000000000001',
     'a1111111-1111-4111-8111-111111111111',
     'Port WebSocket server to Next.js custom server (real-time booking updates)',
     '2026-04-21 02:25:00-07', '2026-04-21 06:25:00-07', false),

    ('b1000002-0000-4000-8000-000000000002',
     'a1111111-1111-4111-8111-111111111111',
     'Migrate Drizzle ORM schema and query layer',
     '2026-04-21 07:25:00-07', '2026-04-21 11:25:00-07', false),

    ('b1000002-0000-4000-8000-000000000003',
     'a1111111-1111-4111-8111-111111111111',
     'Port POS system frontend components (cart, product grid, register UI)',
     '2026-04-21 12:25:00-07', '2026-04-21 15:25:00-07', false),

    ('b1000002-0000-4000-8000-000000000004',
     'a1111111-1111-4111-8111-111111111111',
     'POS checkout flow and payment integration wiring',
     '2026-04-21 17:42:00-07', '2026-04-21 19:12:00-07', false),

-- Span 3: 4/22 03:44 → 4/22 08:27  (4.5 h work)
    ('b1000003-0000-4000-8000-000000000001',
     'a1111111-1111-4111-8111-111111111111',
     'Custom auth middleware: login, register, password reset',
     '2026-04-22 03:44:00-07', '2026-04-22 06:14:00-07', false),

    ('b1000003-0000-4000-8000-000000000002',
     'a1111111-1111-4111-8111-111111111111',
     'Frontend auth pages migration to App Router',
     '2026-04-22 06:27:00-07', '2026-04-22 08:27:00-07', false),

-- Span 4: 4/22 14:30 → 4/22 19:00  (4.5 h work)
    ('b1000004-0000-4000-8000-000000000001',
     'a1111111-1111-4111-8111-111111111111',
     'Production build, TypeScript error fixes, dependency upgrades',
     '2026-04-22 14:30:00-07', '2026-04-22 17:00:00-07', false),

    ('b1000004-0000-4000-8000-000000000002',
     'a1111111-1111-4111-8111-111111111111',
     'End-to-end smoke testing and bug fixes',
     '2026-04-22 17:00:00-07', '2026-04-22 19:00:00-07', false),

-- ── Non-billable / $0.00 entries ─────────────────────────────────────────────
    ('c1000001-0000-4000-8000-000000000001',
     'a1111111-1111-4111-8111-111111111111',
     'SSR layer in server/vite (no charge)',
     '2026-04-20 22:00:00-07', '2026-04-21 01:00:00-07', true),

    ('c1000001-0000-4000-8000-000000000002',
     'a1111111-1111-4111-8111-111111111111',
     'SEO HTML page generator for Google SEO ranking (no charge)',
     '2026-04-22 09:00:00-07', '2026-04-22 11:00:00-07', true)
ON CONFLICT (id) DO NOTHING;
