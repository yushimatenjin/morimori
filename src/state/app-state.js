export const AppPhase = {
  SPLASH: "splash",
  IDLE: "idle",
  SEARCHING: "searching",
  READY_TO_GENERATE: "ready-to-generate",
  GENERATING: "generating",
  GENERATED: "generated",
  ERROR: "error"
};

export const phaseViewModel = {
  [AppPhase.SPLASH]: {
    pill: "開始前",
    title: "開始前です",
    detail: "「作業を始める」を押すと設定パネルが有効になります。",
    action: "地形を生成"
  },
  [AppPhase.IDLE]: {
    pill: "待機中",
    title: "地点の設定を待機しています",
    detail: "地名検索またはクイック地点を使って中心点を決めてください。",
    action: "地形を生成"
  },
  [AppPhase.SEARCHING]: {
    pill: "検索中",
    title: "地点を検索しています",
    detail: "候補地点を取得しています。しばらくお待ちください。",
    action: "検索中..."
  },
  [AppPhase.READY_TO_GENERATE]: {
    pill: "生成準備完了",
    title: "地形を生成できます",
    detail: "取得範囲とズームを確認して「地形を生成」を押してください。",
    action: "地形を生成"
  },
  [AppPhase.GENERATING]: {
    pill: "生成中",
    title: "地形を生成しています",
    detail: "タイル取得とメッシュ生成を順次処理しています。",
    action: "生成中..."
  },
  [AppPhase.GENERATED]: {
    pill: "生成済み",
    title: "地形を生成しました",
    detail: "視点を調整し、問題なければ GLB を書き出してください。",
    action: "再生成"
  },
  [AppPhase.ERROR]: {
    pill: "エラー",
    title: "処理に失敗しました",
    detail: "内容を確認し、条件を見直して再実行してください。",
    action: "再実行"
  }
};

export class AppStateStore {
  constructor() {
    this.phase = AppPhase.SPLASH;
    this.listeners = new Set();
  }

  setPhase(phase) {
    if (!Object.values(AppPhase).includes(phase)) {
      return;
    }
    this.phase = phase;
    this.listeners.forEach((listener) => listener(phase));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.phase);
    return () => this.listeners.delete(listener);
  }
}
