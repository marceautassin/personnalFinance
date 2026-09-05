<script setup lang="ts">
const emit = defineEmits<{ upload: [files: File[]] }>()

const isDragging = ref(false)
const errorMessage = ref<string | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
let dragDepth = 0

const MAX_BYTES = 10 * 1024 * 1024

function isPdfFile(file: File): boolean {
  // Certains OS (Windows en drag-drop notamment) livrent file.type vide pour des PDF valides.
  // Fallback sur l'extension .pdf — la validation profonde se fait côté serveur via unpdf.
  if (file.type === 'application/pdf') return true
  if (file.type === '' || file.type === 'application/octet-stream') {
    return file.name.toLowerCase().endsWith('.pdf')
  }
  return false
}

/** Motif de rejet d'un fichier, ou `null` s'il est acceptable. */
function rejectionReason(file: File): string | null {
  if (!isPdfFile(file)) return 'n\'est pas un PDF'
  if (file.size === 0) return 'est vide'
  if (file.size > MAX_BYTES) {
    const mb = Math.round((file.size / 1024 / 1024) * 10) / 10
    return `dépasse 10 Mo (${mb} Mo)`
  }
  return null
}

/**
 * Accepte un dépôt MULTIPLE (FR1) et trie sur place ce qui n'a aucune chance de passer.
 *
 * Un fichier rejeté ici n'empêche pas les autres de partir : c'est déjà l'esprit de FR3, et
 * ce serait absurde de refuser 23 relevés valides parce qu'une capture d'écran s'est glissée
 * dans la sélection. Les motifs de rejet sont énumérés, pas résumés — « certains fichiers ont
 * été ignorés » n'aide personne.
 */
function handleFiles(fileList: FileList | null | undefined) {
  errorMessage.value = null
  const files = Array.from(fileList ?? [])
  if (files.length === 0) return

  const accepted: File[] = []
  const rejected: string[] = []
  for (const file of files) {
    const reason = rejectionReason(file)
    if (reason) rejected.push(`${file.name} ${reason}`)
    else accepted.push(file)
  }

  if (rejected.length > 0) {
    errorMessage.value = `Ignoré${rejected.length > 1 ? 's' : ''} : ${rejected.join(' ; ')}.`
  }
  // Tri par nom : l'ordre d'un dépôt multiple dépend sinon du système de fichiers, et une
  // file de 24 relevés dans un ordre arbitraire est illisible.
  if (accepted.length > 0) {
    emit('upload', accepted.sort((a, b) => a.name.localeCompare(b.name, 'fr')))
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth = 0
  isDragging.value = false
  handleFiles(e.dataTransfer?.files)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}
function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragDepth++
  isDragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) isDragging.value = false
}
function onClick() {
  inputRef.value?.click()
}
function onInput(e: Event) {
  handleFiles((e.target as HTMLInputElement).files)
  // Reset pour permettre un re-upload du même fichier après une erreur
  if (inputRef.value) inputRef.value.value = ''
}
</script>

<template>
  <div>
    <button
      type="button"
      class="dropzone"
      :class="{ 'dropzone--dragging': isDragging }"
      :aria-label="'Déposer un ou plusieurs relevés PDF'"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @click="onClick"
    >
      <p class="dropzone__title">
        Dépose tes relevés PDF Boursorama ici
      </p>
      <p class="dropzone__hint">
        <small>un ou plusieurs à la fois — ou clique pour les sélectionner (max 10 Mo par fichier)</small>
      </p>
    </button>
    <input
      ref="inputRef"
      type="file"
      multiple
      accept="application/pdf"
      class="dropzone__input"
      @change="onInput"
    >
    <p
      v-if="errorMessage"
      class="dropzone__error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 200px;
  padding: var(--space-8);
  border: 2px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  transition: border-color var(--transition-base), background-color var(--transition-base);
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.dropzone:hover,
.dropzone--dragging {
  border-color: var(--color-accent);
  background: var(--color-neutral-100);
}
.dropzone__title {
  font-size: var(--font-size-lg);
  font-weight: 500;
}
.dropzone__hint { color: var(--color-text-muted); }
.dropzone__input { display: none; }
.dropzone__error {
  color: var(--color-danger);
  margin-top: var(--space-3);
}
</style>
