import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import projectsRouter from './routes/project.js'
import versionRouter from './routes/version.js'
dotenv.config()

// 后端服务器实例
const app = express()
// 跨域
app.use(cors())
// 让后端可以解析JSON请求体
app.use(express.json())
app.use('/api/projects', projectsRouter)
app.use('/api/projects/:id/versions', versionRouter)
// 测试接口
app.get('/health', (rep, res) => {
  res.json({ 
    state:'请求成功',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
})
const PORT = process.env.PORT || 3001
const MONGODB_URI = process.env.MONGODB_URI

// 启动服务
async function startServer(){
  try{
    if(!MONGODB_URI){
      throw new Error('MONGODB_URI is not defined in .env')
    }

    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB connected successfully')

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  }catch(error){
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
