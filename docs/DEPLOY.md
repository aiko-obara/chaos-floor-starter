# Cloudflareで公開する

公開する配置は `worlds/personal/world.json`。編集した場合は先に「配置を保存」で書き出し、`python scripts/import_world.py <保存JSON>` で更新します。

```sh
npm run check
npm run build:public
cp wrangler.example.jsonc wrangler.jsonc
```

Windows PowerShellでは `Copy-Item wrangler.example.jsonc wrangler.jsonc`。wrangler.jsoncのnameを自分のサイト名へ変更し、利用者自身のCloudflareアカウントで続けます。

```sh
npx wrangler@4 login
npx wrangler@4 deploy
```

`wrangler.jsonc` は各利用者の設定としてGit管理外です。元の作者のアカウントIDや認証情報はテンプレートにありません。公開結果に表示されたURLを開き、画像・再生停止・ズーム・番地の参考画像を確認します。

この設定はWorkerの実行コード・DB・R2・生成APIを持たない静的配信です。[CloudflareのStatic Assets料金](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)では静的リクエストは無料・無制限。独自ドメインの購入、生成APIや有料サービスを後から追加する場合は別の費用です。

GitHub Actionsは検証だけを行います。自動デプロイ用のトークンは不要です。
