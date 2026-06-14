import * as Babel from '@babel/standalone'

// 1. 定义 LRU 缓存配置（限制最大缓存 50 个文件/版本快照）
const CACHE_LIMIT = 50;
const compileCache = new Map<string, string>();

// 读取缓存：命中时刷新其排序，使其成为“最近常用”
function getCache(code: string): string | undefined {
  if (!compileCache.has(code)) return undefined;
  const val = compileCache.get(code)!;
  compileCache.delete(code); 
  compileCache.set(code, val); // 重新插入到末尾，保持最新
  return val;
}

// 写入缓存：超出上限时剔除最老的数据
function setCache(code: string, compiled: string) {
  if (compileCache.has(code)) {
    compileCache.delete(code);
  } else if (compileCache.size >= CACHE_LIMIT) {
    // delete oldest: Map 的 keys().next().value 是最早插入的那一个
    const oldestKey = compileCache.keys().next().value;
    if (oldestKey !== undefined) compileCache.delete(oldestKey);
  }
  compileCache.set(code, compiled);
}

self.onmessage = (e: MessageEvent) => {
  const { code, id } = e.data;

  // 2. 🛡️ 缓存核心拦截：如果代码没变/曾经编译过，0ms 闪电回传
  const cachedResult = getCache(code);
  if (cachedResult !== undefined) {
    self.postMessage({
      id,
      success: true,
      compiled: cachedResult
    });
    return; // 直接截断，不走下面的重量级 Babel
  }

  try {
    // 3. 缓存未命中，走原有的 Babel 编译逻辑
    const result = Babel.transform(code, {
      presets: ['react', 'typescript'],
      filename: 'index.tsx' 
    });

    const compiledCode = result.code || '';

    // 4. 📝 编译成功，把结果塞进 LRU 缓存
    setCache(code, compiledCode);

    self.postMessage({
      id,
      success: true,
      compiled: compiledCode
    });
  } catch (error: any) {
    self.postMessage({
      id,
      success: false,
      error: error.message
    });
  }
};