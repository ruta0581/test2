window.APP_CONFIG = {
  appName: "AR名刺サイト スターター v2",

  // 開発中は公式サンプルを使っています。
  // 自分のマーカーを使うときは "./maker/targets.mind" に変更してください。
  targetFile: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/band.mind",

  // 共通の共有文
  // 各マーカーに shareText がある場合はそちらが優先されます。
  shareText: "AR名刺サイトの写真です\n#WebAR #AR名刺",

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
      id: "sample-raccoon",
      name: "サンプルマーカー A",
      targetIndex: 0,
      shareText: "サンプルマーカー A のAR写真です\n#WebAR #AR名刺 #MarkerA",
      models: [
        {
          id: "cube-blue",
          name: "ブルーキューブ",
          type: "primitive",
          primitive: "box",
          position: "0 0.3 0",
          rotation: "0 45 0",
          scale: 0.35,
          color: "#4cc3ff",
          width: 0.45,
          height: 0.45,
          depth: 0.45
        },
        {
          id: "sphere-pink",
          name: "ピンクスフィア",
          type: "primitive",
          primitive: "sphere",
          position: "0 0.35 0",
          scale: 0.35,
          color: "#ff7bb7",
          radius: 0.25
        }

        // GLB を使う場合の例
        // ,
        // {
        //   id: "dragon-model",
        //   name: "ドラゴンモデル",
        //   type: "gltf",
        //   src: "./model/dragon.glb",
        //   position: "0 0 0",
        //   rotation: "0 180 0",
        //   scale: 0.6,
        //   animationMixer: true
        // }
      ]
    },
    {
      id: "sample-bear",
      name: "サンプルマーカー B",
      targetIndex: 1,
      shareText: "サンプルマーカー B のAR写真です\n#WebAR #AR名刺 #MarkerB",
      models: [
        {
          id: "cylinder-gold",
          name: "ゴールドシリンダー",
          type: "primitive",
          primitive: "cylinder",
          position: "0 0.35 0",
          scale: 0.35,
          color: "#f6c453",
          radius: 0.18,
          height: 0.55
        },
        {
          id: "ring-green",
          name: "グリーンリング",
          type: "primitive",
          primitive: "ring",
          position: "0 0.25 0",
          rotation: "-90 0 0",
          scale: 0.55,
          color: "#65ff9f",
          radiusInner: 0.22,
          radiusOuter: 0.33
        }
      ]
    }
  ]
};
