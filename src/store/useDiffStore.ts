import { defineStore } from "pinia";
import { ref } from 'vue';
import * as monaco from 'monaco-editor';

// 定义DiffLine类型
export interface DiffLine {
  lineNumber: number;
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

// 定义DiffStats类型
export interface DiffStats {
  added: number;
  removed: number;
}

// 定义DiffResult类型
export interface DiffResult {
  lines: DiffLine[];
  stats: DiffStats;
}

export const useDiffStore = defineStore('diffStore', () => {
    // 响应式状态
    const originalCode = ref('');   //原代码
    const modifiedCode = ref('');   //修改后的代码
    const modifiedCodeRaw = ref('');    //ai返回原始结果
    const currentSelection = ref<monaco.Selection | null>(null);
    const isDiffMode = ref(false);
    const diffResult = ref<DiffResult>({ lines: [], stats: { added: 0, removed: 0 } });
    let diffDecorations = ref<string[]>([]);
    // 保存选中的起始行号
    const selectionStartLine = ref(0);


function computeLineLevelDiff(
  originalText: string,
  modifiedText: string
): DiffResult {
  // 格式化字符串
  const originalLines = originalText.split('\n');
  const modifiedLines = modifiedText.split('\n');

  // 初始化返回的结果
  const lines: DiffLine[] = [];
  const stats = { added: 0, removed: 0 };

  // 创建索引，i指向原始代码，j指向修改后的代码，lineNumber指向diff结果
  let i = 0, j = 0;
  let lineNumber = 1;

  // 查找下一个匹配的行（忽略空格差异）
  function findNextMatch(arr: string[], target: string | null, startIndex: number): number {
    if (target === null) return -1;

    const targetTrimmed = target.trim();
    for (let k = startIndex; k < arr.length; k++) {
      if (arr[k].trim() === targetTrimmed) {
        return k;
      }
    }

    return -1;
  }

  // 比较两行是否相同（忽略空格差异）
  function linesEqual(line1: string | null, line2: string | null): boolean {
    if (line1 === null || line2 === null) return false;
    return line1.trim() === line2.trim();
  }

  // 循环查找
  while (i < originalLines.length || j < modifiedLines.length) {
    const originalLine = i < originalLines.length ? originalLines[i] : null;
    const modifiedLine = j < modifiedLines.length ? modifiedLines[j] : null;

    // 比较两行之间是否相同
    if (linesEqual(originalLine, modifiedLine)) {
      // 行内容相同（忽略空格），放入返回结果中，使用修改后的版本（保持其缩进）
      lines.push({
        lineNumber: lineNumber++,
        type: 'unchanged',
        content: originalLine as string
      });
      i++;
      j++;
    } else {
      // 查找在原始代码中是否有行与修改后的当前行匹配
      const nextMatchInOriginal = findNextMatch(originalLines, modifiedLine, i);

      // 查找在修改后代码中是否有行与原始的当前行匹配
      const nextMatchInModified = findNextMatch(modifiedLines, originalLine, j);

      if (nextMatchInOriginal !== -1 && (nextMatchInModified === -1 || nextMatchInOriginal - i <= nextMatchInModified - j)) {
        // 原始代码中有匹配行，说明中间有删除的行
        for (let k = i; k < nextMatchInOriginal; k++) {
          lines.push({
            lineNumber: lineNumber++,
            type: 'removed',
            content: originalLines[k]
          });
          stats.removed++;
        }
        i = nextMatchInOriginal;
      } else if (nextMatchInModified !== -1 && (nextMatchInOriginal === -1 || nextMatchInModified - j <= nextMatchInOriginal - i)) {
        // 修改后代码中有匹配行，说明中间有新增的行
        for (let k = j; k < nextMatchInModified; k++) {
          lines.push({
            lineNumber: lineNumber++,
            type: 'added',
            content: modifiedLines[k]
          });
          stats.added++;
        }
        j = nextMatchInModified;
      } else {
        // 没有匹配，说明当前行被修改
        if (originalLine !== null) {
          lines.push({
            lineNumber: lineNumber++,
            type: 'removed',
            content: originalLine
          });
          stats.removed++;
          i++;
        }

        if (modifiedLine !== null) {
          lines.push({
            lineNumber: lineNumber++,
            type: 'added',
            content: modifiedLine as string
          });
          stats.added++;
          j++;
        }
      }
    }
  }

  // 缩进处理
  function getIndent(s: string) {
    const m = s.match(/^\s*/);
    return m ? m[0] : '';
  }

  function applyIndent(baseIndent: string, line: string) {
    // 去掉原来的缩进，再加上基准缩进
    return baseIndent + line.replace(/^\s*/, '');
  }

  function unifyAddedIndent(lines: DiffLine[]) {
    // 预先缓存每行的“基准缩进”（来自 unchanged/removed）
    const baseIndentAt: string[] = new Array(lines.length).fill('');

    // forward：用最近的 baseline 缩进向后传播
    let lastBase = '';
    for (let idx = 0; idx < lines.length; idx++) {
      const t = lines[idx].type;
      if (t === 'unchanged' || t === 'removed') {
        lastBase = getIndent(lines[idx].content);
      }
      baseIndentAt[idx] = lastBase;
    }

    // backward：补齐那些前面没有 baseline 的 added（开头新增的情况）
    let nextBase = '';
    for (let idx = lines.length - 1; idx >= 0; idx--) {
      const t = lines[idx].type;
      if (t === 'unchanged' || t === 'removed') {
        nextBase = getIndent(lines[idx].content);
      }
      if (!baseIndentAt[idx]) baseIndentAt[idx] = nextBase;
    }

    // 最后：只改 added 行
    for (let idx = 0; idx < lines.length; idx++) {
      if (lines[idx].type === 'added') {
        const baseIndent = baseIndentAt[idx] || '';
        lines[idx].content = applyIndent(baseIndent, lines[idx].content);
      }
    }
  }

  unifyAddedIndent(lines);

  return { lines, stats };
}
  
  // 将Diff结果格式化为文本（不添加+/-前缀，只保留原始内容）
  function formatDiffWithColors(diffResult: DiffResult): string {
    const { lines } = diffResult;
    const formattedLines: string[] = [];

    for (const line of lines) {
      // 直接使用原始内容，不添加 +/- 前缀
      // 装饰（+/- 符号）会通过 CSS 在 gutter 中显示
      formattedLines.push(line.content);
    }

    return formattedLines.join('\n');
  }
  
  // 应用Diff装饰到编辑器（指定起始行号）
  function applyDiffToEditorAtPosition(editor: any, diffResult: DiffResult, startLine: number): string[] {
    const { lines } = diffResult;
    const decorations: any[] = [];

    for (const line of lines) {
      // 计算实际的行号：起始行号 + 相对行号 - 1
      const actualLineNumber = startLine + line.lineNumber - 1;
      const range = new monaco.Range(actualLineNumber, 1, actualLineNumber, 1);

      switch (line.type) {
        // 新增的行
        case 'added':
          decorations.push({
            range: range,
            options: {
              isWholeLine: true,
              className: 'diff-line-added',
              linesDecorationsClassName: 'diff-gutter-added'
            }
          });
          break;
          // 删除的行
        case 'removed':
          decorations.push({
            range: range,
            options: {
              isWholeLine: true,
              className: 'diff-line-removed',
              linesDecorationsClassName: 'diff-gutter-removed'
            }
          });
          break;
      }
    }

    // 将装饰放到编辑器里
    diffDecorations.value = editor.deltaDecorations(diffDecorations.value, decorations);
    return diffDecorations.value;
  }

  // 完整的diff流程 - 在选中位置插入diff
  function processDiff(editor:monaco.editor.IStandaloneCodeEditor | null,originalText: string, modifiedText: string ) {
    if (!editor) return null;

    // 保存原始代码和修改后的代码
    originalCode.value = originalText;
    modifiedCode.value = modifiedText;
    modifiedCodeRaw.value = modifiedText;

    // 获取当前选中的范围
    const selection = editor.getSelection();
    if (!selection) return null;

    currentSelection.value = selection;
    selectionStartLine.value = selection.startLineNumber;

    // 计算diff
    const diffResultData = computeLineLevelDiff(originalText, modifiedText);

    // 格式化diff文本
    const diffText = formatDiffWithColors(diffResultData);

    console.log('Diff text:', diffText);
    console.log('Selection:', selection);

    // 在选中位置替换为diff文本
    editor.executeEdits('diff-insert', [{
      range: selection,
      text: diffText,
      forceMoveMarkers: true
    }]);

    // 获取插入后的新范围
    const newEndLine = selectionStartLine.value + diffResultData.lines.length - 1;
    const newRange = new monaco.Range(
      selectionStartLine.value,
      1,
      newEndLine,
      editor.getModel()?.getLineMaxColumn(newEndLine) || 1
    );

    // 设置新的选中范围
    editor.setSelection(newRange);

    // 应用装饰（需要调整行号为实际编辑器中的行号）
    applyDiffToEditorAtPosition(editor, diffResultData, selectionStartLine.value);

    // 设置为只读模式
    editor.updateOptions({ readOnly: true });
    isDiffMode.value = true;

    return diffResultData;
  }

  // 完整文件 diff - 整体替换，不依赖选中区域
  function processFullDiff(editor: monaco.editor.IStandaloneCodeEditor | null, originalText: string, modifiedText: string) {
    if (!editor) return null

    const model = editor.getModel()
    if (!model) return null

    originalCode.value = originalText
    modifiedCode.value = modifiedText
    modifiedCodeRaw.value = modifiedText
    selectionStartLine.value = 1

    // 用整个文件范围模拟 selection
    const totalLines = model.getLineCount()
    const fullRange = new monaco.Range(1, 1, totalLines, model.getLineMaxColumn(totalLines))
    currentSelection.value = new monaco.Selection(1, 1, totalLines, model.getLineMaxColumn(totalLines))

    const diffResultData = computeLineLevelDiff(originalText, modifiedText)
    const diffText = formatDiffWithColors(diffResultData)

    editor.executeEdits('diff-full', [{
      range: fullRange,
      text: diffText,
      forceMoveMarkers: true
    }])

    applyDiffToEditorAtPosition(editor, diffResultData, 1)
    editor.updateOptions({ readOnly: true })
    isDiffMode.value = true

    return diffResultData
  }

  // 保存源代码
  function saveOriginalCode(code: string): void {
    originalCode.value = code;
  }

  // 还原函数
  function restoreOriginalCode(editor: monaco.editor.IStandaloneCodeEditor | null) {
    if (!editor || !currentSelection.value) return;

    const model = editor.getModel();
    if (!model) return;

    // 计算当前diff文本占用的行数
    const diffResult = computeLineLevelDiff(originalCode.value, modifiedCode.value);
    const diffLineCount = diffResult.lines.length;

    // 计算diff文本的结束行号
    const endLine = selectionStartLine.value + diffLineCount - 1;

    // 确保结束行号不超过文档总行数
    const actualEndLine = Math.min(endLine, model.getLineCount());

    // 获取结束行的最大列号
    const endColumn = model.getLineMaxColumn(actualEndLine);

    // 计算diff文本的范围
    const diffRange = new monaco.Range(
      selectionStartLine.value,
      1,
      actualEndLine,
      endColumn
    );

    console.log('Restore - diffRange:', diffRange);
    console.log('Restore - originalCode:', originalCode.value);

    // 用原始代码替换diff文本
    editor.executeEdits('restore-original', [{
      range: diffRange,
      text: originalCode.value,
      forceMoveMarkers: true
    }]);

    // 清除 diff 装饰
    diffDecorations.value = editor.deltaDecorations(diffDecorations.value, []);

    // 关闭只读
    editor.updateOptions({ readOnly: false });

    // 退出 diff 模式
    isDiffMode.value = false;
    currentSelection.value = null;
  }

  // 2. 替换为新代码（modifiedCode）
  function replaceCode(editor: monaco.editor.IStandaloneCodeEditor | null) {
    if (!editor || !currentSelection.value) return;

    const model = editor.getModel();
    if (!model) return;

    // ---- 1) 计算 diffRange（你原来的逻辑保留） ----
    const diffResult = computeLineLevelDiff(originalCode.value, modifiedCode.value);
    const diffLineCount = diffResult.lines.length;

    const endLine = selectionStartLine.value + diffLineCount - 1;
    const actualEndLine = Math.min(endLine, model.getLineCount());
    const endColumn = model.getLineMaxColumn(actualEndLine);

    const diffRange = new monaco.Range(
      selectionStartLine.value,
      1,
      actualEndLine,
      endColumn
    );

    function getIndentOfLine(lineNumber: number) {
      const line = model!.getLineContent(lineNumber);
      const m = line.match(/^\s*/);
      return m ? m[0] : '';
    }

    function stripCommonIndent(code: string) {
      const lines = code.replace(/\r\n/g, '\n').split('\n');
      const nonEmpty = lines.filter(l => l.trim().length > 0);
      if (nonEmpty.length === 0) return code;

      const minIndent = Math.min(...nonEmpty.map(l => (l.match(/^\s*/)?.[0].length ?? 0)));
      return lines
        .map(l => (l.trim().length === 0 ? l : l.slice(minIndent)))
        .join('\n');
    }

    function indentBlock(code: string, baseIndent: string) {
      const lines = code.replace(/\r\n/g, '\n').split('\n');
      return lines
        .map(l => (l.trim().length === 0 ? l : baseIndent + l))
        .join('\n');
    }

    const baseIndent = getIndentOfLine(selectionStartLine.value);
    const modifiedIndented = indentBlock(stripCommonIndent(modifiedCodeRaw.value), baseIndent);

    console.log('Replace - diffRange:', diffRange);
    console.log('Replace - modifiedIndented first line:', JSON.stringify(modifiedIndented.split('\n')[0]));
    console.log("readOnly?", editor.getOption(monaco.editor.EditorOption.readOnly));

    // ---- 3) 执行替换 ----
    editor.updateOptions({ readOnly: false });

    editor.executeEdits('replace-with-modified', [{
      range: diffRange,
      text: modifiedIndented,
      forceMoveMarkers: true
    }]);

    diffDecorations.value = editor.deltaDecorations(diffDecorations.value, []);
    isDiffMode.value = false;
    currentSelection.value = null;
  }

  return {
    // 状态
    originalCode,
    modifiedCode,
    currentSelection,
    isDiffMode,
    diffResult,
    diffDecorations,
    selectionStartLine,

    // 方法
    replaceCode,
    saveOriginalCode,
    restoreOriginalCode,
    computeLineLevelDiff,
    formatDiffWithColors,
    applyDiffToEditorAtPosition,
    processDiff,
    processFullDiff,
  };
});