# 原画から最終atlasまでの加工レシピ

実例はリポジトリの `recipes/demo-robot.json`。新規制作はこの構造を使い、原画とpromptを用意してからレシピを書く。実行はプロジェクトルートから行う。

```sh
.venv/bin/python scripts/process_sprite_recipe.py recipes/<theme-action>.json --output .local/theme-work/<theme-action>
```

| 項目 | 意味・選択 |
|---|---|
| schemaVersion / id | 形式1と、一つの動作・小物パックを特定するID |
| processor / processorSha256 | 同梱スクリプトとそのハッシュ。省略可能なhashは解決後レシピへ自動記録 |
| input / inputSha256 / prompt | 保存済みraw PNGと実際の生成prompt。rawのhashも解決後に記録 |
| target / mode | 一般素材はasset。連続動作の既存例はidle。小物パックの既存例はprop_pack_3x3 |
| rows / cols / cellSize | 原画のグリッドと加工後の正方形セル寸法。9コマ384pxは身体の例。原画に合わない数を指定しない |
| fitScale / componentMode / sharedScale | 身体はlargestとsharedScaleが基本。複数の部品を残す機構物・小物ではallなどを選ぶ。部品を誤削除しない |
| anchorPolicy | 接地が必要ならgrounded（既定）。意図的に浮く動作はfloatingとし、動きと基準点を目視する |
| postScaleBackgroundPasses | 必要な場合だけ追加の色抜きを順序付きで記録。各要素はthresholdとedgeThreshold。生成物の色を確認して選ぶ |
| previewDurationMs | GIFの見本時間。実際の役者のframeDurations/fpsはルームJSONにも記録 |
| expectedAtlas / expectedSha256 | 過去の採用PNGを再現検証する時だけ指定。新規テーマでは両方を削除する |

出力には `atlas.png`、`final-<n>.png`、`final-animation.gif`、processor由来の `pipeline-meta.json`、追加処理を含む `recipe-resolved.json` と `qc.json` が揃う。`idle-*.png`などのprocessor直後のコマと、追加処理後のfinalコマを混同しない。QCに通った最終atlasだけを採用先へコピーする。

このラッパーは空フレーム・端接触・groundedの接地不一致を拒否する。脚の読みやすさ、人物の同定、配色・画風、動作の意味は実際の画像とGIFで確認する。加工原画は生成済み画像に限り、原画をコードで描く代替として使わない。

現ラッパーは正方形セルの作例向け。横長セルや特殊な小物では `tools/sprite-processor/generate2dsprite.py process --help` を確認し、適切な個別処理と仕上げを記録する。対応していない形式をラッパーへ無理に押し込めない。

`postScaleChromaSpillMargin`は必要な時だけ追加する背景色の縁の除去。観測ロボの作例は40です。紫の衣装など必要な色がある素材には一律適用しません。`expectedPixelSha256`がある再現例はPNG圧縮の差を除いたRGBA画素で照合します。
