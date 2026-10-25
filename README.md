# Backlog jeux vidéo

Page personnelle pour suivre mes jeux : en cours (plusieurs à la fois), à faire (liste d'envie), en pause, terminés et abandonnés.
Site statique hébergé sur GitHub Pages, sans dépendance ni étape de compilation.

## Fonctionnalités

- Onglets par statut avec grille de jaquettes ; « En cours » mis en avant.
- Fiche de jeu : dates de début et de fin, heures jouées, note sur 10 (jeux terminés), durées HowLongToBeat (histoire, + extras, 100 %), notes libres.
- Journal des sessions : chaque session ajoute sa durée aux heures jouées.
- Liste « À faire » classée par priorité (glisser-déposer ou flèches).
- Recherche (titre et genres) et tri (titre, note, date de fin, date d'ajout, durée HLTB, heures jouées).
- Statistiques : terminés par année, heures par mois, note moyenne, temps restant estimé.
- Jaquettes récupérées depuis [RAWG](https://rawg.io/apidocs), ou adresse d'image collée à la main.

## Comment sont stockées les données

Tout est dans [`data/games.json`](data/games.json).

- **Visiteurs** : la page lit ce fichier tel que publié par GitHub Pages. Lecture seule.
- **Moi** : avec un token GitHub saisi dans les réglages (⚙), la page lit et écrit le fichier via l'API GitHub.
  Chaque série de modifications produit un commit. Si le fichier a changé depuis un autre appareil, les deux versions sont fusionnées jeu par jeu (la plus récente l'emporte).

Le token et la clé RAWG restent dans le `localStorage` du navigateur. Ils ne sont jamais écrits dans le dépôt.
Après un enregistrement, GitHub Pages peut mettre une à deux minutes à servir la nouvelle version aux visiteurs.

## Mise en place

1. **Activer GitHub Pages** : *Settings → Pages → Deploy from a branch*, branche `main`, dossier `/ (root)`.
2. **Créer un token** sur [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) :
   - *Repository access* : *Only select repositories* → ce dépôt uniquement ;
   - *Permissions → Repository → Contents* : *Read and write* ;
   - une date d'expiration (à renouveler ensuite dans les réglages de la page).
3. **Créer une clé RAWG** gratuite sur [rawg.io/apiv2](https://rawg.io/apiv2).
4. Ouvrir la page publiée, cliquer sur ⚙ et coller le token et la clé. Le propriétaire et le dépôt sont détectés depuis l'adresse `pseudo.github.io/depot/`.

À refaire sur chaque appareil (ordinateur, téléphone).

## Tester en local

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000. Sans token, la page lit `data/games.json` en lecture seule. Avec un token, elle écrit dans le dépôt GitHub configuré dans les réglages.

## Structure

```text
index.html            page unique
assets/css/style.css  thème sombre
assets/js/app.js      interface (onglets, grille, fiches, réglages)
assets/js/store.js    lecture et écriture de games.json (fichier publié ou API GitHub)
assets/js/rawg.js     recherche de jaquettes RAWG
assets/js/stats.js    onglet Statistiques
assets/js/format.js   dates, heures, échappement HTML
data/games.json       les données
```

## Format d'un jeu

```json
{
  "id": "…",
  "title": "The Legend of Zelda: Tears of the Kingdom",
  "status": "playing",
  "cover": "https://media.rawg.io/media/games/…jpg",
  "startDate": "2026-09-15",
  "endDate": "",
  "hours": 38.5,
  "rating": null,
  "hltb": { "main": 59, "extra": 101, "completionist": 215 },
  "sessions": [{ "date": "2026-10-23", "hours": 2.5, "note": "Temple du vent" }],
  "priority": null,
  "notes": "",
  "rawgId": 22511,
  "released": "2023-05-12",
  "genres": ["Action", "Adventure"],
  "addedAt": "2026-09-15T10:00:00.000Z",
  "updatedAt": "2026-10-23T21:12:00.000Z"
}
```

`status` vaut `todo`, `playing`, `paused`, `done` ou `dropped`.
