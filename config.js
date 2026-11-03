// ===== 設定（ここだけ書き換えればOK） =====
window.PD_CONFIG = {
  // Google Apps Script の「ウェブアプリ URL」（https://script.google.com/macros/s/..../exec）
  // 空のままだと「デモモード」で動きます（回答はこのブラウザの中だけに保存・サンプル回答つき・
  // 先生パスワードは demo・AI分類はキーワードによる簡易判定）。授業前の確認用です。
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyxGCEsLqDGidyH2dmwwd3PFCcNUCCMfY7yyeiVcAd5eoExx-qBsWpEO3LRljNqbICeFw/exec',

  // 相手の選択を見せるタイミング
  //   'end'  … 全員との対戦が終わったあとに、まとめて判決として見せる（推奨）
  //   'none' … 最後まで見せない
  // URL に ?reveal=none を付けると一時的に上書きできます。
  REVEAL: 'end',

  // 相手（コンピュータ側）が黙秘する確率。全キャラ共通。
  PARTNER_COOPERATE_P: 0.5,

  // 刑期（年）。変えたときは gas/Code.gs の PAYOFF も同じ値に（AIに渡すルール説明で使います）
  PAYOFF: { CC: 1, DC: 0, CD: 10, DD: 5 }, // CC=両方黙秘, DC=自分だけ自白, CD=自分だけ黙秘, DD=両方自白

  // 判断の理由
  MIN_REASON: 15,        // 理由の最低文字数
  ASK_EXPECT: true,      // 「相棒はどうすると思うか」も尋ねる

  // 送信後すぐに、その人の理由をAIで分類する（混み合って失敗した分は、先生モードで後からまとめて分類できます）
  AUTO_CLASSIFY: true,

  // 結果ページ
  RESULTS_GATE: true,    // まだ遊んでいない端末には結果を見せない（先生モードは除く）
  AUTO_REFRESH_SEC: 15,  // 結果ページの自動更新の間隔（秒）。0で自動更新しない

  APP_VERSION: '2.0',
};
