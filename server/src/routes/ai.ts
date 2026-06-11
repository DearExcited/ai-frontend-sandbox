import express from 'express'
import type { Request, Response } from 'express'
import { extractJson } from '../utils/extractJson.js'
import { AI_TOOLS } from '../ai/toolSchemas.js'
import { runFixErrorTool, runGenerateComponent, runImageToCode } from '../ai/toolExecutors.js'
import type { AgentContext } from '../ai/type.js'
const router = express.Router()

// ai
type ToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// ai消息类型
type AiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name: string }

// ai工具类型
type AiTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: any
  }
}

const success = (res: Response, data: any, message = 'success') => {
  res.json({
    code: 0,
    message,
    data,
  })
}

const fail = (res: Response, error: any, message = '请求失败') => {
  res.status(500).json({
    code: 1,
    message: error?.message || message,
    data: null,
  })
}

// 小的流式响应，调用一次，写入一次，不会像.json一样自动结束
function sendSSE(res: Response, event: string, data: any) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callAiRaw(
    messages: AiMessage[],
    options: {
      tools?: AiTool[]
      tool_choice?: 'auto' | 'none'
      temperature?: number
      max_tokens?: number
      stream?: boolean
    } = {},
) {
  // ai请求体
  const body: any = {
    model: 'deepseek-chat',
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 2000,
  }

  // 用到Function calling 添加必要参数
  if (options.tools) {
    body.tools = options.tools
  }

  if (options.tool_choice) {
    body.tool_choice = options.tool_choice
  }

  if (options.stream) {
    body.stream = true
  }

  const response = await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if(!response.ok){
    const text = await response.text()
    throw new Error(`AI 请求失败：${response.status} ${text}`)
  }

  return response.json()
}

export async function callAi(messages: ChatMessage[]) {
  const data = await callAiRaw(messages as AiMessage[], {
    temperature: 0.3,
    max_tokens: 2000,
  })

  return data.choices?.[0]?.message?.content?.trim() || ''
}

/** 
 * /api/ai/fix-error
 * 接收报错信息 + 代码，返回修复后的代码
 */
router.post('/fix-error', async (req:Request, res:Response) => {
  try{
    const {eMessage, files, target = 'all', selectedCode} = req.body

    if(!eMessage) {
      return res.status(400).json({
        code: 1,
        message: 'errorMessage 不能为空',
        data: null,
      })
    }

    if(!files){
      return res.status(400).json({
        code: 1,
        message: '工作区代码 不能为空',
        data: null,
      })
    }

    const aiText = await callAi([
       {
        role: 'system',
        content: `
          你是一名前端代码修复助手。
          用户会提供 HTML、CSS、JavaScript 代码和报错信息。
          你需要修复代码，并且只返回 JSON，不要返回 Markdown，不要返回代码块。

          返回格式必须是：
          {
            "fixedFiles": {
              "html": "修复后的 html",
              "css": "修复后的 css",
              "javascript": "修复后的 javascript"
            },
            "explanation": "简短说明错误原因和修复方式",
            "changedFiles": ["html" | "css" | "javascript"]
          }

          要求：
          1. 如果某个文件不需要修改，原样返回。
          2. 不要省略任何字段。
          3. 不要输出 JSON 以外的内容。`.trim(),
      },
      {
        role: 'user',
        content:`报错信息：
          ${eMessage}

          修复目标：
          ${target}

          用户选中的代码：
          ${selectedCode || '无'}

          当前代码：
          HTML:
          ${files.html || ''}

          CSS:
          ${files.css || ''}

          JavaScript:
          ${files.javascript || ''}
        `.trim(),
      }
    ])

    const result = extractJson(aiText)
    success(res, result, '修复成功')
  }catch(error:any){
    fail(res, error, '修复失败')
  }
})

router.post('/explain', async (req:Request, res:Response) => {
  try{
    const {code, language, question} = req.body

    if(!code) {
      return res.status(500).json({
        code:1,
        message:'收到代码为空',
        data: null
      })
    }

    const aiExplain = await callAi([{
        role: 'system',
        content: `
          你是一名前端代码讲解助手。
          请用中文解释代码，要求清晰、简洁、适合初中级前端开发者理解。
          不要改写代码，除非用户要求。
                  `.trim(),
                },
                {
                  role: 'user',
                  content: `
          语言：${language}

          用户问题：
          ${question || '请解释这段代码的作用'}

          代码：
          ${code}`.trim(),
    }]) 

    success(res, { aiExplain }, '解释成功')
  }catch(error: any){
    fail(res, error, '解释失败')
  }
})

router.post('/generate',async (req:Request, res:Response) => {
  try{
    const {
      prompt,
      currentFiles,
      framework = 'native',
      style = '',
    } = req.body

    if(!prompt){
      return res.status(400).json({
        code:1,
        message:'描述 不可为空',
        data:null,
      })
    }
    if(!currentFiles){
      return res.status(400).json({
        code:1,
        message:'当前代码 不可为空',
        data:null,
      })
    }

    const aiComponent = await callAi([
      {
        role: 'system',
        content: `
        你是一名前端组件代码生成助手。
        用户会描述需求，你需要生成可运行的前端代码。
        只返回 JSON，不要返回 Markdown，不要返回代码块。

        返回格式必须是：
        {
          "files": {
            "html": "完整 HTML",
            "css": "完整 CSS",
            "javascript": "完整 JavaScript"
          },
          "explanation": "简短说明生成了什么"
        }

        要求：
        1. 如果 framework 是 native，生成原生 HTML/CSS/JavaScript。
        2. 如果 framework 是 vue3，尽量生成适合 Vue3 思路的结构，但仍然拆成 html/css/javascript 三个字段。
        3. 代码要完整，可以直接放入编辑器运行。
        4. 不要输出 JSON 以外的内容。
                `.trim(),
              },
              {
                role: 'user',
                content: `
        需求：
        ${prompt}

        框架：
        ${framework}

        风格要求：
        ${style || '无'}

        当前已有代码：
        HTML:
        ${currentFiles?.html || ''}

        CSS:
        ${currentFiles?.css || ''}

        JavaScript:
        ${currentFiles?.javascript || ''}`.trim(),
      },
    ])
    const result = extractJson(aiComponent)

    success(res, result, '生成成功')
  }catch(error: any){
    fail(res, error, '生成失败')
  }
})

async function runToolByName(
  toolName: string,
  args: any,
  context: AgentContext,
) {
  switch (toolName) {
    case 'fix_error':
      return runFixErrorTool(args, context)

    case 'generate_component':
      return runGenerateComponent(args, context)

    case 'image_to_code' :
      return runImageToCode(args, context)
      
    default:
      throw new Error(`未知工具：${toolName}`)
  }
}

router.post('/agent', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  try{
    const {
      userText,
      image,
      currentFiles,
      selectedCode,
      reactCode,
      consoleLogs = [],
      history = [],
    } = req.body

     if (!userText) {
      sendSSE(res, 'error', { message: 'userText 不能为空' })
      return res.end()
    }

    if (!currentFiles) {
      sendSSE(res, 'error', { message: 'currentFiles 不能为空' })
      return res.end()
    }

    sendSSE(res, 'stage', {
      text: '正在分析是否需要调用工具...',
    })

    // 用户消息：有图片时构造 multimodal content
    const userMessage: AiMessage = image
      ? {
          role: 'user',
          content: [
            { type: 'text', text: '[图片]' },
            { type: 'text', text: userText },
          ] as any,
        }
      : { role: 'user', content: userText }

     const messages: AiMessage[] = [
      {
        role: 'system',
        content: `
        你是一个前端 Agent 助手。
        你可以根据用户需求决定是否调用工具。

        规则：
        1. 如果用户要求生成、修改、添加 React 组件，优先调用 generate_component。
        2. 如果用户提供报错、运行异常、按钮无反应、控制台错误，优先调用 fix_error。
        3. 如果用户只是问代码含义，可以直接回答，不一定调用工具。
        4. 如果当前项目是 React 代码环境，生成组件时应返回完整可运行的 React 代码。
        5. 如果用户上传了图片并要求还原页面或参考设计稿，调用 image_to_code。

        如果只是普通问题，可以直接回答。

        ${consoleLogs.length > 0
          ? `【当前控制台错误信息】\n${consoleLogs.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}`
          : '【当前控制台无错误】'
        }
                `.trim(),
              },
        ...history,
        userMessage,
      ]

      const firstData = await callAiRaw(messages, {
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 1200,
      })

      const assistantMessage = firstData.choices?.[0]?.message
      const toolCalls = assistantMessage?.tool_calls || []

      if (!toolCalls.length) {
        sendSSE(res, 'final', {
          content: assistantMessage?.content || '我没有调用工具，直接完成回答。',
        })

      sendSSE(res, 'done', {})
        return res.end()
      }

      messages.push({
        role: 'assistant',
        content: assistantMessage?.content || '',
        tool_calls: toolCalls,
      })

      // 对于每个用到的工具
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name
        const args = JSON.parse(toolCall.function.arguments || '{}')

        sendSSE(res, 'tool_call', {
          id: toolCall.id,
          name: toolName,
          arguments: args,
        })

        const start = Date.now()

        const context: AgentContext = {
          currentFiles,
          reactCode,
          selectedCode,
          image,
        }

        const result = await runToolByName(toolName, args, context)

        const elapsedMs = Date.now() - start

        sendSSE(res, 'tool_result', {
          id: toolCall.id,
          name: toolName,
          result,
          elapsedMs,
        })

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(result),
        })
      }

      // 所有工具执行完后，统一生成最终回复
      sendSSE(res, 'stage', { text: '工具执行完成，正在生成最终回复...' })

      // image_to_code 结果不需要 DeepSeek 二次总结，直接告知用户
      const hasImageToCode = toolCalls.some((t: ToolCall) => t.function.name === 'image_to_code')

      if (hasImageToCode) {
        sendSSE(res, 'final', { content: '已根据图片生成代码，请确认是否应用。' })
      } else {
        const secondData = await callAiRaw(messages, {
          temperature: 0.3,
          max_tokens: 800,
        })
        const finalText =
          secondData.choices?.[0]?.message?.content ||
          '已完成，结果已进入 Diff 确认流程。'
        sendSSE(res, 'final', { content: finalText })
      }
      sendSSE(res, 'done', {})
      res.end()

  }catch(error: any){
    sendSSE(res, 'error', {
      message: error?.message || 'Agent 执行失败',
    })

    res.end()
  }
})

export default router