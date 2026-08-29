/**
 * Best-effort client IP.
 *
 * Header order matters for trust. `x-forwarded-for` is a chain that a client
 * can prepend to, so its left-most entry is whatever the caller claimed.
 * Vercel sets `x-vercel-forwarded-for` and `x-real-ip` itself from the actual
 * TCP peer, so those are preferred and cannot be forged by the guest.
 *
 * Even so, treat the result as a hint for the host, never as an authorisation
 * decision: VPNs, mobile carrier NAT and dynamic home IPs all blur it.
 */
export function clientIp(request: Request): string | undefined {
  const trusted =
    request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip");
  if (trusted?.trim()) return trusted.trim();

  // Self-hosted / local fallback. Right-most entry is the hop nearest us and
  // therefore the least likely to be caller-supplied.
  const chain = request.headers.get("x-forwarded-for");
  if (chain) {
    const hops = chain.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return undefined;
}
