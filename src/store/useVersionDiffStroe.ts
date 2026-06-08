import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DiffFileKey = 'html' | 'css' | 'javascript'

export interface VersionFiles {
  html: string
  css: string
  javascript: string
}

const emptyFiles = (): VersionFiles => ({
  html: '',
  css: '',
  javascript: '',
})


export const useVersionDiffStore = defineStore('useVersionDiffStore', () => {
  const diffDialogVisible = ref(false)
  const activeTab = ref<DiffFileKey>('html')
  const originalFiles = ref<VersionFiles>(emptyFiles())
  const currentFiles = ref<VersionFiles>(emptyFiles())
  const versionName = ref('')
  const openDiff  = (payload: {
    versionName?: string
    originalFiles: Partial<VersionFiles>
    currentFiles: Partial<VersionFiles>
  }) => {
    versionName.value = payload.versionName || '版本对比'

    originalFiles.value = {
      html: payload.originalFiles.html || '',
      css: payload.originalFiles.css || '',
      javascript: payload.originalFiles.javascript || '',
    }

    currentFiles.value = {
      html: payload.currentFiles.html || '',
      css: payload.currentFiles.css || '',
      javascript: payload.currentFiles.javascript || '',
    }

    activeTab.value = 'html'
    diffDialogVisible.value = true
  }

  const closeDiff = () => {
    diffDialogVisible.value = false
  }


  return{
    diffDialogVisible,
    activeTab,
    originalFiles,
    currentFiles,
    openDiff,
    closeDiff
  }
})