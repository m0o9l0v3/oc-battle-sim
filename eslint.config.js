import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      prettier,
    ],
    languageOptions: { globals: globals.browser },
  },
  // 依存方向の規則（docs/08-architecture/frontend.md §4.3 D1〜D3）
  {
    // core 層: ブラウザ・時計・乱数・通信に触れない
    files: ['src/{physics,combat,fighter,stage,battle,report,cpu,share,model}/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react-dom',
            'react-dom/*',
            '**/engine/**',
            '**/render/**',
            '**/input/**',
            '**/net/**',
            '**/assets/**',
            '**/ui/**',
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'location',
        'performance',
        'fetch',
        'localStorage',
        'sessionStorage',
        'crypto',
        'requestAnimationFrame',
        'setTimeout',
        'setInterval',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '乱数は使わない（決定性）' },
      ],
      // 時計（Date）は、値の生成も静的メソッドも使わない。時刻は引数で受け取る
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: '時計は引数で受け取る（決定性）',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: '時計は引数で受け取る（決定性）',
        },
        {
          selector: "MemberExpression[object.name='Date']",
          message: '時計は引数で受け取る（決定性）',
        },
      ],
    },
  },
  {
    // adapter 層は、app（ui）と React を知らない
    files: ['src/{engine,render,input,net,assets}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'react-dom/*', '**/ui/**'] },
      ],
    },
  },
  {
    // render は、ほかの adapter を知らない
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react-dom',
            'react-dom/*',
            '**/ui/**',
            '**/engine/**',
            '**/input/**',
            '**/net/**',
          ],
        },
      ],
    },
  },
)
