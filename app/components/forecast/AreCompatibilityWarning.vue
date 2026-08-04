<script setup lang="ts">
const props = defineProps<{
  agMonth: string
  areEndMonth: string | null
}>()

const message = computed(() => {
  const until = props.areEndMonth ? ` (jusqu'à ${props.areEndMonth})` : ''
  return `⚠️ Le versement du dividende prévu à l'AG (${props.agMonth}) tombe alors que vos droits ARE `
    + `sont encore actifs${until}. Vérifiez la compatibilité avec le maintien de l'ARE avant de voter.`
})
</script>

<template>
  <p
    class="are-warn"
    role="alert"
  >
    {{ message }}
  </p>
</template>

<style scoped>
.are-warn {
  margin: 0;
  padding: var(--space-3);
  border-left: 3px solid var(--color-warning, #8a6500);
  background: var(--color-warning-bg, #fff4cc);
  color: var(--color-warning, #8a6500);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}
</style>
