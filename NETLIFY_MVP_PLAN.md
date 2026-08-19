# Netlify deployment plan

- Publish directory: `public`
- Function directory: `netlify/functions`
- API route: `/api/*`
- Database migration: `netlify/database/migrations/20260817234000_initial_store_schema.sql`
- Admin route: `/admin`
- Configure environment variables from `.env.example` in Netlify before production use.
