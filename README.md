# Adedoyinsola’s World — Palm Avenue (v3: The Estate)

A single-player 3D portfolio with React, a Three.js city, an authenticated Express content studio, and Supabase persistence for Vercel.

## Run locally

Requires Node.js 24 (also selected for Vercel in `package.json`). Use `nvm use` if you have nvm.

```sh
npm install
npm run admin:setup
npm run dev
```

Visit http://127.0.0.1:5173. The dashboard is http://127.0.0.1:5173/admin. The setup command asks for a password privately and stores only a salted scrypt hash in the ignored `.env` file. Restart the API after setting or changing the password. Until configured, admin login is locked. No default credentials ship with the app.

## What is included

**The neighbourhood (v3)**
- Modelled on a 1970s federal housing estate in Lagos as it looks today (the real place is deliberately not named anywhere in the app). A palm-lined dual-carriageway avenue with a raised median, black-and-white kerbs, open concrete drains with crossing slabs, interlocking footpaths, laterite verges, speed bumps, worn markings and numbered side roads (31–35 Road).
- Walk-up blocks of flats (3–4 storeys) with stair cores behind breeze-block screen walls, projecting balconies with solid parapets, caged balconies, glass louvre and sliding windows behind burglar bars, roof parapets, rows of blue and black water tanks, satellite dishes, AC units, laundry lines and drainpipes.
- Ground-floor flats converted into shops with roller shutters, stocked shelves, awnings and painted signboards (all business names fictional), plus kiosks, POS umbrellas, a vulcanizer, jerrycans, generators and plastic chairs on the forecourts.
- Owner-painted terraced duplexes and bungalows behind block walls with steel gates, bougainvillea over the walls and the usual painted messages (“THIS HOUSE IS NOT FOR SALE”, “POST NO BILL”).
- Street furniture: wooden utility poles with sagging lines and service drops, transformers, double-arm median lamps, road-name signs.
- Trees: Indian almond along the footpaths, royal palms down the median, coconut palms and neem in the compounds, wind-blown grass. Foliage uses alpha-to-coverage and dissolves near the camera.
- Weathering everywhere, computed from world position so nothing tiles: rain streaks under sills and parapets, black damp patches, laterite splash-back along the base of every wall, dust on paving.
- The four destinations are lit glass shopfronts or spaces in the street: The Studio, The Gallery, Play Room and The Courtyard (festoon lights, tables, almond shade).

**Graphics**
- Art-directed time of day: golden hour (default), daylight and night (press **T** or use Settings). Custom sky with sun or moon, clouds and stars; reflections baked from the same sky.
- Multisampled HDR pipeline with ground-truth ambient occlusion (Ultra), bloom, ACES tone mapping, colour grade, procedural lens flare and sunlit dust. Retina-sharp: the post stack now renders at the device pixel ratio.
- Wide, texel-snapped sun shadows (72 m on Ultra), contact shadows under every vehicle.
- Night: sodium lamps with light pools, lit windows, stairwell bulbs, fluorescent shop tubes, neon signs, headlights and brake lights.
- Realistic people: the player and pedestrians are Microsoft Rocketbox avatars (MIT) with motion-captured idle, walk, run and wave clips; pedestrians walk, stand and chat, and wave when you walk up.
- Vehicles: yellow minibuses, tricycles, saloons and SUVs with extruded body profiles, wheel arches and visible seated drivers; traffic keeps right on both carriageways, slows for corners and honks if you block it. Parked cars sit in yards and forecourts.
- Title screen: four authored establishing shots with dips to black, kept in clear air over the roads (this replaces the old orbit camera, which could pass through roofs and tree canopies and fill the screen).

**Play**
- Arcade driving model with weight transfer: speed-sensitive steering, body roll and pitch, handbrake slides (**Space**), tyre smoke, skid marks, and sliding along walls instead of sticking.
- Chase camera that follows your direction of travel, widens its field of view with speed, recentres after you look around, shakes on hard impacts, and swoops down from the opening shot when you enter.
- On foot: a rigged civilian with blended idle / walk / run. **F** gets back in when you are near the car; if you have walked away, the car is brought to you.
- Rotating radar (bottom left, visible only after entering the world) with roads, buildings, destination blips pinned to the edge and a north marker. Set a **GPS** route from the map and a purple line guides you there along the roads.
- Cinematic title cards when you pull up at a destination; **E** opens it.
- Synthesised sound (opt in): engine revs with a simulated gearbox, horn (**H**), traffic horns, birds by day and insects at night. No audio files.
- Automatic graphics scaling: Ultra drops to High, then Performance, if the frame rate stays low. Choosing a quality in Settings turns this off. `?quality=ultra|high|low` and `?time=day|golden|night` also work in the URL.

**Portfolio and studio**
- About, contact links, a wider project spotlight with Web/Mobile filters, previous/next controls, and clear live-project links. A memory game and a seven-checkpoint driving sprint. Accessible direct navigation to all content without playing, keyboard dialogs, reduced-motion support, and a WebGL fallback.
- A content studio for profile, contact details, services, projects and world copy/accent, with password hashing, HttpOnly sessions, same-origin checks, rate-limited login, schema validation, revision checks and atomic writes.

## Controls

| Control           | Action                                     |
| ----------------- | ------------------------------------------ |
| WASD / arrow keys | Drive / walk                               |
| Space             | Handbrake (slide) / brake                  |
| Shift             | Run on foot                                |
| F                 | Step out / get back in (or call your car)  |
| E                 | Open a nearby destination                  |
| H                 | Horn                                       |
| T                 | Change time of day                         |
| M                 | Map, fast travel and GPS                   |
| C                 | Camera: chase, far, bonnet                 |
| Drag              | Look around                                |
| R                 | Reset position and cancel sprint           |
| Escape            | Close a panel                              |

Phones get touch arrows and a brake button; every place is also one tap away on the map.

## Content

Initial biographical and project data was taken from https://adedoyinsola.vercel.app/ on 2026-10-22. The previous Landmark Citizen App URL pointed to a hospital website, so it is intentionally blank pending correction. Project covers are explicitly labeled illustrative compositions, not screenshots of the actual products. Replace them in the studio with uploaded screenshots, product images, or animated GIFs, or use an external image URL. Under **Projects → Project cover**, choose a PNG, JPG, WebP, or GIF (up to 8 MB), review the preview, then click **Save changes**. GIF and WebP animations are preserved. Removing a cover restores the illustrative fallback; uploaded files are retained so existing links stay valid.

Until content is saved, the API serves `server/seed.mjs`. In Supabase mode, admin saves persist the content document in `portfolio_content`; covers upload directly to the public `project-covers` bucket and retain their original animation. The API verifies the file bytes after upload. A stale save returns HTTP 409, including across different Vercel function instances. In optional local mode (`DATA_BACKEND=local`), content and images use `data/content.json` and `data/uploads/`; back up both.

## Verification

```sh
npm run build
npm test
```

The tests validate vehicle binary integrity and bounds, project creation/removal, authentication, persistence across store recreation, stale and concurrent updates, unsafe URLs, duplicate project IDs, cross-origin requests, logout, unconfigured admin lockout, and secure production cookies.

## Production deployment

Vercel serves `dist/` and routes `/api/*` to the Express function in `api/index.mjs`. Supabase stores content, player password hashes, attempts, scores, hashed sessions and rate-limit counters. Images upload directly to Supabase Storage, so an 8 MB GIF does not pass through Vercel's request-body limit. Serverless instances share sessions and rankings, and local files are never used as production storage.

Follow [DEPLOYMENT.md](DEPLOYMENT.md) before deploying: run `supabase/setup.sql`, configure `.env`, run `npm run db:check`, and add the server credentials and admin password hash to Vercel. `.env` is never included in the frontend or deployment upload. The browser does not need the secret or a Supabase Auth session; the existing username/password sign-in remains on the API with HttpOnly cookies. `@supabase/ssr` is unnecessary for this Vite/Express application.

All application tables have RLS enabled and explicit grants restricted to `service_role`. Database functions use security-invoker privileges and deny anonymous execution. Production cookies are Secure, HttpOnly and SameSite=Strict. Admin sessions last eight hours and player sessions seven days, surviving restarts in cloud mode. Credentials are salted scrypt hashes; there is no password recovery service yet. Contact opens the visitor's email client.

Fonts and world assets are self-hosted. Project covers use Supabase Storage or the external image URLs you choose. The application makes no analytics requests.

## Scope and next steps

This is a real-time browser world, not GTA V: a single street block, procedurally built and weathered, with realistic people, at a size that still loads on the web. The layout is inspired by the estate's planning (avenues, numbered roads, walk-up blocks, duplexes) but is not a survey of it, and no real name is used. Ultra expects a recent integrated or discrete GPU; phones default to High.

Higher-fidelity next steps: bespoke modelled buildings and vehicles (glTF with baked lighting and LODs), KTX2 texture compression, a photographed facade set, enter/exit-car animations, physics with suspension (e.g. Rapier), and interiors for the four destinations. For multiplayer: an authoritative simulation server, rooms, interpolated player state, and a database-backed session layer; the browser must never be authoritative for shared state.

## Structure

- `src/world/World.ts`: simulation loop, driving and walking, cameras, collisions, markers, sprint and night lights.
- `src/world/Atmosphere.ts`: time of day, sky shader, environment reflections, shadows and the post-processing / colour-grade stack.
- `src/world/Vehicles.ts`: procedural minibus, tricycle, saloon and SUV, plus the traffic system.
- `src/world/District.ts`: the estate layout — roads, median, drains, utilities, plots, street life, signage, skyline.
- `src/world/Buildings.ts`, `src/world/Kit.ts`: blocks of flats, duplexes, bungalows, shopfronts, kiosks; shared materials, windows, tanks, gates, walls.
- `src/world/Flora.ts`: almond, neem, coconut and royal palms, shrubs and grass.
- `src/world/Geo.ts`, `src/world/Materials.ts`, `src/world/Textures.ts`: geometry batching with vertex-colour tints, weathering and foliage shaders, procedural textures and the sign atlas.
- `src/world/People.ts`: civilian loading, animation blending and pedestrians.
- `src/world/Effects.ts`, `src/world/Audio.ts`: skid marks, tyre smoke and the synthesised soundscape.
- `src/world/roads.ts`, `src/Radar.tsx`: road network, GPS routing and the rotating radar.
- `src/world/District.ts`: original residential architecture, material loading, street props, vegetation, static batching, and building collision boundaries.
- `src/App.tsx`: portfolio, game HUD, accessible navigation and panels.
- `src/Map.tsx`, `src/Arcade.tsx`: navigation map and memory game.
- `src/Admin.tsx`: content studio.
- `server/`: content validation/storage, authentication, and HTTP API.
- `scripts/admin-setup.mjs`: local password provisioning.
- `tests/api.test.mjs`: isolated API integration tests.

## Asset attribution

Car Concept: Eric Chadwick / Darmstadt Graphics Group GmbH, 2024, CC BY 4.0 (runtime paint, scale, orientation, lights and wheel animation adapted). People and animations: Microsoft Rocketbox Avatar Library, MIT License (Copyright (c) 2020 Microsoft; licence text shipped in `public/assets/people/LICENSE-Rocketbox.md`). Street textures: Poly Haven, CC0. DM Sans and Manrope are self-hosted under the SIL Open Font License. Everything else (the neighbourhood, vehicles, trees, sky, effects, sound) is generated in code. Full notes: `public/assets/CREDITS.txt` and World Settings.

## Validation notes

Build and automated checks pass (API/auth/content, vehicle and character rigs, materials, estate geometry and batching, lane/junction/arrival clearance, GPS routing). Golden hour, day and night were reviewed in headless Chromium at Ultra, High and Performance, including the title-screen shots, driving, walking, the four destinations, side roads and night. Headless rendering is software-only; check the real frame rate on your own machine. The estate is about 750k triangles in ~100 draw calls; if a machine struggles, Ultra steps down automatically.

## Arcade accounts and rankings

Both games show **3 → 2 → 1 → GO** before accepting play. Completed games show a result card with a brief confetti burst (disabled with reduced motion). Guest results are stored in `localStorage` under `avenue-game-history-v1`; the latest 200 sessions survive reloads on the same browser and origin. Clearing site data clears these records. Sprint ranks by fastest time; memory ranks by fewest moves, then fastest time. Equal results share a rank. Incomplete or cancelled games are not saved.

Visitors can create a player using a public username and password from the Arcade, or sign in before starting a game. Each new signed-in game gets a server-issued attempt ID. Completion is saved locally first and submitted to the shared leaderboard, which shows each player's best result per game. Guest runs are not uploaded retrospectively. A failed submission can be retried from the result card without duplicating the score. Username/password player accounts are separate from the content administrator. There is currently no password recovery service.

In Supabase mode, player accounts, attempts, scores and sessions persist in the database and work across Vercel instances. Guest game history remains in the visitor’s browser. In local mode only, accounts and scores use `DATA_DIR/players.json`; local sessions end on restart. Back up the local data directory if using this offline option. All production sessions use Secure, HttpOnly, SameSite=Strict cookies.

The server checks authentication, attempt ownership, expiry, score ranges and elapsed time, and makes submissions idempotent. Results are still client-reported: this is a casual portfolio leaderboard, not an authoritative competition system. A prize-bearing or competitive release would need server-verified gameplay.

## Gameplay update verification

The wheel hubs now have independent steering and spin transforms, with the model's exported steering angle removed and brake calipers held fixed. On-foot velocity follows camera-relative input independently of the avatar's turn, with quick braking, normalized diagonals, collision substeps, wall sliding and animation driven by actual ground movement. The sprint locks movement during the countdown and prevents switching out of the car during a run.

Additional automated checks cover actual GLB wheel axle alignment, braking and direction changes, collision sliding and tunnelling, countdown/finish transitions, player session isolation, persistent accounts and scores, ownership and expiry checks, duplicate submissions, per-player best scores and ties. Browser QA uses a temporary data directory so test accounts do not appear in the real leaderboard.

## Interface and drivers update

The homepage keeps both primary actions clear by hiding the minimap until exploration starts. Portfolio copy uses direct descriptions of the work, and destination symbols replace decorative section numbers. Countdown numbers, speed, scores and leaderboard positions remain.

Moving vehicles have seated people with bent legs, arms fitted to their own controls, and fingers curled around the wheel or handlebars, visible through transparent windows; the player driver disappears when the visitor steps out. Traffic poses are baked into shared ordinary mesh geometry so they do not add live skeleton updates to every frame. Parked traffic vehicles stay empty. Automated checks use the actual character rigs to verify the pose, finite geometry, unchanged walking rigs and attachment through traffic turns. The player uses a low, reclined sports-car seat while keeping their gaze forward; checks raycast the actual head against the GLB roof and windscreen and verify both hands against the steering controls.

## Walking animation restoration

The player’s original Rocketbox Walk/Run clips now retain their hip rotation and vertical movement. Horizontal root motion remains removed so the controller owns position. Complete cycle endings are blended across their seam, and the procedural arm swing and lowest-foot body correction have been removed. Normal walking is 1.4 m/s; sprinting is 4.1 m/s, with animation phase driven by actual ground speed. `scripts/restore-locomotion.mjs` reproduces the restored GLB from the original MIT-licensed source animation. Tests check loop continuity, bounded root movement, no horizontal drift, pause behaviour, collisions and responsive stopping/turning.
