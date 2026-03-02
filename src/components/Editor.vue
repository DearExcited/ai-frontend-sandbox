<template>
  <div class="edtior-container">
    <div ref="editorContainer" style="height: 100%;"></div>
    <div class="editor-actions" v-if="language === 'javascript'">
      <div class="action-btn">
        <font-awesome-icon icon="fa-solid fa-robot"/>
      </div>

      <div class="robot-drop-menu">
        <el-tooltip
          content="edit模式"
          placement="right"
        >
          <div class="action-btn" @click="aiStore.openEdit()">
            <font-awesome-icon icon="fa-solid fa-circle-nodes" />
          </div>
        </el-tooltip>

        <el-tooltip
          content="agent模式"
          placement="right"
        >
          <div class="action-btn" @click="aiStore.openAgent()">
            <font-awesome-icon icon="fa-solid fa-comments" />
          </div>
        </el-tooltip>

        <el-tooltip
          :content="tipTool"
          placement="right"
        >
          <div class="action-btn"
           @click="toggleAutoComplete()"
           :class="{ active:autoOn }"
           >
            <font-awesome-icon icon="fa-solid fa-pen" />
          </div>
        </el-tooltip>
      </div>
    </div>

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
          <button 
            class="sendMsg"
            @click="aiStore.sendEditMsg(codeStore.getSelectedCode(editor!), editor!)"
          >
            <font-awesome-icon icon="fa-solid fa-paper-plane" />
          </button>
        </div>
    </div>

    <div class="ai-agent" :class="{ open: aiStore.aiAgentOpen }">
        <div class="talk-header">
          <span class="talk-title">AI-AGENT</span>
          <button class="talk-close" @click="aiStore.closeAgent()">
            <font-awesome-icon icon="fa-regular fa-circle-xmark" size="xl"/>
          </button>
        </div>
        <div class="talk-content" ref="chatAgentEl">
          <div class="talk-messages" v-for="(msg, index) in aiStore.aiAgentMessages" :key="index">
            {{ msg }}
          </div>
        </div>
        <div class="talk-input">
          <input type="text" 
            placeholder="向AI询问代码问题..." 
            v-model="aiStore.aiInput"
            @keydown.ctrl.enter.prevent="handleSendMsg"
          >
          <button 
            class="sendMsg" 
            @click="aiStore.sendAgentMsg(getCurrentCode())"
          >
            <font-awesome-icon icon="fa-solid fa-paper-plane" />
          </button>
        </div>
    </div>
  </div>

  <div v-if="aiStore.isLoading" class="ai-loading">AI正在思考...</div>
</template>

<script setup lang="ts">
  import {ref, watch, computed ,onMounted , onUnmounted, nextTick} from 'vue'
  import * as monaco from 'monaco-editor';
  import 'monaco-editor/esm/vs/language/html/monaco.contribution';
  import 'monaco-editor/esm/vs/language/css/monaco.contribution';
  import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
  import { useCodeStore } from '../store/useCodeStore';
  import { useAiStore } from '../store/useAiStore';
  import { useDiffStore } from '../store/useDiffStore';
  import { useRoute } from 'vue-router';
  import { loadReactTypes } from '../utils/loadReactTypes'
  import { ElTooltip } from 'element-plus';
  const route = useRoute()
  const codeStore = useCodeStore()
  const diffStore = useDiffStore()
  const aiStore = useAiStore()
  const editorContainer = ref<HTMLElement | null>(null)
  let editor: monaco.editor.IStandaloneCodeEditor | null = null

  const props = defineProps<{
    language: 'html' | 'css' | 'javascript' | 'typescript'
  }>()
  const tipTool = ref('自动补全已关闭')
  const autoOn = ref(true)

  // 获取当前语言的代码
  const getCurrentCode = () => {
    switch (props.language) {
      case 'html': return codeStore.htmlCode
      case 'css': return codeStore.cssCode
      case 'javascript': return codeStore.jsCode
      case 'typescript': return codeStore.reactCode
    }
  } 

  // 自动补全切换
  const toggleAutoComplete = () => {
    tipTool.value = tipTool.value.includes('已关闭')? '自动补全已开启': '自动补全已关闭'
    autoOn.value = !autoOn.value
    if( !aiStore.isEnabled ){
      aiStore.enableAIAssistant(editor!)
    } else {
      aiStore.disableAIAssistant()
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

  // 判断当前是否为JS路由
  const isJSRoute = computed(() => {
    return route.path.endsWith('/js');
  });

  // enter + ctrl 快捷键调用函数
  const handleSendEdit = () => {
    aiStore.sendEditMsg(codeStore.getSelectedCode(editor!), editor!)
  }
  const handleSendMsg = () => {
    aiStore.sendAgentMsg(getCurrentCode())
  }

  // 滚动条控制
  const chatAgentEl = ref<HTMLElement | null>(null);

  let autoFollow: boolean = true;

  function isNearBottom(el: HTMLElement, threshold = 80): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  function scrollToBottom(): void {
    const el = chatAgentEl.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function onScroll(): void {
    const el = chatAgentEl.value;
    if (!el) return;
    autoFollow = isNearBottom(el);
  }

  watch(
    () => aiStore.aiAgentMessages[aiStore.aiAgentMessages.length - 1],
    async () => {
      await nextTick();
      if (autoFollow) scrollToBottom();
    }
  );

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
    codeStore.getLocalCode();
    (window as any).monaco = monaco;

    // 配置语言服务
    configureHTMLLanguage();
    configureCSSLanguage();

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
      editor.onDidChangeModelContent(() => {
        if (editor) {
          updateStoreCode(editor.getValue())
        }
      });
      codeStore.setHtmlCode(editor.getValue());

      // 处在js路由时起用ai功能
      if (isJSRoute.value && props.language === 'javascript' && editor) {
        aiStore.enableAIAssistant(editor);
      }

      const el = chatAgentEl.value;
      if (!el) return;
      el.addEventListener("scroll", onScroll);
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
  })

  // 卸载
  onUnmounted(() => {
    if (editor) {
      editor.dispose()
    }

    aiStore.disableAIAssistant();
  })

</script>

<style scoped>
  .ai-loading {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
  }

  .edtior-container {
    flex: 1;
    position: relative;
  }

  .editor-actions {
    position: absolute;
    top: 15px;
    right: 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 10;
  }

  .ai-edit,
  .ai-agent {
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

  /* webkit滚动条样式要写三件套 */
  .ai-agent .talk-content,
  .ai-edit .talk-content{
    overflow: auto;
  }

  .ai-agent .talk-content::-webkit-scrollbar,
  .ai-edit .talk-content::-webkit-scrollbar{
    width: 8px;
  }

  .ai-agent .talk-content::-webkit-scrollbar-track,
  .ai-edit .talk-content::-webkit-scrollbar-track {
    background: #252526;
    border-radius: 999px;
  }

  .ai-agent .talk-content::-webkit-scrollbar-thumb,
  .ai-edit .talk-content::-webkit-scrollbar-thumb {
    background: #5a5a5a;
    border-radius: 999px;
    border: 2px solid #252526;
  }

  .ai-agent .talk-messages,
  .ai-edit .talk-messages {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .ai-edit.open,
  .ai-agent.open {
    display: block;
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

  .aiEdit-Button{
    display: flex;
    gap: 10px;
  }

  .aiEdit-button{
    background: #252526;
    color: white;
    border-radius: 50%;
    cursor: pointer;
  }

  .talk-close {
    background: none;
    border: none;
    color: #d4d4d4;
    cursor: pointer;
  }

  .talk-content {
    padding: 16px;
    max-height: 300px;
    overflow-y: auto;
  }

  .talk-messages {
    margin-bottom: 12px;
    line-height: 1.5;
    color: #d4d4d4;
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

  .robot-drop-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 8px;
    flex-direction: column;
    gap: 10px;
    visibility: hidden;
    display: flex;
    opacity: 0;
    transform: translateY(-6px);
    transition: all 0.2s ease;
  }

  .editor-actions:hover .robot-drop-menu,
  .robot-drop-menu:hover {
    visibility: visible;
    opacity: 1;
    transform: translateY(0);
  }
</style>