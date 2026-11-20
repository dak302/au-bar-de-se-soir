# Au Bar de ce Soir

Carte des cocktails du mini-bar, pensée pour le téléphone.

## Comment ça marche

- **Le site** (`index.html`, `icone.png`) est hébergé par GitHub Pages.
- **Les données** (ingrédients, cocktails, catégories, Livre d'or, photos) restent dans Google :
  un Google Sheet et un dossier Drive, gérés par le script Apps Script (`apps-script/Code.gs`).
- Le site parle au script via son adresse d'application Web (`API_URL` en haut du script de `index.html`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Tout le site (HTML + CSS + JS). Le même fichier fonctionne aussi collé dans Apps Script sous le nom « Index ». |
| `apps-script/Code.gs` | Serveur Apps Script : données, Manager, photos, et API pour le site GitHub. |
| `icone.png` | Icône du site (onglet, écran d'accueil du téléphone). |
| `photos/` | Photos de bouteilles sur fond beige. |

## Réglages Apps Script

- Déploiement : Application Web, exécuter en tant que **moi**, accès **tout le monde**.
- Mise à jour : Déployer → Gérer les déploiements → crayon → **Nouvelle version** (l'adresse `/exec` ne change pas).
- Propriétés du script (Paramètres du projet → Propriétés du script) :
  - `ADMIN_CODE` : le code du Manager (jamais écrit dans ce dépôt public).
  - `SHEET_ID`, `PHOTO_FOLDER`, `SEEDED`, `SETUP_V2` : créés automatiquement.
