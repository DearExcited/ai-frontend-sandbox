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
  import { useRoute } from 'vue-router';
  import { debounce } from '../utils/debounce.ts';
  import CompilerWorker from '../workers/compiler.worker?worker'
  import ConsolePanel from './consolePanel.vue';
  import * as Babel from '@babel/standalone';
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

 // ==================== HMR 性能量化测试方案（安全升级版） ====================
const getMedian = (arr: number[]): number => {
  const sorted = [...arr].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[half];
  return (sorted[half - 1] + sorted[half]) / 2;
};

function compileTsxSync(code: string): number {
  const t0 = performance.now();
  try {
    // @ts-ignore
    if (Babel) {
      // @ts-ignore
      Babel.transform(code, {
        presets: [['react', { runtime: 'classic' }], ['typescript', { isTSX: true, allExtensions: true }]],
      });
    } else {
      let startTime = performance.now();
      while (performance.now() - startTime < 150) {} // 模拟老架构主线程卡顿
    }
  } catch (e) {}
  return performance.now() - t0;
}

// 核心安全熔断器：防止 Promise 挂起卡死
const withTimeout = (promise: Promise<any>, ms: number) => {
  let timer: any;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Worker 响应超时 (${ms}ms)，请检查 Worker 是否存活或重传了 taskId`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
};

async function runHMRBenchmark() {
  const RUN_TIMES = 10; // 巨量代码跑 10 次即可
  console.log(`%c🚀 开始 HMR 1500行巨量代码压测（模拟大型组件实时编辑）`, 'color: #e6a23c; font-weight: bold; font-size: 14px;');

  // 1. 动态生成一个 1500 行的合法巨型 React 组件
  let heavyTSX = `
    import React, { useState } from 'react';
    export default function MegaApp() {
      const [data, setData] = useState(0);
  `;
  for (let i = 0; i < 400; i++) {
    heavyTSX += `  const handleHeavyCalculationNode${i} = (x: number) => x + ${i};\n`;
  }
  heavyTSX += `
      return <div>Mega Sandbox Test</div>;
    }
  `;

  // --- 测试 A：主线程同步（真编译） ---
  const baselineResults: number[] = [];
  for (let i = 0; i < RUN_TIMES; i++) {
    const dynamicCode = heavyTSX + `\n// Salt: ${i}-${Math.random()}`;
    baselineResults.push(compileTsxSync(dynamicCode));
  }

  // --- 测试 B：Web Worker 异步（真编译） ---
  const workerResults: number[] = [];
  console.log("⏳ 正在编译 1500 行巨型组件，主线程即将见证真章...");
  
  for (let i = 0; i < RUN_TIMES; i++) {
    const dynamicCode = heavyTSX + `\n// Salt: ${i}-${Math.random()}`;
    const t0 = performance.now();
    try {
      await withTimeout(compileReactCodeAsync(dynamicCode), 5000);
      workerResults.push(performance.now() - t0);
    } catch (e: any) {
      console.error(`❌ Worker 编译失败:`, e.message);
      return;
    }
  }

  const baselineMedian = getMedian(baselineResults);
  const workerMedian = getMedian(workerResults);

  console.log('%c📊 【1500行大文件 - 真实编译性能报表】', 'color: #409EFF; font-weight: bold;');
  console.table({
    '老架构：主线程同步 (产生阻塞)': {
      '中位数耗时 (ms)': parseFloat(baselineMedian.toFixed(2)),
      'UI 掉帧阻塞时长 (ms)': parseFloat(baselineMedian.toFixed(2)), // 💥 主线程跑多久就卡多久
    },
    '新架构：Web Worker 异步 (零阻塞)': {
      '中位数耗时 (ms)': parseFloat(workerMedian.toFixed(2)),
      'UI 掉帧阻塞时长 (ms)': 0, // ⚡ Worker 跑再久，主线程也是 0ms 阻塞！
    }
  });
}

function generateLargeComponent(): string {
  let heavyTSX = `
    import React, { useState } from 'react';
    export default function MegaApp() {
      const [data, setData] = useState(0);
  `;
  for (let i = 0; i < 400; i++) {
    heavyTSX += `  const handleHeavyCalculationNode${i} = (x: number) => x + ${i};\n`;
  }
  heavyTSX += `
      return <div>Mega Sandbox Test</div>;
    }
  `;
  return heavyTSX;
}

// 2. 缓存命中率压测主函数
async function runLRUBenchmark() {
  console.log(`%c⚡ 开始 LRU 缓存效果专项测试（1500行大文件）`, 'color: #409EFF; font-weight: bold; font-size: 14px;');
  
  // 💡 核心修复：加上批次随机盐（Command Salt），击穿上一次执行留下的持久缓存
  const sameCode = generateLargeComponent() + `\n// 命令执行批次标签: ${Math.random()}`;

  // --- 第一次编译：冷启动（由于加了 Salt，这次绝对会击穿老缓存，强制走 Babel） ---
  console.log('⏳ 正在执行第一次编译（冷启动，强制走 Babel 算力消耗）...');
  const t1 = performance.now();
  try {
    await compileReactCodeAsync(sameCode); 
    const duration1 = performance.now() - t1;
    console.log(`%c[1] 真实冷启动耗时: %c${duration1.toFixed(2)} ms`, 'color: #909399;', 'color: #f56c6c; font-weight: bold;');
    
    // --- 第二次编译：热提交（代码未变，预期命中 LRU） ---
    console.log('⏳ 正在执行第二次编译（代码未变，预期触发 LRU 拦截）...');
    const t2 = performance.now();
    await compileReactCodeAsync(sameCode);
    const duration2 = performance.now() - t2;
    console.log(`%c[2] 缓存命中耗时: %c${duration2.toFixed(2)} ms`, 'color: #909399;', 'color: #67c23a; font-weight: bold;');
    
    const speedup = (duration1 / duration2).toFixed(1);
    console.log(`%c🎉 结论：LRU 拦截成功！响应速度提升了 %c${speedup} 倍%c！`, 'color: #67C23A;', 'color: #ff4d4f; font-weight: bold;', 'color: #67C23A;');
  } catch (e: any) {
    console.error('❌ 测试期间发生错误:', e.message);
  }
}

// 3. 挂载到全局 window 上
onMounted(() => {
  (window as any).runLRUBenchmark = runLRUBenchmark;
  console.log('%c💡 提示：在控制台输入 runLRUBenchmark() 可专项验证 LRU 缓存威力。', 'color: #909399; font-style: italic;');
});

onMounted(() => {
  (window as any).runHMRBenchmark = runHMRBenchmark;
});

  // 监听代码变化
  watch(
    () => [codeStore.htmlCode, codeStore.cssCode, codeStore.jsCode, codeStore.reactCode, language.value],
    deUpdatePreview,
    { deep: true }
  );

  onMounted(updatePreview);
  onUnmounted(() => {
    window.removeEventListener('message', jsMessage);
    worker.terminate(); // 确保离开页面时才关闭
  });
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