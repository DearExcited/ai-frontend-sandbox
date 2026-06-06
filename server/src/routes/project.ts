import express from 'express'
import mongoose from 'mongoose'
import Project from '../models/Project.js'

const router = express.Router()

/**
 * GET /api/projects
 * 获取所有项目列表
 */

router.get('/', async (req, res) => {
  try{
    const projectsList = await Project.find().sort({updatedAt: -1})

    res.json({
      code:0,
      message:'项目列表获取成功',
      data:projectsList
    })
  }catch(error){
    res.status(500).json({
      code:500,
      message:'获取项目列表失败',
      error
    })
  }
})

router.post('/',async (req, res) => {
  try{
    const {name, files, userId} = req.body;

    if(!name){
      return res.status(400).json({
        code:500,
        message:'项目名称不可为空'
      })
    }

    const project = await Project.create({
      name,
      files: files || {
        html:'',
        css:'',
        javascript: '',
        typescript: ''
      },
      userId: userId || 'default'
    })

    res.status(201).json({
      code:201,
      messgage:'项目创建成功',
      data: project
    })
  }catch(error){
    res.status(500).json({
      code: 500,
      message: '创建项目失败',
      error
    })
  }
})

router.get('/:id', async (req, res) => {
  try{
    const {id} = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        code: 400,
        message: '项目 ID 格式不合法'
      })
    }

    const project = await Project.findById(id)

    if(!project){
      res.status(404).json({
        code:404,
        message:'项目不存在',
      })
    }

    res.json({
      // 业务码
      code:0,
      message:'获取项目详情成功',
      data:project,
    })
  }catch(error){
    res.status(500).json({
      code:500,
      message:'获取项目详情失败',
      error
    })
  }
})

router.put('/:id', async(req, res) => {
  try{
    const { id } = req.params
    const { name, files } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        code: 400,
        message: '项目 ID 格式不合法'
      })
    }

    const updateData:{
      name?:string,
      files?: {
        html?: string
        css?: string
        javascript?: string
        typescript?: string
      }
    } = {}

    if(name !== undefined){
      updateData.name = name
    }

    if (files !== undefined) {
      updateData.files = {
        html: files.html ?? '',
        css: files.css ?? '',
        javascript: files.javascript ?? '',
        typescript: files.typescript ?? ''
      }
    }

    const project = await Project.findByIdAndUpdate(id, updateData, {new: true, runValidators: true})

    if (!project) {
      return res.status(404).json({
        code: 404,
        message: '项目不存在'
      })
    }

    res.json({
      code: 0,
      message: '更新项目成功',
      data: project
    })
  }catch(error){
    res.status(500).json({
      code: 500,
      message: '更新项目失败',
      error
    })
  }
})

router.delete('/:id', async (req, res) => {
  try{
    const {id} = req.params
    
    if(!mongoose.Types.ObjectId.isValid(id)){
      return res.status(500).json({
        code:500,
        message:'项目 ID 格式不合法',
      })
    }

    const project = await Project.findByIdAndDelete(id)

    if(!project){
      return res.status(404).json({
        code: 404,
        message: '项目不存在'
      })
    }

    res.json({
      code: 0,
      message: '删除项目成功',
      data: project
    })
  } catch(error){
    res.status(500).json({
      code: 500,
      message: '删除项目失败',
      error
    })
  }
})

export default router 