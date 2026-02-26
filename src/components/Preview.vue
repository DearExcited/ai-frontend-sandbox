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

    <div class="console">
      <div class="console-bar">
        <div class="title">
          JS Console
        </div>

        <div class="action">
          
        </div>
      </div>
      <div class="console-content">
        暂无输出
      </div>
    </div>

  </div>
</template>

<script setup lang="ts" name="Preview">
  import { ref, onMounted, watch, computed } from 'vue';
  import { useCodeStore } from '../store/useCodeStore';
  import * as Babel from '@babel/standalone'
  import { useRoute } from 'vue-router';
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
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
 }

 iframe{
    flex: 1;
    min-height: 0;
    width: 100%;
    border: 0;
  }

  .console{
    height: 220px;           /* 你可以改成 160/240 */
    width: 100%;
    background: #0f1115;
    color: #e6e6e6;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

 .console-bar{
  background: #2d2d30;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #3e3e42;
 }

 .console-content{
    flex: 1;                 /* 关键：用 flex 撑开 */
    min-height: 0;           /* 关键：允许内部滚动 */
    overflow: auto;
    padding: 8px 10px 10px;
  }

</style>