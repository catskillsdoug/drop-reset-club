# OwnerRez checkout markers (discovery, 2026-10-22)

## Key finding
The booking FORM and CONFIRMATION are NOT served at reset.club/stay/*. They live on app.ownerrez.com (not proxied).
OwnerRez doc: "all quotes and forms are handled on the app.ownerrez.com domain for secure credit card processing"
(https://www.ownerrez.com/support/articles/analytics-tracking). The Worker (handleStay) never sees them.

## What reset.club/stay/<slug> contains (walked, headless Chrome UA, HTTP 200, no 403)
- Title: "Hill Studio - RESET CLUB". Saved HTML: ownerrez-booking-form.html (this is the property page + widget host, not the form).
- Booking is a cross-origin iframe: `div.ownerrez-widget[data-widget-type="Booking/Inquiry"][data-propertyid=<uuid-no-dashes>]`
  > `iframe.ownerrez-widget-iframe` src `https://app.ownerrez.com/widgets/<widgetId>?seq=0&propertyKey=<key>&referrer=<page url>`.
  Hill property key a7860575a46e40c68f3d079fcd12ae9b, widget id bc13bfcc7dc04037b52942aa31814115.
- Iframe fields (names/ids): ArrivalDate, DepartureDate, Adults, Children, Pets, DiscountCode, FirstName, LastName, Email, Phone.*,
  hidden PropertyKeyx, HostUrl; buttons `button[name=actionType][value=Book]` (RESERVE) and `[value=Inquire]`.
  Dates are picked only in the datepicker; no or_arrival/or_departure URL params found in widget.js or the iframe.
- Parent page cannot read iframe DOM (cross-origin), so arrival/departure/nights are not readable from reset.club JS.
- NOT reached: the form step. "Book" needs name/email/phone and POSTs, which creates a quote record. Stopped per instructions.

## How the hand-off works (read from widget.js + iframe source)
1. Book click in iframe: AJAX POST, response `paymentForm` URL (app.ownerrez.com quote/checkout page).
2. Iframe runs runBookingStartedConversions (GA BookingStarted/begin_checkout, Meta InitiateCheckout), then updateLocation(paymentForm + tracking params).
3. Parent's widget.js message handler (origin-checked to https://app.ownerrez.com) receives `{id, seq, url}` and does `window.top.location = data.url`.
   Exact quote URL shape not observed (would need a real submit).

## Confirmation page
Docs do not give a URL pattern. Quotes: hosted checkout page "Confirm & Pay" guest form; confirmation page is also on OwnerRez.
- Purchase fires "on the hosted website checkout confirmation page" (Meta Purchase; GA Booking>Booked + ecommerce transaction).
- Optional redirect: "Redirect After Booking URL" (Property > Rules > Change); OwnerRez "automatically appends the booking ID ... https://yoursite.com/?bookingId=ORB123456"
  (https://www.ownerrez.com/support/articles/hosted-websites-redirect-back-your-website-after-booking). API quote field: redirect_after_booking_url.
- No documented thank-you page script field or JS event. Documented custom code: "put custom tracking code in the Footer of your Hosted Website" (hosted pages only, not app.ownerrez.com).

## OwnerRez built-in tracking (Settings > Advanced Tools > Analytics Tracking)
GA, Meta Pixel, Google Ads, GTM. Events: Quote>BookingStarted (GA4 begin_checkout; Meta InitiateCheckout) on view of initial quote checkout page;
Booking>Booked + ecommerce transaction (Meta Purchase) on completion; Widget>BookingStarted on Book click. Direct bookings only.
These fire on app.ownerrez.com with your IDs, not on reset.club.

## What the proxy does today (reset-club-proxy/src/index.js ~848-906)
holdTrackersForConsent turns any script whose src matches googletagmanager|connect.facebook.net|posthog.com or body calls gtag(/fbq(/posthog
into type="text/plain" data-consent="analytics"; /v5/consent.js re-activates after Accept. Meta noscript pixel removed.
Live /stay page already contains (held for consent) a PostHog init (key phc_kMMz..., cross_subdomain_cookie true) plus a snippet that wraps window.fbq
and emits posthog.capture('booking_completed', {source:'ownerrez_purchase'}) when fbq('track','Purchase') fires. That snippet is in the OwnerRez
header/footer HTML, and since Purchase fires on app.ownerrez.com (where the snippet is not present) it likely never runs on confirmation. Unverified.
The Worker does not touch app.ownerrez.com at all.

## Recommended detection
- stay_checkout_started: in injected script on /stay/<slug>, addEventListener('message') accepting e.origin==='https://app.ownerrez.com' and JSON/object with a `url`
  (the hand-off to the quote page, same signal widget.js uses). Property from location slug; guests/nights/arrival are NOT in that message
  (would need the quote URL/page or an OwnerRez API read by quote id). Alt: server-side from OwnerRez webhook/API.
- booking_completed: set Property > Rules > "Redirect After Booking URL" to a reset.club page (e.g. https://reset.club/stay/thanks?)
  which receives ?bookingId=ORB...; fire the event there, then look up property/nights/arrival server-side via OwnerRez API (GET /v2/bookings/{id}) or webhook.
  Most reliable and keeps data out of the browser. Client-only alternative is not possible: the confirmation page is on app.ownerrez.com.
- Verify next (needs a real test quote/booking by Doug): exact paymentForm URL pattern, whether redirect appends only bookingId.
