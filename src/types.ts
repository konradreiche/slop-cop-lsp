export type ViolationCategory =
  | 'word-choice'
  | 'sentence-structure'
  | 'rhetorical'
  | 'structural'
  | 'framing'

export interface ViolationRule {
  id: string
  name: string
  category: ViolationCategory
  description: string
  tip: string          // actionable advice shown in popover
  canRemove: boolean   // whether "Remove" deletes the matched text
  color: string        // CSS hsl or hex
  bgColor: string      // highlight background
  rewriteHint?: string
  llmDirective?: string
}

export interface Violation {
  ruleId: string
  startIndex: number
  endIndex: number
  matchedText: string
  explanation?: string
  suggestedChange?: string | null  // null = explicitly no action (don't fall back to canRemove deletion)
  // When present, Apply uses this range + applyReplacement instead of the highlight span.
  applyStartIndex?: number
  applyEndIndex?: number
  applyReplacement?: string
}

export interface AnnotatedSpan {
  text: string
  start: number
  end: number
  violations: string[] // ruleIds
}
