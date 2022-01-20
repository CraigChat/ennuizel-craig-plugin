import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default ({ watch }) => [
  {
    input: 'ennuizel-craig.ts',
    output: {
      file: 'ennuizel-craig.js',
      format: 'iife',
      compact: !watch,
      sourcemap: false
    },
    plugins: [
      commonjs(),
      typescript(),
      nodeResolve({
        module: true,
        browser: true
      }),
      !watch && terser()
    ]
  }
];