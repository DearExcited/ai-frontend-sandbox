import { ref, onUnmounted } from "vue";
import { defineStore } from "pinia";
import { languages } from 'monaco-editor'
import * as monaco from 'monaco-editor'
import { debounceAsync } from "../utils/debounce";
import { aiService } from '../api/aiService'
import { useDiffStore } from "./useDiffStore";
import { useCodeStore } from "./useCodeStore";
import { ElMessage } from "element-plus";
export const useAiStore = defineStore('useAiStore', () => {
  // 消息类型，定义每一个发送或者接收到的消息
  type ChatMsg = { role: "system" | "user" | "assistant"; content: string }

  const codeStore = useCodeStore()
  // ai助手内联补全开启状态
  const isEnabled     = ref(false)
  // 加载状态
  const isLoading     = ref(false)
  // agent模式下的历史记录
  const agentHistory       = ref<ChatMsg[]>([])
  // 历史记录条数控制
  const MAX_TURNS = 10;
  // ai消息
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
  // 用户文本框中的消息
  const aiInput       = ref('')
  // ai模式状态控制
  const aiEditOpen    = ref(false)
  const aiAgentOpen   = ref(false)
  // 内联补全mocnoc需要的结果
  const lastSession   = ref<languages.InlineCompletions<languages.InlineCompletion> | null>(null)
  // 保存内联补全提供器变量,方便卸载
  const provider      = ref<monaco.IDisposable | null>(null)
  // 防抖与节流
  const debounceTimers = ref(new Map<string, ReturnType<typeof setTimeout>>())
  const throttleFlags  = ref(new Map<string, boolean>())
  // 防抖
  const getAICompletionDebounced = debounceAsync(getAICompletion, 500)

  // console 一键修复的待确认状态
  const pendingFix = ref<{
    html: string
    css: string
    javascript: string
  } | null>(null)
  // 'confirm' 触发 replaceCode，'revert' 触发 restoreOriginalCode，null 表示无操作
  const fixAction = ref<'confirm' | 'revert' | null>(null)

  // ai交互开关
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

  // ai消息构筑函数
  function buildAgentMsg(codeContext: string, userText: string):ChatMsg[] {
    // 初始提示词
    const systemPrompt: ChatMsg = {
      role: "system",
      content:"你是一名 JavaScript 代码助手。请结合对话上下文与当前代码，给出精简可执行的建议。",
    }

    const contextMsg: ChatMsg = {
      role:"system",
      content:`当前代码上下文如下（仅供参考，不要原样复述）：\n\`\`\`\n${codeContext}\n\`\`\``,
    }

    // 历史消息队列,发送给ai方便分析
    const recent = agentHistory.value.splice(-MAX_TURNS * 2)

    return [
      systemPrompt,
      contextMsg,
      ...recent,
      { role: "user", content: userText },
    ]
  }

  // 发送消息异步函数
  async function sendAgentMsg(codeContext: string) {
    // 文本框中消息检查
    if (!aiInput.value.trim()) return;

    // 消息清除末尾空格
    const userText = aiInput.value.trim();
    // 加入消息队列
    aiAgentMessages.value.push(`User: ${userText}`);
    // 聊天框的滚动条交互
    const aiContent = document.querySelector('.talk-content');
    if (aiContent) aiContent.scrollTop = aiContent.scrollHeight;

    // 发送后
    aiInput.value = '';
    isLoading.value = true;

    // SSM打字机效果
    // 先插入占位消息，后续不断改它，每次更新的都是同一条消息，而不是push新消息
    const aiIndex = aiAgentMessages.value.length;
    aiAgentMessages.value.push(`AI助手: `);

    // 用 rAF 做一下节流，token 很碎时不会卡
    let pending = "";       //暂存区，用来存储还没有渲染到页面上的token
    let raf = 0;
    let aiAgentText = "";       //已经渲染到页面上的token
    // 负责更新页面的函数
    const flush = () => {
      aiAgentMessages.value[aiIndex] = `AI助手: ${aiAgentText}`;    //更新消息列表
      if (aiContent) aiContent.scrollTop = aiContent.scrollHeight;    //滚动条滚动
      raf = 0;        //表示这一帧更新结束
    };

    try {
      // 终止上一次
      agentAbort.value?.abort();
      agentAbort.value = new AbortController();

      const messages = buildAgentMsg(codeContext, userText);

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
            stream: true,       //流式
            messages,
            max_tokens: 200,
            temperature: 0.7,
          }),
        },
        (token) => {
          // 打字机：token 到就追加
          pending += token;
          if (!raf) {
            // 让浏览器在下一帧统一更新一次
            raf = requestAnimationFrame(() => {
              aiAgentText += pending;
              pending = "";
              flush();
            });
          }
        }
      );

      // ai历史消息队列
      agentHistory.value.push({ role: "user", content: userText });
      agentHistory.value.push({ role: "assistant", content: aiAgentText });

      // 定量清理历史消息
      if (agentHistory.value.length > MAX_TURNS * 2) {
        agentHistory.value = agentHistory.value.slice(-MAX_TURNS * 2);
      }

    } catch (error: any) {  //错误处理
      if (error?.name === "AbortError") {
        aiAgentMessages.value[aiIndex] = `AI助手: （已停止生成）${aiAgentText}`;
      } else {
        console.error("发送消息失败:", error);
        aiAgentMessages.value[aiIndex] = "AI助手: 抱歉，处理您的请求时出现了问题。";
      }
    } finally {         //状态管理
      isLoading.value = false;
    }
  }

  // 编辑模式消息处理
  async function sendEditMsg(codeContext: string, editor: monaco.editor.IStandaloneCodeEditor) {
    // 变量检查
    if (!codeContext) return

    // diff引用
    const diffStore = useDiffStore()

    // 放入消息队列
    aiEditMessages.value.push(`User: ${aiInput.value}`)
    // 滚动条交互
    const aiContent = document.querySelector('.talk-content')
    if (aiContent) aiContent.scrollTop = aiContent.scrollHeight

    // 输入框与状态管理
    const msg = aiInput.value
    aiInput.value = ''
    isLoading.value = true

    try {
      // 请求ai分析后的代码回复
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
    // 启用编辑器实例的行内建议
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
    // 为编辑器的js语言注册一个mocnoc的行内补全提供器,用变量存储方便卸载
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

              // 定位补全代码的位置
              const item = {
                insertText: suggestion,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                )
              };

              // 将结果变成mocnoc可以理解的格式
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

        // 释放上一次的补全结果
        freeInlineCompletions: (_completions) => {
          lastSession.value = null;
        }
      });
  }

    // tab导入异步函数
  async function getAICompletion(code: string): Promise<string> {
      try {
        // 调用api接收ai消息
        const response = await fetch('/api/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_MOONSHOT_API_KEY}`,
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

        // 解析响应体的异步方法
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
    // 发送请求并检查响应体
    const resp = await fetch(url, fetchInit);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (!resp.body) throw new Error("No response body (stream unsupported)");

    // 读取器
    const reader = resp.body.getReader();
    // 解析器，解析读取器读出的二进制数据
    const decoder = new TextDecoder("utf-8");

    // 暂存区，每一次读取器读取的不都是一条完整的消息，所以有时候需要缓存，等得到完整消息后再解析
    let buffer = "";
    // 判断消息流是否结束
    let done = false;

    // 用循环读取消息流，done控制循环的结束
    while (!done) {
      // 读取器读取，异步函数等待下一条数据的到来
      const { value, done: readerDone } = await reader.read();
      // 消息流结束就跳过循环
      if (readerDone) break;

      // 将解析出的消息放入暂存区
      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以 \n\n 分隔，这是SSE事件的风格决定的
      const parts = buffer.split("\n\n");
      // 最后一段消息可能是不完整的，所以把最后一条重新放入缓存区
      buffer = parts.pop() ?? "";

      //处理每一个SSE事件
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
            // 把json换成对象
            const json = JSON.parse(dataStr);
            // 提取真正的文本
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

  // Edit模式的ai函数,逻辑与agent模式基本一致
  async function getAICode(userQuestion: string, codeContext: string): Promise<string> {
    try {
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_MOONSHOT_API_KEY}`,
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

// 修复错误
async function fixByAi (eMessage: string[]){
  try{
    isLoading.value = true
    const res = await aiService.getFixCode({
      eMessage,
      files: {
        html: codeStore.htmlCode,
        css: codeStore.cssCode,
        javascript: codeStore.jsCode,
      },
      target: 'all',
  })

  if (res.code !== 0) {
      ElMessage.error(res.message || '修复失败')
      return
  }
  const fixedFiles = res.data.fixedFiles
  pendingFix.value = {
    html: fixedFiles.html,
    css: fixedFiles.css,
    javascript: fixedFiles.javascript,
  }

  }catch(error: any){
    ElMessage.error(error.message || 'AI 修复失败')
  }finally {
    isLoading.value = false
  }
}


   onUnmounted(() => {
    disableAIAssistant()
  })

   return {
    isEnabled,
    isLoading,
    agentHistory,
    MAX_TURNS,
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
    buildAgentMsg,
    pendingFix,
    fixAction,
    fixByAi,
  }
})