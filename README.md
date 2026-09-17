# Endless Panel Puzzle — HTML build

## 起動
`index.html` をブラウザで開いてください。サーバー不要です。

`panel_endless_standalone.html` はCSS/JS/データを1ファイルにまとめた版です。

## 操作
- カーソル: 矢印キー
- 交換: `Z` / `X` / `Space`
- 手動せり上げ: `Shift` / `C` / `Q` 長押し
- 一時停止: `P`
- スマホ: 画面下の十字キー / RAISE / SWAP

## 実装したもの
- START後の3→2→1カウントダウン（各60 updates、終了後に入力/盤面更新開始）
- 6×12盤面 + preview row
- 4-update swap transition
- 横/縦3個以上判定（交差は重複カウントしない）
- GAME LV.別の消去待ち・落下初期hold（12 / 9 / 6 updates。0になった更新で1段目、その後は毎update 1段）
- 消去後の重力とchain provenance
- コンボ/連鎖ボーナス、+10/枚、手動せり上げ開始+1
- 自動/手動せり上がり
- SPEED LV.進行（通常の物理速度上限50）
- 盤面最上段をゲームオーバーラインとする安定時top-out（clear/gravity/swap/解決中bitでは判定保留）
- 添付RNGテーブル、初期30パネル、次行生成規則

- 落下の論理タイミングはデコンパイル準拠のまま、Canvas表示のみフレーム間補間

## Web向け置換
SNESのPPU/OAM/DMA、演出VM、SPC700音声は使わず、Canvas 2DとWeb Audioの新規素材に置き換えています。

## v5 timing / falling fixes

- Falling panels still use the recovered logic timing: initial hold 12 / 9 / 6 updates by GAME LV., then one logical row per 60 Hz gameplay update.
- Canvas interpolation now stops immediately when a horizontally-swapped panel becomes support underneath a falling panel, preventing the falling panel from appearing to float one cell above its logical support.
- The recovered `clearPre`, `clearWait`, and `clearStep` values are unchanged. The supplied board model explicitly leaves the pre-clear presentation-helper gate unresolved, so the web presentation adds a 60-update (~1 second) lead-in before the confirmed clear timers to match the observed original clear duration more closely.
