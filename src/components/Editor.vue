<template>
  <div class="edtior-container">
    <!-- 编辑器核心 -->
    <div ref="editorContainer" style="height: 100%;"></div>

    <!-- edit模式面板（保持浮窗） -->
      <div class="ai-edit" :class="{ open: aiStore.aiEditOpen }">
        <div class="talk-header">
          <span class="talk-title">AI-EDIT</span>
          <div class="aiEdit-Button">
            <el-tooltip content="替换" placement="top">
              <button class="aiEdit-button" @click="diffStore.replaceCode(editor)">
                <font-awesome-icon icon="fa-solid fa-rotate" />
              </button>
            </el-tooltip>
            <el-tooltip content="还原" placement="top">
              <button class="aiEdit-button" @click="diffStore.restoreOriginalCode(editor)">
                <font-awesome-icon icon="fa-solid fa-trash-can-arrow-up" />
              </button>
            </el-tooltip>
            <button class="talk-close" @click="aiStore.closeEdit()">
              <font-awesome-icon icon="fa-regular fa-circle-xmark" size="xl"/>
            </button>
          </div>
        </div>
        <div class="talk-content">
          <div class="talk-messages" v-for="(msg, index) in aiStore.aiEditMessages" :key="index">
            {{ msg }}
          </div>
        </div>
        <div class="talk-input">
          <input
            type="text"
            placeholder="向AI请求代码修改建议..."
            v-model="aiStore.aiInput"
            @keydown.ctrl.enter.prevent="handleSendEdit"
          >
          <button class="sendMsg" @click="aiStore.sendEditMsg(codeStore.getSelectedCode(editor!), editor!)">
            <font-awesome-icon icon="fa-solid fa-paper-plane" />
          </button>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="aiStore.isLoading" class="ai-loading">
        <span class="loading-dot"></span>
        AI 正在思考...
      </div>
  </div>
</template>

<script setup lang="ts">
  import {ref, watch, computed, onMounted, onUnmounted, nextTick} from 'vue'
  import * as monaco from 'monaco-editor';
  import 'monaco-editor/esm/vs/language/html/monaco.contribution';
  import 'monaco-editor/esm/vs/language/css/monaco.contribution';
  import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
  import { useCodeStore } from '../store/useCodeStore';
  import { useAiStore } from '../store/useAiStore';
  import { useDiffStore } from '../store/useDiffStore';
  import { loadReactTypes } from '../utils/loadReactTypes'
  import { ElTooltip } from 'element-plus';
  import { debounce } from '../utils/debounce';
  const codeStore = useCodeStore()
  const diffStore = useDiffStore()
  const aiStore = useAiStore()
  const editorContainer = ref<HTMLElement | null>(null)
  let editor: monaco.editor.IStandaloneCodeEditor | null = null

  const props = defineProps<{
    language: 'html' | 'css' | 'javascript' | 'typescript'
  }>()                                                             //路由props，传递语言类型

  // 获取当前语言的代码,用于发送ai
  const getCurrentCode = () => {
    switch (props.language) {
      case 'html': return codeStore.htmlCode
      case 'css': return codeStore.cssCode
      case 'javascript': return codeStore.jsCode
      case 'typescript': return codeStore.reactCode
    }
  }

  // 更新store中的代码
  const updateStoreCode = (value: string) => {
    switch (props.language) {
      case 'html': codeStore.setHtmlCode(value); break
      case 'css': codeStore.setCssCode(value); break
      case 'javascript': codeStore.setJsCode(value); break
      case 'typescript': codeStore.setReactCode(value); break
    }
  }

  const deupdateStoreCode = debounce(updateStoreCode, 500)

  // 判断当前是否为JS路由，可以不用路由路径判断
  const isJSRoute = computed(() => {
    return props.language === 'javascript'
  })

  // enter + ctrl 快捷键
  const handleSendEdit = () => {
    aiStore.sendEditMsg(codeStore.getSelectedCode(editor!), editor!)
  }

  function renderPendingDiff() {
    const currentEditor = editor
    if (!currentEditor?.getModel()) return
    if (!diffStore.isDiffMode) return

    const pending =
      aiStore.pendingChanges?.[
        props.language as keyof typeof aiStore.pendingChanges
      ]

    if (!pending) return

    console.log(pending.original)
    console.log(pending.modified)

    diffStore.processFullDiff(
      currentEditor,
      pending.original,
      pending.modified
    )
  }

  // 配置jsx
  function configureTypeScriptForJSX() {
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    })
  }

  // 配置HTML语言选项
  function configureHTMLLanguage() {
    monaco.languages.html.htmlDefaults.setOptions({
      format: {
        tabSize: 2,
        insertSpaces: true,
        wrapLineLength: 120,
        unformatted: 'wbr',
        contentUnformatted: 'pre,code,textarea',
        indentInnerHtml: false,
        preserveNewLines: true,
        maxPreserveNewLines: 1,
        indentHandlebars: false,
        endWithNewline: false,
        extraLiners: 'head, body, /html',
        wrapAttributes: 'auto'
      },
      suggest: { html5: true }
    });
  }

  // 配置CSS语言选项
  function configureCSSLanguage() {
    monaco.languages.css.cssDefaults.setOptions({
      validate: true,
      lint: {
        compatibleVendorPrefixes: 'ignore',
        vendorPrefix: 'warning',
        duplicateProperties: 'warning',
        emptyRules: 'warning',
        importStatement: 'ignore',
        boxModel: 'ignore',
        universalSelector: 'ignore',
        zeroUnits: 'ignore',
        fontFaceProperties: 'warning',
        hexColorLength: 'error',
        argumentsInColorFunction: 'error',
        unknownProperties: 'warning',
        ieHack: 'ignore',
        unknownVendorSpecificProperties: 'ignore',
        propertyIgnoredDueToDisplay: 'warning',
        important: 'ignore',
        float: 'ignore',
        idSelector: 'ignore'
      }
    });
  }

  // 确保DOM渲染已经完成
  onMounted(async () => {
    // 挂载元素之后加载保存的代码
    codeStore.getLocalCode();
    (window as any).monaco = monaco;

    // 配置语言服务
    configureHTMLLanguage();
    configureCSSLanguage();

    // 将编辑器实例挂载到真实DOM上
    if (editorContainer.value) {
      editor = monaco.editor.create(editorContainer.value, {
        language: props.language,
        theme: 'vs-dark',
        value: getCurrentCode(),
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        suggestOnTriggerCharacters: true,
        tabSize: 2,
        // 启用完整的补全功能
        quickSuggestions: {
          other: true,
          comments: false,
          strings: true
        },
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: 'on',
        wordBasedSuggestions: 'matchingDocuments',
        suggest: {
          showWords: true,
          showSnippets: true,
        }
      });
      
      const uri =
      props.language === 'typescript'
        ? monaco.Uri.parse('file:///src/App.tsx')
        : monaco.Uri.parse(`file:///src/index.${props.language}`)

      const model = monaco.editor.createModel(getCurrentCode(), props.language, uri)
      editor.setModel(model)

      if (props.language === 'typescript') {
        await loadReactTypes(monaco)
        configureTypeScriptForJSX()
      }

      await nextTick()

      requestAnimationFrame(() => {
        renderPendingDiff()
      })

      editor.onDidChangeModelContent(() => {
        if (!editor) return

        if (diffStore.isDiffMode) return
        if (diffStore.isRestoring) return

        deupdateStoreCode(editor.getValue())
      });

      // 注册当前 editor 实例到 aiStore
      aiStore.registerEditor(props.language, editor)

      // 处在js路由时起用ai内联补全功能
      if (isJSRoute.value && props.language === 'javascript' && editor) {
        aiStore.enableAIAssistant(editor);
      }
    }
  })

  // 语言变化时更新编辑器
  watch(() => props.language, async (newLang) => {
    if (!editor) return

    const oldModel = editor.getModel()
    if (oldModel) oldModel.dispose()

    const uri =
    newLang === 'typescript'
      ? monaco.Uri.parse('file:///src/App.tsx')
      : monaco.Uri.parse(`file:///src/index.${newLang}`)
    const newModel = monaco.editor.createModel(getCurrentCode(), newLang, uri)
    editor.setModel(newModel)

    if (newLang === 'typescript') {
      await loadReactTypes(monaco)
      configureTypeScriptForJSX()
    } else {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        jsx: monaco.languages.typescript.JsxEmit.None,
      })
    }

    aiStore.currentLanguage = newLang

    await nextTick()

    requestAnimationFrame(() => {
      renderPendingDiff()
    })
  })

  // 监听实现切换语言diff展示
  watch(
  [
    () => props.language,
    () => aiStore.pendingChanges,
    () => diffStore.isDiffMode,
  ],
  async () => {
    if (!diffStore.isDiffMode) return
    if (diffStore.isRestoring) return
    if (!aiStore.pendingChanges) return

    await nextTick()

    requestAnimationFrame(() => {
      renderPendingDiff()
    })
  },
  {
    deep: true,
    flush: 'post',
  }
)

  // 卸载
  onUnmounted(() => {
    if (editor) {
      const model = editor.getModel()
      editor.setModel(null)
      model?.dispose()
      editor.dispose()
      editor = null
    }
    aiStore.unregisterEditor(props.language)
    aiStore.disableAIAssistant()

    // ★ 核心修复：组件卸载时，立即清空 store 里的旧 ID，切断幽灵ID的传递
    const diffStore = useDiffStore()
    diffStore.diffDecorations = [] 
  })

</script>

<style scoped>
  .edtior-container {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  /* ===== AI 加载状态 ===== */
  .ai-loading {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.75);
    color: #d4d4d4;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .loading-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #0078d4;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }

  /* ===== AI-EDIT 浮窗（保持不变） ===== */
  .ai-edit {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 320px;
    background: #252526;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    z-index: 20;
    overflow: hidden;
    display: none;
  }

  .ai-edit.open {
    display: block;
  }

  .ai-edit .talk-content {
    overflow: auto;
    padding: 16px;
    max-height: 300px;
    overflow-y: auto;
  }

  .ai-edit .talk-content::-webkit-scrollbar { width: 8px; }
  .ai-edit .talk-content::-webkit-scrollbar-track { background: #252526; border-radius: 999px; }
  .ai-edit .talk-content::-webkit-scrollbar-thumb { background: #5a5a5a; border-radius: 999px; border: 2px solid #252526; }

  .ai-edit .talk-messages {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    margin-bottom: 12px;
    line-height: 1.5;
    color: #d4d4d4;
  }

  .talk-header {
    padding: 12px 16px;
    display: flex;
    background: #2d2d30;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #3e3e42;
  }

  .talk-title {
    color: #d4d4d4;
    font-weight: 600;
  }

  .aiEdit-Button {
    display: flex;
    gap: 10px;
  }

  .aiEdit-button {
    background: #252526;
    color: white;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .talk-close {
    background: none;
    border: none;
    color: #d4d4d4;
    cursor: pointer;
  }

  .talk-input {
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #2d2d30;
    border-top: 1px solid #3e3e42;
  }

  .talk-input input {
    flex: 1;
    background: #3c3c3c;
    border: 1px solid #0078d4;
    border-radius: 4px;
    padding: 8px 12px;
    color: #d4d4d4;
    outline: none;
  }

  .talk-input button {
    margin-left: 8px;
    background: #0078d4;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    color: white;
    cursor: pointer;
  }
</style>