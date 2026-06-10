<template>
  <el-drawer
    v-model="aiStore.aiAgentOpen"
    :modal="false"
    :with-header="false"
    size="320px"
    direction="rtl"
    :append-to-body="true"
    class="ai-agent-drawer"
    modal-class="ai-agent-drawer-overlay"
    :lock-scroll="false"
    :style="{
      '--el-drawer-padding-primary': '0px',
      '--el-drawer-bg-color': '#1e1e1e',
    }"
  >
    <!-- 头部 -->
    <div class="sidebar-header">
      <div class="sidebar-title">
        <font-awesome-icon icon="fa-solid fa-comments" class="sidebar-icon" />
        <span>AI Agent</span>
      </div>
      <button class="sidebar-close" @click="aiStore.closeAgent()">
        <font-awesome-icon icon="fa-regular fa-circle-xmark" />
      </button>
    </div>

    <!-- 消息区 -->
    <div class="sidebar-messages" ref="chatAgentEl">
      <template v-for="(msg, index) in aiStore.aiAgentMessages" :key="index">
        <div v-if="msg.role === 'tool'" class="msg-tool">
          <font-awesome-icon icon="fa-solid fa-gear" class="tool-icon" />
          <span>{{ msg.content }}</span>
        </div>
        <div v-else-if="msg.role === 'user'" class="msg-row msg-row--user">
          <div class="bubble bubble--user">{{ msg.content }}</div>
        </div>
        <div v-else class="msg-row msg-row--assistant">
          <div class="avatar">AI</div>
          <div class="bubble bubble--assistant">{{ msg.content }}</div>
        </div>
      </template>

      <!-- 加载中气泡 -->
      <div v-if="aiStore.isLoading" class="msg-row msg-row--assistant">
        <div class="avatar">AI</div>
        <div class="bubble bubble--assistant bubble--thinking">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="sidebar-input">
      <textarea
        placeholder="向 AI 询问代码问题... (Ctrl+Enter 发送)"
        v-model="aiStore.aiInput"
        @keydown.ctrl.enter.prevent="sendMsg"
        rows="3"
      ></textarea>
      <div class="input-actions">
        <span class="input-hint">Ctrl+Enter 发送</span>
        <button class="send-btn" :disabled="aiStore.isLoading" @click="sendMsg">
          <font-awesome-icon icon="fa-solid fa-paper-plane" />
        </button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { ElDrawer } from 'element-plus'
import { useAiStore } from '../store/useAiStore'
import { useCodeStore } from '../store/useCodeStore'

const aiStore = useAiStore()
const codeStore = useCodeStore()
const chatAgentEl = ref<HTMLElement | null>(null)
let autoFollow = true

const sendMsg = () => {
  const ctx = [
    codeStore.htmlCode,
    codeStore.cssCode,
    codeStore.jsCode,
    codeStore.reactCode,
  ].filter(Boolean).join('\n\n')
  aiStore.sendAgentMsg(ctx)
}

function isNearBottom(el: HTMLElement, threshold = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

function scrollToBottom() {
  const el = chatAgentEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function onScroll() {
  const el = chatAgentEl.value
  if (el) autoFollow = isNearBottom(el)
}

watch(
  () => aiStore.aiAgentMessages[aiStore.aiAgentMessages.length - 1],
  async () => {
    await nextTick()
    if (autoFollow) scrollToBottom()
  }
)

watch(
  () => aiStore.aiAgentOpen,
  async (open) => {
    if (open) {
      await nextTick()
      scrollToBottom()
      chatAgentEl.value?.addEventListener('scroll', onScroll)
    } else {
      chatAgentEl.value?.removeEventListener('scroll', onScroll)
    }
  }
)
</script>

<style>
/* 非 scoped —— 覆盖 teleport 到 body 的 el-drawer 样式 */
.ai-agent-drawer {
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4) !important;
  border-left: 1px solid #3e3e42 !important;
  pointer-events: auto;
}

.ai-agent-drawer .el-drawer__body {
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  height: 100% !important;
  padding: 0 !important;
}

/* overlay 容器不拦截事件，点击 drawer 外的区域正常响应 */
.ai-agent-drawer-overlay {
  pointer-events: none !important;
}

.ai-agent-drawer-overlay .ai-agent-drawer {
  pointer-events: auto;
}
</style>

<style scoped>
/* ===== scoped 样式只管组件内部元素 ===== */

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  flex-shrink: 0;
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #d4d4d4;
  font-weight: 600;
  font-size: 13px;
}

.sidebar-icon { color: #0078d4; }

.sidebar-close {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  font-size: 16px;
  padding: 2px;
  transition: color 0.15s;
}
.sidebar-close:hover { color: #d4d4d4; }

.sidebar-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: #1e1e1e;
}

.sidebar-messages::-webkit-scrollbar { width: 6px; }
.sidebar-messages::-webkit-scrollbar-track { background: transparent; }
.sidebar-messages::-webkit-scrollbar-thumb { background: #3e3e42; border-radius: 999px; }
.sidebar-messages::-webkit-scrollbar-thumb:hover { background: #5a5a5a; }

.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.msg-row--user { flex-direction: row-reverse; }

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #0078d4;
  color: white;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bubble {
  max-width: 82%;
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.bubble--user {
  background: #0078d4;
  color: #fff;
  border-bottom-right-radius: 3px;
}

.bubble--assistant {
  background: #2d2d30;
  color: #d4d4d4;
  border-bottom-left-radius: 3px;
  border: 1px solid #3e3e42;
}

.bubble--thinking {
  padding: 12px 16px;
  display: flex;
  gap: 5px;
  align-items: center;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #858585;
  animation: thinking 1.4s ease-in-out infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes thinking {
  0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.msg-tool {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 7px 10px;
  background: #252526;
  border: 1px dashed #3e3e42;
  border-radius: 6px;
  font-size: 11px;
  color: #858585;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.tool-icon { flex-shrink: 0; margin-top: 2px; color: #6a9955; }

.sidebar-input {
  flex-shrink: 0;
  padding: 12px;
  background: #2d2d30;
  border-top: 1px solid #3e3e42;
}

.sidebar-input textarea {
  width: 100%;
  background: #3c3c3c;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  padding: 9px 12px;
  color: #d4d4d4;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  resize: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.15s;
}
.sidebar-input textarea:focus { border-color: #0078d4; }

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.input-hint { font-size: 11px; color: #555; }

.send-btn {
  background: #0078d4;
  border: none;
  border-radius: 6px;
  padding: 7px 14px;
  color: white;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, opacity 0.15s;
}
.send-btn:hover:not(:disabled) { background: #106ebe; }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
