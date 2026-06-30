# Nova Social

Nova Social is a full-stack Instagram-style social platform built with React/Vite and Node/Express. It includes authentication, feeds, posts, reels, stories, profiles, messaging, notifications, search, verification requests, reports, moderation, and an admin dashboard.

## Quick Start

```bash
npm run install:all
npm run dev
```

Client: http://localhost:5173  
API: http://localhost:4200/api

## Demo Accounts

- Admin: `admin@nova.test` / `password123`
- Creator: `maya@nova.test` / `password123`
- User: `leo@nova.test` / `password123`

## Structure

```text
client/          React/Vite app
server/          Express API and JSON database
server/data/     Local persistent database created at runtime
```

## Notes

The backend uses a local JSON store so the project runs immediately without external services. Media fields accept remote URLs and are modeled so Firebase, Supabase, S3, or Cloudinary storage can be added behind the same API later.
