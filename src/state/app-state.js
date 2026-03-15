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
    title: "背景地形の制作を始めます",
    detail: "探す→作る→持ち出すの順で、制作完了まで最短で進めます。",
    action: "制作を始める"
  },
  [AppPhase.IDLE]: {
    pill: "探す",
    title: "地点を決めてください",
    detail: "ギャラリーか検索で中心地点を選ぶと、生成準備に進みます。",
    action: "地点を選ぶ/検索する"
  },
  [AppPhase.SEARCHING]: {
    pill: "検索中",
    title: "地点を検索しています",
    detail: "キーワードに一致する候補を取得しています。完了までお待ちください。",
    action: "検索中（非活性）"
  },
  [AppPhase.READY_TO_GENERATE]: {
    pill: "作る",
    title: "地形を生成できます",
    detail: "条件を確認できたら地形を生成してください。",
    action: "この条件で地形を生成"
  },
  [AppPhase.GENERATING]: {
    pill: "生成中",
    title: "広域地形を生成しています",
    detail: "進捗を表示しています。数十秒から数分かかる場合があります。",
    action: "生成中（非活性）"
  },
  [AppPhase.GENERATED]: {
    pill: "持ち出す",
    title: "地形を生成しました",
    detail: "まず3Dモデルを保存してください。保存後に必要な場合のみ視点調整へ進みます。",
    action: "3Dモデルを保存"
  },
  [AppPhase.ERROR]: {
    pill: "エラー",
    title: "処理に失敗しました",
    detail: "原因を確認し、条件を見直して再試行してください。",
    action: "条件を見直して再試行"
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
