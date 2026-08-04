---
type: vision-note
date: 2026-07-15
author: John (PM) + Marceau
status: consigned-not-scoped
horizon: V-next (post Phase 1.x / épics 8-11)
depends_on: sprint-change-proposal-2026-07-12.md (épics 8-11)
trigger: Marceau exprime une vision "foyer partagé, hébergé, PWA" au-delà du multi-profils local
---

# Vision — Foyer partagé, hébergé & PWA

> **Statut : consignée, non planifiée.** Rien à implémenter ici. Cette note fixe l'intention
> et les arbitrages avant qu'ils ne se perdent. À ressortir **après** la clôture de la
> Phase 1.x (épics 8-11 de la Sprint Change Proposal 2026-07-12).

## Contexte — pourquoi une note séparée

La Sprint Change Proposal du 2026-07-12 a déjà consigné le **multi-profils / multi-comptes
local** (épics 8-11) : plusieurs profils sur **une seule machine de confiance, sans auth**,
que Marceau gère lui-même. Elle a explicitement parqué en *Vision* : « cloud **avec auth** ».

Cette note structure précisément ce morceau de Vision. C'est la **couche supérieure** :
on passe d'un partitionnement local à un **produit hébergé, multi-utilisateur, authentifié,
installable sur mobile**.

## L'intention (mots de Marceau)

1. **Notion de foyer** — un espace partagé auquel on **invite** quelqu'un (typiquement sa femme).
2. **Utilisateurs réels et indépendants** — la femme se connecte elle-même et **ingère/catégorise
   ses propres relevés** (pas un profil « géré » par Marceau).
3. **Tag de dépense partagé** — « payé pour le foyer / pour quelqu'un », posé par **chaque membre**
   sur ses propres transactions.
4. **PWA iPhone + Android** — l'app est **installable sur mobile**.
5. **Hébergée sur un serveur**, accessible **de partout**.
6. **Compte paramétrable** — le forecast inverse et le dividende SAS ne sont **pas** le cœur pour
   tout le monde : ce sont des **modules activables par compte** (Marceau : oui ; sa femme : non).
   Retourne le modèle mental : « app multi-compte où chacun active ses modules, reliés par un foyer ».

## Le delta vs. épics 8-11 (ce qui est réellement nouveau)

| Dimension | Épics 8-11 (déjà consigné) | Cette vision (delta) |
|---|---|---|
| Utilisateurs | Profils **gérés par Marceau**, local | **Membres indépendants** qui se connectent |
| Accès | Mono-machine locale de confiance | **Hébergé, de partout** |
| Auth | ❌ Aucune (invariant assumé) | ✅ **Obligatoire** — c'était le *blocker* du CLAUDE.md |
| Entité « foyer » | Absente (partitionnement plat) | **Foyer** + **invitations** à rejoindre |
| Femme | Profil `managed` (suivi passif) | **Compte propre**, elle ingère et tag |
| Activation forecast/dividende | Binaire `owner`/`managed` | **Toggles par compte**, plus granulaire |
| Client | SPA locale | **PWA installable** (iOS/Android) |

## Garde-fous du projet que cette vision lève (à assumer explicitement le jour venu)

Cette vision **casse trois invariants verrouillés** du CLAUDE.md / PRD — c'est le cœur du sujet,
à ne pas sous-estimer :

- ❌ **« Jamais d'auth en V1 »** → l'auth devient **obligatoire** (multi-utilisateur hébergé).
- ❌ **« Local-first, pas de cloud »** → **hébergement serveur** + accès distant.
- ❌ **« Mono-machine de confiance »** → surface d'exposition réseau : sessions, permissions
  par foyer, cloisonnement des données entre membres.

Conséquence : ce **n'est pas** un amendement PRD, c'est un **nouveau palier produit** (V-next),
à cadrer par un **Product Brief** dédié avant tout PRD.

## Grands arbitrages à trancher (au cadrage, pas maintenant)

- **Modèle d'auth** — self-hosted simple (un seul foyer, quelques comptes) vs. multi-foyer SaaS.
  Le besoin réel de Marceau semble être **un foyer**, pas une plateforme.
- **Hébergement** — VPS perso / self-host vs. plateforme managée. Impacte coût, sécurité, RGPD.
- **Sécurité des données financières hébergées** — chiffrement au repos, isolation stricte
  inter-membres, politique de secours. La barre monte fortement vs. le local.
- **Un compte peut-il vivre seul, hors foyer ?** (compte perso non partagé) — définit si « foyer »
  est optionnel ou structurant.
- **Granularité des toggles de modules** — par compte ? par membre ? presets (`pilotage complet`
  vs. `suivi simple`) ? Attention KISS/YAGNI : ne pas sur-généraliser.
- **PWA vs. natif** — la PWA suffit-elle (notifications, offline, install) ? Probablement oui,
  mais à valider selon les usages mobiles voulus.
- **Réutilisation** — la fondation de scoping des épics 8-11 est le socle technique naturel de
  ce palier : le partitionnement par profil/compte préfigure le cloisonnement par membre/foyer.

## Séquencement

```
V1 mono-user (épics 1-7)  ──►  Phase 1.x multi-profils LOCAL (épics 8-11)  ──►  V-next FOYER HÉBERGÉ (cette vision)
   [en cours de clôture]           [backlog, déjà consigné]                      [consigné, non planifié]
```

Ne rien démarrer ici tant que la Phase 1.x n'est pas livrée et éprouvée : elle valide en local
le modèle de données multi-compte qui sert de fondation à ce palier.

## Prochaine étape le jour venu

Lancer un **Product Brief** dédié (« Foyer partagé hébergé ») : personas (Marceau power-user /
conjoint suivi simple), parcours d'invitation, modèle d'auth, exigences de sécurité hébergée,
puis PRD → épics. **Pas avant.**
