// Recherche de jaquettes dans la base RAWG (https://rawg.io/apidocs).
// La clé est personnelle : elle reste dans le navigateur, jamais dans le dépôt.

export async function searchGames(query, key) {
  const params = new URLSearchParams({ key, search: query, page_size: "8", search_precise: "true" });
  const response = await fetch(`https://api.rawg.io/api/games?${params}`);
  if (response.status === 401) throw new Error("Clé RAWG refusée.");
  if (!response.ok) throw new Error(`Recherche RAWG impossible (${response.status})`);
  const { results } = await response.json();
  return results.map((game) => ({
    rawgId: game.id,
    title: game.name,
    cover: game.background_image || "",
    released: game.released || "",
    genres: (game.genres || []).map((genre) => genre.name),
    platforms: (game.platforms || []).map((item) => item.platform.name),
  }));
}

// Les images RAWG font souvent plusieurs Mo : on demande une version recadrée.
export function thumbnail(url, width = 640, height = 360) {
  if (!url) return "";
  return url.replace("/media/games/", `/media/crop/${width}/${height}/games/`);
}
