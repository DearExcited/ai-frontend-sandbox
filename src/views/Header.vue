<template>
  <div class="header">
    <div class="left">
      <font-awesome-icon icon="fa-solid fa-code" class="logo"/>
      <span class="title">Ai代码编辑器</span>
    </div>
    <div class="right action-btn" @click="code.saveCode()">
      <font-awesome-icon icon="fa-solid fa-floppy-disk" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useCodeStore } from '../store/useCodeStore';
  const code = useCodeStore()
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
</style>