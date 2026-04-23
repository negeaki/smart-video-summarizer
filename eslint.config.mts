import esbuild from 'esbuild';
import process from 'process';

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    external: [
        'obsidian',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/search',
        // 其它 CodeMirror 相关包如果有也加上，按需添加
    ],
    format: 'cjs',
    target: 'es2020',
    logLevel: 'info',
    sourcemap: prod ? false : 'inline',
    treeShaking: true,
    outfile: 'main.js',
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}