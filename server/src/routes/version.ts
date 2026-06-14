import express from "express";
import Version from "../models/Version.js";
import Project from "../models/Project.js";
import mongoose from "mongoose";
import { createPatch, applyPatch } from "../utils/diffMatch.js"; // 刚才封装的工具

const router = express.Router({ mergeParams: true })

/**
 * 🔒 核心内部公共函数：从零开始，沿着时间轴增量还原特定版本（或最新版本）的全量代码
 */
async function reconstructFilesUntilVersion(projectId: string, untilVersionId?: string) {
  const query: any = { projectId };
  
  if (untilVersionId) {
    const target = await Version.findById(untilVersionId);
    if (!target) throw new Error('目标版本不存在');
    query.createdAt = { $lte: target.createdAt }; // 只捞取小于等于目标版本时间线的记录
  }

  // 按照时间正序（从最早到最晚）捞出 Patch 链
  const versionsChain = await Version.find(query).sort({ createdAt: 1 });

  const currentFiles = { html: '', css: '', javascript: '', typescript: '' };

  // 链式回放（Replay）
  for (const ver of versionsChain) {
    currentFiles.html = applyPatch(currentFiles.html, ver.files.html);
    currentFiles.css = applyPatch(currentFiles.css, ver.files.css);
    currentFiles.javascript = applyPatch(currentFiles.javascript, ver.files.javascript);
    currentFiles.typescript = applyPatch(currentFiles.typescript, ver.files.typescript);

    if (untilVersionId && ver._id.toString() === untilVersionId.toString()) {
      break; // 到达目标节点，斩断并退出
    }
  }

  return currentFiles;
}

/**
 * GET /api/projects/:id/versions
 * 获取某个项目的所有版本（此时列表接口返回的是非常轻量的 Patch 描述信息，极其高效）
 */
router.get('/', async(req: express.Request<{ id: string }>, res) => {
  try{
    const { id: projectId } = req.params
    if(!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ code: 400, message: '项目 ID 格式不合法' })
    }

    const versionList = await Version.find({ projectId }).sort({ createdAt: -1 });
    res.json({ code: 0, message: '获取版本列表成功', data: versionList })
  }catch(error){
    res.status(500).json({ code: 500, message: '获取版本列表失败', error })
  }
})

/**
 * POST /api/projects/:id/versions
 * 保存当前项目代码为新版本（增量保存）
 */
router.post('/', async(req: express.Request<{ id: string }>, res) => {
  try{
    const { id: projectId } = req.params
    if(!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ code: 400, message: '项目 ID 格式不合法' })
    }

    const project = await Project.findById(projectId)
    if (!project) return res.status(404).json({ code: 404, message: '项目不存在' })

    const { description = '手动保存', aiPatch } = req.body

    // 1. 还原出“当前最新版本”的全量快照
    const lastFullFiles = await reconstructFilesUntilVersion(projectId);

    // 2. 将当前 project 中的真实代码与上一版本进行 diff，计算出 Patch
    const htmlPatch = createPatch(lastFullFiles.html, project.files.html);
    const cssPatch = createPatch(lastFullFiles.css, project.files.css);
    const javascriptPatch = createPatch(lastFullFiles.javascript, project.files.javascript);
    const typescriptPatch = createPatch(lastFullFiles.typescript, project.files.typescript);

    // 3. 仅向数据库写入 Patch
    const version = await Version.create({
      projectId,
      files: {
        html: htmlPatch,
        css: cssPatch,
        javascript: javascriptPatch,
        typescript: typescriptPatch
      },
      description,
      aiPatch
    })

    res.status(201).json({ code: 0, message: '增量版本保存成功', data: version })
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
    if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(versionId)) {
      return res.status(400).json({ code: 400, message: 'ID 格式不合法' })
    }

    const targetVersion = await Version.findById(versionId)
    if (!targetVersion || targetVersion.projectId.toString() !== projectId) {
      return res.status(404).json({ code: 404, message: '版本不存在或不属于该项目' })
    }

    const project = await Project.findById(projectId)
    if (!project) return res.status(404).json({ code: 404, message: '项目不存在' })

    // 1. 回溯并还原出目标版本的全量文件内容
    const targetFullFiles = await reconstructFilesUntilVersion(projectId, versionId);

    // 2. 捞取执行回滚前一刻的最新全量内容（为了给即将创建的“回滚记录”做 Diff 基准）
    const previousLatestFiles = await reconstructFilesUntilVersion(projectId);

    // 3. 将真实解压后的全量内容更新回 Project 主表
    const restoredProject = await Project.findByIdAndUpdate(
      projectId,
      { files: targetFullFiles },
      { new: true, runValidators: true }
    )

    // 4. Git 规范：回滚操作本身也是一次新的增量提交
    const restoreRecord = await Version.create({
      projectId,
      files: {
        html: createPatch(previousLatestFiles.html, targetFullFiles.html),
        css: createPatch(previousLatestFiles.css, targetFullFiles.css),
        javascript: createPatch(previousLatestFiles.javascript, targetFullFiles.javascript),
        typescript: createPatch(previousLatestFiles.typescript, targetFullFiles.typescript)
      },
      description: `回滚到版本：${targetVersion.description}`,
      aiPatch: `restore from version ${targetVersion._id}`
    })

    res.json({
      code: 0,
      message: '项目回滚成功',
      data: { project: restoredProject, restoreRecord }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: '项目回滚失败', error })
  }
})

/**
 * DELETE /api/projects/:id/versions/:versionId
 * 删除某个历史版本（⚠️ 增量架构核心痛点：若删除中间节点，会导致后续 Patch 链断裂翻车）
 */
router.delete('/:versionId', async (req: express.Request<{ id: string, versionId: string }>, res) => {
  try{
    const { id: projectId, versionId } = req.params
    if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(versionId)) {
      return res.status(400).json({ code: 400, message: 'ID 格式不合法' })
    }

    const targetVersion = await Version.findById(versionId)
    if(!targetVersion) return res.status(404).json({ code: 404, message: '版本不存在' })

    // 💡 【核心高能演进：Mend Chain (修补断链)】
    // 寻找紧随其后的“下一个版本”。因为下一个版本是基于当前要删的版本做 diff 的，若当前版本直接消失，下一个版本应用 Patch 时会彻底崩塌。
    const nextVersion = await Version.findOne({
      projectId,
      createdAt: { $gt: targetVersion.createdAt }
    }).sort({ createdAt: 1 });

    if (nextVersion) {
      // 1. 获取全链条直到 nextVersion 的所有相关版本
      const allVersions = await Version.find({
        projectId,
        createdAt: { $lte: nextVersion.createdAt }
      }).sort({ createdAt: 1 });

      let v1Files = { html: '', css: '', javascript: '', typescript: '' }; // 要删版本的前一个节点的真实全量
      let v2Files = { html: '', css: '', javascript: '', typescript: '' }; // 要删版本的真实全量
      let v3Files = { html: '', css: '', javascript: '', typescript: '' }; // 下一个版本的真实全量

      for (const ver of allVersions) {
        if (ver._id.toString() === nextVersion._id.toString()) {
          v3Files.html = applyPatch(v2Files.html, ver.files.html);
          v3Files.css = applyPatch(v2Files.css, ver.files.css);
          v3Files.javascript = applyPatch(v2Files.javascript, ver.files.javascript);
          v3Files.typescript = applyPatch(v2Files.typescript, ver.files.typescript);
          break;
        } else if (ver._id.toString() === targetVersion._id.toString()) {
          v2Files.html = applyPatch(v1Files.html, ver.files.html);
          v2Files.css = applyPatch(v1Files.css, ver.files.css);
          v2Files.javascript = applyPatch(v1Files.javascript, ver.files.javascript);
          v2Files.typescript = applyPatch(v1Files.typescript, ver.files.typescript);
        } else {
          v1Files.html = applyPatch(v1Files.html, ver.files.html);
          v1Files.css = applyPatch(v1Files.css, ver.files.css);
          v1Files.javascript = applyPatch(v1Files.javascript, ver.files.javascript);
          v1Files.typescript = applyPatch(v1Files.typescript, ver.files.typescript);
          v2Files = { ...v1Files }; // 同步推进
        }
      }

      // 2. 重新洗牌：让 nextVersion 直接相对于 v1Files 做 Diff，跳过即将被抹去的 targetVersion (V2)
      nextVersion.files = {
        html: createPatch(v1Files.html, v3Files.html),
        css: createPatch(v1Files.css, v3Files.css),
        javascript: createPatch(v1Files.javascript, v3Files.javascript),
        typescript: createPatch(v1Files.typescript, v3Files.typescript)
      };
      await nextVersion.save();
    }

    // 安全过渡后，终于可以放心删掉当前节点了
    await Version.findByIdAndDelete(versionId)

    res.json({ code: 0, message: '删除版本并成功重新缝合版本链', data: targetVersion })
  }catch(error){
    res.status(500).json({ code: 500, message: '删除版本失败', error })
  }
})

/**
 * GET /api/projects/:id/versions/:versionId/code
 * 核心功能：获取某个历史版本的【全量完整代码】
 */
router.get('/:versionId/code', async (req: express.Request<{ id: string, versionId: string }>, res) => {
  try {
    const { id: projectId, versionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(versionId)) {
      return res.status(400).json({ code: 400, message: 'ID 格式不合法' });
    }

    // 1. 验证版本是否存在，且是否属于该项目
    const targetVersion = await Version.findById(versionId);
    if (!targetVersion || targetVersion.projectId.toString() !== projectId) {
      return res.status(404).json({ code: 404, message: '该版本不存在或不属于当前项目' });
    }

    // 2.顺着时间线重放 Patch，拼装出那一刻的全量真实代码
    const fullFiles = await reconstructFilesUntilVersion(projectId, versionId);

    res.json({
      code: 0,
      message: '获取历史版本全量代码成功',
      data: {
        versionInfo: {
          description: targetVersion.description,
          createdAt: targetVersion.createdAt
        },
        files: fullFiles
      }
    });

  } catch (error) {
    res.status(500).json({ code: 500, message: '还原历史代码失败', error });
  }
});

export default router