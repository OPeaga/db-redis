import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const FEATURES = ['catalogo', 'carrinho'];

const featureBoundaryConfigs = FEATURES.map((feature) => {
  const otherFeatures = FEATURES.filter((f) => f !== feature);
  const forbiddenFeaturePatterns = otherFeatures.flatMap((other) => [
    `../${other}/**`,
    `../../${other}/**`,
    `../../../${other}/**`,
    `**/features/${other}/**`,
    `@features/${other}`,
    `@features/${other}/**`,
  ]);

  return {
    files: [`frontend/src/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbiddenFeaturePatterns,
              message:
                'Features não podem importar umas às outras. Mova código comum para frontend/src/shared.',
            },
            {
              group: ['../app/**', '../../app/**', '../../../app/**', '**/app/**', '@app/**'],
              message:
                'Features não podem importar de frontend/src/app. Passe callbacks via props.',
            },
          ],
        },
      ],
    },
  };
});

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['{shared,backend,frontend}/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Centralize chamadas HTTP em frontend/src/shared/api/http-client.ts em vez de chamar fetch diretamente.',
        },
      ],
    },
  },
  {
    files: ['backend/src/modules/*/*-controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*-repository.js', '**/*-repository'],
              message: 'Controllers falam só com services (controller -> service -> repository).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['frontend/src/shared/api/http-client.ts'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['frontend/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../features/**',
                '../../features/**',
                '../../../features/**',
                '**/features/**',
                '@features/**',
                '../app/**',
                '../../app/**',
                '../../../app/**',
                '**/app/**',
                '@app/**',
                '../pages/**',
                '../../pages/**',
                '**/pages/**',
                '@pages/**',
              ],
              message: 'frontend/src/shared deve permanecer independente de features, pages e app.',
            },
          ],
        },
      ],
    },
  },
  ...featureBoundaryConfigs
);
