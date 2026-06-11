<template>
  <div class="console" :class="{open : isOpen}">
    <div class="console-bar">
      <div class="title">
        Console
      </div>

      <div class="bar-actions">
        <!-- 有待确认的修复时显示确认/还原按钮 -->
        <template v-if="aiStore.pendingChanges">
          <el-button size="small" type="success" @click="confirmFix">应用修复</el-button>
          <el-button size="small" @click="revertFix">还原</el-button>
        </template>
        <el-button v-else size="small" type="warning" @click="handleFixError" :loading="fixLoading">
          一键修复
        </el-button>
        <div class="action" @click="toggleConsole()">
          <div v-if="isOpen">
            <font-awesome-icon icon="fa-solid fa-chevron-down" />
          </div>
          <div v-else>
            <font-awesome-icon icon="fa-solid fa-chevron-up" />
          </div>
        </div>
      </div>
    </div>
    <div class="console-content">
      <div v-if="logs.length === 0">暂无输出</div>
      <div v-else>
        <div v-for="item in logs" :key="item.id">
          <div>
            <span style="opacity:.7;">[{{ item.type }}]</span>
            <div class="console-message">
              {{ item.text }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script setup lang="ts" name="consolePanel">
  import { ElButton, ElMessage } from 'element-plus';
  import { ref, watch } from 'vue';
  import { useAiStore } from '../store/useAiStore';
  type LogItem = { id: string; type: 'log'|'warn'|'error'|'info'; text: string; ts: number };
  const isOpen = ref(false);
  const fixLoading = ref(false)
  const aiStore = useAiStore()
  const props = defineProps<{
    logs: LogItem[]
  }>()

  // 同步 error logs 到 store，agent 发消息时可以带上
  watch(
    () => props.logs,
    (logs) => {
      aiStore.consoleLogs = logs
        .filter(item => item.type === 'error')
        .map(item => item.text)
    },
    { deep: true }
  )

  function toggleConsole(){
    isOpen.value = !isOpen.value;
  }

  const handleFixError = async () => {
    const eMessage = props.logs
      .filter(item => item.type === 'error')
      .map(item => item.text)

    if (eMessage.length === 0) {
      ElMessage.info('没有发现错误日志')
      return
    }

    fixLoading.value = true
    try {
      await aiStore.fixByAi(eMessage)
    } finally {
      fixLoading.value = false
    }
  }

  const confirmFix = () => {
    aiStore.applyAllChanges()
    ElMessage.success('已应用修复')
  }

  const revertFix = () => {
    aiStore.revertAllChanges()
    ElMessage.info('已还原')
  }
</script>

<style scoped>
  .console{
    height: 40px;
    width: 100%;
    background: #0f1115;
    color: #e6e6e6;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;

    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;

    transition: height 0.25s ease;
    z-index: 10;
  }

  .console.open{
    height: 240px;
  }

 .console-bar{
  height: 40px;
  background: #2d2d30;
  padding: 0px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #3e3e42;

  /* 永远不压缩 */
  flex-shrink: 0;
 }

 .console-content{
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 10px 10px;
  }

  .action{
    cursor: pointer;
  }

  .bar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .console-content::-webkit-scrollbar{
    width: 8px;
  }

  .console-content::-webkit-scrollbar-track{
    background: #252526;
    border-radius: 999px;
  }

  .console-content::-webkit-scrollbar-thumb{
    background: #5a5a5a;
    border-radius: 999px;
    border: 2px solid #252526;
  }
  .console-message{
    display: flex;
    justify-content:space-between;
  }
</style>