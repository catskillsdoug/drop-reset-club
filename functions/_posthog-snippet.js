// PostHog init for server-rendered content pages (renderPageShell). Keep in step with the
// consent-gated block in v5/index.html (tests/content-analytics.test.mjs fails on drift).
export const POSTHOG_CONTENT_SNIPPET = String.raw`
    !(function (t, e) {
      var o, n, p, r;
      e.__SV ||
        ((window.posthog = e),
        (e._i = []),
        (e.init = function (i, s, a) {
          function g(t, e) {
            var o = e.split(".");
            (2 == o.length && ((t = t[o[0]]), (e = o[1])),
              (t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }));
          }
          (((p = t.createElement("script")).type = "text/javascript"),
            (p.crossOrigin = "anonymous"),
            (p.async = !0),
            (p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js"),
            (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r));
          var u = e;
          for (
            void 0 !== a ? (u = e[a] = []) : (a = "posthog"),
              u.people = u.people || [],
              u.toString = function (t) { var e = "posthog"; return ("posthog" !== a && (e += "." + a), t || (e += " (stub)"), e); },
              u.people.toString = function () { return u.toString(1) + ".people (stub)"; },
              o = "init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),
              n = 0;
            n < o.length;
            n++
          )
            g(u, o[n]);
          e._i.push([i, s, a]);
        }),
        (e.__SV = 1));
    })(document, window.posthog || []);

    posthog.init("phc_kMMzJpkChACUWWvd9HWeUWxB4HoMcoqoABVFecAaamkZ", {  // publishable project key (US, project 485877)
      api_host: "https://us.i.posthog.com",
      defaults: "2026-05-30",          // current PostHog defaults bundle (SPA-aware pageviews)
      person_profiles: "identified_only", // profiles only after identify() (email_signup)
      autocapture: true,               // clicks/inputs
      capture_pageview: "history_change", // pageviews incl. this SPA's URL/filter changes
      enable_heatmaps: true,           // heatmaps
      cross_subdomain_cookie: true,    // same visitor across reset.club subdomains
      // Session replay: on by default; also flip it ON in PostHog → Project settings → Session replay.
      opt_out_capturing_by_default: false // held by consent.js until Accept; resetAnalyticsConsent() flips it
    });

    // consent.js holds this whole block until Accept. resetAnalyticsConsent(true|false) toggles capture.
    window.resetAnalyticsConsent = function (granted) {
      try { granted ? posthog.opt_in_capturing() : posthog.opt_out_capturing(); } catch (e) {}
    };
`;
