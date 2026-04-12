window.APP_CONFIG = {
  appName: "AR名刺サイト スターター v4",

  // 開発中は公式サンプルを使っています。
  // 自分のマーカーを使うときは "./maker/targets.mind" に変更してください。
  targetFile: "./maker/band.mind",

  // 共通の共有文
  // 各マーカーに shareText がある場合はそちらが優先されます。
  shareText: "AR名刺サイトの写真です\n#WebAR #AR名刺",

  // 画面表示設定
  ui: {
    // true で上部のデバッグ情報を表示
    // false で非表示
    showDebugInfo: true
  },

  scale: {
    min: 0.1,
    max: 5.0,
    step: 0.1,
    default: 1.0
  },

  // maker フォルダーにある targets.mind に登録した順番に targetIndex を合わせます。
  // model は将来 "./model/xxx.glb" のように指定します。
markers: [
  {
    id: "main",
    name: "名刺",
    targetIndex: 0,
    shareText: "名刺ARです\n#AR #名刺",
    models: [
      {
        id: "koiru",
        name: "コイルモデル",
        type: "gltf",
        src: "./model/koiru.glb",
        position: "0 0 0",
        rotation: "0 180 0",
        scale: 0.6,
        animationMixer: true
      }
    ]
  }
]
};
