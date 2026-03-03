<template>
  <div class="sandbox">
    <iframe 
      title="my-html" 
      ref="previewFrame" 
      src="" 
      frameborder="0" 
      sandbox="allow-scripts" 
      width="100%" 
      height="100%">
    </iframe>

    <console :logs="logs"></console>
  </div>
</template>

<script setup lang="ts" name="Preview">
  import { ref, onMounted, watch, computed } from 'vue';
  import { useCodeStore } from '../store/useCodeStore';
  import * as Babel from '@babel/standalone'
  import { useRoute } from 'vue-router';
  import console from './consolePanel.vue';
  type LogItem = { id: string; type: 'log'|'warn'|'error'|'info'; text: string; ts: number };
  const logs = ref<LogItem[]>([]);
  const route = useRoute()
  const codeStore = useCodeStore()
  const previewFrame = ref<HTMLIFrameElement | null>(null);
  const language = computed(() => {
  const routeName = route.path.split('/').pop();
  switch(routeName) {
      case 'html': return 'html';
      case 'css': return 'css';
      case 'js': return 'javascript';
      case 'react': return 'typescript';
      default: return 'html'; // 默认值
    }
  });

  // 通过监听获取输出
  function jsMessage(e:MessageEvent){
    const frameWin = previewFrame.value?.contentWindow;
    if(!frameWin) return;

    if (e.source !== frameWin) return;

    const data = e.data;
    if (!data || data.source !== 'sandbox-console') return;

    logs.value.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: data.method || 'log',
      text: (data.args || []).join(' '),
      ts: data.ts || Date.now(),
    });
  }

  onMounted(() => {
    window.addEventListener('message', jsMessage);
  });

    /* 把 TSX → JS */
  function compileTsx(code: string): string {
    try {
      const result = Babel.transform(code, {
        presets:[
          ['react', { runtime: 'classic' }],
          ['typescript', { isTSX: true, allExtensions: true }],
        ],
      })
      return result.code || ''
    } catch (e: any) {
      return `console.error('编译失败:', ${JSON.stringify(e.message)})`
    }
  }

  const generateReactHtml = () => {
    const compiledJs = compileTsx(codeStore.reactCode);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
          <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
          <style>${codeStore.cssCode}<\/style>
        </head>
        <body>
          <div id="root"></div>
          <script>
            const { useState, useEffect } = React;
            try {
              ${compiledJs}
              const root = ReactDOM.createRoot(document.getElementById('root'));
              root.render(React.createElement(App));
            } catch (error) {
              console.error('React 渲染错误:', error);
              document.getElementById('root').innerText = '渲染失败: ' + error.message;
            }
          <\/script>
        </body>
      </html>
    `;
  };

  const generateFullHtml = () => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${codeStore.cssCode}</style>
        </head>
        <body>
          ${codeStore.htmlCode}
          <script>
           (function () {
            const methods = ['log','warn','error','info']
            methods.forEach(method => {
              const original = console[method]
              console[method] = function (...args) {
                window.parent.postMessage({
                  source: 'sandbox-console',
                  method,
                  args,
                  ts: Date.now()
                }, '*')
                original.apply(console, args)
              }
            })
          })()
            ${codeStore.jsCode}
          <\/script>
        </body>
      </html>
    `;
  };
  
  const updatePreview = () => {
    if (!previewFrame.value) return 

    if( language.value === 'typescript' ) {
      previewFrame.value.srcdoc = generateReactHtml();
    } else {
      previewFrame.value.srcdoc = generateFullHtml();
    } 

  }

  watch(
    () => [codeStore.htmlCode, codeStore.cssCode, codeStore.jsCode, codeStore.reactCode, language.value],
    updatePreview,
    { deep: true }
  );

  onMounted(updatePreview);
</script>

<style>
 .sandbox{
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
 }

 iframe{
    flex: 1;
    min-height: 0;
    width: 100%;
    border: 0;
  }
</style>