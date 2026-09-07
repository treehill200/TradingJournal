import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers, including a nonce-based Content Security Policy.
 *
 * Next.js reads the nonce back out of the CSP header on the request and stamps
 * it onto the scripts it renders, so no inline script needs to be blanket
 * allowed. Styles still need 'unsafe-inline' — Tailwind and Next both inject
 * <style> tags — which is far less dangerous than allowing inline script.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's bootstrap script load its own chunks.
    // Dev needs eval for hot reloading; production does not.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // The app only ever talks to itself; there is no third-party analytics.
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("content-security-policy", csp);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  // Trading data should never leak into another site's referrer logs.
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, which carry no markup to protect.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
