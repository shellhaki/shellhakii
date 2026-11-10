# Portfolio Spec — Next\.js \+ Neon Data API

Short spec for shellhaki's portfolio: home, featured projects, repos, articles, contact, gallery, and admin upload flow\.

## 1\. Overview and goals

Personal portfolio for shellhaki built with Next\.js\. Content mixes curated uploads (featured projects, gallery media via admin) with live external data (GitHub repos, Medium articles) and a contact form that emails via Resend\.

Goals:

- Fast public pages with clear navigation across home, work, writing, gallery, and contact\.
- Admin\-only upload flow for featured projects and gallery media\.
- Media stored in Cloudflare, structured data in Neon Postgres via Neon Data API\.
- Assumption: public site is read\-heavy, so cache external fetches and paginate lists\.

## 2\. Tech stack and architecture

- App: Next\.js App Router with TypeScript; public pages are server components where possible, client components only for filters, pagination, gallery lightbox, and admin forms\.
- Database: Neon Postgres accessed via Neon Data API / serverless driver; no direct DB connection from the browser\.
- Media: Cloudflare object storage for images and videos (R2\-style bucket \+ public/custom domain delivery)\. Assumption: images and short video files both live in the same bucket with a ` kind ` flag in Postgres\.
- External data: GitHub REST API for repos, Medium feed/API for ` @shellhaki ` articles, rendered server\-side with caching and revalidation\.
- Email: Resend API called from a Next\.js Route Handler on form submit\.
- Admin: simple session gate showing "Welcome Haki"; all writes go through authenticated Route Handlers / Server Actions that validate input before Neon insert and Cloudflare upload\.

## 3\. Routes and navigation

Public routes:

- ` / ` — home
- ` /projects ` — featured projects uploaded via admin
- ` /repos ` — GitHub repos (note: request listed ` /projects ` twice; assumption: repos lives at ` /repos ` to avoid collision)
- ` /articles ` — Medium article list for ` @shellhaki `
- ` /articles/[id] ` — parsed article reading view
- ` /contact ` — contact form
- ` /gallery ` — personal Pinterest\-style image/video grid with All / Pictures / Videos filter
- ` /admin ` — gated upload dashboard showing "Welcome Haki"

API / server routes (server\-only):

- ` POST /api/contact ` — validate form, call Resend
- ` GET /api/repos ` or server fetch — proxy/cache GitHub repo list with pagination params
- ` POST /api/admin/projects `, ` PATCH/DELETE /api/admin/projects/[id] ` — featured\-project writes
- ` POST /api/admin/media `, ` PATCH/DELETE /api/admin/media/[id] ` — gallery uploads, Cloudflare \+ Neon writes

Global nav links to Home, Projects, Repos, Articles, Gallery, Contact; Admin is unlinked/hidden\.

## 4\. Home (` / `) — fully in Next\.js

Purpose: quick intro \+ entry points to work, writing, gallery, and contact\. Implemented as a Next\.js server component page with revalidation\.

Sections:

- Hero: name, short role/tagline, primary CTAs (View Projects, Get in Touch), social links (GitHub, Medium @shellhaki, \[NEEDS: other socials\])\.
- Highlights: 3–4 featured projects from Neon (thumbnail, title, one\-line about, link)\.
- Latest writing: 3 most recent Medium posts (title, excerpt, date, read time if available)\.
- Gallery teaser: 4–6 recent media tiles linking to ` /gallery `\.
- Contact teaser: short CTA to ` /contact `\.

Behavior: static\-first Next\.js page with revalidation; featured projects and gallery teaser read from Neon via server\-side Data API calls; Medium teaser uses cached server fetch with empty\-state fallback\.

<?kiko block L5Z4FDWMUBZHZ2UPMS3WHO44B5.7?>

<?kiko block L5Z4FDWMUBZHZ2UPMS3WHO44B5.8?>

<?kiko block L5Z4FDWMUBZHZ2UPMS3WHO44B5.9?>

<?kiko block L5Z4FDWMUBZHZ2UPMS3WHO44B5.10?>

<?kiko block L5Z4FDWMUBZHZ2UPMS3WHO44B5.11?>

## 10\. Env vars and config

```env
# Database (Neon Data API / serverless)
DATABASE_URL=
# or NEON_DATA_API_URL + NEON_API_KEY per driver choice

# GitHub
GITHUB_USERNAME=
GITHUB_TOKEN= # optional, raises rate limit

# Medium
MEDIUM_USERNAME=shellhaki
MEDIUM_FEED_URL= # optional override

# Cloudflare media storage
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_BUCKET=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_PUBLIC_BASE_URL= # delivery domain

# Resend email
RESEND_API_KEY=
CONTACT_TO_EMAIL=
CONTACT_FROM_EMAIL= # verified domain sender

# Admin gate + app
ADMIN_SECRET= # or chosen auth credentials
NEXT_PUBLIC_SITE_URL=
```

Notes: never expose server keys to the client; validate env at boot with a clear error naming the missing var; "other stuff I didn't remember" is covered by ` ADMIN_SECRET ` and ` NEXT_PUBLIC_SITE_URL ` above\.

<?kiko block L5Z4FDWMUBZHZ2UPMS3WHO44B5.13?>
