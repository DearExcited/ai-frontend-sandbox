<template>
   <div class="home">
    <Header></Header>
    <Tabs></Tabs>
    <div class="container">
      <!-- 左侧编辑区 -->
      <div class="left">
        <router-view></router-view>
      </div>
      <!-- 右侧预览区 -->
      <div class="right">
        <Preview></Preview>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
  import Preview from '../components/Preview.vue'; 
  import Tabs from '../components/Tabs.vue'
  import Header from './Header.vue'
</script>

<style lang="css" scoped>
  .home{
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100vh;
  }

  .container {
    width: 100%;
    flex: 1;
    overflow: hidden;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .left {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .right{
    overflow: hidden;
    height: 100%;
  }
</style>