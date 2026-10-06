// 画面の文言。コードに直接書かず、ここにまとめる（調整だけで直せる。ui-design.md §10）。
// ひらがな中心・短い文（NFR-02）。

export const messages = {
  stat: {
    title: 'すうじを きめよう',
    remaining: (n: number) => `あと ${n}ポイント`,
    remainingDone: 'ポイントを ぜんぶ つかったよ',
    rule: 'ぜんぶで 20ポイント。2〜8の あいだで えらぼう',
    reset: 'ひょうじゅんに もどす',
    back: 'もどる',
    next: 'つぎへ',
    /** 「つぎへ」が押せない理由 */
    nextBlocked: (n: number) => `あと ${n}ポイント つかおう`,
    nextBlockedOver: (n: number) => `${n}ポイント おおいよ。へらそう`,
    nextBlockedInvalid: 'すうじが おかしいよ。ひょうじゅんに もどしてね',
    /** 「−」「＋」が押せない理由 */
    atMin: (min: number) => `${min}が いちばん ひくいよ`,
    atMax: (max: number) => `${max}が いちばん たかいよ`,
    noPoints: 'ポイントが ないよ。ほかを へらそう',
    decrease: (label: string) => `${label}を 1 へらす`,
    increase: (label: string) => `${label}を 1 ふやす`,
    stats: {
      attackPower: {
        label: 'こうげき力',
        meaning: 'いちどに あたえる ダメージが かわるよ',
        effect: 'ダメージ',
      },
      defense: {
        label: 'ふっとばされにくさ',
        meaning: 'たかいほど ふっとびにくいよ（うけるダメージは かわらないよ）',
        effect: 'ふっとび',
      },
      jumpPower: {
        label: 'ジャンプ力',
        meaning: 'ジャンプの たかさが かわるよ',
        effect: 'たかさ',
      },
      speed: {
        label: 'いどうのはやさ',
        meaning: 'よこに うごく はやさが かわるよ',
        effect: 'はやさ',
      },
    },
    /** 標準（5）との比較の見出し */
    compareNote: 'ひょうじゅん（5）と くらべた わりあい',
  },
  appearance: {
    title: 'ファイターを つくろう',
    groups: { body: 'からだ', face: 'かお', color: 'いろ', accessory: 'かざり' },
    none: 'なし',
    name: 'なまえ',
    namePlaceholder: (defaultName: string) => `${defaultName}（かえなければ これに なるよ）`,
    nameRemaining: (n: number) => `あと ${n}もじ`,
    nameMax: '10もじまで',
    nameBytesNote: 'えもじは ながい ぶん、10もじ より すくなく なるよ',
    nameNotice: 'ほんとうの なまえは いれないでね（あだなに しよう）',
    random: 'ランダム',
    next: 'つぎへ',
    back: 'もどる',
    previewLabel: (name: string) => `${name}の みため（うごいているよ）`,
  },
  /** ステージの検証の、参加者向けメッセージ（validation.md §6） */
  stageRules: {
    BLOCKS_TOO_FEW: (n: number) => `ブロックが すくないよ。あと ${n}こ おこう`,
    BLOCKS_TOO_MANY: (n: number) => `ブロックが おおすぎるよ。${n}こ へらそう`,
    MAIN_PLATFORM_NARROW: (min: number) =>
      `ひろい ゆかが ないよ。${min}マス いじょうの ゆかを つくろう`,
    PLATFORM_TOO_NARROW: (min: number) => `せまい あしばが あるよ。${min}マス いじょうに しよう`,
    STAGE_TOO_HIGH: (rows: number) =>
      `たかすぎる ブロックが あるよ。うえの ${rows}れつは あけておこう`,
    SPAWN_MISSING: 'スタートの いちが きまっていないよ',
    SPAWN_OUT_OF_RANGE: 'スタートの いちが はみだしているよ',
    SPAWN_BLOCKED: 'スタートの うえに ブロックが あるよ。うえを あけよう',
    SPAWN_NO_GROUND: 'スタートの したに ゆかが ないよ',
    SPAWN_TOO_CLOSE: 'ふたりの スタートが ちかすぎるよ。もっと はなそう',
    UNREACHABLE: 'いけない あしばが あるよ。ジャンプで とどく ように しよう',
    NAME_TOO_LONG: 'なまえが ながすぎるよ',
    MALFORMED: 'ステージを よみこめなかったよ。もういちど よみとってね',
    SCHEMA_UNSUPPORTED:
      'このステージは、いまの アプリでは よみこめないよ。あたらしい ばんの アプリで ひらいてね',
    /** 画面に出しきれない分 */
    others: (n: number) => `ほかにも ${n}こ あるよ`,
  },
} as const
