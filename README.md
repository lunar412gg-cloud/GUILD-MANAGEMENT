# Titania Guild Management - GitHub Pages + Supabase

Titania Guild Management is a browser-based guild planning tool hosted on GitHub Pages, with Supabase providing authentication, roles, shared planner state, attendance tracking, public read-only lineups, and revision-safe saves.

## Repository layout

```text
/
├─ index.html
├─ guild-league.html
├─ siege.html
├─ polarity-zone.html
├─ member.html
├─ config.js              # compatibility bootstrap only
├─ js/
│  ├─ config.js           # real browser configuration + loaders
│  ├─ attendance-page.js
│  ├─ attendance-pre.js
│  ├─ member-links.js
│  ├─ public-attendance.js
│  └─ public-lineup.js
├─ css/
│  ├─ attendance-page.css
│  ├─ attendance-pre.css
│  ├─ dashboard-fixes.css
│  ├─ mobile-nav.css
│  ├─ polarity-hidden.css
│  ├─ public-attendance.css
│  └─ public-lineup.css
├─ sql/
│  ├─ titania_setup.sql
│  ├─ supabase_setup.sql
│  ├─ attendance_setup.sql
│  ├─ public_view_setup.sql
│  └─ siege_public_setup.sql
└─ image assets / README / LICENSE
```

## Important security rule

`js/config.js` must contain ONLY:

- Supabase Project URL
- Supabase Publishable key

These are intended for browser applications when RLS is enabled.

**Never put a Supabase secret key, `service_role` key, database password, SMTP password, or other private credential in GitHub, JavaScript, or HTML.**

---

## Step 1 - Create the Supabase project

1. Sign in to Supabase and create a new project.
2. Open the project's SQL Editor.
3. Run the entire `sql/titania_setup.sql` file once.
4. Open Project Settings / API and copy:
   - Project URL
   - Publishable key
5. Put those two values into `js/config.js`.

`sql/titania_setup.sql` is the canonical database setup. It contains the core profiles/planner schema, attendance tables, gear-rating history tracking, RLS policies, triggers, save RPCs, and the current `get_public_lineup(p_view text)` public-lineup RPC in one file.

The older split SQL files under `sql/` are retained only as historical/compatibility references. For a fresh setup, use only `sql/titania_setup.sql`.

## Step 2 - Configure Supabase Auth

In Supabase Authentication URL settings, set your final GitHub Pages address as the Site URL and add it to Redirect URLs.

For a project repository, the address normally looks like:

`https://YOUR-GITHUB-USERNAME.github.io/titania-guild-management/`

You can temporarily add both the GitHub Pages URL and any local testing URL you use.

## Step 3 - GitHub Pages

Keep the HTML files at the repository root and deploy from:

1. Repository > Settings > Pages
2. Source: Deploy from a branch
3. Branch: `main`
4. Folder: `/(root)`
5. Save

The HTML pages reference scripts and styles from `js/` and `css/`.

## Step 4 - Create your own Titania account

Open the website and choose Register.

Use your own email and password. New users are intentionally created as `pending` and cannot open the planner until approved.

If Supabase email confirmation is enabled, confirm your email first.

## Step 5 - Make yourself the first Admin

After you have registered, return to Supabase > SQL Editor and run:

```sql
update public.profiles
set role = 'admin', approved = true
where email = 'YOUR_EMAIL_HERE';
```

Replace `YOUR_EMAIL_HERE` with the exact email you registered.

Reload the website and sign in. You will now see the `Users` button in the top bar.

## Roles

- `viewer` - can open and print/export the planner but is read-only
- `leader` - can edit roster, assignments, raid leaders, modes, and attendance
- `admin` - same as Leader plus user approval/role management

## Database approach

The planner is stored as one transactional JSONB document in `public.planner_state`, while authentication and user roles live separately in Supabase Auth and `public.profiles`.

Attendance is stored separately in `public.attendance_events` and `public.attendance_records`.

Gear Rating history is stored separately in `public.gear_rating_history` and is captured automatically whenever a member's GR changes in `planner_state`.

Core database functions include:

- `save_planner_state` - full autosave with revision checking
- `save_raid_leader_setting` - direct Raid Leader save
- `save_raid_mode_setting` - direct ATK/DEF save
- `get_public_lineup(p_view text)` - safe published lineup access for Guild League, Siege, and Polarity Zone

## If saving says REVISION_CONFLICT

That means another Leader/Admin saved a newer version first. Reload the newest planner when prompted to avoid overwriting another user's changes.

## Security

The GitHub repository may safely contain the Supabase **Project URL** and **publishable key** when Row Level Security is correctly configured.

Never commit:

- Supabase secret or `service_role` keys
- Database passwords or connection strings containing passwords
- SMTP passwords or SMTP keys
- Gmail App Passwords
- GitHub Personal Access Tokens
- Any other privileged credential

## Credits

Titania Guild Management Tool is based on and adapted from [RO World Planner](https://github.com/cajancharles/roworldplanner), originally created by [CharlesPlaysGG](https://github.com/cajancharles).

Please retain the original project's MIT license and copyright notice where required by its license terms.
