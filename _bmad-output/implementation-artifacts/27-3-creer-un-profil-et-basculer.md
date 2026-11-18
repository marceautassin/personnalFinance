# Story 27.3: Créer un profil et passer de l'un à l'autre

Status: review

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

- [x] **T1 — Contrat partagé** (AC: 1, 2, 3)
  - [x] `shared/schemas/profile.schema.ts` : `ProfileSchema` (`id`, `name`, `defaultBank`),
        `NewProfileInputSchema` (`name` trim, 1..40 caractères ; `defaultBank` ∈ `BANKS`),
        `SelectProfileInputSchema` (`profileId` entier positif). Types inférés exportés.
  - [x] `shared/schemas/api-errors.ts` : ajouter `ProfileNameTaken: 'profile_name_taken'` et, si
        27.2 ne l'a pas déjà fait, `ProfileRequired: 'profile_required'`.
  - [x] `app/composables/useApiError.ts` : messages FR des deux codes (le `Record` est exhaustif,
        le typecheck échoue sinon). `profile_required` → « Choisis un profil pour continuer. »
  - [x] Libellés FR des banques : `BANK_LABELS` à côté de `BANKS` dans `shared/types/bank.ts`
        (créé en 27.1 ; l'ajouter s'il manque) — `{ boursorama: 'Boursorama', credit_mutuel: 'Crédit Mutuel' }`.
- [x] **T2 — Service de création** (AC: 1, 2)
  - [x] `createProfile(input)` dans `server/utils/profiles.ts` : vérifie l'unicité insensible à la
        casse, puis **`db.transaction(tx => { insert profil ; seedReferential(tx, id) })`**.
  - [x] Réutiliser `seedReferential(tx, profileId)` posé en 27.1 (D39) — le chercher
        (`grep -rn seedReferential server`) ; ne **pas** dupliquer la boucle d'insertion du bootstrap.
- [x] **T3 — Endpoints `server/api/profiles/`** (AC: 1, 2, 3, 7) — exemptés du test d'architecture
      de 27.2, qui exclut ce dossier.
  - [x] `index.get.ts` → `Profile[]` triés par nom.
  - [x] `index.post.ts` → `201` + `Profile` ; `409 profile_name_taken` ; `422` via `validateBody`.
  - [x] `current.get.ts` → `Profile | null`. Ne **lève pas** : un cookie absent ou désignant un
        profil inconnu rend `null` (c'est ce qui permet AC 7).
  - [x] `current.put.ts` → corps `{ profileId }` ; profil inconnu → `404 not_found` ; sinon
        `setCookie(event, 'pf_profile', String(id), { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 31536000 })`
        et renvoie le `Profile`.
  - [x] Lecture du cookie **uniquement** via `server/utils/current-profile.ts` (D38). Si 27.2 n'y
        expose que `requireProfile`, y ajouter `findCurrentProfile(event): Profile | null`, dont
        `requireProfile` devient un simple enrobage. Aucun endpoint ne fait `getCookie` lui-même.
        **Cohérence avec 27.2 (vérifiée à la consolidation du 2026-09-22)** : `findCurrentProfile` applique
        le **repli de 27.2** — sans cookie et avec exactement un profil, il rend ce profil. Il ne rend
        `null` que sans cookie avec au moins deux profils, ou avec un cookie invalide. Conséquences :
        les E2E mono-profil n'ont pas à poser de cookie, et la garde `profile.global.ts` ne redirige
        vers `/profils` qu'à partir du second profil.
- [x] **T4 — Composable `app/composables/useProfiles.ts`** (AC: 3, 4, 7)
  - [x] `useFetch('/api/profiles', { key: 'profiles', server: false, default: () => [] })` et
        `useFetch('/api/profiles/current', { key: 'current-profile', server: false })`.
  - [x] `createProfile(input): Promise<MutationOutcome & { profile?: Profile }>` via `apiMutate` +
        `mapMutationError`, puis `fetchState.refresh()` de la liste (AR20 — jamais `refreshNuxtData`).
  - [x] `selectProfile(id)` : `PUT /api/profiles/current`, puis **`reloadNuxtApp({ path: '/analyse' })`**.
        Pas d'invalidation fine : le rechargement complet garantit qu'aucune donnée d'un profil ne
        survit en mémoire sous un autre (D38).
- [x] **T5 — Écran `app/pages/profils.vue`** (AC: 1, 2, 3, 5)
  - [x] En-tête `.page-head` : titre « Profils », sous-titre neutre (« Chaque profil a ses relevés,
        son référentiel et son analyse. »).
  - [x] Formulaire de création : `.field`/`.input`/`.select`/`.btn.btn--primary`. Sélecteur de banque
        prérempli sur `boursorama`. Garde de ré-entrance + `aria-disabled` pendant l'envoi (modèle :
        `app/pages/regles.vue`, `onSubmit`).
  - [x] Liste des profils (`.table.table--framed`) : nom, banque par défaut, action « Utiliser ce profil ».
        Sur la ligne du profil courant : badge « en cours » et bouton **`aria-disabled="true"`**, dont
        le nom accessible dit pourquoi (« Utiliser le profil X — indisponible, c'est le profil en cours »).
        Jamais `disabled` (NFR18-20).
  - [x] Erreurs via `<p class="notice" role="alert">`.
  - [x] Après création : proposer immédiatement « Utiliser ce profil » sur la nouvelle ligne ; ne
        **pas** basculer automatiquement.
- [x] **T6 — Barre d'application `app/components/shared/AppBar.vue`** (AC: 4, 5)
  - [x] Ajouter un `NuxtLink` vers `/profils`, libellé « Profil : {nom} », **hors de `.bar__stats`**
        (masqué sous 1200 px, AC 4), placé entre la `nav` et les compteurs, `flex-shrink: 0`.
        Troncature CSS au-delà d'environ 16 caractères avec le nom complet dans `title` et dans le
        nom accessible.
  - [x] L'entrée « Profils » n'est **pas** ajoutée au menu « Données » : le lien de la barre suffit
        (un seul chemin, pas deux).
- [x] **T7 — Garde de route `app/middleware/profile.global.ts`** (AC: 7)
  - [x] Si `current-profile` vaut `null` et que la route n'est pas `/profils`, `navigateTo('/profils')`.
  - [x] Sur `/profils` sans profil courant : message « Choisis ou crée un profil pour commencer. »
- [x] **T8 — Tests** (AC: 1-7)
  - [x] `server/api/profiles/profiles.test.ts` (modèle : `server/api/rules/rules.test.ts`, base
        temporaire + `TEST_SCHEMA_DDL`) : création → profil + N rubriques + M postes égaux à
        `DEFAULT_REFERENTIAL` ; nom en double (casse différente) → 409 et **aucune** ligne ajoutée ;
        seed forcé en échec → aucun profil créé (atomicité) ; `current.get` sans cookie → `null` ;
        `current.put` inconnu → 404 ; `current.put` valide → en-tête `Set-Cookie` avec `HttpOnly` et
        `SameSite=Strict`. Le faux `H3Event` doit exposer `node.res.setHeader`/`getHeader` et un
        en-tête `cookie` en entrée.
  - [x] AC 6 : test unitaire de l'orchestrateur (catégoriseur simulé) vérifiant que la liste de
        postes transmise est celle du profil courant — **si 27.2 ne le couvre pas déjà**.
  - [x] `tests/e2e/profiles.spec.ts` : créer « Test B », l'utiliser, vérifier le nom dans la barre
        à 1280 px **et** à 1000 px, vérifier que `/categories` montre le référentiel initial, revenir
        sur `marceau`. Vérifier l'absence des mots « connexion », « connecté », « se connecter ».
  - [x] Mettre à jour `tests/e2e/navigation.spec.ts` si l'ajout du lien casse une assertion sur le
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

Agent de développement, worktree dédié.

### Debug Log References

- `yarn test:run` — 728 passed, 8 skipped (0 échec), y compris `server/api/profiles/profiles.test.ts`,
  `app/composables/useCurrentProfile.test.ts` et `app/composables/useProfiles.test.ts` (nouveaux) et
  `server/utils/current-profile.test.ts` (inchangé, toujours vert après le refactor de
  `requireProfile`).
- `yarn lint` — 0 erreur.
- `yarn typecheck` — 0 erreur.
- `yarn test:e2e` (suite complète, après corrections de revue) — **38 passed, 7 skipped, 0 failed**
  (`rm -f _data/e2e.db*` puis suite complète). C'est le nombre de tests de `master` (37) plus le
  nouveau `tests/e2e/profiles.spec.ts` (1) — donc bien la suite complète au vert, pas seulement les
  fichiers touchés.

### Completion Notes List

- Contexte rédigé le 2026-09-22 par analyse du code et des artefacts (bmad-create-story) — guide
  développeur complet. Suppose 27.1 et 27.2 livrées.
- **Bug trouvé et corrigé en cours de story** : `reloadNuxtApp({ path: '/analyse' })` sans `force:
  true` se souvient (sessionStorage, fenêtre de 10 s) du dernier chemin rechargé et NE FAIT RIEN au
  second appel vers le même chemin — exactement le cas d'un aller-retour entre deux profils qui
  atterrissent tous les deux sur `/analyse`. Sans `force: true`, le bouton « Utiliser ce profil »
  restait bloqué sur « Bascule… » indéfiniment au second aller-retour. Corrigé dans
  `app/composables/useProfiles.ts` (`selectProfile`), avec commentaire explicatif et test unitaire
  (`useProfiles.test.ts`) qui fige l'appel exact.
- `findCurrentProfile` ajoutée à `server/utils/current-profile.ts`, `requireProfile` devenue un
  enrobage qui lève `400 profile_required` quand elle rend `null`. Comportement de `requireProfile`
  inchangé (même suite de tests `current-profile.test.ts`, toujours verte sans modification).
- `BANK_LABELS` (`shared/types/bank.ts`) et `ApiErrorCode.ProfileRequired` existaient déjà (posés en
  27.1/27.2) : seul `ApiErrorCode.ProfileNameTaken` a été ajouté.

**Corrections apportées suite à la revue `pr-reviewer` (verdict initial : changements requis, deux
bloquants) :**

- **BLOQUANT 1 (échec E2E — régression réelle, pas une fragilité d'infrastructure comme je l'avais
  d'abord cru).** Diagnostic du relecteur, vérifié : le `test.afterAll` de `tests/e2e/profiles.spec.ts`
  ouvrait une SECONDE connexion `better-sqlite3` sur `_data/e2e.db` pour supprimer « Test B », mais
  cette connexion ne voyait pas les écritures du serveur (sondé : `profiles` n'y contenait déjà plus
  « Test B » avant même le `DELETE`) — le nettoyage ne faisait donc RIEN, silencieusement. « Test B »
  survivait, le repli « exactement un profil » (D38) tombait pour toute spec suivante sans cookie, et
  `tests/e2e/rules.spec.ts` recevait `400 profile_required` sur `/api/categories`, d'où son
  `<select>` « Ranger dans » vide. Corrigé en TRAITANT LA CAUSE plutôt qu'en réparant le nettoyage
  (contourner la base par un chemin que le serveur n'emprunte pas restait fragile) : le `afterAll`
  cassé est retiré, et `tests/e2e/rules.spec.ts` épingle désormais explicitement son propre cookie
  `pf_profile=1` (`test.beforeEach`) au lieu de dépendre du repli implicite, avec une assertion
  `GET /api/categories` → `200` avant chaque test. Suite complète revérifiée : 38 passed, 0 failed.
- **BLOQUANT 2 (AC 7 non satisfait).** `server/api/profiles/current.get.ts` renvoyait `Profile | null`
  NU — h3 sérialise un handler qui renvoie `null` en `204 SANS CORPS` (`sendNoContent`, confirmé en
  lisant `node_modules/h3`), que Nitro ne convertit jamais en `"null"` JSON. Côté client,
  `currentProfile.value === null` (`profile.global.ts`) ne se déclenchait donc JAMAIS après une vraie
  réponse réseau — seulement pendant l'état initial, avant toute réponse, ce qui masquait le bug.
  Corrigé : l'endpoint renvoie désormais `{ profile: Profile | null }` (type `CurrentProfileResponse`,
  `shared/schemas/profile.schema.ts`), toujours un objet JSON réel même sans profil. La garde teste la
  falsy-ness (`!data.value?.profile`). Reproduit AVANT correction et reproduit CORRIGÉ après (curl +
  navigateur, cookie `pf_profile` désignant un profil inexistant) : `/analyse` redirige bien vers
  `/profils`, la notice « Choisis ou crée un profil pour commencer » est visible, aucun badge
  « en cours », le bouton du profil existant redevient actionnable. Couvert par
  `useCurrentProfile.test.ts` (nouveau).
- **IMPORTANT 3.** Le contrôle d'unicité insensible à la casse (`server/utils/profiles.ts`) est
  déplacé DANS le callback de `db.transaction` : il vivait avant la transaction, une fenêtre —
  théorique avec better-sqlite3 synchrone et Node mono-thread, mais sans bénéfice à la laisser
  ouverte — où deux créations quasi simultanées au même nom pouvaient toutes deux passer leur
  vérification avant qu'aucune insertion n'ait eu lieu.
- **IMPORTANT 4.** Nouveau composable `app/composables/useCurrentProfile.ts`, dédié au SEUL profil
  courant (fetch + déballage de l'enveloppe). `app/components/shared/AppBar.vue` l'utilise
  désormais au lieu de `useProfiles()`, qui chargeait la LISTE COMPLÈTE des profils sur CHAQUE écran
  alors que seul `/profils` en a besoin. `useProfiles()` délègue maintenant à `useCurrentProfile()`
  pour sa part « profil courant ».
- **IMPORTANT 5.** `useCurrentProfile.test.ts` et `useProfiles.test.ts` ajoutés (aucun des deux
  composables n'avait de test) — c'est ce trou qui avait laissé passer le BLOQUANT 2 : aucun test ne
  vérifiait le déballage `{ profile }` avec une VRAIE valeur reçue (seul l'état initial, avant
  réponse, était implicitement exercé).
- **MINEUR 6.** Commentaire de `server/api/architecture.test.ts` corrigé : `profiles/` n'est pas
  « pas encore existant », il est exempté parce que ces endpoints résolvent eux-mêmes le profil.
- **MINEUR 7.** `app/pages/profils.vue` : imports explicites de `useProfiles`/`useApiError` retirés
  (auto-import Nuxt), gardé uniquement l'import de type `Profile` et `BANKS`/`BANK_LABELS`
  (hors auto-import, viennent de `shared/`).
- **MINEUR 8.** `app/pages/profils.vue` : la garde dupliquée dans `@click` est retirée, `onSelect`
  est la SEULE source de vérité (ré-entrance ET profil déjà courant).

**Second tour de contre-revue — deux IMPORTANT et deux suggestions :**

- **IMPORTANT 1.** `useProfiles.createProfile` ne rafraîchissait que la LISTE des profils, jamais
  `current-profile`. Reproduit au navigateur : un seul profil, aucun cookie (état nominal après
  27.2) → création d'un 2ᵉ profil → côté serveur le repli « exactement un profil » disparaît et
  `/api/profiles/current` rend `{ profile: null }`, mais le cache client mentait (badge « en
  cours » resté sur `marceau`, barre inchangée, navigation SPA sans redirection). Corrigé :
  `await refreshCurrentProfile()` après une création réussie. Test ajouté
  (`useProfiles.test.ts`), et revérifié au navigateur (cookies nettoyés, base à un seul profil
  fraîche) : après création, plus aucun badge « en cours », plus de lien « Profil : » dans la
  barre, notice « Choisis ou crée un profil pour commencer » visible, boutons réactivés, et un
  clic SPA sur « Analyse » reste bloqué sur `/profils` (middleware relit le cache à jour).
- **IMPORTANT 2.** La barre déclenchait `GET /api/statements` (via `useBaseHealth`) même sans
  profil courant — `400 profile_required` en console à chaque affichage de `/profils`, l'écran
  où la garde envoie précisément un visiteur sans profil. Corrigé : `useStatementsList` accepte
  `{ immediate: boolean }` (défaut `true`, comportement inchangé pour `import.vue` et
  `useIngestionQueue`) ; `useBaseHealth` l'appelle avec `immediate: false` et rafraîchit via un
  `watch(currentProfile, …, { immediate: true })`. Tests ajoutés
  (`useBaseHealth.profile-guard.test.ts`).
- **SUGGESTION 3.** `tests/e2e/reconciliation.spec.ts` — même auto-suffisance qu'`rules.spec.ts`
  (cookie `pf_profile=1` épinglé + assertion `GET /api/categories` → 200 en `beforeEach`) : elle
  vient après `profiles.spec.ts` par ordre alphabétique et n'était verte ici que parce que
  sautée (pas de fixture PDF ni de clé LLM sur ce poste).
- **SUGGESTION 4.** `server/api/architecture.test.ts` : l'exemption portait sur tout le dossier
  `profiles/` ; un futur `profiles/[id]/…` réellement cloisonné y aurait échappé sans bruit.
  Remplacée par une liste NOMMÉE des quatre fichiers exemptés (`EXEMPT_FILES`) — tout nouveau
  fichier dans ce dossier est désormais vérifié par défaut.
- **SUGGESTION 5.** `playwright.config.ts` charge son module deux fois par run (processus
  principal, puis worker) et appelait `prepareE2eDatabase()` à chaque fois : la seconde
  recréation remplaçait le fichier sous le `webServer` déjà démarré sur le premier, laissant la
  base sur disque paraître vierge après coup alors que le serveur continue d'écrire dans le
  fichier qu'il avait ouvert. Corrigé (court) : un drapeau `PF_E2E_DB_PREPARED` dans
  `process.env`, hérité par le worker, fait de la première recréation la seule ; vérifié par le
  nombre de lignes « base de test recréée » dans les logs (1, au lieu de 2, sur le run complet
  après correction).

**Limite de fond, à garder en tête (relevée par la contre-revue) :** épingler un cookie dans les
specs qui en ont besoin (`rules.spec.ts`, `reconciliation.spec.ts`) est un correctif LOCAL, pas
structurel. Tant qu'il n'existe pas une base — ou au moins un profil — PAR WORKER E2E, toute
NOUVELLE spec triée après `profiles.spec.ts` dans l'ordre alphabétique naîtra rouge pour cette
même raison, sans qu'aucun message ne le rende lisible depuis l'échec seul. `playwright.config.ts`
documente déjà ce choix structurel (base unique, exécution sérielle) ; le passage à une base par
worker reste hors périmètre de la story 27.3.

### File List

Nouveaux :
- `shared/schemas/profile.schema.ts`
- `server/utils/profiles.ts`
- `server/api/profiles/index.get.ts`
- `server/api/profiles/index.post.ts`
- `server/api/profiles/current.get.ts`
- `server/api/profiles/current.put.ts`
- `server/api/profiles/profiles.test.ts`
- `app/composables/useProfiles.ts`
- `app/composables/useProfiles.test.ts`
- `app/composables/useCurrentProfile.ts`
- `app/composables/useCurrentProfile.test.ts`
- `app/pages/profils.vue`
- `app/middleware/profile.global.ts`
- `app/composables/useBaseHealth.profile-guard.test.ts`
- `tests/e2e/profiles.spec.ts`

Modifiés :
- `shared/schemas/api-errors.ts` (ajout `ProfileNameTaken`)
- `app/composables/useApiError.ts` (message FR de `ProfileNameTaken`)
- `app/components/shared/AppBar.vue` (lien « Profil : {nom} », via `useCurrentProfile`)
- `server/utils/current-profile.ts` (ajout `findCurrentProfile`, `requireProfile` devenue un enrobage)
- `server/api/architecture.test.ts` (exemption nommée des 4 fichiers `profiles/`, suggestion 4)
- `tests/e2e/rules.spec.ts` (cookie `pf_profile` épinglé + assertion `GET /api/categories` → 200,
  BLOQUANT 1)
- `tests/e2e/reconciliation.spec.ts` (même correctif, suggestion 3)
- `app/composables/useStatements.ts` (`useStatementsList` accepte `{ immediate }`, IMPORTANT 2)
- `app/composables/useBaseHealth.ts` (fetch gardé derrière le profil courant, IMPORTANT 2)
- `app/composables/useBaseHealth.test.ts` (adapté aux nouvelles dépendances : `watch`,
  `useCurrentProfile`)
- `playwright.config.ts` (`prepareE2eDatabase()` appelée une seule fois par run, suggestion 5)
