import { createBundledHighlighter, createSingletonShorthands } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

const languages = {
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  csv: () => import('shiki/langs/csv.mjs'),
} as const;

const createHighlighter = createBundledHighlighter({
  langs: languages,
  themes: {
    'github-dark-default': () => import('shiki/themes/github-dark-default.mjs'),
  },
  engine: () => createJavaScriptRegexEngine(),
});

const { codeToTokens } = createSingletonShorthands(createHighlighter);

type SupportedLanguage = keyof typeof languages;

export async function tokenizeCode(code: string, language: string) {
  if (!(language in languages)) return null;
  return codeToTokens(code, {
    lang: language as SupportedLanguage,
    theme: 'github-dark-default',
  });
}
