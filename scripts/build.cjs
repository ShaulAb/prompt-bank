const esbuild = require('esbuild');

async function build() {
  const watch = process.argv.includes('--watch');
  const sourcemap = process.argv.includes('--sourcemap');
  const shared = { bundle: true, sourcemap, minify: !sourcemap };
  const configurations = [
    {
      ...shared,
      entryPoints: ['src/webview/promptEditor.js'],
      outfile: 'dist/promptEditor.js',
      platform: 'browser',
      format: 'iife',
      target: 'es2020',
    },
    {
      ...shared,
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/extension.js',
      external: ['vscode'],
      platform: 'node',
      format: 'cjs',
      target: 'node18',
    },
  ];
  if (watch) {
    for (const configuration of configurations) {
      const context = await esbuild.context(configuration);
      await context.watch();
    }
  } else {
    for (const configuration of configurations) await esbuild.build(configuration);
  }
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
