import { callAi } from '../routes/ai.js'
import { extractJson } from '../utils/extractJson.js'
import type { AgentContext } from './type.js'

export async function runFixErrorTool(args: any, context: AgentContext){
  const {
    eMessage,
    target = 'all',
    selectedCode,
  } = args

  if (!eMessage) {
    throw new Error('fix_error 缺少 eMessage')
  }

  const files = context.currentFiles

  if (!files) {
    throw new Error('fix_error 缺少 currentFiles')
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
        3. 不要输出 JSON 以外的内容。
              `.trim(),
            },
            {
              role: 'user',
              content: `
        报错信息：
        ${eMessage}

        修复目标：
        ${target}

        用户选中的代码：
        ${selectedCode || context.selectedCode || '无'}

        当前代码：

        HTML:
        ${files.html || ''}

        CSS:
        ${files.css || ''}

        JavaScript:
        ${files.javascript || ''}
              `.trim(),
            },
          ])

  return extractJson(aiText)
}

export async function runGenerateComponent(
    args: any,
    context: AgentContext,
  ) {
    const {
      prompt,
      selectedCode,
      style = '',
      target = 'all',
    } = args

    if (!prompt) {
      throw new Error('generate_component 缺少 prompt ---- 用户描述不能为空')
    }

    const reactCode = context.reactCode || ''

    const aiText = await callAi([
      {
        role: 'system',
        content: `
  你是一名 React 组件生成助手。
  用户会提供当前 React 代码和需求信息。
  你需要在当前 React 代码基础上生成或修改组件。

  你必须只返回 JSON，不要返回 Markdown，不要返回代码块。

  返回格式必须是：
  {
    "reactCode": "完整的 React 代码",
    "explanation": "简短介绍你生成或修改了什么"
  }

  要求：
  1. 不要省略任何字段。
  2. 不要输出 JSON 以外的内容。
  3. reactCode 必须是完整 React 代码，不要只返回片段。
  4. 如果当前 React 代码为空，请从零生成完整可运行的 React 组件。
  5. 如果当前 React 代码不为空，并且用户要求修改，请基于当前代码修改。

         【重要】沙箱运行环境限制，生成的 React 代码必须遵守：
        - 禁止使用 import / export 语句，React 已通过 UMD CDN 注入为全局变量
        - 可直接使用 React、ReactDOM 以及已解构的 hooks：useState、useEffect、useRef、useCallback、useMemo
        - 组件必须定义为 const App = () => { ... }，渲染入口固定为 App
        - 可以在 App 内部定义子组件，或在 App 之前定义后在 App 中使用

        `.trim(),
      },
      {
        role: 'user',
        content: `
  用户需求：
  ${prompt}

  用户期望风格：
  ${style || '无特殊要求'}

  修改目标：
  ${target}

  用户选中的代码：
  ${selectedCode || context.selectedCode || '无'}

  当前 React 代码：
  ${reactCode || '无。请从零生成一个完整可运行的 React 组件。'}
        `.trim(),
      },
    ])

  return extractJson(aiText)
}

export async function runImageToCode(args:any, context: AgentContext) {
  const { instruction } = args
  // 图片优先从 context 取（前端直接传），args.image 作为备选
  const image = context.image || args.image

  if (!image) {
    throw new Error('image_to_code 缺少图片')
  }

  const res = await fetch("https://api.moonshot.cn/v1/chat/completions",{
    method:'POST',
    headers: {
      "Authorization": `Bearer ${process.env.MOONSHOT_API_KEY}`,
      "Content-Type": "application/json"
    },
    body:JSON.stringify({
      model: "moonshot-v1-32k-vision-preview",
      messages:[
        {
          role: "system",
          content: `
            你是前端专家。
            用户会提供图片与描述，请你根据用户描述与图片内容尽可能还原页面。
            你必须只返回 JSON，不要返回 Markdown，不要返回代码块。

            返回格式必须是：
            {
              "files": {
                "html": "html代码",
                "css": "css代码",
                "javascript": "js代码"
              },
              "explanation": "简短介绍你生成的页面"
            }

            要求：
            - 语义化 HTML
            - 尽量还原布局
            - 使用现代 CSS
            - 不要解释，只输出 JSON
          `.trim()
        },
         {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: image
              }
            },
            {
              type: "text",
              text: instruction || "还原这个页面"
            }
          ]
        }
      ],
      temperature: 0.2
    })
  })

  const data = await res.json()

  console.log(data)

  const content =
  data.choices?.[0]?.message?.content || ""

  console.log(content)

  return extractJson(content)
}