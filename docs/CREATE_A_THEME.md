# 最初の新テーマを追加する

1. Codexに `$chaos-theme` とテーマを伝えます。人物・衣装・物体の同定用画像と、共通の画風用画像を分けて参照します。
2. 主役の読める行動、特徴物、小物を決めます。既存例は3×3の主役動作と小物・設備の組み合わせです。テーマに合わせて数と寸法を選びます。
3. `app/public/assets/<theme>/raw/` に原画、`prompts/` に実際の生成promptを保存します。新規recipeは `recipes/demo-robot.json` を参考に、入力・grid・補正を変更し、デモのexpectedAtlas/expectedSha256/expectedPixelSha256を外します。
4. 加工します。出力は`.local/theme-work/`で確認し、採用atlas・GIF・QC・解決済みrecipeをテーマのフォルダへ保存します。

```sh
python scripts/process_sprite_recipe.py recipes/<theme-action>.json --output .local/theme-work/<theme-action>
```

5. `app/public/assets/sample.json` のsamples配列へ、デモと同じ形式のテーマを追加します。idはテーマの識別子、actorsはatlas・columns/rows/frames・fpsまたはframeDurations・worldWidth・footAnchor・u/vを持ちます。`references`には実際の制作参照と出典を記録します。生成した絵を公式画像と偽って表示しません。
6. `npm run dev` を開き、＋から新テーマを選び、空き番地へ配置します。room JSONは一式の定義、world JSONは住所を持つ配置です。同じ素材を別番地へ置く場合も素材を複製する必要はありません。
7. 指定動作、接地、重なり、停止、参考画像と旧配置の保持を実画面で確認。「配置を保存」して再読込後も比較します。採用・差戻しの理由は`.wiki/`に残します。
8. 配置を `scripts/import_world.py` で公開用へ取り込み、`npm run check` が通ってからコミット・配布・公開へ進めます。

未接続のWeb生成APIは、このCodex経由の制作とは別工程です。自動生成・利用者管理・課金制限を実装済みとして案内しないでください。
