import {
  NO_INPUT,
  type InputSource,
  type PlayerInput,
  type SampleContext,
} from '../battle/index.ts'

/** 記録した入力の列を、ステップ番号に合わせて再生する。テストと、バグの再現に使う */
export class ReplaySource implements InputSource {
  private readonly inputs: readonly PlayerInput[]

  constructor(inputs: readonly PlayerInput[]) {
    this.inputs = inputs
  }

  sample({ step }: SampleContext): PlayerInput {
    return this.inputs[step] ?? NO_INPUT
  }

  dispose() {}
}
