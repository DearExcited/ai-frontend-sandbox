import type { AiTool } from './type.js'

export const AI_TOOLS: AiTool[] =[
  {
    type: 'function',
    function:{
      name:'fix_error',
      description:
        '根据报错信息和当前工作区代码修复前端错误。适合处理控制台报错、运行时报错、语法错误、变量未定义、事件不生效、样式异常等问题。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['eMessage'],
        properties:{
          eMessage: {
            type: 'string',
            description:
              '错误信息、控制台报错、构建报错或用户描述的问题。比如：Cannot read properties of undefined、按钮点击无反应。',
          },
          target: {
            type: 'string',
            enum: ['all', 'html', 'css', 'javascript'],
            description:
              '修复目标。all 表示可以修改所有文件；html/css/javascript 表示优先修复指定文件。默认 all。',
          },
          selectedCode: {
            type: 'string',
            description:
              '用户当前选中的代码片段。没有选中代码时可以为空。',
          },
        }
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_component',
      description:
        '根据用户描述生成或修改 React 组件代码。适合生成搜索栏、按钮、表单、弹窗、下拉框等 React 小组件。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            description:
              '用户希望生成或修改的组件需求。比如：生成一个搜索栏、生成一个下拉选择器、给按钮添加 loading 状态。',
          },
          selectedCode: {
            type: 'string',
            description:
              '用户当前选中的 React 代码片段。没有选中代码时可以为空。',
          },
          style: {
            type: 'string',
            description:
              '用户希望的组件风格。比如：简约、科技风、暗色主题、移动端适配等。',
          },
          target: {
            type: 'string',
            enum: ['all', 'component', 'style', 'logic'],
            description:
              '主要修改目标。all 表示自动判断；component 表示 JSX 结构；style 表示样式；logic 表示交互逻辑。',
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_to_code",
      description: "根据用户上传的页面截图与描述，生成对应的 HTML、CSS 和 JavaScript 代码。当用户上传图片并要求还原页面、参考设计稿、截图转代码时调用。",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description: "用户的需求描述，例如：还原这个页面 / 参考这个设计稿生成组件 / 分析UI布局"
          },
          image: {
            type: "string",
            description: "用户上传的页面截图，base64 格式的 data URL 或图片链接"
          }
        },
        required: ["instruction"]
      }
    }
  }
]