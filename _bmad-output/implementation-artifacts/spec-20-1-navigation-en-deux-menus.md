---
title: 'Navigation regroupée en deux menus (story 20.1)'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: 'fba7190'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La barre aligne sept liens de même poids — Analyse, Évolution, Transactions, Import,
Catégories, À ranger, Règles — sans dire lesquels vont ensemble. « À ranger » est une vue des
transactions mais vit à l'autre bout ; Import, Règles et Catégories alimentent et paramètrent la
base sans que rien ne les rapproche.

**Approach:** Quatre entrées au lieu de sept. `Analyse` et `Évolution` restent des liens directs.
`Transactions ▾` et `Données ▾` deviennent des menus déroulants : le premier contient « Toutes »
et « À ranger », le second Import, Règles et Catégories. Aucune page n'est créée, déplacée ni
renommée — seule la façon d'y accéder change.

## Boundaries & Constraints

**Always:**
- Toutes les URL existantes restent valides et inchangées. Un lien profond ne casse pas.
- L'entrée d'un menu s'allume quand on est sur l'une de ses pages, `/reconciliation/<hash>`
  comptant pour « Données » comme il comptait pour « Import ».
- Le menu s'ouvre au clavier autant qu'à la souris, se ferme par `Escape` et par un clic
  extérieur, et rend le focus à son déclencheur.
- La barre ne déborde jamais : c'est le cadre de l'application, pas son contenu.

**Ask First:** ajouter un compteur à une entrée de menu ; toucher aux compteurs de santé de la
barre ; changer une URL.

**Never:**
- Pas de compteur « À ranger N » : le nombre de non-catégorisés n'est porté par aucune donnée
  déjà chargée, et l'afficher imposerait une requête sur CHAQUE page pour un chiffre décoratif.
- Pas de rail latéral (écarté en epic 16 : la ressource rare ici est la largeur).
- Pas de bibliothèque de composants tierce.
- Aucun changement de comportement des pages elles-mêmes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Ouverture souris | clic sur `Transactions ▾` | le menu s'ouvre, `aria-expanded="true"`, le premier élément prend le focus |
| Navigation | clic sur « À ranger » | va sur `/a-ranger`, le menu se ferme, `Transactions` reste allumé |
| Fermeture clavier | menu ouvert, `Escape` | le menu se ferme, le focus revient au déclencheur |
| Fermeture extérieure | menu ouvert, clic ailleurs | le menu se ferme sans naviguer |
| Deux menus | `Données` ouvert, clic sur `Transactions` | le premier se ferme, le second s'ouvre — jamais deux ouverts |
| Flèches | menu ouvert, `↓` / `↑` | le focus descend / remonte, sans sortir de la liste |
| État actif | route `/transactions/2026-08` | `Transactions` allumé, `Données` éteint |
| État actif hérité | route `/reconciliation/<hash>` | `Données` allumé — la page vient d'Import |
| Base vide | aucun relevé | « Toutes » vise l'année du calendrier, comme aujourd'hui |

</frozen-after-approval>

## Code Map

- `app/components/shared/AppBar.vue` -- les 7 entrées (l. 42-52), `isActive` par préfixe (l. 59-64), styles `.bar__nav` / `.bar__link`.
- `app/components/transactions/CategoryEditor.vue` -- le menu déroulant DÉJÀ écrit du projet (`Escape`, clic extérieur, focus rendu, classe `.overlay`). Modèle à suivre, pas à copier.
- `app/assets/styles/components.css` -- `.overlay` (l. 243), cadre partagé des surfaces flottantes.
- `app/composables/useBaseHealth.ts` -- `latestPeriod` vise la cible de « Toutes ».
- `tests/e2e/` -- naviguent par `goto` et par titre, jamais par la barre : rien ne devrait casser.

## Tasks & Acceptance

**Execution:**
- [x] `app/components/shared/AppBarMenu.vue` -- créer -- un déclencheur + une liste d'entrées, employé deux fois. Porte l'ouverture, le clavier, la fermeture et le focus ; ne connaît ni les routes ni les libellés.
- [x] `app/components/shared/AppBar.vue` -- passer à 4 entrées, dont 2 menus, et étendre `isActive` pour qu'un menu s'allume sur n'importe laquelle de ses pages.
- [x] `tests/e2e/navigation.spec.ts` -- créer -- ouverture, `Escape`, flèches, exclusion mutuelle, état actif. **En E2E et non en unitaire** : le projet n'embarque ni `@vue/test-utils` ni `happy-dom`, et les ajouter toucherait une stack verrouillée. C'est du comportement de navigateur, qu'un navigateur exerce mieux.
- [x] `app/components/shared/AppBar.vue` -- déplacer `overflow: hidden` de la barre vers ses COMPTEURS (non prévu) -- sur la barre, il rognait le menu ouvert ET faisait défiler la barre sur elle-même dès qu'une entrée prenait le focus.
- [x] `_bmad-output/planning-artifacts/epics.md` -- ouvrir l'epic 20 et y décrire la story 20.1.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- inscrire `epic-20` et `20-1-navigation-en-deux-menus`.

**Acceptance Criteria:**
- Given n'importe quelle page, when je regarde la barre, then elle porte quatre entrées : Analyse, Évolution, Transactions ▾, Données ▾.
- Given un menu ouvert, when je parcours au clavier puis valide, then j'arrive sur la page voulue et le focus n'est jamais perdu.
- Given une page atteinte par une URL profonde, when elle s'affiche, then l'entrée de menu qui la contient est allumée.
- Given la barre à 1 000 px, when elle s'affiche, then elle ne déborde pas et aucune entrée n'est tronquée.

## Spec Change Log

### 2026-09-08 — revue adversariale (4 relecteurs, contexte neuf)

**Déclencheur.** Deux relecteurs ont trouvé, indépendamment, que le déclencheur de menu ne
recevait AUCUN des styles de `.bar__link` : la classe était bien posée — mes tests le
vérifiaient — mais elle est définie dans le `<style scoped>` d'`AppBar`, qui ne franchit pas la
frontière d'un composant enfant. La section courante n'était donc jamais surlignée, et le
contrôle visuel ne l'a pas rattrapé : un bouton sans hauteur ni retrait ressemble encore à un
onglet.

**Amendé.** `.bar__link` et `.bar__link--on` passent dans `components.css`, aux côtés de `.tag`
et `.overlay` : deux composants les portent désormais, c'est la définition d'une primitive
partagée.

**État connu-mauvais évité.** Une barre où rien ne dit sur quelle section on se trouve — soit
l'inverse du but de la story.

**KEEP.** À préserver si le code est re-dérivé : `overflow-x: clip` sur `.bar` et `overflow:
clip` sur `.bar__stats` — `hidden` rogne aussi, mais crée un conteneur de DÉFILEMENT qui
rognait le menu ouvert et faisait défiler la barre sur elle-même au focus ; l'écoute clavier sur
la RACINE du composant et non sur le document, faute de quoi les flèches sont confisquées à
toute la page tant qu'un menu est ouvert ; la fermeture sur `focusout`, seule façon de couvrir
`Tab` dans les deux sens sans deviner où le focus atterrit.

**Corrigés au passage (patches).** `tabindex="-1"` sur les entrées (dans un `role="menu"`, seul
le déclencheur est tabulable) ; `aria-controls` + `id` reliant le panneau à son déclencheur ;
`aria-current="page"` sur le déclencheur allumé, que rien n'annonçait ; focus rendu au
déclencheur après navigation, comme après `Escape` ; garde sur un menu sans entrée.

**Ajouté aux tests.** Quatre cas de non-régression, dont un qui compare la COULEUR CALCULÉE des
deux déclencheurs : le défaut principal passait les assertions de classe.

**Reporté.** `latestPeriod` vaut `null` pendant le chargement et pas seulement sur base vide :
cliquer « Toutes » avant la résolution du fetch mène à l'année civile. Antérieur à cette story —
l'ancien onglet avait le même repli.

### 2026-09-08 — second tour (auditeur d'acceptation + `pr-reviewer`)

**Déclencheur.** `setOpen(label, false)` remettait `openMenu` à `null` quel que soit le menu
émetteur : une fermeture tardive de A éteignait B qui venait de s'ouvrir. Le comportement ne
cassait plus depuis l'ajout de `focusout`, mais il ne tenait qu'à deux garanties d'ordonnancement
non écrites. Rendu explicite : on ne referme que si c'est bien ce menu-là qui est ouvert.

**Amendé.** Trois écarts d'accessibilité relevés par `pr-reviewer` : `aria-current="page"` sur un
bouton annonçait « page actuelle » sur ce qui n'est pas une page — `"true"` est le jeton prévu
pour l'élément courant d'un ensemble, et l'entrée qui EST la page reçoit son `"page"` de
`NuxtLink` ; `↓` sur un déclencheur fermé ouvre désormais le menu, seul raccourci qui manquait ;
`Escape` s'écoute sur le document — un clic sur le rembourrage du panneau faisait retomber le
focus sur `body`, où l'écoute sur la racine ne répondait plus.

**Couverture.** Quatre scénarios de la matrice n'étaient exercés par rien : `/reconciliation/<hash>`
— la SEULE logique dont la forme change, une branche dédiée devenant un préfixe parmi d'autres —,
le préfixe profond sous `Transactions`, la base vide, et la flèche `↑`. Les quatre sont testés.
La suite de navigation passe de 7 à 15 cas.

**KEEP.** `aria-current="true"` (jamais `"page"`) sur le déclencheur ; `Escape` sur le document
et les flèches sur la racine — l'inverse confisque les flèches à toute la page ; `setOpen` qui
vérifie l'identité du menu avant de refermer.

## Design Notes

```
personnalFinance   Analyse   Évolution   Transactions ▾   Données ▾      1 855 lignes · 20 relevés
                                         ┌──────────────┐ ┌────────────┐
                                         │ Toutes       │ │ Import     │
                                         │ À ranger     │ │ Règles     │
                                         └──────────────┘ │ Catégories │
                                                          └────────────┘
```

Le déclencheur est un **bouton de menu**, pas un lien : un élément qui navigue ET ouvre un menu
oblige à deviner ce que fera le clic. « Toutes » coûte donc un clic de plus qu'avant — c'est le
prix du regroupement, assumé.

## Verification

**Commands:**
- `yarn test:run` -- verts (le comportement du menu est couvert en E2E, cf. tâches)
- `yarn test:e2e` -- verts, dont `navigation.spec.ts` ; aucune autre spec ne navigue par la barre
- `yarn lint:fix` / `yarn typecheck` -- 0 erreur

**Manual checks:**
- Les six pages, une par une : exactement une entrée allumée à chaque fois.
- Traverser la barre au seul clavier, sans jamais perdre le focus de vue.
