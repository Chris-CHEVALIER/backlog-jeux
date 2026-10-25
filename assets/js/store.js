// Lecture et écriture de data/games.json.
// Visiteur : lecture du fichier publié par GitHub Pages.
// Propriétaire (token renseigné) : lecture et écriture via l'API GitHub (un commit par sauvegarde).

const DATA_PATH = "data/games.json";
const SETTINGS_KEY = "backlog-settings";
const SAVE_DELAY = 1200;

export function emptyData() {
  return { version: 1, games: [] };
}

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    saved = {};
  }
  return { ...detectRepo(), branch: "main", token: "", rawgKey: "", ...saved };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Navigation privée : les réglages ne survivront pas au rechargement.
  }
}

// Sur https://pseudo.github.io/depot/ on devine le propriétaire et le dépôt.
function detectRepo() {
  const host = location.hostname;
  if (!host.endsWith(".github.io")) return { owner: "", repo: "" };
  const owner = host.split(".")[0];
  const repo = location.pathname.split("/").filter(Boolean)[0] || `${owner}.github.io`;
  return { owner, repo };
}

export function canEdit(settings) {
  return Boolean(settings.token && settings.owner && settings.repo);
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function normalize(data) {
  const result = { ...emptyData(), ...data };
  result.games = Array.isArray(result.games) ? result.games : [];
  return result;
}

export class Store {
  constructor(settings, onStatus) {
    this.settings = settings;
    this.onStatus = onStatus;
    this.sha = null;
    this.data = emptyData();
    this.deleted = new Set();
    this.timer = null;
    this.saving = false;
    this.pending = false;
    this.lastMessage = "";
  }

  get apiUrl() {
    const { owner, repo } = this.settings;
    return `https://api.github.com/repos/${owner}/${repo}/contents/${DATA_PATH}`;
  }

  get headers() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.settings.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async load() {
    if (canEdit(this.settings)) {
      const remote = await this.fetchRemote();
      this.data = remote.data;
      this.sha = remote.sha;
    } else {
      const response = await fetch(DATA_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error(`Impossible de lire ${DATA_PATH} (${response.status})`);
      this.data = normalize(await response.json());
    }
    return this.data;
  }

  async fetchRemote() {
    const url = `${this.apiUrl}?ref=${encodeURIComponent(this.settings.branch)}&t=${Date.now()}`;
    const response = await fetch(url, { headers: this.headers, cache: "no-store" });
    if (response.status === 404) return { data: emptyData(), sha: null };
    if (response.status === 401) throw new Error("Token GitHub refusé (expiré ou invalide).");
    if (!response.ok) throw new Error(`Lecture GitHub impossible (${response.status})`);
    const file = await response.json();
    return { data: normalize(JSON.parse(decodeBase64(file.content))), sha: file.sha };
  }

  // Les modifications rapprochées sont regroupées en un seul commit.
  scheduleSave(message) {
    if (!canEdit(this.settings)) return;
    this.lastMessage = message;
    this.onStatus("pending");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY);
  }

  forget(id) {
    this.deleted.add(id);
  }

  async flush() {
    if (this.saving) {
      this.pending = true;
      return;
    }
    this.saving = true;
    this.onStatus("saving");
    try {
      await this.put();
      this.onStatus("saved");
    } catch (error) {
      if (error.conflict) {
        try {
          await this.mergeRemote();
          await this.put();
          this.onStatus("saved");
        } catch (retryError) {
          this.onStatus("error", retryError.message);
        }
      } else {
        this.onStatus("error", error.message);
      }
    } finally {
      this.saving = false;
      if (this.pending) {
        this.pending = false;
        this.flush();
      }
    }
  }

  async put() {
    const body = {
      message: this.lastMessage || "Mise à jour du backlog",
      content: encodeBase64(JSON.stringify(this.data, null, 2) + "\n"),
      branch: this.settings.branch,
    };
    if (this.sha) body.sha = this.sha;
    const response = await fetch(this.apiUrl, {
      method: "PUT",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 409 || response.status === 422) {
      const error = new Error("Conflit avec une autre modification");
      error.conflict = true;
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Écriture refusée : vérifiez les droits du token (Contents en lecture et écriture).");
    }
    if (!response.ok) throw new Error(`Sauvegarde impossible (${response.status})`);
    this.sha = (await response.json()).content.sha;
  }

  // Le fichier a changé ailleurs (autre appareil) : on fusionne jeu par jeu, le plus récent l'emporte.
  async mergeRemote() {
    const remote = await this.fetchRemote();
    const merged = new Map();
    for (const game of remote.data.games) {
      if (!this.deleted.has(game.id)) merged.set(game.id, game);
    }
    for (const game of this.data.games) {
      const other = merged.get(game.id);
      if (!other || (game.updatedAt || "") >= (other.updatedAt || "")) merged.set(game.id, game);
    }
    this.data.games.splice(0, this.data.games.length, ...merged.values());
    this.sha = remote.sha;
  }
}
