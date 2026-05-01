<script setup lang="ts">
const emit = defineEmits<{ upload: [file: File] }>()

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

function handleFiles(files: FileList | null | undefined) {
  errorMessage.value = null
  const file = files?.[0]
  if (!file) return
  if (!isPdfFile(file)) {
    errorMessage.value = 'Seuls les fichiers PDF sont acceptés.'
    return
  }
  if (file.size === 0) {
    errorMessage.value = 'Le fichier est vide.'
    return
  }
  if (file.size > MAX_BYTES) {
    const mb = Math.round((file.size / 1024 / 1024) * 10) / 10
    errorMessage.value = `Le fichier dépasse 10 Mo (${mb} Mo).`
    return
  }
  emit('upload', file)
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
      :aria-label="'Déposer un relevé PDF'"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @click="onClick"
    >
      <p class="dropzone__title">
        Dépose un relevé PDF Boursorama ici
      </p>
      <p class="dropzone__hint">
        <small>ou clique pour sélectionner un fichier (max 10 Mo)</small>
      </p>
    </button>
    <input
      ref="inputRef"
      type="file"
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
