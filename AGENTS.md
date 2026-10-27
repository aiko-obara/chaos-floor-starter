# CHAOS FLOOR Starter

新テーマは `.agents/skills/chaos-theme/SKILL.md` と `.wiki/wiki/implementation-process.md` を入口に制作する。画風・動作・来歴・加工recipe・QC・配置を一緒に管理する。現在のworldと作業差分を読み、本人の既存配置を保つ。

コード変更時は `npm run check`。画像は生成ツールで原画を作り、同梱processorは加工・QCに使う。端接触や空フレームを許容して合格にしない。具体的な動作とループ、人物の同定、接地、重なりは実画像・実ブラウザでも確認する。本人評価と機械検証を区別する。

決定・採用理由・現在地は `.wiki/` に記録。新しい外部公開やデプロイ、API課金設定は利用者の指示に基づく。初期設定はローカル編集のみで、生成APIや自動デプロイは接続されていない。
