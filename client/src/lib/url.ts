// Canonical form of a URL, used as the deduplication key.
//
// Two links that open the same page should collapse to one saved resource even
// when they differ by campaign parameters, a fragment, or a trailing slash. The
// original URL is always kept alongside this on the resource, and it is the one
// we open — normalization is for matching only.

const TRACKING_PARAMETERS = [
  /^utm_/,
  /^ga_/,
  /^mc_/,
  /^pk_/,
  /^hsa_/,
  /^_hs/,
  /^(fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|igshid|mkt_tok|ref|ref_src|source|si)$/,
];

const isTracking = (key: string) => {
  const lower = key.toLowerCase();
  return TRACKING_PARAMETERS.some((pattern) => pattern.test(lower));
};

/**
 * Returns the canonical form of `raw`, or "" when it is not a URL we can key on
 * (empty, malformed, or a non-web scheme such as chrome:// or about:blank).
 */
export function normalizeUrl(raw: string | undefined | null): string {
  if (!raw) return "";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return "";

  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !isTracking(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);

  // A trailing slash on a path is not meaningful; on the bare origin it is.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  // The scheme is dropped so that http:// and https:// of the same page match.
  return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}${url.search}`;
}

/** Host of a URL without the scheme or "www.", for display and grouping. */
export function domainOf(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
