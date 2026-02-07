<template>
  <el-config-provider :locale="zhCn">
    <router-view></router-view>
  </el-config-provider>
</template>

<script setup lang="ts">
  import { ElConfigProvider } from 'element-plus';
  import { zhCn } from 'element-plus/es/locales.mjs';
  // import ai from './components/ai.vue';
</script>