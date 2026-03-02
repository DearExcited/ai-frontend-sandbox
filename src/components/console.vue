<template>
  <div class="console" :class="{open : isOpen}">
    <div class="console-bar">
      <div class="title">
        JS Console
      </div>

      <div class="action" @click="toggleConsole()">
        <div v-if="isOpen">
          <font-awesome-icon icon="fa-solid fa-chevron-down" />
        </div>

        <div v-else>
          <font-awesome-icon icon="fa-solid fa-chevron-up" />
        </div>
      </div>
    </div>
    <div class="console-content">
      <div v-if="logs.length === 0">暂无输出</div>
      <div v-else>
        <div v-for="item in logs" :key="item.id">
          <span style="opacity:.7;">[{{ item.type }}]</span>
          {{ item.text }}
        </div>
      </div>
    </div>
  </div>
</template>


<script setup lang="ts" name="console">
  import { ref } from 'vue';
  type LogItem = { id: string; type: 'log'|'warn'|'error'|'info'; text: string; ts: number };
  const isOpen = ref(false);
  const logs = ref<LogItem[]>([]);

  function toggleConsole(){
    isOpen.value = !isOpen.value;
  }

</script>

<style scoped>
  .console{
    height: 148px;
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

</style>