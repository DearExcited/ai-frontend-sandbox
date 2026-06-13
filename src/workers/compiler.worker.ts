import * as Babel from '@babel/standalone'

self.onmessage = (e: MessageEvent) => {
  const { code, id } = e.data;

  try {
    // 执行 Babel 编译（React + TS 预设）
    const result = Babel.transform(code, {
      presets: ['react', 'typescript'],
      filename: 'index.tsx' // 让 Babel 识别 JSX/TSX 语法
    });

    // 编译成功，把结果和唯一标识 id 回传给主线程
    self.postMessage({
      id,
      success: true,
      compiled: result.code
    });
  } catch (error: any) {
    // 编译失败，回传错误信息，防止主线程无限挂起
    self.postMessage({
      id,
      success: false,
      error: error.message
    });
  }
};