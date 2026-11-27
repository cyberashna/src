import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = (path, dependencies = {}) => {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
};
export const readingLinks = compile('../../src/services/readingLinks.ts');
export const readingComponents = compile('../../src/components/ReadingLink.tsx', { '../services/readingLinks': readingLinks });
export const readingDependencies = { '../services/readingLinks': readingLinks, './ReadingLink': readingComponents };
