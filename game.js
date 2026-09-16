'use strict';

(() => {
  const COLS = 6;
  const ROWS = 12;
  const CELL = 44;
  const BOARD_X = 46;
  const BOARD_Y = 54;
  const BOARD_W = COLS * CELL;
  const BOARD_H = ROWS * CELL;
  const SCORE_MAX = 99999;

  const ST_MATCHED = 0x0010;
  const ST_GRAVITY = 0x0040;
  const ST_PROVENANCE = 0x0200;
  const ST_CHAINED = 0x0400;
  const PN_SWAP = 0x0100;

  const DIFFICULTY = [
    { colors: 5, clearPre: 22, clearWait: 22, clearStep: 8, fallHold: 12, rowRule: 0 },
    { colors: 6, clearPre: 18, clearWait: 17, clearStep: 7, fallHold: 9, rowRule: 1 },
    { colors: 6, clearPre: 14, clearWait: 12, clearStep: 6, fallHold: 6, rowRule: 2 },
  ];

  const COMBO_BONUS = [
    0,0,0,0,20,30,50,60,70,80,100,140,170,210,250,290,
    340,390,440,490,550,610,680,750,820,900,980,1060,1150,1240,1330,
  ];
  const CHAIN_BONUS = [0,50,80,150,300,400,500,700,900,1100,1300,1500,1800,0];

  const PANEL_COLORS = [
    null,
    ['#ff4f64','#c82042'],
    ['#4e8cff','#2056bf'],
    ['#58d66f','#198e47'],
    ['#ffd34d','#c58b13'],
    ['#b56cff','#6e39ba'],
    ['#ff8d3d','#c54d17'],
  ];

  function newCell(color = 0) {
    return { color, state: 0, timer: 0, panelFlags: 0, pop: false, popOrder: 0, presented: false };
  }

  function hashSeed(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  class PrimaryRng {
    constructor(seedText = '') {
      const h = hashSeed(seedText || String(Date.now()) + ':' + Math.random());
      this.index = h & 0x07ff;
      this.epoch = (h >>> 11) & 0xffff;
    }
    next() {
      this.index = (this.index + 1) & 0x07ff;
      if (this.index === 0) this.epoch = (this.epoch + 1) & 0xffff;
      return (RNG_TABLE[this.index] + this.epoch) & 0xff;
    }
    masked(mask) { return this.next() & mask; }
  }

  class SoundBank {
    constructor() { this.ctx = null; this.enabled = true; }
    ensure() {
      if (!this.enabled) return null;
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    tone(freq, dur = 0.05, gain = 0.045, type = 'square', delay = 0) {
      const ctx = this.ensure(); if (!ctx) return;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + dur + 0.01);
    }
    move() { this.tone(520, 0.025, 0.018, 'square'); }
    swap() { this.tone(720, 0.045, 0.025, 'square'); }
    clear(n) { this.tone(660 + Math.min(n, 10) * 24, 0.075, 0.035, 'triangle'); }
    chain(n) { this.tone(760 + Math.min(n, 10) * 32, 0.12, 0.05, 'sine'); }
    level() { this.tone(880,0.07,0.03,'square'); this.tone(1100,0.08,0.03,'square',0.06); }
    count(n) { this.tone(n===1 ? 760 : 620, 0.09, 0.035, 'square'); }
    go() { this.tone(940,0.11,0.045,'square'); this.tone(1180,0.12,0.035,'square',0.06); }
    over() { this.tone(180,0.18,0.06,'sawtooth'); this.tone(120,0.28,0.055,'sawtooth',0.15); }
  }

  class EndlessGame {
    constructor(canvas, sound) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.sound = sound;
      this.reset(0, 1, '');
      this.started = false;
    }

    reset(gameLevel, speedLevel, seedText) {
      this.gameLevel = Math.max(0, Math.min(2, gameLevel | 0));
      this.cfg = DIFFICULTY[this.gameLevel];
      this.board = Array.from({length: ROWS}, () => Array.from({length: COLS}, () => newCell()));
      this.preview = Array(COLS).fill(0);
      this.rng = new PrimaryRng(seedText);
      this.seedLabel = seedText || 'random';
      this.rowAlternate = false;
      this.score = 0;
      this.displayedSpeed = Math.max(1, Math.min(99, speedLevel | 0));
      this.physicalSpeed = Math.min(50, this.displayedSpeed);
      this.riseSpeedQ12 = RISE_SPEED_Q12[this.physicalSpeed - 1];
      this.clearsToSpeed = CLEARS_TO_NEXT[this.physicalSpeed - 1];
      this.risePhase = 0;
      this.riseState = 0;
      this.risePixelsLeft = 16;
      this.manualRise = false;
      this.visibleScroll = 0;
      this.swapActive = false;
      this.swapCounter = 0;
      this.swapPair = null;
      this.gravityActive = false;
      this.clearEvents = [];
      this.matchRecheck = false;
      this.chainIndex = 0;
      this.chainedMatchThisPass = false;
      this.cursorRow = ROWS - 2;
      this.cursorCol = 2;
      this.gameOver = false;
      this.paused = false;
      this.started = false;
      this.countdownFrames = 0;
      this.countdownValue = 0;
      this.frame = 0;
      this.flash = 0;
      this.message = '';
      this.messageTimer = 0;
      this.stats = { maxChain: 1, maxCombo: 0, cleared: 0 };

      this.startupPresentationRng();
      this.buildInitialBoard();
      this.generatePreviewRow();
      this.riseState = 1;
      this.matchRecheck = true;
    }

    startupPresentationRng() {
      let n = 0;
      do { n = this.rng.masked(0x0f); } while (n === 0 || n > 6);
    }

    beginCountdown() {
      this.started = false;
      this.paused = false;
      this.countdownFrames = 180; // 3, 2, 1: one 60 Hz second each.
      this.countdownValue = 3;
      this.sound.count(3);
    }

    scoreAdd(n) { this.score = Math.min(SCORE_MAX, this.score + n); }

    chooseInitialTemplate() {
      let t;
      do { t = this.rng.masked(0x0f); } while (t >= 14);
      return t;
    }

    nextInitialColor(last, left) {
      for (;;) {
        const c = this.rng.masked(0x0f);
        if (c === 0 || c > this.cfg.colors || c === last || c === left) continue;
        return c;
      }
    }

    buildInitialBoard() {
      const heights = INITIAL_HEIGHTS[this.chooseInitialTemplate()];
      let last = 1;
      for (let c = 0; c < COLS; c++) {
        for (let dy = 0; dy < heights[c]; dy++) {
          const r = ROWS - 1 - dy;
          const left = c > 0 ? this.board[r][c-1].color : 0;
          const color = this.nextInitialColor(last, left);
          this.board[r][c] = newCell(color);
          last = color;
        }
      }
    }

    generatePreviewRow() {
      let rejectLeft = this.cfg.rowRule === 2;
      if (this.cfg.rowRule === 1) rejectLeft = this.rowAlternate;
      for (let c = 0; c < COLS; c++) {
        const above = this.board[ROWS-1][c].color;
        const left1 = c >= 1 ? this.preview[c-1] : 0;
        const left2 = c >= 2 ? this.preview[c-2] : 0;
        for (;;) {
          const n = this.rng.masked(0xff) & 7;
          if (n === 0 || n > this.cfg.colors) continue;
          if (n === above) continue;
          if (rejectLeft && n === left1) continue;
          if (!rejectLeft && n === left2) continue;
          this.preview[c] = n;
          break;
        }
      }
      this.rowAlternate = !this.rowAlternate;
    }

    commonLock() {
      return this.clearEvents.some(e => e.active) || this.gravityActive || this.swapActive;
    }

    moveCursor(dx, dy) {
      if (!this.started || this.gameOver || this.paused) return;
      const nr = Math.max(0, Math.min(ROWS-1, this.cursorRow + dy));
      const nc = Math.max(0, Math.min(COLS-2, this.cursorCol + dx));
      if (nr !== this.cursorRow || nc !== this.cursorCol) this.sound.move();
      this.cursorRow = nr; this.cursorCol = nc;
    }

    trySwap() {
      if (!this.started || this.gameOver || this.paused || this.swapActive) return false;
      const r = this.cursorRow, c = this.cursorCol;
      const a = this.board[r][c], b = this.board[r][c+1];
      if ((a.state | b.state) & ST_MATCHED) return false;
      if (a.timer || b.timer) return false;
      if (!a.color && !b.color) return false;
      const tmp = this.board[r][c]; this.board[r][c] = this.board[r][c+1]; this.board[r][c+1] = tmp;
      if (this.board[r][c].color) this.board[r][c].panelFlags |= PN_SWAP;
      if (this.board[r][c+1].color) this.board[r][c+1].panelFlags |= PN_SWAP;
      this.swapActive = true;
      this.swapCounter = 4;
      this.swapPair = { r, c, startCounter: 4 };
      this.sound.swap();
      return true;
    }

    updateSwap() {
      if (!this.swapActive) return;
      this.swapCounter--;
      if (this.swapCounter > 0) return;
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) this.board[r][c].panelFlags &= ~PN_SWAP;
      this.swapActive = false;
      this.swapPair = null;
      this.prepareUnsupported(false);
      this.matchRecheck = true;
    }

    prepareUnsupported(chainProvenance) {
      // Once a gap exists in a column, the ordinary stack above it is prepared to fall.
      // This mirrors the decompile's behavior of preparing panels above a removed support.
      for (let c=0;c<COLS;c++) {
        let gapBelow = !this.board[ROWS-1][c].color;
        for (let r=ROWS-2;r>=0;r--) {
          const cell = this.board[r][c];
          if (!cell.color) { gapBelow = true; continue; }
          if ((cell.state & ST_MATCHED) || (cell.panelFlags & PN_SWAP)) { gapBelow = false; continue; }
          if (gapBelow) {
            cell.state |= ST_GRAVITY;
            if (chainProvenance) cell.state |= ST_PROVENANCE;
            if (cell.timer === 0) cell.timer = this.cfg.fallHold;
          }
        }
      }
    }

    updateGravity() {
      let seen = false;
      for (let r=ROWS-2;r>=0;r--) {
        for (let c=0;c<COLS;c++) {
          const cell = this.board[r][c];
          if (!cell.color || !(cell.state & ST_GRAVITY) || (cell.panelFlags & PN_SWAP)) continue;
          seen = true;
          if (cell.timer > 0) {
            cell.timer--;
            if (cell.timer > 0) continue;
          }
          if (!this.board[r+1][c].color) {
            this.board[r+1][c] = cell;
            this.board[r][c] = newCell();
          } else {
            cell.state &= ~ST_GRAVITY;
            this.matchRecheck = true;
          }
        }
      }
      // A bottom-row gravity flag (rare after shifts) lands immediately.
      for (let c=0;c<COLS;c++) {
        const cell = this.board[ROWS-1][c];
        if (cell.color && (cell.state & ST_GRAVITY)) {
          seen = true;
          cell.state &= ~ST_GRAVITY;
          this.matchRecheck = true;
        }
      }
      this.gravityActive = seen;
    }

    matchKey(cell) {
      if (!cell.color) return 0;
      if (cell.state & (ST_MATCHED | ST_GRAVITY)) return 0;
      if (cell.panelFlags & PN_SWAP) return 0;
      return cell.color;
    }

    findMatches() {
      const key = this.board.map(row => row.map(cell => this.matchKey(cell)));
      const mark = Array.from({length:ROWS},()=>Array(COLS).fill(false));
      for (let r=0;r<ROWS;r++) {
        let c=0;
        while(c<COLS) {
          const k=key[r][c]; let e=c+1;
          while(k && e<COLS && key[r][e]===k) e++;
          if (k && e-c>=3) for(let x=c;x<e;x++) mark[r][x]=true;
          c=e;
        }
      }
      for (let c=0;c<COLS;c++) {
        let r=0;
        while(r<ROWS) {
          const k=key[r][c]; let e=r+1;
          while(k && e<ROWS && key[e][c]===k) e++;
          if (k && e-r>=3) for(let y=r;y<e;y++) mark[y][c]=true;
          r=e;
        }
      }
      const cells=[]; let chainContinuation=false;
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(mark[r][c]) {
        const cell=this.board[r][c];
        if (cell.state & ST_MATCHED) continue;
        cell.state |= ST_MATCHED;
        if (cell.state & ST_PROVENANCE) { cell.state |= ST_CHAINED; chainContinuation=true; }
        cells.push({r,c});
      }
      return { any: cells.length>0, cells, count: cells.length, chainContinuation };
    }

    comboBonus(n) {
      if (n <= 30) return COMBO_BONUS[n] || 0;
      // Preserve the documented 31..35 quirk values, but saturating score makes them harmless enough.
      return [0,33301,33307,33313,33319][Math.min(35,n)-31] || 0;
    }

    chainBonus(index) {
      if (index >= 14) index = 13;
      return CHAIN_BONUS[index] || 0;
    }

    allocateClearEvent(match) {
      if (!match.any) return;
      const e = {
        active:true, state:0, pre:this.cfg.clearPre, wait:0, step:0,
        presentIndex:0, matchedCount:Math.min(35, match.count), cells:match.cells.slice(0,35),
      };
      this.clearEvents.push(e);
      this.scoreAdd(this.comboBonus(e.matchedCount));
      this.stats.maxCombo = Math.max(this.stats.maxCombo, e.matchedCount);
      if (match.chainContinuation) {
        const chainNo = this.chainIndex + 2;
        this.scoreAdd(this.chainBonus(this.chainIndex + 1));
        this.stats.maxChain = Math.max(this.stats.maxChain, chainNo);
        this.message = `${chainNo} CHAIN`;
        this.messageTimer = 60;
        this.sound.chain(chainNo);
      } else if (e.matchedCount >= 4) {
        this.message = `${e.matchedCount} COMBO`;
        this.messageTimer = 45;
      }
      this.sound.clear(e.matchedCount);
      this.chainedMatchThisPass = match.chainContinuation;
    }

    onPanelClear() {
      this.scoreAdd(10);
      this.stats.cleared++;
      if (this.clearsToSpeed > 0) this.clearsToSpeed--;
      if (this.clearsToSpeed !== 0) return;
      if (this.displayedSpeed < 99) this.displayedSpeed++;
      if (this.physicalSpeed < 50) this.physicalSpeed++;
      this.riseSpeedQ12 = RISE_SPEED_Q12[this.physicalSpeed - 1];
      this.clearsToSpeed = CLEARS_TO_NEXT[this.physicalSpeed - 1];
      this.message = `SPEED ${this.displayedSpeed}`;
      this.messageTimer = 55;
      this.sound.level();
    }

    deleteClearBatch(e) {
      const cleared = e.cells.slice();
      for (const {r,c} of cleared) this.board[r][c] = newCell();
      // $82:EC34 semantics: for every removed support, prepare eligible panels above
      // with both gravity and chain-provenance bits.
      for (const {r: holeRow, c} of cleared) {
        for (let r=holeRow-1;r>=0;r--) {
          const cell=this.board[r][c];
          if (!cell.color) continue;
          if ((cell.state & ST_MATCHED) || (cell.panelFlags & PN_SWAP) || (cell.state & ST_GRAVITY)) break;
          cell.state |= ST_PROVENANCE | ST_GRAVITY;
          cell.timer = this.cfg.fallHold;
        }
      }
    }

    updateClearEvents() {
      for (const e of this.clearEvents) {
        if (!e.active) continue;
        if (e.state===0) { e.pre=this.cfg.clearPre; e.state=1; continue; }
        if (e.state===1) { e.state=2; continue; }
        if (e.state===2) {
          if (e.pre>0) e.pre--;
          if (e.pre===0) { e.wait=this.cfg.clearWait; e.state=3; }
          continue;
        }
        if (e.state===3) {
          if (e.wait>0) e.wait--;
          if (e.wait===0) { e.step=0; e.state=4; }
          continue;
        }
        if (e.state===4) {
          if (e.step>0) { e.step--; continue; }
          e.step=this.cfg.clearStep;
          if (e.presentIndex < e.matchedCount) {
            const p=e.cells[e.presentIndex];
            const cell=this.board[p.r]?.[p.c];
            if (cell && cell.color) {
              // The ROM keeps the logical cell until the whole clear batch finishes,
              // but its per-panel presentation advances here. Hide it from the board
              // at this exact presentation tick so the visible disappearance cadence
              // follows clear_step (8/7/6) instead of looking like one final batch pop.
              cell.pop=true; cell.popOrder=e.presentIndex+1; cell.presented=true;
            }
            e.presentIndex++;
            this.onPanelClear();
          }
          if (e.presentIndex>=e.matchedCount) { this.deleteClearBatch(e); e.state=5; }
          continue;
        }
        if (e.state===5) e.active=false;
      }
      this.clearEvents = this.clearEvents.filter(e=>e.active);
    }

    resolveChain() {
      let active=false;
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
        const cell=this.board[r][c];
        if (!(cell.state & (ST_GRAVITY|ST_PROVENANCE|ST_CHAINED))) continue;
        active=true;
        if ((cell.state & (ST_GRAVITY|ST_PROVENANCE|ST_CHAINED)) === ST_PROVENANCE) {
          const supportSwap = r+1<ROWS && (this.board[r+1][c].panelFlags & PN_SWAP);
          if (!supportSwap) cell.state &= ~ST_PROVENANCE;
        }
      }
      if (active) {
        if (this.chainedMatchThisPass) this.chainIndex = Math.min(23, this.chainIndex+1);
      } else if (this.chainIndex) {
        this.chainIndex=0;
      }
      this.chainedMatchThisPass=false;
    }

    updateRise(raiseHeld) {
      if (this.commonLock()) return;
      if (this.riseState===0) {
        this.generatePreviewRow();
        this.risePixelsLeft=16;
        this.riseState=1;
        return;
      }
      if (this.riseState===1) {
        if (raiseHeld || this.manualRise) {
          if (!this.manualRise) this.scoreAdd(1);
          this.manualRise=true;
          this.risePhase=this.riseSpeedQ12;
          this.riseState=2;
          return;
        }
        this.risePhase = (this.risePhase - this.riseSpeedQ12) & 0xffff;
        if (this.risePhase & 0x8000) this.riseState=2;
        return;
      }
      if (this.riseState===2) {
        if (this.risePixelsLeft>0) this.risePixelsLeft--;
        this.visibleScroll++;
        if (this.risePixelsLeft===0) {
          this.risePhase=(this.risePhase+0x1000)&0xffff;
          this.riseState=3;
        } else if (!this.manualRise) {
          this.risePhase=(this.risePhase+0x1000)&0xffff;
          this.riseState=1;
        }
        return;
      }
      if (this.riseState===3) {
        for(let r=0;r<ROWS-1;r++) for(let c=0;c<COLS;c++) this.board[r][c]=this.board[r+1][c];
        for(let c=0;c<COLS;c++) this.board[ROWS-1][c]=newCell(this.preview[c]);
        this.preview.fill(0);
        this.manualRise=false;
        this.risePixelsLeft=16;
        this.riseState=0;
        this.cursorRow=Math.max(0,this.cursorRow-1);
        this.matchRecheck=true;
      }
    }

    topOutCheck() {
      if (this.commonLock()) return;
      if (this.board[0].some(cell => cell.color && !(cell.state & ST_GRAVITY))) {
        this.gameOver=true;
        this.message='GAME OVER'; this.messageTimer=999999;
        this.sound.over();
      }
    }

    update(input) {
      if (this.countdownFrames > 0) {
        this.frame++;
        this.countdownFrames--;
        const next = Math.ceil(this.countdownFrames / 60);
        if (next > 0 && next !== this.countdownValue) {
          this.countdownValue = next;
          this.sound.count(next);
        }
        if (this.countdownFrames === 0) {
          this.countdownValue = 0;
          this.started = true;
          this.sound.go();
        }
        return;
      }
      if (!this.started) return;
      if (this.gameOver) return;
      if (this.paused) return;
      this.frame++;
      if (this.messageTimer>0) this.messageTimer--;
      if (this.flash>0) this.flash--;

      // ROM order: rise uses lock from previous activity, then board worker updates gravity/input/swap/matches/clear.
      this.updateRise(input.raiseHeld);
      this.updateGravity();
      if (input.swapPressed) this.trySwap();
      this.updateSwap();

      if (this.matchRecheck) {
        this.matchRecheck=false;
        const m=this.findMatches();
        if (m.any) this.allocateClearEvent(m);
      }
      this.updateClearEvents();
      this.resolveChain();
      this.gravityActive = this.board.some(row => row.some(c => c.state & ST_GRAVITY));
      this.topOutCheck();
    }

    riseOffset() { return 16 - this.risePixelsLeft; }

    drawPanel(ctx, x, y, colorId, scale=1, alpha=1, pop=false) {
      if (!colorId) return;
      const [c1,c2]=PANEL_COLORS[colorId];
      const size=CELL*scale, pad=3*scale, rr=8*scale;
      ctx.save(); ctx.globalAlpha=alpha;
      if (pop) { const pulse=1+0.08*Math.sin(this.frame*0.7); ctx.translate(x+size/2,y+size/2); ctx.scale(pulse,pulse); x=-size/2; y=-size/2; }
      const grad=ctx.createLinearGradient(x,y,x,y+size);
      grad.addColorStop(0,c1); grad.addColorStop(1,c2);
      roundRect(ctx,x+pad,y+pad,size-pad*2,size-pad*2,rr);
      ctx.fillStyle=grad; ctx.fill();
      ctx.lineWidth=2*scale; ctx.strokeStyle='rgba(255,255,255,.65)'; ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.9)';
      ctx.strokeStyle='rgba(20,18,45,.35)'; ctx.lineWidth=2*scale;
      const cx=x+size/2, cy=y+size/2;
      drawSymbol(ctx,colorId,cx,cy,12*scale);
      ctx.restore();
    }

    render() {
      const ctx=this.ctx;
      const W=this.canvas.width,H=this.canvas.height;
      ctx.clearRect(0,0,W,H);
      drawBackdrop(ctx,W,H,this.frame);
      drawHudFrame(ctx);

      ctx.save();
      ctx.beginPath(); ctx.rect(BOARD_X,BOARD_Y,BOARD_W,BOARD_H); ctx.clip();
      const rise = this.riseOffset() * (CELL/16);
      drawBoardGrid(ctx, rise);

      // Preview row appears from below as the stack rises.
      for(let c=0;c<COLS;c++) {
        const x=BOARD_X+c*CELL, y=BOARD_Y+ROWS*CELL-rise;
        this.drawPanel(ctx,x,y,this.preview[c],1,0.78,false);
      }
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
        const cell=this.board[r][c]; if(!cell.color || cell.presented) continue;
        let x=BOARD_X+c*CELL, y=BOARD_Y+r*CELL-rise;
        if (this.swapActive && this.swapPair && this.swapPair.r===r && (c===this.swapPair.c || c===this.swapPair.c+1)) {
          const t=(4-this.swapCounter)/4;
          const ease=1-Math.pow(1-Math.min(1,t),3);
          if(c===this.swapPair.c) x += CELL*(1-ease);
          else x -= CELL*(1-ease);
        }
        let alpha=1;
        if (cell.state & ST_MATCHED) alpha=0.78+0.22*Math.sin(this.frame*0.55);
        if (cell.pop) alpha=0.45+0.55*Math.abs(Math.sin(this.frame*0.75));
        this.drawPanel(ctx,x,y,cell.color,1,alpha,cell.pop);
        if (cell.state & ST_PROVENANCE) {
          ctx.fillStyle='rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(x+CELL-8,y+8,3,0,Math.PI*2); ctx.fill();
        }
      }
      ctx.restore();

      // Board border & danger line.
      ctx.strokeStyle='rgba(255,255,255,.88)'; ctx.lineWidth=3; roundRect(ctx,BOARD_X-4,BOARD_Y-4,BOARD_W+8,BOARD_H+8,12); ctx.stroke();
      ctx.strokeStyle='rgba(255,95,115,.75)'; ctx.lineWidth=2; ctx.setLineDash([8,6]);
      ctx.beginPath(); ctx.moveTo(BOARD_X,BOARD_Y+CELL); ctx.lineTo(BOARD_X+BOARD_W,BOARD_Y+CELL); ctx.stroke(); ctx.setLineDash([]);

      // Cursor moves with the scrolling stack.
      const cx=BOARD_X+this.cursorCol*CELL;
      const cy=BOARD_Y+this.cursorRow*CELL-rise;
      ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.shadowColor='rgba(255,255,255,.7)'; ctx.shadowBlur=8;
      roundRect(ctx,cx-2,cy-2,CELL*2+4,CELL+4,9); ctx.stroke(); ctx.shadowBlur=0;
      ctx.fillStyle='rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.moveTo(cx+CELL-6,cy-10); ctx.lineTo(cx+CELL+6,cy-10); ctx.lineTo(cx+CELL,cy-3); ctx.closePath(); ctx.fill();

      drawHudText(ctx,this);
      if (this.messageTimer>0) drawMessage(ctx,this.message,this.frame);
      if (this.countdownFrames > 0) drawCountdown(ctx,this.countdownValue,this.frame);
      else if (!this.started) drawOverlay(ctx,'READY','START を押すと開始');
      else if (this.paused) drawOverlay(ctx,'PAUSED','P / ⏸ で再開');
      if (this.gameOver) drawOverlay(ctx,'GAME OVER','NEW GAME で再挑戦');
    }
  }

  function roundRect(ctx,x,y,w,h,r) {
    r=Math.min(r,w/2,h/2); ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }

  function drawSymbol(ctx,id,cx,cy,s) {
    ctx.beginPath();
    if(id===1) { ctx.moveTo(cx,cy-s); ctx.lineTo(cx+s,cy); ctx.lineTo(cx,cy+s); ctx.lineTo(cx-s,cy); ctx.closePath(); }
    if(id===2) { ctx.arc(cx,cy,s,0,Math.PI*2); ctx.moveTo(cx+s*.45,cy); ctx.arc(cx,cy,s*.45,0,Math.PI*2,true); }
    if(id===3) { for(let i=0;i<8;i++){const a=-Math.PI/2+i*Math.PI/4; const rr=i%2? s*.45:s; const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr; i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.closePath(); }
    if(id===4) { ctx.moveTo(cx,cy-s); ctx.lineTo(cx+s*.9,cy+s*.75); ctx.lineTo(cx-s*.9,cy+s*.75); ctx.closePath(); }
    if(id===5) { for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3; const x=cx+Math.cos(a)*s,y=cy+Math.sin(a)*s; i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.closePath(); }
    if(id===6) { ctx.moveTo(cx-s*.25,cy-s); ctx.lineTo(cx+s*.55,cy-s*.18); ctx.lineTo(cx+s*.12,cy-s*.18); ctx.lineTo(cx+s*.38,cy+s); ctx.lineTo(cx-s*.55,cy+s*.05); ctx.lineTo(cx-s*.08,cy+s*.05); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
  }

  function drawBackdrop(ctx,w,h,frame) {
    const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#171638'); g.addColorStop(1,'#0a0c20'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=.18;
    for(let i=0;i<28;i++) {
      const x=(i*97 + frame*.12*(1+i%3))%w; const y=(i*53 + 70*Math.sin(i*1.7))%h;
      ctx.fillStyle=i%2?'#7ad7ff':'#da9cff'; ctx.beginPath(); ctx.arc(x,y,1.5+(i%3),0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  function drawBoardGrid(ctx,rise) {
    ctx.fillStyle='rgba(8,10,30,.72)'; ctx.fillRect(BOARD_X,BOARD_Y,BOARD_W,BOARD_H);
    ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.lineWidth=1;
    for(let c=0;c<=COLS;c++){ctx.beginPath();ctx.moveTo(BOARD_X+c*CELL,BOARD_Y);ctx.lineTo(BOARD_X+c*CELL,BOARD_Y+BOARD_H);ctx.stroke();}
    for(let r=-1;r<=ROWS+1;r++){const y=BOARD_Y+r*CELL-rise;ctx.beginPath();ctx.moveTo(BOARD_X,y);ctx.lineTo(BOARD_X+BOARD_W,y);ctx.stroke();}
  }

  function drawHudFrame(ctx) {
    const x=344,y=54,w=310,h=528;
    ctx.fillStyle='rgba(18,18,48,.78)'; roundRect(ctx,x,y,w,h,18); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=2; ctx.stroke();
  }

  function drawHudText(ctx,g) {
    ctx.textBaseline='top';
    ctx.fillStyle='#aab4ff'; ctx.font='700 14px system-ui,sans-serif'; ctx.fillText('ENDLESS / WEB REBUILD',370,82);
    ctx.fillStyle='#fff'; ctx.font='800 42px system-ui,sans-serif'; ctx.fillText(String(g.score).padStart(5,'0'),370,111);
    ctx.fillStyle='#7581ad'; ctx.font='700 12px system-ui,sans-serif'; ctx.fillText('SCORE',370,157);

    info(ctx,'GAME LV.',String(g.gameLevel+1),370,205);
    info(ctx,'SPEED LV.',String(g.displayedSpeed),500,205);
    info(ctx,'NEXT SPEED',String(g.clearsToSpeed),370,277);
    info(ctx,'CLEARED',String(g.stats.cleared),500,277);
    info(ctx,'MAX CHAIN',`${g.stats.maxChain}x`,370,349);
    info(ctx,'MAX COMBO',String(g.stats.maxCombo),500,349);

    ctx.fillStyle='#d6daf4'; ctx.font='700 13px system-ui,sans-serif'; ctx.fillText('KEYBOARD',370,435);
    ctx.fillStyle='#9199bd'; ctx.font='600 12px system-ui,sans-serif';
    ctx.fillText('← ↑ ↓ →  カーソル',370,463);
    ctx.fillText('Z / X / Space  交換',370,486);
    ctx.fillText('Shift / C / Q  せり上げ',370,509);
    ctx.fillText('P  一時停止',370,532);
  }

  function info(ctx,label,value,x,y){ctx.fillStyle='#7581ad';ctx.font='700 11px system-ui,sans-serif';ctx.fillText(label,x,y);ctx.fillStyle='#fff';ctx.font='800 26px system-ui,sans-serif';ctx.fillText(value,x,y+17);}

  function drawMessage(ctx,text,frame) {
    if (!text) return;
    const pulse=1+0.035*Math.sin(frame*.25);
    ctx.save();ctx.translate(BOARD_X+BOARD_W/2,BOARD_Y+BOARD_H*.34);ctx.scale(pulse,pulse);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 34px system-ui,sans-serif';
    ctx.lineWidth=8;ctx.strokeStyle='rgba(15,10,35,.8)';ctx.strokeText(text,0,0);ctx.fillStyle='#fff4a8';ctx.fillText(text,0,0);ctx.restore();
  }

  function drawOverlay(ctx,title,sub) {
    ctx.fillStyle='rgba(6,7,20,.72)';ctx.fillRect(BOARD_X,BOARD_Y,BOARD_W,BOARD_H);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 34px system-ui,sans-serif';ctx.fillStyle='#fff';ctx.fillText(title,BOARD_X+BOARD_W/2,BOARD_Y+BOARD_H/2-18);
    ctx.font='700 13px system-ui,sans-serif';ctx.fillStyle='#b8bfdc';ctx.fillText(sub,BOARD_X+BOARD_W/2,BOARD_Y+BOARD_H/2+24);ctx.textAlign='start';ctx.textBaseline='alphabetic';
  }

  function drawCountdown(ctx,value,frame) {
    ctx.fillStyle='rgba(6,7,20,.48)';ctx.fillRect(BOARD_X,BOARD_Y,BOARD_W,BOARD_H);
    const local=(frame%60)/60;
    const scale=1.18-0.18*Math.min(1,local*3);
    ctx.save();
    ctx.translate(BOARD_X+BOARD_W/2,BOARD_Y+BOARD_H/2);
    ctx.scale(scale,scale);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='900 96px system-ui,sans-serif';
    ctx.lineWidth=12;ctx.strokeStyle='rgba(16,12,44,.85)';ctx.strokeText(String(value),0,0);
    ctx.fillStyle='#fff4a8';ctx.fillText(String(value),0,0);
    ctx.restore();
  }

  // Boot / input -----------------------------------------------------------
  const canvas=document.getElementById('game');
  const sound=new SoundBank();
  const game=new EndlessGame(canvas,sound);
  const input={swapPressed:false,raiseHeld:false};
  const held=new Set();

  function restartFromUi() {
    const gl=Number(document.getElementById('gameLevel').value)-1;
    const sp=Number(document.getElementById('speedLevel').value);
    const seed=document.getElementById('seed').value.trim();
    game.reset(gl,sp,seed);
    document.getElementById('startPanel').classList.add('compact');
    sound.ensure();
    game.beginCountdown();
  }

  document.getElementById('startBtn').addEventListener('click',restartFromUi);
  document.getElementById('restartBtn').addEventListener('click',()=>{
    game.started=false;
    game.countdownFrames=0;
    game.countdownValue=0;
    game.paused=false;
    input.swapPressed=false;
    input.raiseHeld=false;
    held.clear();
    document.getElementById('startPanel').classList.remove('compact');
  });
  document.getElementById('soundBtn').addEventListener('click',()=>{
    sound.enabled=!sound.enabled;
    document.getElementById('soundBtn').textContent=sound.enabled?'SOUND: ON':'SOUND: OFF';
  });
  document.getElementById('pauseBtn').addEventListener('click',()=>{ if(game.started && !game.gameOver) game.paused=!game.paused; });

  function keyAction(e,down) {
    const code=e.code;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyZ','KeyX','ShiftLeft','ShiftRight','KeyC','KeyQ','KeyP'].includes(code)) e.preventDefault();
    if (down) held.add(code); else held.delete(code);
    if (down) {
      if(code==='ArrowLeft') game.moveCursor(-1,0);
      else if(code==='ArrowRight') game.moveCursor(1,0);
      else if(code==='ArrowUp') game.moveCursor(0,-1);
      else if(code==='ArrowDown') game.moveCursor(0,1);
      else if(['Space','KeyZ','KeyX'].includes(code) && !e.repeat) input.swapPressed=true;
      else if(code==='KeyP' && !e.repeat && game.started && !game.gameOver) game.paused=!game.paused;
    }
    input.raiseHeld=[...held].some(k=>['ShiftLeft','ShiftRight','KeyC','KeyQ'].includes(k));
  }
  window.addEventListener('keydown',e=>keyAction(e,true),{passive:false});
  window.addEventListener('keyup',e=>keyAction(e,false),{passive:false});
  window.addEventListener('blur',()=>{held.clear(); input.raiseHeld=false;});

  document.querySelectorAll('[data-action]').forEach(btn=>{
    const action=btn.dataset.action;
    const doPress=()=>{
      sound.ensure();
      if(action==='left') game.moveCursor(-1,0);
      if(action==='right') game.moveCursor(1,0);
      if(action==='up') game.moveCursor(0,-1);
      if(action==='down') game.moveCursor(0,1);
      if(action==='swap') input.swapPressed=true;
      if(action==='raise') input.raiseHeld=true;
    };
    const release=()=>{ if(action==='raise') input.raiseHeld=false; };
    btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);doPress();});
    btn.addEventListener('pointerup',release); btn.addEventListener('pointercancel',release); btn.addEventListener('pointerleave',release);
  });

  let last=performance.now(), acc=0;
  const step=1000/60;
  function loop(now) {
    acc=Math.min(acc+(now-last),250);last=now;
    while(acc>=step){game.update(input);input.swapPressed=false;acc-=step;}
    game.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__endlessGame=game;
})();
