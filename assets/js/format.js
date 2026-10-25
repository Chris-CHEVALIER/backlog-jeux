// Petites fonctions d'affichage partagées.

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "short" });

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function today() {
  return new Date().toLocaleDateString("sv");
}

export function parseDate(iso) {
  return iso ? new Date(`${iso.slice(0, 10)}T00:00`) : null;
}

export function formatDate(iso) {
  const date = parseDate(iso);
  return date ? dateFormat.format(date) : "";
}

export function formatMonth(date) {
  return monthFormat.format(date).replace(".", "");
}

export function formatNumber(value, digits = 1) {
  return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

export function formatHours(value) {
  return `${formatNumber(value)} h`;
}

export function normalizeText(text) {
  return String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function initials(title) {
  return String(title || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
