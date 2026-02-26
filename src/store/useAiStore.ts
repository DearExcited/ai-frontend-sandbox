import { ref, onUnmounted } from "vue";

import { defineStore } from "pinia";
import { languages } from 'monaco-editor'
import * as monaco from 'monaco-editor'
import { debounceAsync } from "../utils/debounce";
import { useDiffStore } from "./useDiffStore";

export const useAiStore = defineStore('useAiStore', () => {
  const isEnabled     = ref(false)
  const isLoading     = ref(false)
  const aiAgentMessages    = ref<string[]>([
    'AI助手已启用！',
    '我可以帮助您编写更好的JavaScript代码。',
    '请尝试问我关于代码的问题，或让我帮您优化代码。',
  ])
  const aiEditMessages = ref<string[]>([
    'AI助手已起用！',
    '我可以帮您优化光标选中的代码。',
    '请尝试提出要求让我帮您修改'
  ])
  const aiInput       = ref('')
  const aiEditOpen    = ref(false)
  const aiAgentOpen   = ref(false)
  const lastSession   = ref<languages.InlineCompletions<languages.InlineCompletion> | null>(null)
  const provider      = ref<monaco.IDisposable | null>(null)
  const debounceTimers = ref(new Map<string, ReturnType<typeof setTimeout>>())
  const throttleFlags  = ref(new Map<string, boolean>())
  // 防抖
  const getAICompletionDebounced = debounceAsync(getAICompletion, 500)

  function openEdit() {
    closeAgent()
    aiEditOpen.value = true
  }

  function closeEdit() {
    aiEditOpen.value = false
  }

  function openAgent() {
    closeEdit()
    aiAgentOpen.value = true
  }

  function closeAgent() {
    aiAgentOpen.value = false
  }

  const agentAbort = ref<AbortController | null>(null);

  async function sendAgentMsg(codeContext: string) {
    if (!aiInput.value.trim()) return;

    aiAgentMessages.value.push(`User: ${aiInput.value}`);
    const aiContent = document.querySelector('.talk-content');
    if (aiContent) aiContent.scrollTop = aiContent.scrollHeight;

    const msg = aiInput.value;
    aiInput.value = '';
    isLoading.value = true;

    // 先插入占位消息，后续不断改它
    const aiIndex = aiAgentMessages.value.length;
    aiAgentMessages.value.push(`AI助手: `);

    // 用 rAF 做一下节流，token 很碎时不会卡
    let pending = "";
    let raf = 0;
    const flush = () => {
      aiAgentMessages.value[aiIndex] = `AI助手: ${aiAgentText}`;
      if (aiContent) aiContent.scrollTop = aiContent.scrollHeight;
      raf = 0;
    };
    let aiAgentText = "";

    try {
      // 终止上一次
      agentAbort.value?.abort();
      agentAbort.value = new AbortController();

      await fetchSSEStream(
        "/api/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer sk-IT2HedPEUDo4yfBTYEH0dhZ3SlPYeZoMM5QKeKFiTmyaslRP",
          },
          signal: agentAbort.value.signal,
          body: JSON.stringify({
            model: "moonshot-v1-8k",
            stream: true,
            messages: [
              {
                role: "system",
                content:
                  "你是一名 JavaScript 代码助手。请根据用户给出的代码片段和问题，给用户一些精简的建议。",
              },
              {
                role: "user",
                content: `这是我的代码：\n\`\`\`\n${codeContext}\n\`\`\`\n我的问题是：${msg}`,
              },
            ],
            max_tokens: 200,
            temperature: 0.7,
          }),
        },
        (token) => {
          // 打字机：token 到就追加
          pending += token;
          if (!raf) {
            raf = requestAnimationFrame(() => {
              aiAgentText += pending;
              pending = "";
              flush();
            });
          }
        }
      );
    } catch (error: any) {
      if (error?.name === "AbortError") {
        aiAgentMessages.value[aiIndex] = `AI助手: （已停止生成）${aiAgentText}`;
      } else {
        console.error("发送消息失败:", error);
        aiAgentMessages.value[aiIndex] = "AI助手: 抱歉，处理您的请求时出现了问题。";
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function sendEditMsg(codeContext: string, editor: monaco.editor.IStandaloneCodeEditor) {
    if (!codeContext) return

    const diffStore = useDiffStore()

    aiEditMessages.value.push(`User: ${aiInput.value}`)
    const aiContent = document.querySelector('.talk-content')
    if (aiContent) aiContent.scrollTop = aiContent.scrollHeight

    const msg = aiInput.value
    aiInput.value = ''
    isLoading.value = true

    try {
      const aiResponse = await getAICode(msg, codeContext)
      
      // diff显示
      diffStore.saveOriginalCode(codeContext)
      diffStore.modifiedCode = aiResponse
      diffStore.processDiff(editor, codeContext, aiResponse)

      aiEditMessages.value.push(`AI助手: 已生成优化后的代码`)
      if (aiContent) aiContent.scrollTop = aiContent.scrollHeight
    } catch (error) {
      console.error('发送消息失败:', error)
      aiAgentMessages.value.push('AI助手: 抱歉，处理您的请求时出现了问题。')
    } finally {
      isLoading.value = false
    }
  }

    // 启动ai功能
  function enableAIAssistant(editor: monaco.editor.IStandaloneCodeEditor) {
    // 如果提供器中有东西，先将其卸载
    if (provider) {
      disableAIAssistant();
    }

    // 状态管理
    isEnabled.value = true;
    registerAIProvider(editor);
    editor.updateOptions({ inlineSuggest: { enabled: true } });
    console.log('ai启动了')
  }

    // 禁用AI功能
  function disableAIAssistant() {
      if (provider.value) {
        // 卸载并还原
        provider.value?.dispose();
        provider.value = null;
      }

      // 状态管理
      isEnabled.value = false;
      lastSession.value = null;
      console.log('ai禁用了')
  }

    // 注册内联补全提供者
  function registerAIProvider(_editor: monaco.editor.IStandaloneCodeEditor) {
      provider.value = languages.registerInlineCompletionsProvider('javascript', {
        provideInlineCompletions: (model, position, _context, _token) => {
          if (lastSession.value) {
            lastSession.value = null;
          }

          // 获取内容
          const code = model.getValue();

          // 返回一个Promise，用于异步获取AI补全
          return new Promise(async (resolve) => {
            try {

              // 状态管理
              isLoading.value = true;

              // 获取ai补全
              const suggestion = await getAICompletionDebounced(code)
              isLoading.value = false;
              
              // 没有建议返回空
              if (!suggestion) {
                resolve({ items: [] });
                return;
              }

              const item = {
                insertText: suggestion,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                )
              };

              const result = { items: [item] };
              lastSession.value = result as any;
              resolve(result);
            } catch (e) {
              console.error(e);
              isLoading.value = false;
              resolve({ items: [] });
            }
          });
        },

        freeInlineCompletions: (_completions) => {
          lastSession.value = null;
        }
      });
  }

    // tab导入异步函数
  async function getAICompletion(code: string): Promise<string> {
      try {
        const response = await fetch('/api/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-IT2HedPEUDo4yfBTYEH0dhZ3SlPYeZoMM5QKeKFiTmyaslRP',
          },
          body: JSON.stringify({
            model: 'moonshot-v1-8k',
            messages: [
              {
                role: 'system',
                content: '你是一名 JavaScript 代码助手。请根据用户给出的代码片段，补全接下来的一小段代码（不要返回整段代码，只返回要补全的部分）。',
              },
              { role: 'user', content: code },
            ],
            max_tokens: 50,
            temperature: 0.2,
          }),
        });

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
      } catch (error) {
        console.error('AI请求失败:', error);
        return '';
      }
  }

  function extractDeltaText(payload: any): string {
    const choice = payload?.choices?.[0];
    // OpenAI-like stream: { choices:[{ delta:{ content:"..." } }] }
    const delta = choice?.delta?.content;
    if (typeof delta === "string") return delta;

    // 有些兼容实现可能会走 message/content
    const msg = choice?.message?.content;
    if (typeof msg === "string") return msg;

    // 也可能是 { choices:[{ text:"..." }] }
    const text = choice?.text;
    if (typeof text === "string") return text;

    return "";
  }

  /**
   * 读取 OpenAI 风格 SSE：
   * data: {...}\n\n
   * data: [DONE]\n\n
   */
  async function fetchSSEStream(
    url: string,
    fetchInit: RequestInit,
    onToken: (t: string) => void,
  ) {
    const resp = await fetch(url, fetchInit);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (!resp.body) throw new Error("No response body (stream unsupported)");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以 \n\n 分隔
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        // 可能有多行：event: ... / id: ... / data: ...
        const lines = part.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;

          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;

          if (dataStr === "[DONE]") {
            done = true;
            break;
          }

          try {
            const json = JSON.parse(dataStr);
            const t = extractDeltaText(json);
            if (t) onToken(t);
          } catch {
            // 有些实现 data: 直接推文本
            onToken(dataStr);
          }
        }
        if (done) break;
      }
    }
  }

  async function getAICode(userQuestion: string, codeContext: string): Promise<string> {
    try {
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-IT2HedPEUDo4yfBTYEH0dhZ3SlPYeZoMM5QKeKFiTmyaslRP',
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [
            {
              role: 'system',
              content: '你是一名 JavaScript 代码助手。请根据用户给出的代码片段和问题，完成用户的要求，并只返回代码，注意必须只返回代码字符串，不要包含任何代码块标记（如 ```javascript）',
            },
            { 
              role: 'user', 
              content: `这是我的代码：\n\`\`\`\n${codeContext}\n\`\`\`\n我的需求是：${userQuestion}` 
            },
          ],
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      let code = data.choices?.[0]?.message?.content?.trim() || '';
      
      // 清理和标准化返回的代码
      code = cleanAICode(code);
      
      console.log(code);
      return code;
    } catch (error) {
      console.error('AI对话请求失败:', error);
      return '抱歉，AI助手暂时无法响应，请稍后再试。';
    }
}

// 清理 AI 返回的代码
function cleanAICode(aiCode: string): string {
  if (!aiCode) return '';
  
  let cleanedCode = aiCode;
  
  // 1. 移除代码块标记
  cleanedCode = cleanedCode
    .replace(/^```\w*\n/, '')  // 移除开头的 ```javascript 等
    .replace(/\n```$/, '');    // 移除结尾的 ```
  
  // 2. 移除可能的多余说明文字
  const codeMatch = cleanedCode.match(/^(.*?)(?=这里是|以下|代码实现|function|const|let|var|class)/s);
  if (codeMatch && codeMatch[1]) {
    cleanedCode = codeMatch[1].trim();
  }
  
  // 3. 确保代码以合理的结构结束
  if (!cleanedCode.endsWith('}') && !cleanedCode.endsWith(';')) {
    // 如果代码没有合理的结束符，尝试找到最后一个完整语句
    const lines = cleanedCode.split('\n');
    let lastValidLine = lines.length - 1;
    
    // 向后查找，找到第一个包含有效代码的行
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && !line.startsWith('//') && !line.startsWith('/*')) {
        lastValidLine = i;
        break;
      }
    }
    
    cleanedCode = lines.slice(0, lastValidLine + 1).join('\n');
  }
  
  return cleanedCode.trim();
}

   onUnmounted(() => {
    disableAIAssistant()
  })

   return {
    isEnabled,
    isLoading,
    aiAgentMessages,
    aiEditMessages,
    aiInput,
    aiAgentOpen,
    aiEditOpen,
    lastSession,
    provider,
    debounceTimers,
    throttleFlags,
    openEdit,
    closeEdit,
    openAgent,
    closeAgent,
    sendAgentMsg,
    sendEditMsg,
    enableAIAssistant,
    disableAIAssistant,
  }
})