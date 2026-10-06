import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { StageData } from '../model/index.ts'
import { DEFAULT_PRESET_ID } from '../stage/index.ts'
import { StageSelectScreen } from './StageSelectScreen.tsx'

type Props = {
  children: ReactNode
  /** エディタが落ちたときの、プリセットだけの画面の、「つぎへ」 */
  onNext: (stage: StageData) => void
  onBack?: () => void
}

/**
 * S04 の入口。グリッドエディタが例外で落ちたら、エディタを隠して、プリセットの一覧だけの画面にする。
 * プリセットを選べば、先に進める（stage-editor.md §9）
 */
export class StageScreen extends Component<Props, { failed: boolean; presetId: string }> {
  state = { failed: false, presetId: DEFAULT_PRESET_ID }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <StageSelectScreen
        selectedId={this.state.presetId}
        onSelect={(presetId) => this.setState({ presetId })}
        onNext={this.props.onNext}
        onBack={this.props.onBack}
      />
    )
  }
}
