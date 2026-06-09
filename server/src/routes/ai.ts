import express from 'express'
import type { Request, Response } from 'express'
import { extractJson } from '../utils/extractJson.js'

const router = express.Router()

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

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function callAi(messages: ChatMessage[]) {
  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MOONSHOT_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AI 请求失败：${response.status} ${text}`)
  }

  const data = await response.json()

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

export default router