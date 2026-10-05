/** 開発用ページを開くか。URL に `?dev` があるときだけ（参加者の画面には、出さない） */
export function isDevPage(search: string): boolean {
  return new URLSearchParams(search).has('dev')
}
