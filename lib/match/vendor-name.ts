/**
 * Canonical vendor-name utilities. Pure functions, no DB / no imports so they
 * can be reused anywhere (clients, ingesters, matcher) without cycles.
 *
 * `slugify` replaces the ~8 duplicated copies of the same slug regex across the
 * seed-* routes. `normalizeVendorName` powers fuzzy fallback matching when a
 * UEI/CAGE strong key or an explicit alias isn't available.
 */

/** URL/DB-safe slug: lowercase, non-alphanumeric → single dash, trimmed. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Legal-entity and common industry suffixes that add noise to a company name.
// Removed as whole words so "Systems" in "Elbit Systems" collapses but a match
// stays symmetric (normalization is applied to BOTH sides of a comparison).
const NOISE_WORDS = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'lp', 'plc', 'pbc', 'co', 'company',
  'corp', 'corporation', 'ltd', 'limited', 'gmbh', 'ag', 'sa', 'nv', 'bv',
  'holdings', 'holding', 'group', 'the',
  'technologies', 'technology', 'systems', 'solutions', 'industries',
  'international', 'labs', 'laboratories', 'federal', 'usa', 'us',
])

/**
 * Normalize a vendor name for fuzzy comparison: lowercase, strip punctuation,
 * drop corporate/industry noise words, collapse whitespace. Two names that
 * refer to the same firm should normalize to the same (or a prefix-overlapping)
 * string. Used only as a fallback after UEI/CAGE/slug/alias matching.
 */
export function normalizeVendorName(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const kept = cleaned
    .split(' ')
    .filter((word) => word.length > 0 && !NOISE_WORDS.has(word))

  // If every token was noise (rare), fall back to the cleaned string.
  return (kept.length > 0 ? kept.join(' ') : cleaned).trim()
}

/**
 * True if two vendor names plausibly refer to the same firm after
 * normalization (exact normalized match, or one is a token-prefix of the other
 * — e.g. "palantir" vs "palantir gotham federal").
 */
export function vendorNamesMatch(a: string, b: string): boolean {
  const na = normalizeVendorName(a)
  const nb = normalizeVendorName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.startsWith(nb + ' ') || nb.startsWith(na + ' ')
}
