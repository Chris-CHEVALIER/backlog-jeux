// Onglet Statistiques : tuiles chiffrées et deux histogrammes.

import { escapeHtml, formatHours, formatMonth, formatNumber, parseDate, today } from "./format.js";

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function tile(label, value, detail = "") {
  return `
    <div class="stat-tile">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${value}</span>
      ${detail ? `<span class="stat-detail">${detail}</span>` : ""}
    </div>`;
}

// Histogramme en HTML : une colonne par valeur, infobulle au survol ou au focus, tableau équivalent.
function barChart(title, subtitle, points, unit) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const columns = points.map((point) => {
    const height = (point.value / max) * 100;
    return `
      <div class="bar-col" tabindex="0" aria-label="${escapeHtml(point.label)} : ${escapeHtml(unit(point.value))}">
        <div class="bar-track">
          <div class="bar" style="height:${height}%"></div>
        </div>
        <span class="bar-label">${escapeHtml(point.label)}</span>
        <span class="bar-tip">${escapeHtml(point.tip || point.label)}<strong>${escapeHtml(unit(point.value))}</strong></span>
      </div>`;
  }).join("");
  const rows = points.map((point) => `<tr><td>${escapeHtml(point.tip || point.label)}</td><td>${escapeHtml(unit(point.value))}</td></tr>`).join("");
  return `
    <section class="chart-card">
      <h3>${escapeHtml(title)}</h3>
      <p class="chart-subtitle">${escapeHtml(subtitle)}</p>
      <div class="bar-chart">
        <span class="axis-max">${escapeHtml(unit(max))}</span>
        <div class="bar-columns">${columns}</div>
      </div>
      <details class="chart-table">
        <summary>Voir en tableau</summary>
        <table><tbody>${rows}</tbody></table>
      </details>
    </section>`;
}

function finishedByYear(done) {
  const years = done.map((game) => parseDate(game.endDate)?.getFullYear()).filter(Boolean);
  if (!years.length) return [];
  const last = new Date().getFullYear();
  const first = Math.max(Math.min(...years), last - 9);
  const points = [];
  for (let year = first; year <= last; year++) {
    const value = years.filter((y) => y === year).length;
    points.push({ label: String(year), value });
  }
  return points;
}

function hoursByMonth(games) {
  const now = parseDate(today());
  const points = [];
  for (let offset = 11; offset >= 0; offset--) {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = month.toLocaleDateString("sv").slice(0, 7);
    const value = sum(games.flatMap((game) => (game.sessions || []).filter((s) => s.date?.startsWith(key)).map((s) => s.hours)));
    const tip = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    points.push({ label: formatMonth(month), value, tip });
  }
  return points;
}

export function renderStats(container, games) {
  const by = (status) => games.filter((game) => game.status === status);
  const done = by("done");
  const playing = [...by("playing"), ...by("paused")];
  const todo = by("todo");
  const year = new Date().getFullYear();
  const doneThisYear = done.filter((game) => parseDate(game.endDate)?.getFullYear() === year).length;
  const rated = done.filter((game) => game.rating != null && game.rating !== "");
  const average = rated.length ? sum(rated.map((game) => game.rating)) / rated.length : null;
  const remaining = sum(playing.map((game) => Math.max(0, (game.hltb?.main || 0) - (game.hours || 0))));
  const todoWithTime = todo.filter((game) => game.hltb?.main);
  const todoHours = sum(todoWithTime.map((game) => game.hltb.main));
  const missing = todo.length - todoWithTime.length;

  const tiles = [
    tile("Terminés", formatNumber(done.length), `dont ${doneThisYear} en ${year}`),
    tile("Heures jouées", formatHours(sum(games.map((game) => game.hours))), "tous statuts confondus"),
    tile("Note moyenne", average == null ? "–" : `${formatNumber(average)}<small>/10</small>`, `${rated.length} jeu${rated.length > 1 ? "x" : ""} noté${rated.length > 1 ? "s" : ""}`),
    tile("En cours et en pause", formatNumber(playing.length), remaining ? `≈ ${formatHours(remaining)} restantes (HLTB)` : ""),
    tile("À faire", formatNumber(todo.length), todoHours ? `≈ ${formatHours(todoHours)} de jeu${missing ? ` (+ ${missing} sans durée)` : ""}` : "dans la liste d'envie"),
    tile("Abandonnés", formatNumber(by("dropped").length)),
  ].join("");

  const years = finishedByYear(done);
  const months = hoursByMonth(games);
  const plural = (n) => `${formatNumber(n)} jeu${n > 1 ? "x" : ""}`;
  const charts = [
    years.length ? barChart("Jeux terminés par année", "D'après la date de fin", years, plural) : "",
    months.some((point) => point.value) ? barChart("Heures jouées par mois", "12 derniers mois, d'après le journal des sessions", months, formatHours) : "",
  ].join("");

  const top = rated.sort((a, b) => b.rating - a.rating || (b.endDate || "").localeCompare(a.endDate || "")).slice(0, 5);
  const topList = top.length ? `
    <section class="chart-card">
      <h3>Mieux notés</h3>
      <ol class="top-list">
        ${top.map((game) => `<li><button type="button" data-open="${escapeHtml(game.id)}">${escapeHtml(game.title)}</button><span class="rating-pill">${formatNumber(game.rating)}</span></li>`).join("")}
      </ol>
    </section>` : "";

  container.innerHTML = `
    <div class="stats">
      <div class="stat-grid">${tiles}</div>
      <div class="chart-grid">${charts}${topList}</div>
      ${games.length ? "" : `<p class="empty">Ajoutez quelques jeux pour voir vos statistiques.</p>`}
    </div>`;
}
