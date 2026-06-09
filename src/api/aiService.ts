const BASE = '/backend/api'

export type CodeFiles = {
  html: string
  css: string
  javascript: string
}

export const aiService = {
  getFixCode: (payload: {
    eMessage: string[],
    files: CodeFiles
    target?: 'html' | 'css' | 'javascript' | 'all'
    selectedCode?: string
  }) => fetch(`${BASE}/ai/fix-error`, {
    method:'POST',
    headers: { 'Content-Type': 'application/json' },
    body:JSON.stringify(payload)
  }).then(r => r.json()),
  getAiExplain: (code: any, language:'html' | 'css' | 'javascript', question?:string) => fetch(`${BASE}/ai/explain`, {
    method:'POST',
    headers: { 'Content-Type': 'application/json' },
    body:JSON.stringify({code, language, question})
  }).then(r => r.json()),
  getAiComponents:(prompt: any, currentFiles: any, framework?: any, style?: any) => fetch(`${BASE}/generate`, {
    method:'POST',
    headers: { 'Content-Type': 'application/json' },
    body:JSON.stringify({prompt, currentFiles, framework, style})
  }).then(r => r.json())
}