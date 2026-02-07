import * as monaco from 'monaco-editor'

export interface DiffLine {
  lineNumber: number;
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export interface DiffResult {
  lines: DiffLine[];
  stats: DiffStats;
}

export class DiffUtils {
  // 私有变量
  private static originalCode: string = '';
  private static diffDecorations: string[] = [];
  diffStats = false;

  // 计算行级别Diff
  static computeLineLevelDiff(originalText: string, modifiedText: string): DiffResult {
    const originalLines = originalText.split('\n');
    const modifiedLines = modifiedText.split('\n');
    
    const diffLines: DiffLine[] = [];
    const stats: DiffStats = { added: 0, removed: 0 };
    
    let i = 0, j = 0;
    let lineNumber = 1;
    
    while (i < originalLines.length || j < modifiedLines.length) {
      const originalLine = i < originalLines.length ? originalLines[i] : null;
      const modifiedLine = j < modifiedLines.length ? modifiedLines[j] : null;
      
      if (originalLine === modifiedLine) {
        // 行内容相同
        diffLines.push({
          lineNumber: lineNumber++,
          type: 'unchanged',
          content: originalLine as string
        });
        i++;
        j++;
      } else {
        // 查找在原始代码中是否有行与修改后的当前行匹配
        const nextMatchInOriginal = this.findNextMatch(originalLines, modifiedLine, i);
        
        // 查找在修改后代码中是否有行与原始的当前行匹配
        const nextMatchInModified = this.findNextMatch(modifiedLines, originalLine, j);
        
        if (nextMatchInOriginal !== -1 && (nextMatchInModified === -1 || nextMatchInOriginal - i <= nextMatchInModified - j)) {
          // 原始代码中有匹配行，说明中间有删除的行
          for (let k = i; k < nextMatchInOriginal; k++) {
            diffLines.push({
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
            diffLines.push({
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
            diffLines.push({
              lineNumber: lineNumber++,
              type: 'removed',
              content: originalLine
            });
            stats.removed++;
            i++;
          }
          
          if (modifiedLine !== null) {
            diffLines.push({
              lineNumber: lineNumber,
              type: 'added',
              content: modifiedLine as string
            });
            stats.added++;
            j++;
            lineNumber++;
          }
        }
      }
    }
    
    return { lines: diffLines, stats };
  }
  
  // 查找下一个匹配的行
  private static findNextMatch(lines: string[], targetLine: string | null, startIndex: number): number {
    if (targetLine === null) return -1;
    
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i] === targetLine) {
        return i;
      }
    }
    
    return -1;
  }
  
  // 将Diff结果格式化为带颜色标记的文本
  static formatDiffWithColors(diffResult: DiffResult): string {
    const { lines } = diffResult;
    let result = '';
    
    for (const line of lines) {
      switch (line.type) {
        case 'added':
          result += `+ ${line.content}\n`;
          break;
        case 'removed':
          result += `- ${line.content}\n`;
          break;
        case 'unchanged':
          result += `  ${line.content}\n`;
          break;
      }
    }
    
    return result;
  }
  
  // 获取Diff装饰器（用于在编辑器中高亮显示）
  static getDiffDecorations(diffResult: DiffResult, editor: any): any[] {
    const { lines } = diffResult;
    const decorations: any[] = [];
    let lineNumber = 1;
    
    for (const line of lines) {
      const range = new monaco.Range(lineNumber, 1, lineNumber, 1);
      
      switch (line.type) {
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
      
      lineNumber++;
    }
    
    return decorations;
  }
  
  // 应用Diff装饰到编辑器
  static applyDiffToEditor(editor: any, diffResult: DiffResult): string[] {
    const decorations = this.getDiffDecorations(diffResult, editor);
    this.diffDecorations = editor.deltaDecorations(this.diffDecorations, decorations);
    return this.diffDecorations;
  }
  
  // 清除Diff装饰
  static clearDiffDecorations(editor: any): void {
    if (editor && this.diffDecorations.length > 0) {
      editor.deltaDecorations(this.diffDecorations, []);
      this.diffDecorations = [];
    }
  }
  
  // 保存原始代码
  static saveOriginalCode(code: string): void {
    this.originalCode = code;
  }
  
  // 获取原始代码
  static getOriginalCode(): string {
    return this.originalCode;
  }  
  
  // 完整的Diff处理流程
  static processDiff(originalEditor: any, modifiedEditor: any): DiffResult | null {
    if (!originalEditor || !modifiedEditor) return null;
    
    const originalText = originalEditor.getValue();
    const modifiedText = modifiedEditor.getValue();
    
    // 保存原始代码
    this.saveOriginalCode(originalText);
    
    // 计算Diff
    const diffResult = this.computeLineLevelDiff(originalText, modifiedText);
    
    // 将Diff结果格式化为文本
    const diffText = this.formatDiffWithColors(diffResult);
    
    // 更新原始编辑器内容为Diff结果
    originalEditor.setValue(diffText);
    
    // 应用Diff装饰
    this.applyDiffToEditor(originalEditor, diffResult);
    
    // 设置原始编辑器为只读
    originalEditor.updateOptions({ readOnly: true });
    
    return diffResult;
  }
  
  // 恢复原始代码
  static restoreOriginalCode(editor: any): void {
    if (!editor) return;
    
    // 清除Diff装饰
    this.clearDiffDecorations(editor);
    
    // 恢复原始代码
    editor.setValue(this.getOriginalCode());
    
    // 恢复编辑器为可编辑状态
    editor.updateOptions({ readOnly: false });
  }
}