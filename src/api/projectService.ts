const BASE = '/backend/api'

export const projectService ={
  getAll: () => fetch(`${BASE}/projects`).then(r => r.json()),
  getProject :(id: string) => fetch(`${BASE}/projects/${id}`).then(r => r.json()),
  create: (name:string) => fetch(`${BASE}/projects`,{
    method:'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, files: { html: '', css: '', javascript: '', typescript: '' } })
  }).then(r => r.json()),
  update: (id: string, files: object, name?:string) => fetch(`${BASE}/projects/${id}`, {
    method:'PUT',
    headers:{'Content-Type': 'application/json'},
    body: JSON.stringify({name, files})
  }).then(r => r.json()),
  delete:(id:string) => fetch(`${BASE}/projects/${id}`, {
    method:'DELETE',
  }).then(r => r.json()),
  getVersion:(id: string) => fetch(`${BASE}/projects/${id}/versions`).then(r => r.json()),
  saveVersion:(id:string, description:string) => fetch(`${BASE}/projects/${id}/versions`,{
    method:'POST',
    headers:{'Content-Type': 'application/json'},
    body:JSON.stringify({
      description
    })
  }).then(r => r.json()),
  restoreVersion:(projectId: string, versionId: string) => fetch(`${BASE}/projects/${projectId}/versions/${versionId}/restore`,{
    method:'POST',
    }
  ).then(r => r.json()),
  deleteVersion:(projectId:string ,versionId: string) => fetch(`${BASE}/projects/${projectId}/versions/${versionId}`, {
    method:'DELETE'
  }).then(r => r.json())
}