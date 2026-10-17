# Trip Concierge

A shared travel concierge for two phones: nearby places, routes with things to see along the way, a shared itinerary with a rule-based day planner, and a camera that files photos by day, place and person. Everything syncs live.

- Frontend: Vite + Preact PWA (installable on iPhone and Android)
- Backend: Supabase (auth, Postgres with row-level security, realtime, storage)
- Maps: Google Maps JavaScript API, Places API (New), Routes API (key is entered in the app)

```
npm install
npm run dev      # local
npm run build    # outputs dist/, published to the gh-pages branch
```
