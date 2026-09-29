/**
 * The tunnels' proper names, keyed by product name — the same map the API's
 * push builder carries (services/push/messages.js#TUNNEL_TITLES), because a
 * pass is known by its route ("Tauern A10"), not by a country. The name is
 * identical in every language, so it never goes through i18n. A tunnel this
 * map has not learned yet still gets its route code out of its own name.
 */
const TUNNEL_TITLES: Record<string, string> = {
  "tunnel-at-a9": "Pyhrn A9",
  "tunnel-at-a9-bosruck": "Bosruck A9",
  "tunnel-at-a9-gleinalm": "Gleinalm A9",
  "tunnel-at-a10": "Tauern A10",
  "tunnel-at-a11": "Karawanken A11",
  "tunnel-at-a13": "Brenner A13",
  "tunnel-at-s16": "Arlberg S16",
  "tunnel-ch-muntlaschera": "Munt La Schera",
}

export function tunnelTitle(product: string): string {
  return (
    TUNNEL_TITLES[product] ||
    product.replace(/^tunnel-[a-z]{2}-?/i, "").toUpperCase() ||
    "Tunnel"
  )
}
