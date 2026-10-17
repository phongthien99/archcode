import { readFileSync, writeFileSync } from 'node:fs';

const source = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const publishPackage = {
  name: source.name,
  version: source.version,
  type: source.type,
  description: source.description,
  license: source.license,
  main: './index.js',
  types: './index.d.ts',
  exports: {
    '.': {
      types: './index.d.ts',
      import: './index.js',
    },
    './constants': {
      types: './constants.d.ts',
      import: './constants.js',
    },
    './theme': {
      types: './render/theme.d.ts',
      import: './render/theme.js',
    },
    './tokens': {
      types: './tokens.d.ts',
      import: './tokens.js',
    },
    './schema.json': './schema/architecture.schema.json',
    './canvas': {
      types: './canvas.d.ts',
      import: './canvas.js',
    },
  },
  publishConfig: source.publishConfig,
  dependencies: source.dependencies,
};

writeFileSync(
  new URL('../dist/package.json', import.meta.url),
  `${JSON.stringify(publishPackage, null, 2)}\n`,
);
