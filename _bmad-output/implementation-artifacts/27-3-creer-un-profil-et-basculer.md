# Story 27.3: Créer un profil et passer de l'un à l'autre

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que Marceau,
je veux créer un profil pour une autre personne et choisir celui sur lequel je travaille,
afin qu'elle suive ses dépenses dans un espace qui n'est pas le mien.

## Acceptance Criteria

1. **Création (FR73, AR36).** Depuis l'écran des profils, créer un profil avec un nom et une banque
   par défaut le fait exister **avec le référentiel initial** (`DEFAULT_REFERENTIAL`), sans relevé,
   transaction ni règle. Profil et référentiel sont créés **dans la même transaction** : un échec
   du seed ne laisse aucun profil à moitié créé.
2. **Nom déjà pris.** Créer un profil dont le nom existe déjà (comparaison insensible à la casse et
   aux espaces de bord) est refusé en `409 profile_name_taken`, avec un message français explicite.
3. **Bascule (AR35, D38).** Choisir un profil pose le cookie `pf_profile` (`httpOnly`,
   `SameSite=Strict`), puis **recharge entièrement l'application** ; chaque écran n'affiche alors que
   les données de ce profil.
4. **Nom visible (FR74).** Le nom du profil courant est visible dans la barre d'application sur
   **chaque** écran, y compris sous 1200 px de large.
5. **Pas une connexion (NFR35).** Rien dans l'écran ni dans la barre ne présente le choix du profil
   comme une connexion ou une sécurité : ni « connecté », ni « se connecter », ni cadenas, ni avatar.
6. **Référentiel propre.** Un nouveau profil qui dépose son premier relevé Boursorama voit ses lignes
   rangées dans **son** référentiel initial, jamais dans celui de `marceau`.
7. **Sans profil courant.** Ouvrir l'application sans cookie valide (premier lancement, cookie
   effacé, profil inconnu) mène à l'écran des profils au lieu d'écrans en erreur.

## Tasks / Subtasks

- [ ] **T1 — Contrat partagé** (AC: 1, 2, 3)
  - [ ] `shared/schemas/profile.schema.ts` : `ProfileSchema` (`id`, `name`, `defaultBank`),
        `NewProfileInputSchema` (`name` trim, 1..40 caractères ; `defaultBank` ∈ `BANKS`),
        `SelectProfileInputSchema` (`profileId` entier positif). Types inférés exportés.
  - [ ] `shared/schemas/api-errors.ts` : ajouter `ProfileNameTaken: 'profile_name_taken'` et, si
        27.2 ne l'a pas déjà fait, `ProfileRequired: 'profile_required'`.
  - [ ] `app/composables/useApiError.ts` : messages FR des deux codes (le `Record` est exhaustif,
        le typecheck échoue sinon). `profile_required` → « Choisis un profil pour continuer. »
  - [ ] Libellés FR des banques : `BANK_LABELS` à côté de `BANKS` dans `shared/types/bank.ts`
        (créé en 27.1 ; l'ajouter s'il manque) — `{ boursorama: 'Boursorama', credit_mutuel: 'Crédit Mutuel' }`.
- [ ] **T2 — Service de création** (AC: 1, 2)
  - [ ] `createProfile(input)` dans `server/utils/profiles.ts` : vérifie l'unicité insensible à la
        casse, puis **`db.transaction(tx => { insert profil ; seedReferential(tx, id) })`**.
  - [ ] Réutiliser `seedReferential(tx, profileId)` posé en 27.1 (D39) — le chercher
        (`grep -rn seedReferential server`) ; ne **pas** dupliquer la boucle d'insertion du bootstrap.
- [ ] **T3 — Endpoints `server/api/profiles/`** (AC: 1, 2, 3, 7) — exemptés du test d'architecture
      de 27.2, qui exclut ce dossier.
  - [ ] `index.get.ts` → `Profile[]` triés par nom.
  - [ ] `index.post.ts` → `201` + `Profile` ; `409 profile_name_taken` ; `422` via `validateBody`.
  - [ ] `current.get.ts` → `Profile | null`. Ne **lève pas** : un cookie absent ou désignant un
        profil inconnu rend `null` (c'est ce qui permet AC 7).
  - [ ] `current.put.ts` → corps `{ profileId }` ; profil inconnu → `404 not_found` ; sinon
        `setCookie(event, 'pf_profile', String(id), { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 31536000 })`
        et renvoie le `Profile`.
  - [ ] Lecture du cookie **uniquement** via `server/utils/current-profile.ts` (D38). Si 27.2 n'y
        expose que `requireProfile`, y ajouter `findCurrentProfile(event): Profile | null`, dont
        `requireProfile` devient un simple enrobage. Aucun endpoint ne fait `getCookie` lui-même.
        **Cohérence avec 27.2 (vérifiée à la consolidation du 2026-09-22)** : `findCurrentProfile` applique
        le **repli de 27.2** — sans cookie et avec exactement un profil, il rend ce profil. Il ne rend
        `null` que sans cookie avec au moins deux profils, ou avec un cookie invalide. Conséquences :
        les E2E mono-profil n'ont pas à poser de cookie, et la garde `profile.global.ts` ne redirige
        vers `/profils` qu'à partir du second profil.
- [ ] **T4 — Composable `app/composables/useProfiles.ts`** (AC: 3, 4, 7)
  - [ ] `useFetch('/api/profiles', { key: 'profiles', server: false, default: () => [] })` et
        `useFetch('/api/profiles/current', { key: 'current-profile', server: false })`.
  - [ ] `createProfile(input): Promise<MutationOutcome & { profile?: Profile }>` via `apiMutate` +
        `mapMutationError`, puis `fetchState.refresh()` de la liste (AR20 — jamais `refreshNuxtData`).
  - [ ] `selectProfile(id)` : `PUT /api/profiles/current`, puis **`reloadNuxtApp({ path: '/analyse' })`**.
        Pas d'invalidation fine : le rechargement complet garantit qu'aucune donnée d'un profil ne
        survit en mémoire sous un autre (D38).
- [ ] **T5 — Écran `app/pages/profils.vue`** (AC: 1, 2, 3, 5)
  - [ ] En-tête `.page-head` : titre « Profils », sous-titre neutre (« Chaque profil a ses relevés,
        son référentiel et son analyse. »).
  - [ ] Formulaire de création : `.field`/`.input`/`.select`/`.btn.btn--primary`. Sélecteur de banque
        prérempli sur `boursorama`. Garde de ré-entrance + `aria-disabled` pendant l'envoi (modèle :
        `app/pages/regles.vue`, `onSubmit`).
  - [ ] Liste des profils (`.table.table--framed`) : nom, banque par défaut, action « Utiliser ce profil ».
        Sur la ligne du profil courant : badge « en cours » et bouton **`aria-disabled="true"`**, dont
        le nom accessible dit pourquoi (« Utiliser le profil X — indisponible, c'est le profil en cours »).
        Jamais `disabled` (NFR18-20).
  - [ ] Erreurs via `<p class="notice" role="alert">`.
  - [ ] Après création : proposer immédiatement « Utiliser ce profil » sur la nouvelle ligne ; ne
        **pas** basculer automatiquement.
- [ ] **T6 — Barre d'application `app/components/shared/AppBar.vue`** (AC: 4, 5)
  - [ ] Ajouter un `NuxtLink` vers `/profils`, libellé « Profil : {nom} », **hors de `.bar__stats`**
        (masqué sous 1200 px, AC 4), placé entre la `nav` et les compteurs, `flex-shrink: 0`.
        Troncature CSS au-delà d'environ 16 caractères avec le nom complet dans `title` et dans le
        nom accessible.
  - [ ] L'entrée « Profils » n'est **pas** ajoutée au menu « Données » : le lien de la barre suffit
        (un seul chemin, pas deux).
- [ ] **T7 — Garde de route `app/middleware/profile.global.ts`** (AC: 7)
  - [ ] Si `current-profile` vaut `null` et que la route n'est pas `/profils`, `navigateTo('/profils')`.
  - [ ] Sur `/profils` sans profil courant : message « Choisis ou crée un profil pour commencer. »
- [ ] **T8 — Tests** (AC: 1-7)
  - [ ] `server/api/profiles/profiles.test.ts` (modèle : `server/api/rules/rules.test.ts`, base
        temporaire + `TEST_SCHEMA_DDL`) : création → profil + N rubriques + M postes égaux à
        `DEFAULT_REFERENTIAL` ; nom en double (casse différente) → 409 et **aucune** ligne ajoutée ;
        seed forcé en échec → aucun profil créé (atomicité) ; `current.get` sans cookie → `null` ;
        `current.put` inconnu → 404 ; `current.put` valide → en-tête `Set-Cookie` avec `HttpOnly` et
        `SameSite=Strict`. Le faux `H3Event` doit exposer `node.res.setHeader`/`getHeader` et un
        en-tête `cookie` en entrée.
  - [ ] AC 6 : test unitaire de l'orchestrateur (catégoriseur simulé) vérifiant que la liste de
        postes transmise est celle du profil courant — **si 27.2 ne le couvre pas déjà**.
  - [ ] `tests/e2e/profiles.spec.ts` : créer « Test B », l'utiliser, vérifier le nom dans la barre
        à 1280 px **et** à 1000 px, vérifier que `/categories` montre le référentiel initial, revenir
        sur `marceau`. Vérifier l'absence des mots « connexion », « connecté », « se connecter ».
  - [ ] Mettre à jour `tests/e2e/navigation.spec.ts` si l'ajout du lien casse une assertion sur le
        contenu de la barre.

## Dev Notes

### Prérequis — ce que 27.1 et 27.2 ont posé (à vérifier avant d'écrire une ligne)

- **27.1** : table `profiles` (`id`, `name` unique, `default_bank`, `created_at`), profil `marceau`
  (`id = 1`), `profile_id` sur les tables du référentiel, `shared/types/bank.ts` (`BANKS`),
  `seedReferential(tx, profileId)` appelé par le bootstrap pour tout profil sans rubrique.
- **27.2** : `server/utils/current-profile.ts` + `requireProfile(event)` sur les 23 endpoints,
  cookie `pf_profile`, test d'architecture qui **exclut `server/api/profiles/`**, filtrage SQL par
  profil, 404 pour les ressources d'un autre profil.
- Si un de ces éléments manque ou porte un autre nom, **s'aligner sur le code livré** et le signaler
  dans les notes de complétion ; ne pas le réinventer en parallèle.

### État actuel des fichiers touchés

- **`app/components/shared/AppBar.vue`** — barre de 44 px : marque, `nav` (deux liens + deux
  `AppBarMenu`), puis `.bar__stats` (compteurs de santé via `useBaseHealth`) poussés à droite par
  `margin-left: auto` et **masqués sous 1200 px** (`@media (width < 1200px)`). `overflow-x: clip` sur
  `.bar` (ne pas passer en `hidden` : ça rognerait les menus, cf. commentaire). **À préserver** :
  l'arbitrage « un seul menu ouvert », les commentaires de revue, le comportement des compteurs.
  Le lien profil doit rester visible quand les compteurs disparaissent → le placer hors de
  `.bar__stats`, et si besoin lui donner `margin-left: auto` quand les compteurs sont masqués.
- **`server/middleware/0.bootstrap.ts`** — contient aujourd'hui le seed inline (rubriques puis
  postes, `position` = index). 27.1 l'a normalement extrait en `seedReferential`. Ne pas y toucher
  dans cette story, sauf si l'extraction n'a pas été faite.
- **`app/composables/useApiError.ts`** — `FR_MESSAGES: Record<ApiErrorCodeValue, string>` exhaustif :
  tout code ajouté dans `api-errors.ts` doit y avoir son message.
- **`shared/constants/default-referential.ts`** — le référentiel initial (14 rubriques / 51 postes au
  dernier commentaire, postes du compte joint inclus). Un nouveau profil reçoit donc aussi les postes
  du compte joint ; inertes chez lui, c'est assumé (D39).

### Garde-fous d'architecture

- **D38 / AR35** : un seul lecteur du cookie (`current-profile.ts`). Le jour de FR44 (story 22.1),
  seule l'implémentation de ce module change ; `/api/profiles/current` sera alors remplacé par la
  session. Ne rien coder qui suppose que le cookie est la source d'identité ailleurs qu'ici.
- **D39 / AR36** : `better-sqlite3` est synchrone — **aucun `await` dans le callback de
  `db.transaction`**, sinon la transaction se ferme avant les insertions.
- **NFR35** : le choix du profil n'est pas une authentification. Vocabulaire neutre : « profil »,
  « utiliser ce profil ». Pas d'icône de sécurité.
- **Composants** : jamais de `$fetch`/`useFetch` dans un composant ou une page — tout passe par
  `useProfiles` (CLAUDE.md). Pas de store Pinia pour les profils (anti-pattern « cache Pinia de
  données serveur »).
- **Accessibilité** : `aria-disabled` + raison dans le nom accessible, jamais `disabled` ; ne jamais
  désactiver l'élément focalisé (NFR18-20, AR22).
- **Erreurs** : `domainError(ApiErrorCode.ProfileNameTaken, { name }, 409)` ; validation par
  `validateBody` (422 `validation_failed`). Pas de `try/catch` qui mange.
- **Nommage** : endpoints kebab-case pluriel (`/api/profiles`), clés JSON camelCase (`defaultBank`),
  énumération de banque en anglais, libellés en français.

### Primitives de l'epic 16 à réutiliser (pas de nouvelle définition de bouton/champ/tableau)

`app/assets/styles/components.css` : `.btn`, `.btn--primary`, `.btn--sm`, `.btn--quiet`,
`.btn[aria-disabled='true']`, `.field`, `.field__label`, `.field__error`, `.input`, `.select`,
`.table`, `.table--framed`, `.badge`, `.notice`, `.page-head`, `.page-head__title`,
`.page-head__sub`. Le `<style scoped>` de la page ne porte **que** la mise en page.

### Hors périmètre

Renommage et suppression d'un profil (hors périmètre au PRD). Modification de la banque par défaut
après création. Sélecteur de profil sous forme de menu dans la barre (un lien vers `/profils` suffit
pour deux profils). Toute notion de membre, d'invitation ou de connexion (epic 22).

### Project Structure Notes

Nouveaux fichiers : `shared/schemas/profile.schema.ts`, `server/utils/profiles.ts`,
`server/api/profiles/{index.get,index.post,current.get,current.put}.ts`,
`server/api/profiles/profiles.test.ts`, `app/composables/useProfiles.ts`, `app/pages/profils.vue`,
`app/middleware/profile.global.ts`, `tests/e2e/profiles.spec.ts`.
Modifiés : `shared/schemas/api-errors.ts`, `app/composables/useApiError.ts`,
`app/components/shared/AppBar.vue`, éventuellement `shared/types/bank.ts`,
`server/utils/current-profile.ts`, `tests/e2e/navigation.spec.ts`.
Nom de page en français (`profils.vue`), comme `regles.vue` et `a-ranger.vue`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 27.3]
- [Source: _bmad-output/planning-artifacts/prd.md#Profils et banques — FR73, FR74 ; NFR35 ; Journey 9]
- [Source: _bmad-output/planning-artifacts/architecture.md#D38 — cookie, requireProfile, rechargement]
- [Source: _bmad-output/planning-artifacts/architecture.md#D39 — seed par profil dans la transaction]
- [Source: _bmad-output/planning-artifacts/architecture.md#D40 — BANKS, default_bank]
- [Source: app/components/shared/AppBar.vue — structure de la barre, masquage des compteurs]
- [Source: app/pages/regles.vue — formulaire, garde de ré-entrance, aria-disabled]
- [Source: server/api/rules/rules.test.ts — patron de test d'endpoint sur base temporaire]
- [Source: CLAUDE.md — anti-patterns, conventions de nommage, règles d'erreur]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Contexte rédigé le 2026-09-22 par analyse du code et des artefacts (bmad-create-story) — guide
  développeur complet. Suppose 27.1 et 27.2 livrées.

### File List
