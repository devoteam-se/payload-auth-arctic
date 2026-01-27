// @ts-check

import payloadEsLintConfig from '@payloadcms/eslint-config'

const stripPerfectionistConfig = (config) => {
  const next = { ...config }

  if (next.rules) {
    next.rules = Object.fromEntries(
      Object.entries(next.rules).filter(([ruleName]) => !ruleName.startsWith('perfectionist/')),
    )
  }

  if (next.plugins && 'perfectionist' in next.plugins) {
    const { perfectionist, ...rest } = next.plugins
    next.plugins = rest
  }

  return next
}

const payloadConfigWithoutPerfectionist = payloadEsLintConfig.map(stripPerfectionistConfig)

export const defaultESLintIgnores = [
  '**/.temp',
  '**/.*', // ignore all dotfiles
  '**/.git',
  '**/.hg',
  '**/.pnp.*',
  '**/.svn',
  '**/playwright.config.ts',
  '**/vitest.config.js',
  '**/tsconfig.tsbuildinfo',
  '**/README.md',
  '**/eslint.config.js',
  '**/payload-types.ts',
  '**/dist/',
  '**/.yarn/',
  '**/build/',
  '**/node_modules/',
  '**/temp/',
]

export default [
  ...payloadConfigWithoutPerfectionist,
  {
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        projectService: {
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 40,
          allowDefaultProject: ['scripts/*.ts', '*.js', '*.mjs', '*.spec.ts', '*.d.ts'],
        },
        // projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
