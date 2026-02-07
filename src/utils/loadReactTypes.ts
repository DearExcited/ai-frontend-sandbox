export async function loadReactTypes(monaco: any) {
  const [react, reactDom, jsxRuntime] = await Promise.all([
    fetch('/@types/react/index.d.ts').then(r => r.text()),
    fetch('/@types/react-dom/index.d.ts').then(r => r.text()),
    fetch('/@types/react/jsx-runtime.d.ts').then(r => r.text()),
  ]);

  // 1. 加载官方类型
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    react,
    'file:///node_modules/@types/react/index.d.ts'
  );
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    jsxRuntime,
    'file:///node_modules/@types/react/jsx-runtime.d.ts'
  );
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    reactDom,
    'file:///node_modules/@types/react-dom/index.d.ts'
  );

  // 2. 添加全局 React 类型
  const globalHelpers = `
    declare var React: any;

    // 全局钩子函数
    declare var useState: any;
    declare var useEffect: any;
    declare var useRef: any;
    declare var useCallback: any;
    declare var useMemo: any;
    declare var useReducer: any;
    declare var useContext: any;
    declare var useLayoutEffect: any;
    declare var useImperativeHandle: any;
    declare var useDebugValue: any;
    declare var useDeferredValue: any;
    declare var useTransition: any;
    declare var useId: any;

    // JSX 支持
    declare namespace JSX {
      interface Element {}
      interface IntrinsicElements {
        [elemName: string]: any;
      }
    }
    `;

  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    globalHelpers,
    'file:///global-helpers.d.ts'
  );
}