<template>
  <el-dialog
      v-model="versionDiffStore.diffDialogVisible"
      width="90vw"
      title="DIFF"
      class="diff-dialog"
      align-center
      @opened="handleOpened"
      @closed="handleClosed"
    >
    <el-tabs v-model="versionDiffStore.activeTab">
      <el-tab-pane label="HTML" name="html" />
      <el-tab-pane label="CSS" name="css" />
      <el-tab-pane label="JavaScript" name="javascript" />
    </el-tabs>
    
    <div ref="diffContainerRef" class="diff-editor-container"></div>
    
    <template #footer>
      <el-button @click="diffDialogVisible = false" type="primary">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup name="diffDialogForm" lang="ts">
import * as monaco from 'monaco-editor';
import { ref, nextTick, watch, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia'
import { ElDialog, ElButton, ElTabPane, ElTabs } from 'element-plus';
import { useVersionDiffStore, type DiffFileKey } from '../store/useVersionDiffStroe';

let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
let originalModel:monaco.editor.ITextModel | null = null
let currentModel:monaco.editor.ITextModel | null = null
const versionDiffStore = useVersionDiffStore()

const {
  diffDialogVisible,
  activeTab,
  originalFiles,
  currentFiles
} = storeToRefs(versionDiffStore)

const diffContainerRef = ref<HTMLElement | null>(null)
const languageMap: Record<DiffFileKey, string> = {
  html: 'html',
  css: 'css',
  javascript: 'javascript',
}


const disposeModels = () => {
  originalModel?.dispose()
  currentModel?.dispose()

  originalModel = null
  currentModel = null
}

const getCurrentLanguage = () => {
  return languageMap[activeTab.value]
}

const renderDiff = async () => {
  await nextTick()

  if(!diffContainerRef.value) return

  if(!diffEditor) {
    diffEditor = monaco.editor.createDiffEditor(diffContainerRef.value, {
      readOnly: true,
      automaticLayout: true,
      renderSideBySide: true,
      enableSplitViewResizing: true,
      originalEditable: false,
      minimap: {
        enabled: false,
      },
      scrollBeyondLastLine: false,
    })
  }

  disposeModels()

  const key = activeTab.value
  const language = getCurrentLanguage()

  originalModel = monaco.editor.createModel(
    originalFiles.value[key] || '',
    language,
  )

  currentModel = monaco.editor.createModel(
    currentFiles.value[key] || '',
    language,
  )

  diffEditor.setModel({
    original: originalModel,
    modified: currentModel,
  })

  diffEditor.layout()
}

const handleOpened = async () => {
  await renderDiff()
}

const handleClosed = () => {
  disposeModels()

  diffEditor?.dispose()
  diffEditor = null

}

watch(activeTab, async () => {
  if (diffDialogVisible.value) {
    await renderDiff()
  }
})

onBeforeUnmount(() => {
  disposeModels()

  diffEditor?.dispose()
  diffEditor = null
})
</script>

<style scoped>
.diff-editor-container {
  width: 100%;
  height: calc(100vh - 220px);
  border: 1px solid #333;
  overflow: hidden;
}
</style>

<style>
.diff-dialog .diffViewport{
  display: none !important;
}

.diffOverview{
  display: none !important;
}
</style>
