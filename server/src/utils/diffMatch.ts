import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

/**
 * 核心工具：对比新旧文本，生成可存储的 Patch 字符串
 */
export function createPatch(oldText: string, newText: string): string {
  const diffs = dmp.diff_main(oldText || '', newText || '');
  dmp.diff_cleanupEfficiency(diffs); // 提升可读性与体积压缩
  const patches = dmp.patch_make(oldText || '', diffs);
  return dmp.patch_toText(patches); // 转为紧凑的文本进行存储
}

/**
 * 核心工具：将 Patch 字符串应用到旧文本上，还原出新文本
 */
export function applyPatch(oldText: string, patchText: string): string {
  if (!patchText) return oldText || '';
  try {
    const patches = dmp.patch_fromText(patchText);
    const [newText] = dmp.patch_apply(patches, oldText || '');
    return newText;
  } catch (e) {
    console.error('Patch 应用失败，可能遭遇断链:', e);
    return oldText; // 降级返回原文本
  }
}