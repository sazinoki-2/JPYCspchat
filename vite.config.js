import { defineConfig } from 'vite';

// GitHub Pages(https://ユーザー名.github.io/リポジトリ名/)のように、
// サブフォルダで公開しても動くよう、読み込むファイルの場所を相対パスにする
export default defineConfig({
  base: './',
});
