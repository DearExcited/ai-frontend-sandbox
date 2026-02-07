<template>
  <div style="height: 100vh; display: flex; flex-direction: column;">
    <h2>AI Code Editor Demo</h2>
    <div id="editor" style="flex: 1;"></div>
  </div>
</template>

<script setup lang="ts">
import { languages } from 'monaco-editor'
import { onMounted } from 'vue'
import * as monaco from 'monaco-editor'

let editor: monaco.editor.IStandaloneCodeEditor

onMounted(() => {
  editor = monaco.editor.create(document.getElementById('editor')!, {
    value: `// 输入代码试试，比如写个 for 循环\nfor (let i = 0; i < 10; i++) {\n  \n}`,
    language: 'javascript',
    theme: 'vs-dark',
  })

  let lastSession: languages.InlineCompletions<languages.InlineCompletion> | null = null

  // 注册一个 JS 的 inline 补全提供者
  languages.registerInlineCompletionsProvider('javascript', {
    provideInlineCompletions(model, position, context, _token) {
      // 如果上一次还没完成，直接取消
      if (lastSession) {
        lastSession = null
      }

      // 只有显式触发（用户打字）时才请求 AI
      if (context.triggerKind === languages.InlineCompletionTriggerKind.Automatic) {
        // 继续执行
      }

      const code = model.getValue()
      return new Promise(async (resolve) => {
        try {
          const suggestion = await getAICompletion(code)
          if (!suggestion) {
            resolve({ items: [] })
            return
          }

          // 构造 Monaco 需要的返回格式
          const item = {
            insertText: suggestion,
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            )
          }

          const result = { items: [item] }
          lastSession = result as any
          resolve(result)
        } catch (e) {
          console.error(e)
          resolve({ items: [] })
        }
      })
    },

    freeInlineCompletions(_completions) {
      // 释放引用
      lastSession = null
    }
  })

  editor.updateOptions({ inlineSuggest: { enabled: true } })

  ;(window as any).editor = editor
  ;(window as any).monaco = monaco

  // 防抖监听
  editor.onDidChangeModelContent(() => {
    
  })
})

/* 调用 Moonshot */
async function getAICompletion(code: string): Promise<string> {
  const response = await fetch('/api/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-IT2HedPEUDo4yfBTYEH0dhZ3SlPYeZoMM5QKeKFiTmyaslRP', // ← 填你的 key
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        {
          role: 'system',
          content:
            '你是一名 JavaScript 代码助手。请根据用户给出的代码片段，补全接下来的一小段代码（不要返回整段代码，只返回要补全的部分）。',
        },
        { role: 'user', content: code },
      ],
      max_tokens: 50,
      temperature: 0.2,
    }),
  })

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

</script>