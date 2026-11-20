# Au Bar de ce Soir

Carte des cocktails du mini-bar, pensée pour le téléphone.
En ligne : https://dak302.github.io/au-bar-de-se-soir/

## Comment ça marche

Tout vit dans ce dépôt GitHub :

| Fichier | Rôle |
|---|---|
| `index.html` | Tout le site (HTML + CSS + JS). |
| `data.json` | Ingrédients, cocktails, catégories, photo About. Modifié par le Manager. |
| `photos/` | Photos des cocktails, des catégories et de la page About. |
| `icone.png` | Icône du site (onglet, écran d'accueil). |
| `apps-script/Code.gs` | Uniquement pour le **Livre d'or** (les messages des invités restent dans un Google Sheet). |

- Un cocktail n'apparaît que si **tous** ses ingrédients sont disponibles. `cat:gin` = n'importe quelle bouteille de gin.
- Le **Manager** (menu ≡ → Manager) enregistre directement dans `data.json` et `photos/`.
  Les invités voient les changements environ 1 minute après (le temps que GitHub Pages republie).

## Manager : clé GitHub

La première fois sur un appareil, le Manager demande le code **et** une clé GitHub.
Créer la clé : github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
- Repository access : **Only select repositories** → `au-bar-de-se-soir`
- Permissions → Repository permissions → **Contents : Read and write**
- Expiration au choix (à la fin, le Manager redemandera une nouvelle clé).

La clé reste enregistrée sur l'appareil ; bouton « Oublier la clé GitHub de cet appareil » en bas du Manager.

## Livre d'or

`apps-script/Code.gs` collé dans le projet Apps Script, déployé en Application Web
(exécuter en tant que moi, accès tout le monde). Propriété du script `ADMIN_CODE` = code du Manager.
L'adresse `/exec` du déploiement se met dans `GB_URL`, en haut du script de `index.html`.
Tant que `GB_URL` est vide, le Livre d'or est masqué.
