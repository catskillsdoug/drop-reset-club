import { onRequest as __health_js_onRequest } from "/Users/dougjaeger/drop-reset-club/functions/health.js"
import { onRequest as __og_image_js_onRequest } from "/Users/dougjaeger/drop-reset-club/functions/og-image.js"
import { onRequest as ___middleware_js_onRequest } from "/Users/dougjaeger/drop-reset-club/functions/_middleware.js"

export const routes = [
    {
      routePath: "/health",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__health_js_onRequest],
    },
  {
      routePath: "/og-image",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__og_image_js_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]