# game4

ブラウザゲーム用のリポジトリ。エージェント向けスキル（Agent Skills）を同梱しています。

## インストール済みスキル

| スキル | できること | 取得元 |
| --- | --- | --- |
| `$pixelfx` | コードで描くピクセルアート VFX（244 種）とスプライトシート書き出し | [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) v0.3.1 · `5294518` · MIT |
| `$imagegen` | スプライト・テクスチャ・モックアップ等のラスター画像の生成／編集 | [openai/skills](https://github.com/openai/skills) `skills/.system/imagegen` · `49f948f` · Apache-2.0 |
| `$playwright-interactive` | 永続 Playwright セッションでローカル Web / Electron の UI を反復デバッグ | openai/skills `skills/.curated/playwright-interactive` · `49f948f` · Apache-2.0 |
| `$openai-docs` | OpenAI 製品・API の公式ドキュメント参照、モデル選定、移行ガイド | openai/skills `skills/.curated/openai-docs` · `49f948f` · Apache-2.0 |

- `.claude/skills/` … Claude Code / OpenCode
- `.agents/skills/` … Codex / Cursor / Copilot（同じ内容のミラー）
- `vendor/pixelfx/` … pixelfx のチェックアウト本体（`src/`, `tools/`, `docs/`）

各スキルは `SKILL.md` + 参照資料 + スクリプトの標準構成で、上流のファイルを改変せずに配置しています。
例外は `pixelfx` のみ: チェックアウト先が `vendor/pixelfx/` であることを示す注記と、
「clone せよ」という手順を「同梱チェックアウトを使え」に置き換えた 1 段落だけを加えています。

## 使い方

エージェントに `$pixelfx` などの名前で呼び出させます（Claude Code では `/pixelfx` でも可）。
スキルはリポジトリ直下の `SKILL.md` を自動探索するため、追加のセットアップは不要です。

pixelfx を直接叩く場合（作業ディレクトリは必ず `vendor/pixelfx/`）:

```bash
cd vendor/pixelfx
node tools/list.mjs frost              # 効果を検索
node tools/render.mjs fire/torch       # records/fire/torch/contact.png にコンタクトシートを出力
node tools/render.mjs ice/frost-nova --opts '{"palette":["#102","#215","#43a","#8cf","#fff"]}'
node tools/render.mjs ice/frost-nova --sheet   # 透過スプライトシート + Aseprite 形式 JSON
node tools/check.mjs ice/frost-nova    # はみ出し・ループ継ぎ目・乱数・速度の検査
```

依存インストールは不要（Node 18+ のみ。GIF/MP4 プレビューには ffmpeg があると便利）。
`records/` と `sheets/` は `.gitignore` 済みです。

## スキルの更新

取得元コミットは `scripts/sync-skills.mjs` の `REFS` に固定してあります。

```bash
node scripts/sync-skills.mjs             # 固定コミットから .claude/skills/ と vendor/pixelfx/ を作り直す
node scripts/sync-skills.mjs --agents    # .agents/skills/ も含めて再生成
node scripts/sync-skills.mjs --check     # SKILL.md の frontmatter（name / description / license）を検証
```

新しい版に上げるときは `REFS` のコミットを書き換えてから実行してください。
`pixelfx` の SKILL.md は上流の文面に依存して差分を当てているため、上流が変わると
`--check` ではなくシム生成時に明示的なエラーで止まります（その場合は差分箇所を直す）。

## ライセンス

同梱物はすべて上流のライセンスに従います（各スキルディレクトリの `LICENSE*` と
`vendor/pixelfx/NOTICE.md` を参照）。pixelfx の一部エフェクトは
[Hugo Duprez / Sprite Fusion](https://www.spritefusion.com/pixel-art-vfx)（MIT）由来です。
