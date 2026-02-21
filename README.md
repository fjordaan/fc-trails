# FC Trails

Mobile web app for self-guided walking trails at [Fulham Cemetery](https://fulhamcemeteryfriends.org.uk), built for the Friends of Fulham Cemetery.

**Live site:** [trails.fulhamcemeteryfriends.org.uk](https://trails.fulhamcemeteryfriends.org.uk)

- [Tree Trail](https://trails.fulhamcemeteryfriends.org.uk/tree-trail)
- [Grave Trail](https://trails.fulhamcemeteryfriends.org.uk/grave-trail)
- [Admin CMS](https://trails.fulhamcemeteryfriends.org.uk/admin) (requires a GitHub PAT)

## Features

- Interactive map with custom imagery, waypoint markers, and walking route overlay
- Pan and zoom with multi-touch gestures
- GPS location shown as a blue dot when on-site
- Photo gallery with pinch-to-zoom for each waypoint
- Swipe navigation between waypoints
- Installable as a PWA
- CMS admin panel for managing trail content via the GitHub API

## Tech stack

- Vanilla HTML, CSS, and JavaScript (no framework)
- [Hammer.js](https://hammerjs.github.io/) for touch gestures
- [Vite](https://vitejs.dev/) for local dev and build
- Deployed to GitHub Pages with a custom domain

## Trail structure

Each trail lives in its own folder under `trails/`:

```
trails/tree-trail/
  trail.json        # Trail metadata, features, and waypoints
  map.png           # Base map image (1521x2020)
  route.svg         # Walking route overlay
  photos/{id}/      # Waypoint photos, organised by waypoint ID
  photos/{id}/thumbs/
```

Trail content is defined in `trail.json` and managed through the admin CMS at `/admin`.

## Local development

```
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`.

## Deployment

Pushes to `main` trigger a GitHub Actions workflow that builds with Vite and deploys to GitHub Pages.
