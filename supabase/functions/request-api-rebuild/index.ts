const ALLOWED_ORIGINS = new Set([
  "https://wazawaza-map.github.io",
  "http://localhost:5173",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://wazawaza-map.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function jwtPayload(authorization: string | null): Record<string, unknown> | null {
  try {
    const token = authorization?.replace(/^Bearer\s+/i, "") || "";
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  // Supabase verifies the JWT before invoking this function (see config.toml).
  const claims = jwtPayload(request.headers.get("authorization"));
  const appMetadata = claims?.app_metadata as Record<string, unknown> | undefined;
  if (appMetadata?.role !== "admin") return json(request, { error: "Admin role required" }, 403);

  const githubToken = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  if (!githubToken) return json(request, { error: "GitHub dispatch is not configured" }, 503);

  const response = await fetch(
    "https://api.github.com/repos/wazawaza-map/wazawaza-map.github.io/dispatches",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "wazawaza-api-rebuild",
      },
      body: JSON.stringify({
        event_type: "places_changed",
        client_payload: { source: "wazadmin", requested_at: new Date().toISOString() },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error(`GitHub repository dispatch failed (${response.status}): ${detail}`);
    return json(request, { error: "Could not request API rebuild" }, 502);
  }

  return json(request, { queued: true }, 202);
});
