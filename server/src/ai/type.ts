export type AiTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: any
  }
}

export type FrontendFiles = {
  html: string
  css: string
  javascript: string
}


export type AgentContext = {
  currentFiles?: FrontendFiles
  selectedCode?: string
  reactCode?:string
}