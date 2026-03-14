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
    detail: "先に地形を生成し、GLB を保存してから配置検証へ進みます。",
    action: "制作を始める"
  },
  [AppPhase.IDLE]: {
    pill: "入力待ち",
    title: "地点の設定を待機しています",
    detail: "地点を設定し、地形生成の条件を決めてください。",
    action: "地点を検索"
  },
  [AppPhase.SEARCHING]: {
    pill: "検索中",
    title: "候補地点を検索しています",
    detail: "キーワードに一致する地点を取得しています。",
    action: "検索中..."
  },
  [AppPhase.READY_TO_GENERATE]: {
    pill: "生成準備完了",
    title: "地形を生成できます",
    detail: "条件を確認しました。地形生成を開始できます。",
    action: "この条件で地形を生成"
  },
  [AppPhase.GENERATING]: {
    pill: "生成中",
    title: "広域地形を生成しています",
    detail: "数十秒から数分かかる場合があります。",
    action: "生成中..."
  },
  [AppPhase.GENERATED]: {
    pill: "生成済み",
    title: "地形を生成しました",
    detail: "3Dモデルを保存し、必要なら配置・視点検証へ進んでください。",
    action: "別条件で再生成"
  },
  [AppPhase.ERROR]: {
    pill: "エラー",
    title: "生成に失敗しました",
    detail: "原因を確認し、条件を見直して再試行してください。",
    action: "再試行する"
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
