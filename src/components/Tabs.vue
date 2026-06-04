<!-- Tabs组件，主要用来进行语言的切换 -->
<template>
  <el-tabs v-model="activeName" @tab-click="handClick" class="tabs" type="card">
    <el-tab-pane label="HTML" name="html" class="tab"></el-tab-pane>
    <el-tab-pane label="CSS" name="css" class="tab"></el-tab-pane>
    <el-tab-pane label="JS" name="js" class="tab"></el-tab-pane>
    <el-tab-pane label="REACT" name="react" class="tab"></el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts"> 
  import { ElTabPane } from 'element-plus'
  import { ElTabs } from 'element-plus'
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  const router = useRouter()
  const activeName = ref('html')
  
  // 点击事件
  const handClick = (tab:any) => {
    router.push(`/home/${tab.paneName}`)
  }

  // 防止用户直接访问标签页/浏览器前进回退按钮：确保标签状态始终反映当前路由
  router.isReady().then(() => {
    const currentRoute = router.currentRoute.value
      if (currentRoute.path.startsWith('/home/')) {
        // 提取路径最后部分作为标签名
        const tabName = currentRoute.path.split('/').pop()
        if (tabName && ['html', 'css', 'js', 'react'].includes(tabName)) {
          activeName.value = tabName;
        }
      }
  })

</script>

<style>
  .tabs{
    display: flex;
    gap: 2px;
    background: #2d2d30;
    padding: 0 20px;
  }

  .tabs .el-tabs__item {
    color: #d4d4d4;
  }

  .el-tabs__item.is-active, .el-tabs__item:hover{
    color: var(--el-color-primary);
  }

  .el-tabs--card>.el-tabs__header {
    border: 0;
  }

  .el-tabs--card>.el-tabs__header .el-tabs__item{
    border: 0;
  }

  .el-tabs--card>.el-tabs__header .el-tabs__item {
    border: 0;
  }

  .el-tabs__header {
    margin: 0;
  }

  .el-tabs--card>.el-tabs__header .el-tabs__nav {
    border: 0;
  }

</style>