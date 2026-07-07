/**
 * Hardened fetch used by every external-API client.
 *
 * - Exponential backoff on 429 / 5xx, honoring the `Retry-After` header.
 * - Per-request timeout via AbortController.
 * - Optional in-process TTL cache so repeated lookups within a single run or
 *   request don't re-hit the upstream API.
 *
 * This replaces the ad-hoc `setTimeout()` rate-limiting and manual
 * `res.status === 429` branches scattered across the seed-* routes. The
 * resilience model mirrors the date-probe loop in
 * `lib/ingest/disa.ts::fetchLatestDcasXlsx`.
 */

export interface RetryOptions {
  /** Max retry attempts after the first try (default 4). */
  retries?: number
  /** Base backoff delay in ms; grows exponentially (default 500). */
  baseDelayMs?: number
  /** Ceiling for a single backoff wait in ms (default 20_000). */
  maxDelayMs?: number
  /** Abort a single attempt after this many ms (default 30_000). */
  timeoutMs?: number
  /** Cache key. Defaults to `${method} ${url} ${body}`. Set null to disable. */
  cacheKey?: string | null
  /** How long a cached value stays fresh, in ms (default 0 = no caching). */
  cacheTtlMs?: number
  /** Label used in thrown errors / logs. */
  label?: string
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const responseCache = new Map<string, CacheEntry>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultCacheKey(url: string, init?: RequestInit): string {
  const method = (init?.method || 'GET').toUpperCase()
  const body = typeof init?.body === 'string' ? init.body : ''
  return `${method} ${url} ${body}`
}

/**
 * Parse a Retry-After header (either delta-seconds or an HTTP date) into ms.
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const asSeconds = Number(header)
  if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1000)
  const asDate = Date.parse(header)
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now())
  return null
}

/**
 * Fetch with retry/backoff. Returns the raw Response (caller reads body).
 * Retries on network errors, 429, and 5xx. Does NOT retry other 4xx.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {}
): Promise<Response> {
  const {
    retries = 4,
    baseDelayMs = 500,
    maxDelayMs = 20_000,
    timeoutMs = 30_000,
    label = url,
  } = opts

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)

      if (res.ok) return res

      // Retry on rate-limit and server errors; fail fast on other 4xx.
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
          const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
          await sleep(retryAfter ?? backoff)
          continue
        }
      }

      return res // non-retryable, or out of retries — let caller inspect status
    } catch (err) {
      clearTimeout(timer)
      lastError = err
      if (attempt < retries) {
        const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
        await sleep(backoff)
        continue
      }
    }
  }

  throw new Error(
    `fetchWithRetry failed for ${label}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}

/**
 * Fetch and parse JSON, with retry/backoff and optional TTL caching.
 * Throws on non-2xx responses (after retries are exhausted).
 */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {}
): Promise<T> {
  const cacheKey =
    opts.cacheKey === null
      ? null
      : opts.cacheKey ?? defaultCacheKey(url, init)
  const ttl = opts.cacheTtlMs ?? 0

  if (cacheKey && ttl > 0) {
    const hit = responseCache.get(cacheKey)
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as T
    }
  }

  const res = await fetchWithRetry(url, init, opts)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `${opts.label || url}: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
    )
  }

  const value = (await res.json()) as T

  if (cacheKey && ttl > 0) {
    responseCache.set(cacheKey, { value, expiresAt: Date.now() + ttl })
  }

  return value
}

/** Clear the in-process response cache (useful in tests / long-running syncs). */
export function clearFetchCache(): void {
  responseCache.clear()
}

/**
 * Race a promise against a timeout. On timeout, resolves with `onTimeout()` if
 * provided, else rejects. Used to keep slow/flaky sources (e.g. SBIR's 429
 * backoff) from hanging a request — the underlying work may keep running, but
 * the caller stops waiting.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => T
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (onTimeout) resolve(onTimeout())
      else reject(new Error(`timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}
