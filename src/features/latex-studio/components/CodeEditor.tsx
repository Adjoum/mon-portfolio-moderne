// Éditeur du code LaTeX : Monaco sur ordinateur, zone de texte sur écran tactile ou si Monaco ne
// se charge pas. Les remplacements venant du studio (IA, template, import) passent par la pile
// d'annulation de Monaco : Ctrl+Z les annule aussi.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface CodeEditorHandle {
  /** Ligne entière sélectionnée et amenée à l’écran ; focus dans l’éditeur sauf demande contraire */
  goToLine(line: number, focus?: boolean): void
  focus(): void
}

export interface Selection { text: string; start: number; end: number }

/* eslint-disable @typescript-eslint/no-explicit-any -- API AMD de Monaco chargée depuis le CDN, sans types */
let monacoLoading: Promise<any> | null = null

function loadMonaco(): Promise<any> {
  monacoLoading ??= new Promise((resolve, reject) => {
    const w = window as any
    if (w.monaco?.editor) return resolve(w.monaco)
    const loader = document.createElement('script')
    loader.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.min.js'
    loader.async = true
    loader.onload = () => {
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs' } })
      w.require(['vs/editor/editor.main'], () => resolve(w.monaco), reject)
    }
    loader.onerror = () => { monacoLoading = null; reject(new Error('Monaco indisponible')) }
    document.head.appendChild(loader)
  })
  return monacoLoading
}

export const CodeEditor = forwardRef<CodeEditorHandle, {
  value: string
  onChange: (value: string) => void
  onSelection: (selection: Selection | null) => void
  onCompile: () => void
  /** Ligne du curseur (synchronisation avec l'aperçu PDF) */
  onCursorLine?: (line: number) => void
  /** Zone de texte simple (écran tactile) */
  plain: boolean
}>(function CodeEditor({ value, onChange, onSelection, onCompile, onCursorLine, plain }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const editor = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const callbacks = useRef({ onChange, onSelection, onCompile, onCursorLine })
  const initial = useRef(value)

  useEffect(() => { callbacks.current = { onChange, onSelection, onCompile, onCursorLine } }, [onChange, onSelection, onCompile, onCursorLine])

  useEffect(() => {
    if (plain) return
    let disposed = false
    loadMonaco().then(monaco => {
      if (disposed || !host.current) return
      if (!monaco.languages.getLanguages().some((l: any) => l.id === 'latex')) monaco.languages.register({ id: 'latex' })
      const ed = monaco.editor.create(host.current, {
        value: initial.current,
        language: 'latex',
        theme: 'vs-dark',
        fontSize: 13,
        fontFamily: "'JetBrains Mono','Fira Code',monospace",
        minimap: { enabled: false },
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        ariaLabel: 'Code LaTeX du CV',
      })
      ed.onDidChangeModelContent(() => callbacks.current.onChange(ed.getValue()))
      ed.onDidChangeCursorSelection(() => {
        const sel = ed.getSelection()
        const model = ed.getModel()
        if (!sel || sel.isEmpty() || !model) return callbacks.current.onSelection(null)
        const text = model.getValueInRange(sel)
        const start = model.getOffsetAt(sel.getStartPosition())
        callbacks.current.onSelection({ text, start, end: start + text.length })
      })
      ed.onDidChangeCursorPosition((e: any) => callbacks.current.onCursorLine?.(e.position.lineNumber))
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => callbacks.current.onCompile())
      editor.current = ed
      setReady(true)
    }).catch(() => { /* zone de texte conservée */ })
    return () => {
      disposed = true
      editor.current?.dispose()
      editor.current = null
      setReady(false)
    }
  }, [plain])

  // Code modifié hors de l'éditeur : remplacement annulable
  useEffect(() => {
    initial.current = value
    const ed = editor.current
    if (!ed || ed.getValue() === value) return
    const model = ed.getModel()
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null)
  }, [value, ready])

  useImperativeHandle(ref, () => ({
    goToLine(line: number, focus = true) {
      const ed = editor.current
      if (ed) {
        // Ligne entière sélectionnée : visible d'un coup d'œil
        const max = ed.getModel()?.getLineMaxColumn(line) ?? 1
        ed.revealLineInCenter(line)
        ed.setSelection({ startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: max })
        if (focus) ed.focus()
        return
      }
      const ta = area.current
      if (!ta) return
      const lines = ta.value.split('\n')
      const offset = lines.slice(0, Math.max(0, line - 1)).reduce((n, l) => n + l.length + 1, 0)
      if (focus) ta.focus()
      ta.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0))
      ta.scrollTop = Math.max(0, (line - 5) * 20)
    },
    focus() {
      (editor.current ?? area.current)?.focus()
    },
  }), [])

  const showArea = plain || !ready
  return (
    <div className="relative min-h-0 flex-1">
      {!plain && <div ref={host} className={`absolute inset-0 ${ready ? '' : 'invisible'}`} />}
      {showArea && (
        <textarea
          ref={area}
          value={value}
          onChange={e => onChange(e.target.value)}
          onSelect={e => {
            const ta = e.currentTarget
            onSelection(ta.selectionStart === ta.selectionEnd ? null : { text: ta.value.slice(ta.selectionStart, ta.selectionEnd), start: ta.selectionStart, end: ta.selectionEnd })
            onCursorLine?.(ta.value.slice(0, ta.selectionStart).split('\n').length)
          }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onCompile() } }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Code LaTeX du CV"
          className="absolute inset-0 h-full w-full resize-none border-0 bg-[#0d1117] p-4 font-mono text-[13px] leading-5 text-gray-200 outline-none"
        />
      )}
    </div>
  )
})
