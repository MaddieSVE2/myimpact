---
name: Vite public-route SSG
description: Compatibility constraints for build-time React rendering of My Impact public routes.
---

Public routes are rendered from a dedicated Vite SSR bundle during the production build. Keep authenticated routes client-rendered.

**Why:** The installed `react-helmet-async` release fails as an external Node ESM dependency and emits server metadata inline before the app tree. Without handling both behaviours, prerendering either crashes or leaves duplicate metadata inside the document body.

**How to apply:** When changing the public rendering pipeline, keep Helmet bundled in the SSR artifact and ensure only the rendered app tree is inserted into `#root`; route metadata belongs in `<head>`. Validate from a fresh full build because the root HTML becomes a generated page after postbuild.