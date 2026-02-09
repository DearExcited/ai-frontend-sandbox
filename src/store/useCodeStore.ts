import { defineStore } from "pinia";
import * as monaco from 'monaco-editor';

export const useCodeStore = defineStore('codeStore', {
  state: ()=> {
    return {
      // 不用//防止之后代码被注释
      htmlCode:'<!-- Welcome to html -->',
      cssCode:'/* Welcome to css */',
      jsCode:'/* Welcome to js */',
      reactCode:'/* Welcome to react */'
    }
  },
  actions: {
    setHtmlCode(code:string) {
      this.htmlCode = code
    },
    setCssCode(code:string) {
      this.cssCode = code
    },
    setJsCode(code:string) {
      this.jsCode = code
    },
    setReactCode(code:string) {
      this.reactCode = code
    },
    saveCode(){
      console.log('保存了')
      localStorage.setItem('htmlCode', this.htmlCode)
      localStorage.setItem('cssCode', this.cssCode)
      localStorage.setItem('jsCode', this.jsCode)
      localStorage.setItem('reactCode', this.reactCode)
    },
    getLocalCode(){
      this.htmlCode = localStorage.getItem('htmlCode') || '<!-- Welcome to html -->'
      this.cssCode = localStorage.getItem('cssCode') || '/* Welcome to css */'
      this.jsCode = localStorage.getItem('jsCode') || '/* Welcome to js */'
      this.reactCode = localStorage.getItem('reactCode') || '/* Welcome to react */'
    },
    getSelectedCode(editor:monaco.editor.IStandaloneCodeEditor){
      const selection = editor.getSelection();
    
      if (!selection || selection.isEmpty()) {
          console.log('没有选中任何代码');
          return '';
      }
      
      const selectedText = editor.getModel()!.getValueInRange(selection);
      return selectedText;
    },
  }
})