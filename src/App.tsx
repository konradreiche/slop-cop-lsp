import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { RULES, RULES_BY_ID } from './rules'
import type { Violation } from './types'
import { runClientDetectors } from './detectors/index'
import { buildHighlightedHTML } from './utils/buildHighlightedHTML'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Popover, { type PopoverState } from './components/Popover'
import { useHashText } from './hooks/useHashText'
import { SAMPLE_TEXT } from './data/sampleText'

const DEBOUNCE_MS = 350

export default function App() {
  const [text, setText] = useState(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return SAMPLE_TEXT
    try { return decodeURIComponent(hash) } catch { return SAMPLE_TEXT }
  })
  useHashText(text)
  const [violations, setViolations] = useState<Violation[]>([])
  const [hiddenRules, setHiddenRules] = useState<Set<string>>(new Set())
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null)
  const [hintVisible, setHintVisible] = useState(true)
  const [idleCount, setIdleCount] = useState(0)

  const editorRef = useRef<HTMLDivElement>(null)
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isComposingRef = useRef(false)
  const isTypingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textRef = useRef(text)
  textRef.current = text
  const violationsRef = useRef<Violation[]>([])
  const undoStackRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])
  const lastPushedRef = useRef<string>('')

  violationsRef.current = violations

  const activeRules = new Set(RULES.filter(r => !hiddenRules.has(r.id)).map(r => r.id))

  if (lastPushedRef.current === '') lastPushedRef.current = text

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setViolations(text.trim() ? runClientDetectors(text) : [])
    }, DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [text])

  useLayoutEffect(() => {
    if (isTypingRef.current) return
    const editor = editorRef.current
    if (!editor) return
    const hadFocus = document.activeElement === editor
    const saved = saveCaretPosition(editor)
    editor.innerHTML = buildHighlightedHTML(text, violations, activeRules)
    if (saved !== null) restoreCaretPosition(editor, saved)
    if (hadFocus) editor.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violations, hiddenRules, idleCount])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = buildHighlightedHTML(text, violations, activeRules)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markTyping = useCallback(() => {
    isTypingRef.current = true
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false
      setIdleCount(c => c + 1)
    }, 800)
  }, [])

  const restoreText = useCallback((value: string) => {
    setText(value)
    setPopover(null)
    const editor = editorRef.current
    if (editor) editor.innerText = value
  }, [])

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return
    const editor = editorRef.current
    if (!editor) return
    const value = editor.innerText
    if (value !== lastPushedRef.current) {
      undoStackRef.current.push(lastPushedRef.current)
      redoStackRef.current = []
      lastPushedRef.current = value
    }
    setText(value)
    setPopover(null)
    setHintVisible(false)
    markTyping()
  }, [markTyping])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    if (e.key === 'z' && !e.shiftKey) {
      const prev = undoStackRef.current.pop()
      if (prev === undefined) return
      e.preventDefault()
      redoStackRef.current.push(lastPushedRef.current)
      lastPushedRef.current = prev
      restoreText(prev)
    } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      const next = redoStackRef.current.pop()
      if (next === undefined) return
      e.preventDefault()
      undoStackRef.current.push(lastPushedRef.current)
      lastPushedRef.current = next
      restoreText(next)
    }
  }, [restoreText])

  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const mark = target.tagName === 'MARK' ? target : target.closest('mark')
    if (!mark) { setPopover(null); return }

    const ruleIds = (mark.getAttribute('data-rules') ?? '').split(',').filter(Boolean)
    const startIndex = parseInt(mark.getAttribute('data-start') ?? '0', 10)
    const endIndex = parseInt(mark.getAttribute('data-end') ?? '0', 10)
    const matchedText = mark.textContent ?? ''

    const rules = ruleIds
      .map(id => RULES_BY_ID[id])
      .filter((r): r is NonNullable<typeof r> => !!r)

    if (rules.length === 0) return

    const clickedViolations = ruleIds.map(ruleId => {
      const v = violationsRef.current.find(
        v2 => v2.ruleId === ruleId && v2.startIndex <= startIndex && v2.endIndex >= endIndex
      ) ?? violationsRef.current.find(
        v2 => v2.ruleId === ruleId && Math.abs(v2.startIndex - startIndex) < 20
      )
      return {
        startIndex: v?.startIndex ?? startIndex,
        endIndex: v?.endIndex ?? endIndex,
        matchedText: v?.matchedText ?? matchedText,
        explanation: v?.explanation,
        suggestedChange: v?.suggestedChange,
        applyStartIndex: v?.applyStartIndex,
        applyEndIndex: v?.applyEndIndex,
        applyReplacement: v?.applyReplacement,
      }
    })

    setPopover({
      rules,
      violations: clickedViolations,
      anchorRect: mark.getBoundingClientRect(),
      ruleIndex: 0,
    })
  }, [])

  const applyTextChange = useCallback((startIndex: number, endIndex: number, replacement: string) => {
    const current = textRef.current
    const newText = cleanupAfterEdit(current.slice(0, startIndex) + replacement + current.slice(endIndex))
    undoStackRef.current.push(lastPushedRef.current)
    redoStackRef.current = []
    lastPushedRef.current = newText
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setViolations(newText.trim() ? runClientDetectors(newText) : [])
    setText(newText)
    setPopover(null)
    setHintVisible(false)
  }, [])

  // Dim all text and non-matching marks when hovering a sidebar rule
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (!hoveredRuleId) {
      editor.style.color = ''
      editor.querySelectorAll<HTMLElement>('mark').forEach(m => {
        m.style.opacity = ''
        m.style.color = ''
        if (m.dataset.hoverOverridden) {
          m.style.background = m.dataset.origBg ?? ''
          m.style.borderBottom = m.dataset.origBorderBottom ?? ''
          delete m.dataset.hoverOverridden
          delete m.dataset.origBg
          delete m.dataset.origBorderBottom
        }
      })
      return
    }
    const hoveredRule = RULES_BY_ID[hoveredRuleId]
    editor.style.color = 'rgba(26,26,26,0.15)'
    editor.querySelectorAll<HTMLElement>('mark').forEach(m => {
      const rules = (m.getAttribute('data-rules') ?? '').split(',')
      if (rules.includes(hoveredRuleId)) {
        m.style.opacity = '1'
        m.style.color = '#1a1a1a'
        if (hoveredRule && !m.dataset.hoverOverridden) {
          m.dataset.hoverOverridden = '1'
          m.dataset.origBg = m.style.background
          m.dataset.origBorderBottom = m.style.borderBottom
          m.style.background = hoveredRule.bgColor
          m.style.borderBottom = `2px solid ${hoveredRule.color}`
        }
      } else {
        m.style.opacity = '0.15'
        m.style.color = ''
      }
    })

    const scroll = editorScrollRef.current
    if (!scroll) return
    const matchingMarks = Array.from(
      editor.querySelectorAll<HTMLElement>('mark')
    ).filter(m => (m.getAttribute('data-rules') ?? '').split(',').includes(hoveredRuleId))
    if (matchingMarks.length === 0) return
    const scrollRect = scroll.getBoundingClientRect()
    const anyVisible = matchingMarks.some(m => {
      const r = m.getBoundingClientRect()
      return r.bottom > scrollRect.top && r.top < scrollRect.bottom
    })
    if (!anyVisible) {
      matchingMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [hoveredRuleId])

  const handleClear = useCallback(() => {
    const editor = editorRef.current
    undoStackRef.current.push(lastPushedRef.current)
    redoStackRef.current = []
    lastPushedRef.current = ''
    setText('')
    setViolations([])
    setPopover(null)
    setHintVisible(false)
    if (editor) { editor.innerText = ''; editor.focus() }
  }, [])

  const toggleRule = (ruleId: string) => {
    setHiddenRules(prev => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
    setPopover(null)
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f5f0' }}>
      <Toolbar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Main editor */}
        <div
          ref={editorScrollRef}
          className="editor-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '48px 64px 80px', position: 'relative' }}
        >
          <div style={{ maxWidth: '680px', margin: '0 auto', position: 'relative' }}>
            {/* Callout box — sits in left margin, arrow points right at the text */}
            {hintVisible !== undefined && (
              <div className="hint-callout" style={{ position: 'absolute', right: 'calc(100% - 39px)', top: '6px', width: '158px', opacity: !hintVisible ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: hintVisible ? 'auto' : 'none' }}>
                <div style={{
                  background: '#fff',
                  border: '1px solid #e0dbd4',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'sans-serif', color: '#888', marginBottom: '2px' }}>
                    ✎ Text is editable
                  </div>
                  <div style={{ fontSize: '11px', fontFamily: 'sans-serif', color: '#aaa', lineHeight: '1.5' }}>
                    Paste or type your own text to analyse it. The sample shows what detections look like.
                  </div>
                  {text.trim() && <button
                    onClick={handleClear}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: '11px',
                      fontFamily: 'sans-serif',
                      color: '#bbb',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: '2px',
                      display: 'block',
                      textAlign: 'left',
                    }}
                  >
                    Clear text
                  </button>}
                </div>
                {/* Arrow pointing right */}
                <div style={{ position: 'absolute', right: '-8px', top: '18px', width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '8px solid #e0dbd4' }} />
                <div style={{ position: 'absolute', right: '-7px', top: '18px', width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '8px solid #fff' }} />
              </div>
            )}
            {!text.trim() && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: '52px',
                pointerEvents: 'none',
                fontSize: '18px',
                lineHeight: '1.9',
                fontFamily: "'Georgia', 'Times New Roman', serif",
                color: '#ccc',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ fontSize: '22px', opacity: 0.4 }}>✏</span>
                Write here…
              </div>
            )}
            <div
              ref={editorRef}
              className="editor-content"
              contentEditable="plaintext-only"
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onClick={handleEditorClick}
              onCompositionStart={() => { isComposingRef.current = true }}
              onCompositionEnd={() => { isComposingRef.current = false; handleInput() }}
              spellCheck
              style={{
                outline: 'none',
                fontSize: '18px',
                lineHeight: '1.9',
                fontFamily: "'Georgia', 'Times New Roman', serif",
                color: '#1a1a1a',
                minHeight: '400px',
                caretColor: '#1a1a1a',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                paddingLeft: '52px',
              }}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <Sidebar
          violations={violations}
          hiddenRules={hiddenRules}
          onToggleRule={toggleRule}
          onRuleHover={setHoveredRuleId}
          wordCount={wordCount}
        />
      </div>

      {/* Popover */}
      {popover && (
        <Popover
          state={popover}
          onClose={() => setPopover(null)}
          onApply={applyTextChange}
          onNextRule={() => setPopover(p => p ? { ...p, ruleIndex: (p.ruleIndex + 1) % p.rules.length } : p)}
          onPrevRule={() => setPopover(p => p ? { ...p, ruleIndex: (p.ruleIndex - 1 + p.rules.length) % p.rules.length } : p)}
        />
      )}

      {/* GitHub link */}
      <a
        href="https://github.com/awnist/slop-cop"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '16px',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.15,
          transition: 'opacity 0.2s',
          zIndex: 100,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.15')}
        title="View on GitHub"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      </a>
    </div>
  )
}

// ── Caret helpers ──────────────────────────────────────────────────────────

function saveCaretPosition(root: Node): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const { startContainer, startOffset } = sel.getRangeAt(0)

  let count = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node === startContainer) {
      if (node.nodeType === Node.TEXT_NODE) return count + startOffset
      for (let i = 0; i < startOffset; i++) count += nodeCharLen(startContainer.childNodes[i])
      return count
    }
    if (node.nodeType === Node.TEXT_NODE) count += (node.textContent ?? '').length
    else if ((node as Element).tagName === 'BR') count += 1
  }
  return count
}

function nodeCharLen(node: Node | undefined): number {
  if (!node) return 0
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').length
  if ((node as Element).tagName === 'BR') return 1
  let len = 0
  for (const child of node.childNodes) len += nodeCharLen(child)
  return len
}

function restoreCaretPosition(root: Node, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let count = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length
      if (count + len >= offset) {
        const sel = window.getSelection()
        if (!sel) return
        const range = document.createRange()
        range.setStart(node, offset - count)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      count += len
    } else if ((node as Element).tagName === 'BR') {
      count += 1
      if (count >= offset) {
        const sel = window.getSelection()
        if (!sel) return
        const range = document.createRange()
        range.setStartAfter(node)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
    }
  }
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function cleanupAfterEdit(text: string): string {
  return text
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/ +(["”’\)\]])\s*([.,;:!?])/g, '$1$2')
    .replace(/  +/g, ' ')
    .replace(/\n /g, '\n')
}
