# Beno Digital Card — Web app

Next.js 16 (App Router), React 19, Tailwind CSS 4. See the main `README.md` one level up for setup.

```bash
npm install
cp .env.example .env.local   # BACKEND_URL, NEXT_PUBLIC_APP_URL, INTERNAL_API_KEY
npm run dev                  # http://localhost:3000
npm run build && npm start   # production
```

| Path | Area |
|---|---|
| `/login`, `/accept-invite`, `/forgot-password`, `/reset-password` | Authentication |
| `/platform/*` | Beno Super Admin |
| `/admin/*` | Company Admin |
| `/me/*` | Employee portal |
| `/c/[company]/[employee]` | Public digital card (server-rendered) |

The card renderer lives in `components/card/` (`card-view.tsx` + `card.css`, four templates: classic, modern, executive, minimal).
