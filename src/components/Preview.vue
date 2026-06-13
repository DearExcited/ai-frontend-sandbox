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

    <console-panel :logs="logs"></console-panel>
  </div>
</template>

<script setup lang="ts" name="Preview">
  import { ref, onMounted, watch, computed, onUnmounted } from 'vue';
  import { useCodeStore } from '../store/useCodeStore';
  import * as Babel from '@babel/standalone'
  import { useRoute } from 'vue-router';
  import { debounce } from '../utils/debounce.ts';
  import consolePanel from './consolePanel.vue';
  import CompilerWorker from '../workers/compiler.worker?worker'
import ConsolePanel from './consolePanel.vue';
  type LogItem = { id: string; type: 'log'|'warn'|'error'|'info'; text: string; ts: number };
  const logs = ref<LogItem[]>([]);
  const route = useRoute()
  const codeStore = useCodeStore()
  const compiledCode = ref('')
  const compileDuration = ref(0) // 记录编译耗时
  const worker = new CompilerWorker()
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

  async function compileReactCodeAsync(rawCode: string): Promise<string>{
    return new Promise((resolve, reject) => {
      // 生成本次编译id 方便记录编译耗时
      const taskId = Math.random().toString(36).slice(2)

      const handleMessage = (e : MessageEvent) => {
        const {id, compiled, error, success} = e.data 
        if( id !== taskId) return
        // 卸载监听器
        worker.removeEventListener('message', handleMessage)
         if (success) {
          resolve(compiled)
        } else {
          reject(new Error(error))
        }
      }

      worker.addEventListener('message', handleMessage)
      worker.postMessage({ code: rawCode, id: taskId })
    })
  }

  // function compileTsx(code: string): string {
  //   try {
  //     const result = Babel.transform(code, {
  //       presets:[
  //         ['react', { runtime: 'classic' }],
  //         ['typescript', { isTSX: true, allExtensions: true }],
  //       ],
  //     })
  //     return result.code || ''
  //   } catch (e: any) {
  //     return `console.error('编译失败:', ${JSON.stringify(e.message)})`
  //   }
  // }

  const generateReactHtml = (complieJsCode: string) => {
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
              ${complieJsCode}
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
  
  // 更新展示区
  const updatePreview = async () => {
    if (!previewFrame.value) return
    logs.value = [] // 清空界面日志

    const startTime = performance.now()

    // 1. Iframe 渲染完毕的监听器
    const handleLoad = () => {
      if (!previewFrame.value) return
      const endTime = performance.now()
      const duration = endTime - startTime
      console.log(`%c[Iframe Render] 界面刷新总耗时: ${duration.toFixed(2)} ms`, 'color: #67C23A; font-weight: bold;')
      previewFrame.value.removeEventListener('load', handleLoad)
    }
    previewFrame.value.addEventListener('load', handleLoad)

    // 2. 分流处理
    if (language.value === 'typescript') {
      console.log('[Compiler] 收到新代码，投放给 Worker 线程编译...')
      const workerStartTime = performance.now()

      try {
        // 异步等待编译结果
        const compileJsCode = await compileReactCodeAsync(codeStore.reactCode)
        
        // 存储编译耗时与代码状态
        compiledCode.value = compileJsCode
        compileDuration.value = performance.now() - workerStartTime
        console.log(`%c[Compiler Worker] 编译成功！耗时: ${compileDuration.value.toFixed(2)} ms`, 'color: #409EFF; font-weight: bold;')

        // 塞入 Iframe 渲染
        previewFrame.value.srcdoc = generateReactHtml(compileJsCode);
      } catch (err: any) {
        // 🛡️ 防御机制：代码语法错误时，直接把红字错误丢进 iframe 提示，体验极佳
        console.error('[Compiler Worker] 编译发生语法错误:', err.message)
        previewFrame.value.srcdoc = `<pre style="color: #ff4d4f; background: #fff1f0; padding: 20px; font-family: monospace; border: 1px solid #ffa39e; border-radius: 4px;">❌ React 编译失败:\n${err.message}</pre>`
      }
    } else {
      // 普通模式直接同步渲染
      previewFrame.value.srcdoc = generateFullHtml();
    }
  }

  const deUpdatePreview = debounce(updatePreview, 200)

  // 监听代码变化
  watch(
    () => [codeStore.htmlCode, codeStore.cssCode, codeStore.jsCode, codeStore.reactCode, language.value],
    deUpdatePreview,
    { deep: true }
  );

  onMounted(updatePreview);
  onUnmounted(window.removeEventListener('message', jsMessage))
  onUnmounted(worker.terminate())
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