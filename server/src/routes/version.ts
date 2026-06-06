import express from "express";
import Version from "../models/Version.js";
import Project from "../models/Project.js";
import mongoose from "mongoose";

const router = express.Router({ mergeParams: true })

/**
 * GET /api/projects/:id/versions
 * 获取某个项目的所有版本
 */
router.get('/', async(req: express.Request<{ id: string }>, res) => {
  try{
    const { id: projectId } = req.params

    if(!mongoose.Types.ObjectId.isValid(projectId)){
      return res.status(400).json({
        code:400,
        message:'项目 ID 格式不合法'
      })
    }

    const versionList = await Version.find({ projectId }).sort({ createdAt: -1 })

    res.json({
      code: 0,
      message: '获取版本列表成功',
      data: versionList
    })
  }catch(error){
    res.status(500).json({ code: 500, message: '获取版本列表失败', error })
  }
})

/**
 * POST /api/projects/:id/versions
 * 保存当前项目代码为新版本
 */
router.post('/', async(req: express.Request<{ id: string }>, res) => {
  try{
    const { id: projectId } = req.params

    if(!mongoose.Types.ObjectId.isValid(projectId)){
      return res.status(400).json({
        code:400,
        message:'项目 ID 格式不合法'
      })
    }

    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ code: 404, message: '项目不存在' })
    }

    const { description = '手动保存', aiPatch } = req.body

    const version = await Version.create({
      projectId,
      files: project.files,
      description,
      aiPatch
    })

    res.status(201).json({
      code: 0,
      message: '版本保存成功',
      data: version
    })

  }catch(error){
    res.status(500).json({ code: 500, message: '版本保存失败', error })
  }
})
/**
 * POST /api/projects/:id/versions/:versionId/restore
 * 回滚项目到指定版本
 */
router.post('/:versionId/restore', async (req:express.Request<{id: string, versionId: string}>, res) => {
  try {
    const { id: projectId, versionId } = req.params

    if (
      !mongoose.Types.ObjectId.isValid(projectId) ||
      !mongoose.Types.ObjectId.isValid(versionId)
    ) {
      return res.status(400).json({
        code: 400,
        message: 'ID 格式不合法'
      })
    }

    const targetVersion = await Version.findById(versionId)

    if (!targetVersion || targetVersion.projectId.toString() !== projectId) {
      return res.status(404).json({
        code: 404,
        message: '版本不存在或不属于该项目'
      })
    }

    const project = await Project.findById(projectId)

    if (!project) {
      return res.status(404).json({
        code: 404,
        message: '项目不存在'
      })
    }

    const restoredProject = await Project.findByIdAndUpdate(
      projectId,
      {
        files: {
          html: targetVersion.files.html,
          css: targetVersion.files.css,
          javascript: targetVersion.files.javascript,
          typescript: targetVersion.files.typescript
        }
      },
      {
        new: true,
        runValidators: true
      }
    )

    const restoreRecord = await Version.create({
      projectId,
      files: targetVersion.files,
      description: `回滚到版本：${targetVersion.description}`,
      aiPatch: `restore from version ${targetVersion._id}`
    })

    res.json({
      code: 0,
      message: '项目回滚成功',
      data: {
        project: restoredProject,
        restoreRecord
      }
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '项目回滚失败',
      error
    })
  }
})
export default router