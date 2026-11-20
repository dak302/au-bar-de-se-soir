# Au Bar de ce Soir

Carte des cocktails du mini-bar, pensée pour le téléphone.
En ligne : https://dak302.github.io/au-bar-de-se-soir/

## La stack

Vite + React + TypeScript + Tailwind CSS v4 + shadcn (structure `components.json`, alias `@/`).
GitHub Actions construit le site et le publie sur GitHub Pages à chaque changement sur `main`
(`.github/workflows/deploy.yml`) ; réglage requis une fois : **Settings → Pages → Source : GitHub Actions**.

```bash
npm install
npm run dev      # site local
npm run build    # dist/ (copie aussi data.json, photos/, icone.png)
```

## Où sont les choses

| Chemin | Rôle |
|---|---|
| `src/components/ui/` | Composants (chemin shadcn par défaut, alias `@/components/ui`). |
| `src/components/ui/cocktail-pour.tsx` | Le verre qui se remplit : coupe, martini, tumbler, verre long, mug en cuivre ; liquides colorés, glaçons, garnitures. |
| `src/components/ui/coffee-pour-menu.tsx` | Le composant d'origine (Aakash Mehra), gardé tel quel comme référence. |
| `src/app/` | L'appli : vues, Manager, données, GitHub, Idées, traductions FR/HE/EN. |
| `src/app/legacy.css` | Le style de la carte (beige, contours noirs, animations). |
| `data.json` | Ingrédients (couleur du liquide comprise), cocktails (verre, glaçons, garniture, doses), catégories. Modifié par le Manager. |
| `photos/`, `icone.png` | Photos et icône. |
| `apps-script/Code.gs` | Uniquement pour le Livre d'or (Google Sheet). |

Pourquoi `src/components/ui` : c'est là que la CLI shadcn (`npx shadcn@latest add …`) pose les composants ;
garder ce dossier permet d'en coller ou d'en ajouter d'autres sans rien régler.

## Manager

Menu ≡ → Manager → code + (la première fois sur l'appareil) une clé GitHub :
github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** →
Only select repositories → `au-bar-de-se-soir` → Contents : **Read and write**.
Chaque enregistrement est un commit sur `main` ; les invités le voient 1 à 2 minutes après (le temps de la publication).

Dans la fiche d'un cocktail : verre, glaçons, garniture, avec l'aperçu du verre. Les nouveaux cocktails
calculent leur versement à partir des couleurs et doses de leurs ingrédients.
Cocktails → **Idées** : ce que permet le stock, d'après TheCocktailDB.

## Livre d'or

`apps-script/Code.gs` dans un projet Apps Script déployé en Application Web ; son adresse `/exec`
va dans `GB_URL` (`src/app/config.ts`). Vide : le Livre d'or est masqué.
