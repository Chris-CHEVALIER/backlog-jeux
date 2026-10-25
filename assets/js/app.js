import { Store, canEdit, loadSettings, saveSettings } from "./store.js";
import { searchGames, thumbnail } from "./rawg.js";
import { renderStats } from "./stats.js";
import { escapeHtml, formatDate, formatHours, formatNumber, initials, normalizeText, today } from "./format.js";

const STATUSES = [
  { id: "playing", tab: "En cours", label: "En cours" },
  { id: "todo", tab: "À faire", label: "À faire" },
  { id: "paused", tab: "En pause", label: "En pause" },
  { id: "done", tab: "Terminés", label: "Terminé" },
  { id: "dropped", tab: "Abandonnés", label: "Abandonné" },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((status) => [status.id, status.label]));

const SORTS = {
  default: "Tri par défaut",
  title: "Titre (A → Z)",
  rating: "Note",
  endDate: "Date de fin",
  addedAt: "Date d'ajout",
  hltb: "Durée HLTB",
  hours: "Heures jouées",
};

const EMPTY_MESSAGES = {
  playing: "Aucun jeu en cours. Lancez-en un depuis « À faire » !",
  todo: "Votre liste d'envie est vide.",
  paused: "Aucun jeu en pause.",
  done: "Aucun jeu terminé pour l'instant.",
  dropped: "Aucun jeu abandonné. Bravo !",
};

const $ = (selector) => document.querySelector(selector);
const main = $("#main");
const gameDialog = $("#game-dialog");
const settingsDialog = $("#settings-dialog");

const state = {
  settings: loadSettings(),
  store: null,
  games: [],
  tab: "playing",
  query: "",
  sort: "default",
};

function owner() {
  return canEdit(state.settings);
}

function uid() {
  return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function findGame(id) {
  return state.games.find((game) => game.id === id);
}

function lastActivity(game) {
  const sessions = (game.sessions || []).map((session) => session.date);
  return [game.startDate, ...sessions].filter(Boolean).sort().pop() || game.addedAt || "";
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (element.hidden = true), 5000);
}

/* ---------- Tri et filtre ---------- */

function compare(a, b, key) {
  const text = (x, y) => String(x || "").localeCompare(String(y || ""), "fr");
  const numDesc = (x, y) => (Number(y) || 0) - (Number(x) || 0);
  switch (key) {
    case "title": return text(a.title, b.title);
    case "rating": return numDesc(a.rating, b.rating);
    case "endDate": return text(b.endDate, a.endDate);
    case "addedAt": return text(b.addedAt, a.addedAt);
    case "hltb": return (a.hltb?.main || Infinity) - (b.hltb?.main || Infinity);
    case "hours": return numDesc(a.hours, b.hours);
    case "priority": return (a.priority ?? Infinity) - (b.priority ?? Infinity) || text(a.addedAt, b.addedAt);
    case "activity": return text(lastActivity(b), lastActivity(a));
    default: return 0;
  }
}

function defaultSort(tab) {
  return { playing: "activity", paused: "activity", todo: "priority", done: "endDate", dropped: "endDate" }[tab];
}

function matches(game) {
  if (!state.query) return true;
  const haystack = normalizeText([game.title, ...(game.genres || [])].join(" "));
  return normalizeText(state.query).split(/\s+/).every((word) => haystack.includes(word));
}

function visibleGames(status) {
  const key = state.sort === "default" ? defaultSort(status) : state.sort;
  return state.games
    .filter((game) => game.status === status && matches(game))
    .sort((a, b) => compare(a, b, key) || compare(a, b, "title"));
}

function canReorder() {
  return owner() && state.tab === "todo" && state.sort === "default" && !state.query;
}

/* ---------- Rendu ---------- */

function render() {
  renderTabs();
  renderSortOptions();
  $("#add-button").hidden = !owner();
  if (state.tab === "stats") {
    renderStats(main, state.games);
  } else {
    renderGrid();
  }
}

function renderTabs() {
  const tabs = STATUSES.map((status) => {
    const count = state.games.filter((game) => game.status === status.id && matches(game)).length;
    return tabButton(status.id, status.tab, count);
  });
  tabs.push(tabButton("stats", "Statistiques"));
  $("#tabs").innerHTML = tabs.join("");
}

function tabButton(id, label, count) {
  const selected = state.tab === id;
  return `
    <button class="tab tab-${id}" role="tab" type="button" data-tab="${id}" aria-selected="${selected}">
      ${escapeHtml(label)}${count == null ? "" : `<span class="count">${count}</span>`}
    </button>`;
}

function renderSortOptions() {
  const select = $("#sort");
  select.disabled = state.tab === "stats";
  select.innerHTML = Object.entries(SORTS)
    .map(([value, label]) => `<option value="${value}" ${value === state.sort ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderGrid() {
  const games = visibleGames(state.tab);
  if (!games.length) {
    const message = state.query ? `Aucun résultat pour « ${escapeHtml(state.query)} ».` : EMPTY_MESSAGES[state.tab];
    const action = owner() && !state.query ? `<button class="button primary" type="button" data-action="add">+ Ajouter un jeu</button>` : "";
    main.innerHTML = `<div class="empty"><p>${message}</p>${action}</div>`;
    return;
  }
  const reorder = canReorder();
  main.innerHTML = `
    ${state.tab === "todo" && reorder ? `<p class="hint grid-hint">Classez vos envies : glissez une carte ou utilisez les flèches.</p>` : ""}
    <div class="grid ${state.tab === "playing" ? "grid-featured" : ""}">
      ${games.map((game, index) => card(game, index, reorder)).join("")}
    </div>`;
}

function cover(game, width, height) {
  if (game.cover) {
    return `<img src="${escapeHtml(thumbnail(game.cover, width, height))}" alt="" loading="lazy" decoding="async">`;
  }
  return `<span class="cover-placeholder" aria-hidden="true">${escapeHtml(initials(game.title))}</span>`;
}

function progress(game) {
  const hours = Number(game.hours) || 0;
  const target = Number(game.hltb?.main) || 0;
  if (!target) return `<p class="meta">${formatHours(hours)} jouées</p>`;
  const ratio = Math.min(1, hours / target);
  return `
    <div class="progress" role="img" aria-label="${formatHours(hours)} sur ${formatHours(target)} estimées">
      <span style="width:${(ratio * 100).toFixed(1)}%"></span>
    </div>
    <p class="meta">${formatHours(hours)} <span class="muted">/ ${formatHours(target)} (HLTB)</span></p>`;
}

function cardDetails(game) {
  switch (game.status) {
    case "playing":
    case "paused": {
      const last = lastActivity(game);
      const since = game.status === "paused" ? "En pause" : last && last !== game.startDate ? `Joué le ${formatDate(last)}` : game.startDate ? `Depuis le ${formatDate(game.startDate)}` : "";
      return `${progress(game)}${since ? `<p class="meta muted">${since}</p>` : ""}`;
    }
    case "todo": {
      const parts = [];
      if (game.hltb?.main) parts.push(`≈ ${formatHours(game.hltb.main)}`);
      if (game.released) parts.push(game.released.slice(0, 4));
      return `<p class="meta muted">${parts.join(" · ") || "Durée inconnue"}</p>`;
    }
    default: {
      const parts = [];
      if (game.endDate) parts.push(`${game.status === "done" ? "Fini" : "Arrêté"} le ${formatDate(game.endDate)}`);
      if (game.hours) parts.push(formatHours(game.hours));
      return `<p class="meta muted">${parts.join(" · ")}</p>`;
    }
  }
}

function card(game, index, reorder) {
  const badge = game.status === "done" && game.rating != null && game.rating !== ""
    ? `<span class="rating-badge" title="Note">${formatNumber(game.rating)}</span>`
    : "";
  const rank = game.status === "todo" && state.sort === "default" && !state.query
    ? `<span class="rank-badge">#${index + 1}</span>`
    : "";
  const arrows = reorder ? `
    <div class="reorder">
      <button type="button" data-move="-1" aria-label="Monter ${escapeHtml(game.title)}">▲</button>
      <button type="button" data-move="1" aria-label="Descendre ${escapeHtml(game.title)}">▼</button>
    </div>` : "";
  return `
    <article class="card status-${game.status}" data-id="${escapeHtml(game.id)}" ${reorder ? `draggable="true"` : ""}>
      <button class="card-hit" type="button" data-open="${escapeHtml(game.id)}" aria-label="Ouvrir ${escapeHtml(game.title)}"></button>
      <div class="cover">${cover(game, 640, 360)}${badge}${rank}</div>
      <div class="card-body">
        <h3>${escapeHtml(game.title)}</h3>
        ${cardDetails(game)}
      </div>
      ${arrows}
    </article>`;
}

/* ---------- Priorités de la liste « À faire » ---------- */

function renumber(list) {
  list.forEach((game, index) => {
    if (game.priority !== index + 1) {
      game.priority = index + 1;
      game.updatedAt = now();
    }
  });
}

function moveGame(id, targetIndex) {
  const list = visibleGames("todo");
  const from = list.findIndex((game) => game.id === id);
  if (from < 0) return;
  const to = Math.max(0, Math.min(list.length - 1, targetIndex));
  if (from === to) return;
  const [game] = list.splice(from, 1);
  list.splice(to, 0, game);
  renumber(list);
  state.store.scheduleSave("Priorités de la liste « À faire »");
  render();
  main.querySelector(`[data-id="${CSS.escape(id)}"] [data-move="${to < from ? -1 : 1}"]`)?.focus();
}

/* ---------- Fiche d'un jeu ---------- */

function openGame(id) {
  const game = id ? findGame(id) : null;
  if (id && !game) return;
  if (owner()) {
    openForm(game);
  } else {
    openDetails(game);
  }
}

function fact(label, value) {
  return value ? `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>` : "";
}

function hltbText(hltb = {}) {
  const parts = [["Histoire", hltb.main], ["+ extras", hltb.extra], ["100 %", hltb.completionist]]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label} ${formatHours(value)}`);
  return parts.join(" · ");
}

function sessionList(sessions, editable) {
  if (!sessions?.length) return `<p class="hint">Aucune session notée.</p>`;
  const sorted = sessions.map((session, index) => ({ ...session, index })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<ul class="sessions">${sorted.map((session) => `
    <li>
      <span class="session-date">${formatDate(session.date)}</span>
      <span class="session-hours">${formatHours(session.hours)}</span>
      <span class="session-note">${escapeHtml(session.note || "")}</span>
      ${editable ? `<button type="button" class="icon-button small" data-remove-session="${session.index}" aria-label="Supprimer la session">✕</button>` : ""}
    </li>`).join("")}</ul>`;
}

function openDetails(game) {
  gameDialog.innerHTML = `
    <header class="sheet-header">
      <h2>${escapeHtml(game.title)}</h2>
      <button class="icon-button" type="button" data-close aria-label="Fermer">✕</button>
    </header>
    <div class="sheet-body">
      <div class="detail-cover">${cover(game, 960, 540)}</div>
      <p><span class="status-chip status-${game.status}">${STATUS_LABEL[game.status]}</span>
        ${game.status === "done" && game.rating != null && game.rating !== "" ? `<span class="rating-pill">${formatNumber(game.rating)}/10</span>` : ""}</p>
      <dl class="facts">
        ${fact("Début", formatDate(game.startDate))}
        ${fact("Fin", formatDate(game.endDate))}
        ${fact("Heures jouées", game.hours ? formatHours(game.hours) : "")}
        ${fact("HowLongToBeat", hltbText(game.hltb))}
        ${fact("Sortie", formatDate(game.released))}
        ${fact("Genres", escapeHtml((game.genres || []).join(", ")))}
      </dl>
      ${game.notes ? `<p class="notes">${escapeHtml(game.notes)}</p>` : ""}
      ${game.sessions?.length ? `<h3>Sessions</h3>${sessionList(game.sessions, false)}` : ""}
    </div>`;
  gameDialog.showModal();
}

function statusRadios(current) {
  return STATUSES.map((status) => `
    <label class="segment status-${status.id}">
      <input type="radio" name="status" value="${status.id}" ${status.id === current ? "checked" : ""}>
      <span>${status.label}</span>
    </label>`).join("");
}

function numberInput(name, value, attributes = "") {
  return `<input name="${name}" type="number" inputmode="decimal" min="0" step="0.5" value="${value ?? ""}" ${attributes}>`;
}

function openForm(game) {
  const isNew = !game;
  const draft = structuredClone(game || {
    status: state.tab === "stats" ? "todo" : state.tab,
    hours: 0,
    sessions: [],
    hltb: {},
    genres: [],
  });
  draft.sessions ||= [];
  draft.hltb ||= {};

  gameDialog.innerHTML = `
    <form id="game-form" novalidate>
      <header class="sheet-header">
        <h2>${isNew ? "Ajouter un jeu" : "Modifier le jeu"}</h2>
        <button class="icon-button" type="button" data-close aria-label="Fermer">✕</button>
      </header>
      <div class="sheet-body">
        <div class="title-row">
          <label class="grow">Titre
            <input name="title" required autocomplete="off" value="${escapeHtml(draft.title || "")}" placeholder="Ex. The Legend of Zelda: Tears of the Kingdom">
          </label>
          <button class="button" type="button" data-action="rawg">Chercher la jaquette</button>
        </div>
        <div id="rawg-results" class="rawg-results" aria-live="polite"></div>

        <div class="cover-row">
          <div class="detail-cover small" id="cover-preview">${cover(draft, 480, 270)}</div>
          <label class="grow">Adresse de la jaquette
            <input name="cover" type="url" autocomplete="off" value="${escapeHtml(draft.cover || "")}" placeholder="https://…">
          </label>
        </div>

        <fieldset class="segments">
          <legend>Statut</legend>
          ${statusRadios(draft.status)}
        </fieldset>

        <div class="field-row">
          <label>Date de début<input name="startDate" type="date" value="${escapeHtml(draft.startDate || "")}"></label>
          <label>Date de fin<input name="endDate" type="date" value="${escapeHtml(draft.endDate || "")}"></label>
          <label>Heures jouées${numberInput("hours", draft.hours)}</label>
          <label class="rating-field">Note /10${numberInput("rating", draft.rating, `max="10"`)}</label>
        </div>

        <fieldset>
          <legend>Temps pour le finir (HowLongToBeat)</legend>
          <div class="field-row">
            <label>Histoire${numberInput("hltbMain", draft.hltb.main)}</label>
            <label>+ extras${numberInput("hltbExtra", draft.hltb.extra)}</label>
            <label>100 %${numberInput("hltbCompletionist", draft.hltb.completionist)}</label>
          </div>
          <p class="hint"><a id="hltb-link" href="#" target="_blank" rel="noopener">Chercher ce jeu sur HowLongToBeat</a> puis recopiez les durées (en heures).</p>
        </fieldset>

        <fieldset>
          <legend>Journal des sessions</legend>
          <div id="session-list">${sessionList(draft.sessions, true)}</div>
          <div class="session-add">
            <label>Date<input name="sessionDate" type="date" value="${today()}"></label>
            <label>Durée (h)${numberInput("sessionHours", "", `placeholder="1,5"`)}</label>
            <label class="grow">Note<input name="sessionNote" autocomplete="off" placeholder="Facultatif"></label>
            <button class="button" type="button" data-action="add-session">Ajouter</button>
          </div>
          <p class="hint">Chaque session s'ajoute aux heures jouées.</p>
        </fieldset>

        <label>Notes<textarea name="notes" rows="3">${escapeHtml(draft.notes || "")}</textarea></label>
      </div>
      <footer class="sheet-footer">
        ${isNew ? "" : `<button class="button danger" type="button" data-action="delete">Supprimer</button>`}
        <span class="spacer"></span>
        <button class="button" type="button" data-close>Annuler</button>
        <button class="button primary" type="submit">Enregistrer</button>
      </footer>
    </form>`;

  const form = gameDialog.querySelector("form");
  const field = (name) => form.elements[name];

  const updateHltbLink = () => {
    $("#hltb-link").href = `https://howlongtobeat.com/?q=${encodeURIComponent(field("title").value.trim())}`;
  };
  const updateStatus = () => {
    const status = form.elements.status.value;
    form.querySelector(".rating-field").hidden = status !== "done";
    if (status === "playing" && !field("startDate").value) field("startDate").value = today();
    if ((status === "done" || status === "dropped") && !field("endDate").value) field("endDate").value = today();
  };
  const updatePreview = () => {
    $("#cover-preview").innerHTML = cover({ title: field("title").value, cover: field("cover").value }, 480, 270);
  };
  const refreshSessions = () => {
    $("#session-list").innerHTML = sessionList(draft.sessions, true);
  };

  updateHltbLink();
  form.querySelector(".rating-field").hidden = draft.status !== "done";

  form.addEventListener("input", (event) => {
    if (event.target.name === "title") updateHltbLink();
    if (event.target.name === "cover") updatePreview();
  });
  form.addEventListener("change", (event) => {
    if (event.target.name === "status") updateStatus();
  });
  field("title").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runRawgSearch(form, draft);
    }
  });

  form.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "rawg") runRawgSearch(form, draft);
    if (action === "add-session") {
      const hours = parseFloat(String(field("sessionHours").value).replace(",", "."));
      if (!(hours > 0)) {
        field("sessionHours").focus();
        return;
      }
      const date = field("sessionDate").value || today();
      draft.sessions.push({ date, hours, note: field("sessionNote").value.trim() });
      field("hours").value = Math.round(((parseFloat(field("hours").value) || 0) + hours) * 100) / 100;
      if (!field("startDate").value || date < field("startDate").value) field("startDate").value = date;
      field("sessionHours").value = "";
      field("sessionNote").value = "";
      refreshSessions();
    }
    if (button.dataset.removeSession != null) {
      const [removed] = draft.sessions.splice(Number(button.dataset.removeSession), 1);
      const total = (parseFloat(field("hours").value) || 0) - (removed?.hours || 0);
      field("hours").value = Math.max(0, Math.round(total * 100) / 100);
      refreshSessions();
    }
    if (action === "pick") {
      const pick = draft.rawgResults?.[Number(button.dataset.index)];
      if (!pick) return;
      field("title").value = pick.title;
      field("cover").value = pick.cover;
      Object.assign(draft, { rawgId: pick.rawgId, released: pick.released, genres: pick.genres });
      $("#rawg-results").innerHTML = "";
      updatePreview();
      updateHltbLink();
    }
    if (action === "delete" && confirm(`Supprimer « ${draft.title} » du backlog ?`)) {
      state.games.splice(state.games.findIndex((item) => item.id === draft.id), 1);
      state.store.forget(draft.id);
      state.store.scheduleSave(`Suppression : ${draft.title}`);
      gameDialog.close();
      render();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = field("title").value.trim();
    if (!title) {
      field("title").focus();
      return;
    }
    const number = (name) => {
      const value = parseFloat(String(field(name).value).replace(",", "."));
      return Number.isFinite(value) ? value : null;
    };
    const status = form.elements.status.value;
    const rating = number("rating");
    const previous = game?.status;
    Object.assign(draft, {
      title,
      cover: field("cover").value.trim(),
      status,
      startDate: field("startDate").value,
      endDate: field("endDate").value,
      hours: number("hours") || 0,
      rating: rating == null ? null : Math.min(10, rating),
      hltb: { main: number("hltbMain"), extra: number("hltbExtra"), completionist: number("hltbCompletionist") },
      notes: field("notes").value.trim(),
      updatedAt: now(),
    });
    delete draft.rawgResults;
    if (status === "todo" && previous !== "todo") {
      draft.priority = Math.max(0, ...state.games.filter((item) => item.status === "todo").map((item) => item.priority || 0)) + 1;
    }
    if (isNew) {
      draft.id = uid();
      draft.addedAt = now();
      state.games.push(draft);
    } else {
      Object.assign(game, draft);
    }
    state.store.scheduleSave(`${isNew ? "Ajout" : "Mise à jour"} : ${title}`);
    gameDialog.close();
    if (state.tab !== "stats" && state.tab !== status) {
      state.tab = status;
      history.replaceState(null, "", `#${status}`);
    }
    render();
  });

  gameDialog.showModal();
  if (isNew) field("title").focus();
}

async function runRawgSearch(form, draft) {
  const results = $("#rawg-results");
  const query = form.elements.title.value.trim();
  if (!query) {
    form.elements.title.focus();
    return;
  }
  if (!state.settings.rawgKey) {
    results.innerHTML = `<p class="hint">Ajoutez une clé RAWG dans les réglages pour chercher les jaquettes, ou collez l'adresse d'une image ci-dessous.</p>`;
    return;
  }
  results.innerHTML = `<p class="hint">Recherche…</p>`;
  try {
    draft.rawgResults = await searchGames(query, state.settings.rawgKey);
    if (!draft.rawgResults.length) {
      results.innerHTML = `<p class="hint">Aucun jeu trouvé sur RAWG.</p>`;
      return;
    }
    results.innerHTML = draft.rawgResults.map((game, index) => `
      <button type="button" class="rawg-item" data-action="pick" data-index="${index}">
        ${game.cover ? `<img src="${escapeHtml(thumbnail(game.cover, 320, 180))}" alt="" loading="lazy">` : `<span class="cover-placeholder">${escapeHtml(initials(game.title))}</span>`}
        <span class="rawg-title">${escapeHtml(game.title)}</span>
        <span class="rawg-meta">${escapeHtml([game.released?.slice(0, 4), game.platforms.some((name) => /nintendo switch/i.test(name)) ? "Switch" : ""].filter(Boolean).join(" · "))}</span>
      </button>`).join("");
  } catch (error) {
    results.innerHTML = `<p class="hint error">${escapeHtml(error.message)}</p>`;
  }
}

/* ---------- Réglages ---------- */

function openSettings() {
  const form = $("#settings-form");
  for (const name of ["owner", "repo", "branch", "token", "rawgKey"]) {
    form.elements[name].value = state.settings[name] || "";
  }
  settingsDialog.showModal();
}

settingsDialog.addEventListener("close", async () => {
  if (settingsDialog.returnValue !== "save") return;
  const form = $("#settings-form");
  const next = { ...state.settings };
  for (const name of ["owner", "repo", "branch", "token", "rawgKey"]) {
    next[name] = form.elements[name].value.trim();
  }
  next.branch ||= "main";
  const reconnect = ["owner", "repo", "branch", "token"].some((name) => next[name] !== state.settings[name]);
  state.settings = next;
  saveSettings(next);
  if (reconnect) await start();
  else render();
});

$("#export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: 1, games: state.games }, null, 2)], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `backlog-${today()}.json`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
});

/* ---------- Événements ---------- */

$("#tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (!tab) return;
  location.hash = tab.dataset.tab;
});

$("#search").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  render();
});

$("#sort").addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

$("#add-button").addEventListener("click", () => openGame(null));
$("#settings-button").addEventListener("click", openSettings);

main.addEventListener("click", (event) => {
  const move = event.target.closest("[data-move]");
  if (move) {
    const id = move.closest(".card").dataset.id;
    const index = visibleGames("todo").findIndex((game) => game.id === id);
    moveGame(id, index + Number(move.dataset.move));
    return;
  }
  const open = event.target.closest("[data-open]");
  if (open) openGame(open.dataset.open);
  if (event.target.closest("[data-action='add']")) openGame(null);
});

let dragged = null;
main.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".card[draggable]");
  if (!card) return;
  dragged = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragged);
});
main.addEventListener("dragover", (event) => {
  if (!dragged || !event.target.closest(".card")) return;
  event.preventDefault();
  main.querySelectorAll(".drop-target").forEach((element) => element.classList.remove("drop-target"));
  event.target.closest(".card").classList.add("drop-target");
});
main.addEventListener("drop", (event) => {
  const target = event.target.closest(".card");
  if (!dragged || !target) return;
  event.preventDefault();
  const index = visibleGames("todo").findIndex((game) => game.id === target.dataset.id);
  moveGame(dragged, index);
});
main.addEventListener("dragend", () => {
  dragged = null;
  main.querySelectorAll(".dragging, .drop-target").forEach((element) => element.classList.remove("dragging", "drop-target"));
});

gameDialog.addEventListener("click", (event) => {
  if (event.target === gameDialog || event.target.closest("[data-close]")) gameDialog.close();
});
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});

window.addEventListener("beforeunload", (event) => {
  if (["pending", "saving"].includes(saveStatus.dataset.state)) event.preventDefault();
});

/* ---------- Démarrage ---------- */

const saveStatus = $("#save-status");
const STATUS_TEXT = {
  pending: "Modifications en attente…",
  saving: "Enregistrement…",
  saved: "Enregistré",
  error: "Erreur d'enregistrement",
};

function onSaveStatus(status, message) {
  saveStatus.dataset.state = status;
  saveStatus.textContent = STATUS_TEXT[status];
  if (status === "error") toast(message);
}

function readHash() {
  const hash = location.hash.slice(1);
  if ([...STATUSES.map((status) => status.id), "stats"].includes(hash)) state.tab = hash;
}

window.addEventListener("hashchange", () => {
  readHash();
  render();
});

async function start() {
  readHash();
  state.store = new Store(state.settings, onSaveStatus);
  saveStatus.textContent = "";
  saveStatus.dataset.state = owner() ? "idle" : "readonly";
  try {
    state.games = (await state.store.load()).games;
    render();
  } catch (error) {
    state.games = state.store.data.games;
    render();
    toast(error.message);
  }
}

start();
