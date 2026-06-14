export type AiTool = {
  type:string
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
  reactCode?: string
  image?: string
}