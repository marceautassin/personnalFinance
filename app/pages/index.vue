<script setup lang="ts">
/**
 * L'accueil est la page d'analyse.
 *
 * Le tableau de bord narratif de l'epic 4 a été retiré le 2026-09-05. Il datait du produit
 * forecast et séparait recettes et dépenses par le SIGNE du montant, sans connaître les
 * natures : sur août 2026 il annonçait 3 187,40 € de « revenus » dont 1 000 € de remboursement
 * de compte courant — exactement la distorsion que ce produit existe pour corriger. Deux
 * écrans donnaient donc deux réponses différentes sur le même mois, et l'accueil donnait la
 * fausse.
 *
 * Sa synthèse narrative n'est pas perdue : elle est au PRD en phase Croissance (FR37), où le
 * moteur calcule et le modèle rédige — et non l'inverse.
 */
definePageMeta({ redirect: '/analyse' })
</script>

<template>
  <div />
</template>
