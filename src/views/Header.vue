<template>
  <div class="header">
    <div class="left">
      <font-awesome-icon icon="fa-solid fa-code" class="logo"/>
      <span class="title">Ai前端辅助沙箱</span>
    </div>

    <div class="editor-actions">
      <div class="action-btn">
        <font-awesome-icon icon="fa-solid fa-bars" />
      </div>

      <div class="robot-drop-menu">
        <div class="right action-btn" @click="dialogFormVisible = true">
          <font-awesome-icon icon="fa-solid fa-floppy-disk" />
        </div>

         <div class="right action-btn"  @click="drawerVisible = true">
          <font-awesome-icon icon="fa-solid fa-list" />
        </div>
      </div>
    </div>

     <el-dialog v-model="dialogFormVisible" title="保存" width="500">
      
      <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick">
        <el-tab-pane label="新建项目" name="project">
          <el-form>
            <el-form-item label="项目名称" :label-width="formLabelWidth">
              <el-input v-model="proJectname" autocomplete="off" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="保存版本" name="version">
          <el-form-item label="项目名称" :label-width="formLabelWidth">
              <el-select v-model="form.projectId" placeholder="请选择要保存此版本的项目">
                  <el-option 
                    v-for="project in projectList"
                    :key="project._id"
                    :label="project.name"
                    :value="project._id"
                  />
              </el-select>
            </el-form-item>
            <el-form-item label="版本名称" :label-width="formLabelWidth">
              <el-input v-model="form.versionName" autocomplete="off" />
            </el-form-item>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogFormVisible = false">Cancel</el-button>
          <el-button type="primary" @click="handleConfirm">
            Confirm
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="drawerVisible" :modal="false" modal-penetrable title="项目列表">
      <div class="project-list">
        <div
          v-for="project in projectList"
          :key="project._id"
          class="project-card"
        >
          <!-- 项目卡片头部，点击展开/折叠版本列表 -->
          <div class="project-card-header" @click="toggleProject(project._id)">
            <font-awesome-icon icon="fa-solid fa-folder" class="project-icon" />
            <span class="project-name">{{ project.name }}</span>
            <el-tooltip content="删除项目" placement="top" >
              <button class="version-btn version-btn--danger project-delete-btn" @click.stop="deleteProject(project._id)">
                <font-awesome-icon icon="fa-solid fa-trash" />
              </button>
            </el-tooltip>
            <font-awesome-icon
              :icon="expandedProject === project._id ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"
              class="project-chevron"
            />
          </div>

          <!-- 版本列表 -->
          <div v-show="expandedProject === project._id" class="version-list">
            <div
              v-for="version in (versionMap[project._id] ?? [])"
              :key="version._id"
              class="version-item"
            >
              <div class="version-info">
                <span class="version-name">{{ version.description }}</span>
                <span class="version-date">{{ new Date(version.createdAt).toLocaleString() }}</span>
              </div>
              <div class="version-actions">
                <el-tooltip content="Diff" placement="top">
                  <button class="version-btn" @click.stop="handleVersionDiff(version)">
                    <font-awesome-icon icon="fa-solid fa-code-compare" />
                  </button>
                </el-tooltip>

                <el-tooltip content="回滚" placement="top">
                  <button class="version-btn version-btn--danger" @click.stop="handleRollBack(project ,version)">
                    <font-awesome-icon icon="fa-solid fa-rotate-left" />
                  </button>
                </el-tooltip>
                <el-tooltip content="删除版本" placement="top">
                  <button class="version-btn version-btn--danger" @click.stop="handleDelete(project, version)">
                    <font-awesome-icon icon="fa-solid fa-trash" />
                  </button>
                </el-tooltip>
              </div>
            </div>
            <div v-if="(versionMap[project._id] ?? []).length === 0" class="version-empty">
              暂无版本记录
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>

  
  <diff-dialog-form></diff-dialog-form>

</template>

<script setup lang="ts">
  import { projectService } from '../api/projectService';
  import {ref, reactive, watch} from 'vue'
  import { useCodeStore } from '../store/useCodeStore';
  import { useVersionDiffStore } from '../store/useVersionDiffStroe.ts';
  import type { TabsPaneContext } from 'element-plus'
  import { ElDialog, ElForm, ElButton, ElFormItem, ElOption, ElSelect, ElInput, ElTabs, ElTabPane, ElMessage, ElDrawer,ElTooltip, ElMessageBox } from 'element-plus';
  import diffDialogForm from '../components/diffDialogForm.vue';
  const dialogFormVisible = ref(false)
  const formLabelWidth = '140px'
  const proJectname = ref('')
  const codeStore = useCodeStore()
  const versionDiffStore = useVersionDiffStore()
  const handleClick = (tab: TabsPaneContext, event: Event) => {
    console.log(tab, event)
  }
  const activeName = ref('project')
  const form = reactive({
    versionName: '',
    projectId: ''
  })
  const projectList = ref<any[]>([])
  const drawerVisible = ref(false)
  const expandedProject = ref<string | null>(null)
  const versionMap = ref<Record<string, any[]>>({})

  const toggleProject = async (id: string) => {
    if (expandedProject.value === id) {
      expandedProject.value = null
      return
    }
    expandedProject.value = id
    if (!versionMap.value[id]) {
      try {
        const res = await projectService.getVersion(id)
        versionMap.value[id] = res.code === 0 ? res.data : []
      } catch {
        versionMap.value[id] = []
      }
    }
  }
  // 加载项目列表
  const loadProjectList = async () => {
    try {
      const res = await projectService.getAll()

      if (res.code === 0) {
        projectList.value = res.data
      } else {
        ElMessage.error(res.message || '获取项目列表失败')
      }
    } catch (error: any) {
      ElMessage.error(error.message || '获取项目列表失败')
    }
  }

  watch([activeName, drawerVisible], async () => {
    if(activeName.value === 'version' || drawerVisible.value === true){
       await loadProjectList()
    }
  })
  const createNewProject = async (name:string) => {
      if (!name) {
        ElMessage.warning('请填写项目名称')
        return;
      }
      const files = {
        html: codeStore.htmlCode,
        css: codeStore.cssCode,
        javascript: codeStore.jsCode,
      }

      try{
        const { data:{_id}  } = await projectService.create(name)
        await projectService.update(_id, files, name)
        await projectService.saveVersion(_id, 'first init')

        ElMessage.success('项目创建成功！')
        dialogFormVisible.value = false
        proJectname.value = ''
        }catch(error: any){
          ElMessage.error(error.message || '创建项目失败')
      }
  }

  const saveNewVersion = async () => {
    if (!form.projectId) {
      ElMessage.warning('请选择项目')
      return
    }

    if (!form.versionName) {
      ElMessage.warning('请填写版本名称')
      return
    }

    const files = {
      html: codeStore.htmlCode,
      css: codeStore.cssCode,
      javascript: codeStore.jsCode,
    }

    try{
      await projectService.update(form.projectId, files)
      await projectService.saveVersion(form.projectId, form.versionName)
      delete versionMap.value[form.projectId]
      if (expandedProject.value === form.projectId) {
        const res = await projectService.getVersion(form.projectId)
        versionMap.value[form.projectId] = res.code === 0 ? res.data : []
      }
      ElMessage.success('版本保存成功')
      dialogFormVisible.value = false
    }catch(error: any){
       ElMessage.error(error.message || '获取项目列表失败')
    }
  }
  const handleConfirm = async () => {
  if (activeName.value === 'project') {
    await createNewProject(proJectname.value)
  }

  if (activeName.value === 'version') {
    await saveNewVersion()
  }
  }
  const deleteProject = async (id: string) => {
    try {
      await projectService.delete(id)
      const res = await projectService.getAll()
      if (res.code === 0) {
        projectList.value = res.data
        ElMessage.success('项目删除成功')
      } else {
        ElMessage.error(res.message || '删除后刷新失败')
      }
    } catch (error: any) {
      ElMessage.error(error.message || '删除失败')
    }
  }
  const handleVersionDiff = async (version : any) => {
    try{
      versionDiffStore.openDiff({
        versionName:version.description || '历史版本',
         originalFiles: {
          html: version.files?.html || version.html || '',
          css: version.files?.css || version.css || '',
          javascript: version.files?.javascript || version.javascript || '',
        },

        // 右边：当前编辑器代码，不需要保存
        currentFiles: {
          html: codeStore.htmlCode,
          css: codeStore.cssCode,
          javascript: codeStore.jsCode,
        },
      })
    }catch(error :any){
      ElMessage.error(error.message || '打开版本对比失败')
    }
  }

  const handleRollBack = async (project : any ,version : any) => {
    try{
      await ElMessageBox.confirm(
        `确定要回滚到版本「${version.name || version.versionName || '未命名版本'}」吗？\n\n建议先完成 Diff 对比。回滚后当前编辑器代码会被该版本覆盖，并会自动生成一条新的回滚版本记录。`,
        '确认回滚',
        {
          confirmButtonText: '回滚',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )

      const rollbackFiles = {
        html: version.files?.html || version.html || '',
        css: version.files?.css || version.css || '',
        javascript: version.files?.javascript || version.javascript || '',
      }

      codeStore.htmlCode = rollbackFiles.html
      codeStore.cssCode = rollbackFiles.css
      codeStore.jsCode = rollbackFiles.javascript

      await projectService.update(project._id, rollbackFiles, project.name)

      await projectService.restoreVersion(project._id, version._id)

      delete versionMap.value[project._id]
      await loadProjectList()
      // 如果当前还是展开状态，重新拉版本列表
      if (expandedProject.value === project._id) {
        const res = await projectService.getVersion(project._id)
        versionMap.value[project._id] = res.code === 0 ? res.data : []
      }
      ElMessage.success('回滚成功，已生成新的版本记录')
    }catch(error:any){
      if (error === 'cancel' || error === 'close') {
        return
      }

      ElMessage.error(error.message || '回滚失败')
    }
  }

  const handleDelete = async(project: any, version : any) => {
    try{
      if(!project || !version) return
      await projectService.deleteVersion(project._id, version._id)
      delete versionMap.value[project._id]
      await loadProjectList()
      // 如果当前还是展开状态，重新拉版本列表
      if (expandedProject.value === project._id) {
        const res = await projectService.getVersion(project._id)
        versionMap.value[project._id] = res.code === 0 ? res.data : []
      }

      ElMessage.success('删除成功，已生成新的版本记录')
    }catch(error: any){
      ElMessage.error(error.message || '删除版本失败')
    }
  }
</script>

<style scoped>
  .header {
    background: #2d2d30;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #3e3e42;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    color: #0078d4;
    font-size: 24px;
  }

  .title {
    font-size: 18px;
    font-weight: 600;
  }

  .editor-actions {
    position: absolute;
    top: 15px;
    right: 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 10;
  }
   .robot-drop-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 8px;
    flex-direction: column;
    gap: 10px;
    visibility: hidden;
    display: flex;
    opacity: 0;
    transform: translateY(-6px);
    transition: all 0.2s ease;
  }

  .editor-actions:hover .robot-drop-menu {
    visibility: visible;
    opacity: 1;
    transform: translateY(0);
  }

  .project-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .project-card {
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #3e3e42;
  }

  .project-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #2d2d30;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .project-card-header:hover {
    background: #37373d;
  }

  .project-icon {
    color: #e8a030;
    font-size: 14px;
  }

  .project-name {
    flex: 1;
    color: #d4d4d4;
    font-size: 14px;
    font-weight: 500;
  }

  .project-chevron {
    color: #858585;
    font-size: 12px;
  }

  .version-list {
    background: #1e1e1e;
    padding: 6px 0;
  }

  .version-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #2d2d30;
  }

  .version-item:last-child {
    border-bottom: none;
  }

  .version-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .version-name {
    color: #d4d4d4;
    font-size: 13px;
  }

  .version-date {
    color: #858585;
    font-size: 11px;
  }

  .version-actions {
    display: flex;
    gap: 6px;
  }

  .version-btn {
    width: 28px;
    height: 28px;
    background: #3c3c3c;
    border: none;
    border-radius: 4px;
    color: #d4d4d4;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .version-btn:hover {
    background: #0078d4;
    color: #fff;
  }

  .version-btn--danger:hover {
    background: #c0392b;
    color: #fff;
  }

  .version-empty {
    padding: 12px;
    color: #858585;
    font-size: 13px;
    text-align: center;
  }

  .version-list {
    transition: opacity 0.2s ease;
  }
</style>