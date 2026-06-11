<!-- 效果展示区组件，分两部分，上面渲染代码效果，底部输出js的信息 -->
<template>
  <div class="sandbox">
    <!-- 将代码拼接成字符串之后放在iframe中运行，让iframe渲染在页面上,相当于一个独立的小浏览器环境 -->
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
  // 沙箱DOM元素绑定
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
    // 确认消息来源来自iframe
    const frameWin = previewFrame.value?.contentWindow;
    if(!frameWin) return;

    if (e.source !== frameWin) return;

    const data = e.data;
    if (!data || data.source !== 'sandbox-console') return;

    // log格式化
    logs.value.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: data.method || 'log',
      text: (data.args || []).join(' '),
      ts: data.ts || Date.now(),
    });
  }

  // 挂载组件时将挂上监听器
  onMounted(() => {
    window.addEventListener('message', jsMessage);
  });

  // 浏览器不能直接编译TSX，所以需要这一步
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
            const { useState, useEffect, useRef, useCallback, useMemo } = React;
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

  // 这里重写了iframe中的console方法, 把日志通过 postMessage 发给父页面,同时继续调用原来的 console.log
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

            window.onerror = function(message, source, lineno, colno) {
              window.parent.postMessage({
                source: 'sandbox-console',
                method: 'error',
                args: [message + ' (' + source + ':' + lineno + ':' + colno + ')'],
                ts: Date.now()
              }, '*')
            }

            window.addEventListener('unhandledrejection', function(e) {
              window.parent.postMessage({
                source: 'sandbox-console',
                method: 'error',
                args: ['Unhandled Promise Rejection: ' + e.reason],
                ts: Date.now()
              }, '*')
            })
          })()
            ${codeStore.jsCode}
          <\/script>
        </body>
      </html>
    `;
  };
  
  // 更新展示区，感觉要加防抖
  const updatePreview = () => {
    if (!previewFrame.value) return

    logs.value = []

    if( language.value === 'typescript' ) {
      previewFrame.value.srcdoc = generateReactHtml();
    } else {
      previewFrame.value.srcdoc = generateFullHtml();
    }

  }

  // 监听代码变化
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