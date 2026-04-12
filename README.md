# AR名刺サイト スターター v2

変更点

- マーカー関連ファイルは `maker/`
- モデル関連ファイルは `model/`
- マーカーを認識していないときは撮影ボタンを無効化

## フォルダー構成

- `index.html`
- `app-config.js`
- `maker/`
  - `bear.png`
  - `raccoon.png`
  - `README.txt`
- `model/`
  - `README.txt`

## 今のテスト方法

今は `app-config.js` の `targetFile` が公式サンプルの `band.mind` になっています。  
`maker/` の画像を別端末やPC画面に表示して確認してください。

## 自分のマーカーに差し替えるとき

1. `maker/targets.mind` を作る
2. `app-config.js` の `targetFile` を `./maker/targets.mind` に変更
3. `markers[].targetIndex` を登録順に合わせる

## 自分のモデルに差し替えるとき

`model/` に GLB を入れて `app-config.js` を編集します。

```js
{
  id: "dragon-model",
  name: "ドラゴンモデル",
  type: "gltf",
  src: "./model/dragon.glb",
  position: "0 0 0",
  rotation: "0 180 0",
  scale: 0.6,
  animationMixer: true
}
```

## 撮影制御

マーカー未認識時:
- 撮影ボタンは無効
- 押しても撮影しない

マーカー認識時:
- 撮影ボタンが有効
- プレビューから保存と共有が可能


## マーカーごとの共有文

各マーカーごとに `shareText` を設定できます。  
撮影後のプレビューと共有時の文面は、撮影したマーカーの `shareText` を使います。  
そのマーカーに `shareText` がない場合だけ、共通の `shareText` を使います。

```js
{
  id: "business-card-main",
  name: "名刺メイン",
  targetIndex: 2,
  shareText: "名刺メインのAR写真です\n#WebAR #AR名刺",
  models: [
    {
      id: "dragon-model",
      name: "ドラゴンモデル",
      type: "gltf",
      src: "./model/dragon.glb",
      position: "0 0 0",
      rotation: "0 180 0",
      scale: 0.6,
      animationMixer: true
    }
  ]
}
```
