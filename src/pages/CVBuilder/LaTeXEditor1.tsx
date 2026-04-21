import React, { useState, useEffect, useRef, useCallback } from "react";

// Official latex.js UMD build — exposes window.latexjs inside the iframe
// Pattern from docs: <script src="latex.js"> then new latexjs.HtmlGenerator()


// Packages natively supported by latex.js (no require() call needed):
// geometry, hyperref, array, url, amsmath, xcolor, color, booktabs
// NOT supported: fullpage, titlesec, enumitem, fancyhdr, babel, tabularx,
//               moderncv, fontenc, marvosym, inputenc

const TEMPLATES: Record<string, { name: string; emoji: string; code: string }> = {
  faang: {
    name: "FAANG",
    emoji: "📄",
    code: `\\documentclass[11pt]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\usepackage{array}
\\usepackage{url}

\\setlength{\\parskip}{0pt}

\\begin{document}

{\\Large\\textbf{Koffi Wilfried Adjoumani}} \\\\[2pt]
Abidjan, CI \\quad|\\quad
\\href{mailto:koffi@email.com}{koffi@email.com} \\quad|\\quad
\\href{https://github.com/Adjoum}{github.com/Adjoum}

\\bigskip\\hrule\\bigskip

{\\large\\textbf{EDUCATION}} \\\\[4pt]\\hrule\\smallskip

\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{INPHB} -- Master 1, Big Data \\& Data Analytics & 2025--present \\\\
  \\textit{Institut National Polytechnique Houphouet-Boigny} & Yamoussoukro \\\\[4pt]
  \\textbf{UVCI} -- Licence 3, Data Analytics Industriel & 2024--2026 \\\\
  \\textit{Universite Virtuelle de Cote d'Ivoire} & Abidjan \\\\
\\end{tabular*}

\\bigskip

{\\large\\textbf{EXPERIENCE}} \\\\[4pt]\\hrule\\smallskip

\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{CHU d'Angre} -- Stagiaire Imagerie Medicale & Aout 2022--Juin 2023 \\\\
\\end{tabular*}
\\begin{itemize}
  \\item Traitement de 100+ images radiographiques/jour (Python, OpenCV)
  \\item Reduction du temps d'attente de 20\\% via optimisation des protocoles
  \\item Collaboration multidisciplinaire pour amelioration des diagnostics
\\end{itemize}

\\bigskip

{\\large\\textbf{PROJECTS}} \\\\[4pt]\\hrule\\smallskip

\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{Optimisation Radiologique} $|$ \\textit{Python, SQL, Scikit-learn} & 2023 \\\\
\\end{tabular*}
\\begin{itemize}
  \\item Modele predictif de pannes reduisant les temps d'arret de 15\\%
\\end{itemize}

\\bigskip

{\\large\\textbf{TECHNICAL SKILLS}} \\\\[4pt]\\hrule\\smallskip

\\textbf{Languages:} Python, SQL, VBA, R \\\\
\\textbf{Data:} Power BI, Talend Studio, Pandas, Scikit-learn \\\\
\\textbf{Tools:} Git, Docker, PostgreSQL, Jupyter

\\end{document}`,
  },
  classic: {
    name: "Classic",
    emoji: "🔵",
    code: `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=2cm]{geometry}
\\usepackage{hyperref}
\\usepackage{array}

\\begin{document}

{\\LARGE\\textbf{Jean Dupont}} \\hfill
\\href{mailto:jean@email.com}{jean@email.com}\\\\
Ingenieur Logiciel Senior \\hfill +33 6 12 34 56 78

\\bigskip\\hrule\\bigskip

{\\large\\textbf{EXPERIENCE}} \\\\[4pt]\\hrule\\smallskip

\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{Software Engineer L5} -- Google, Paris & 2021--present \\\\
\\end{tabular*}
\\begin{itemize}
  \\item API servant 10M+ requetes/jour
  \\item Latence P99 reduite de 800ms a 120ms
\\end{itemize}

\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{Software Engineer} -- Amazon, Lyon & 2018--2021 \\\\
\\end{tabular*}
\\begin{itemize}
  \\item Microservices AWS Lambda
  \\item Reduction des incidents de 60\\% via CI/CD
\\end{itemize}

\\bigskip

{\\large\\textbf{FORMATION}} \\\\[4pt]\\hrule\\smallskip

\\textbf{Master Informatique} -- Polytechnique Paris \\hfill 2018

\\bigskip

{\\large\\textbf{COMPETENCES}} \\\\[4pt]\\hrule\\smallskip

\\textbf{Langages:} Python, Go, TypeScript \\\\
\\textbf{Cloud:} AWS, GCP, Docker, Kubernetes

\\end{document}`,
  },
  minimal: {
    name: "Minimal",
    emoji: "✏️",
    code: `\\documentclass{article}
\\usepackage[margin=2.5cm]{geometry}

\\begin{document}

{\\large\\textbf{Votre Nom}} \\\\
email@example.com $\\cdot$ +XX XX XX XX XX

\\bigskip
{\\large\\textbf{EXPERIENCE}} \\\\[2pt]\\hrule\\smallskip

\\textbf{Poste} \\hfill 2022--present\\\\
Entreprise, Ville\\\\
Description du role.

\\bigskip
{\\large\\textbf{FORMATION}} \\\\[2pt]\\hrule\\smallskip

\\textbf{Diplome} \\hfill 2022\\\\
Institution

\\bigskip
{\\large\\textbf{COMPETENCES}} \\\\[2pt]\\hrule\\smallskip

Competence 1, Competence 2, Competence 3

\\end{document}`,
  },
};

// ── Build srcdoc — exact pattern from the official docs ────────
// The doc example:
//   <script src="latex.js"></script>
//   var generator = new latexjs.HtmlGenerator({ hyphenate: false })
//   generator = latexjs.parse(text, { generator: generator })
//   document.head.appendChild(generator.stylesAndScripts(""))
//   document.body.appendChild(generator.domFragment())
//
// Key: latex.js UMD is loaded in the SAME iframe as the script that calls it,
// so window.latexjs is defined and packages load via the correct base path.
// We use JSON.stringify to safely encode the LaTeX source.
// ── Build srcdoc — corrected version ────────
function buildSrcdoc(latexCode: string): string {
  const safeCode = JSON.stringify(latexCode);
  
  // Base URL pour les assets (CSS, fonts, packages)
  const assetBase = "https://cdn.jsdelivr.net/npm/latex.js@0.12.4/dist/";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #fff; color: #000; }
    #err {
      display: none; margin: 16px; padding: 14px;
      background: #fff0f0; border: 1px solid #f5c6cb;
      border-radius: 6px; font-family: monospace;
      font-size: 12px; color: #721c24; white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="err"></div>
  
  <!-- Chargement de latex.js UMD -->
  <script src="https://cdn.jsdelivr.net/npm/latex.js@0.12.4/dist/latex.js"><\/script>
  
  <script>
    (function() {
      try {
        var src = ${safeCode};
        
        // Configuration du générateur avec base URL pour les assets
        var generator = new latexjs.HtmlGenerator({ 
          hyphenate: false 
        });
        
        // Parsing du LaTeX
        var result = latexjs.parse(src, { generator: generator });
        
        // Injection des styles/scripts avec base URL absolue
        var assets = result.stylesAndScripts("${assetBase}");
        if (assets) document.head.appendChild(assets);
        
        // Injection du contenu HTML généré
        var content = result.domFragment();
        if (content) document.body.appendChild(content);
        
        // Notification au parent
        window.parent.postMessage({ type: 'latex-ok' }, '*');
        
      } catch(e) {
        console.error('LaTeX render error:', e);
        var el = document.getElementById('err');
        el.style.display = 'block';
        el.textContent = '❌ Erreur latex.js:\\n\\n' + (e.message || String(e)) + 
                        '\\n\\n💡 Packages supportés : geometry, hyperref, array, url, amsmath, xcolor, booktabs';
        window.parent.postMessage({ type: 'latex-err', msg: e.message || String(e) }, '*');
      }
    })();
  <\/script>
</body>
</html>`;
}

// ── AI helpers ─────────────────────────────────────────────────
async function aiGenerateLatex(info: string, template: string, existing: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: `Tu es expert LaTeX et redacteur CV haut de gamme.
Retourne UNIQUEMENT le code LaTeX brut, sans explications ni balises markdown.
CONTRAINTES (rendu via latex.js dans le navigateur):
- Classe: article uniquement
- Packages OK: geometry, hyperref, array, url, amsmath, xcolor, color, booktabs
- Packages INTERDITS: fullpage, titlesec, enumitem, fancyhdr, babel, tabularx, moderncv, fontenc, marvosym, inputenc
- Evite les caracteres accentues — utilise des equivalents ASCII
- Mise en page via: tabular*, itemize, hfill, hrule, bigskip, medskip`,
      messages: [{
        role: "user",
        content: `Infos candidat:\n${info}\n\nTemplate:\n${template}\n\nCode actuel:\n${existing || "(vide)"}`,
      }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function aiImproveSelection(selection: string, instruction: string, fullCode: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `Expert LaTeX CV. Retourne UNIQUEMENT le LaTeX ameliore.
Packages OK: geometry, hyperref, array, url, amsmath, xcolor, booktabs. Pas d'accents directs.`,
      messages: [{
        role: "user",
        content: `Lignes:\n\`\`\`latex\n${selection}\n\`\`\`\nInstruction: ${instruction}\nContexte:\n${fullCode.slice(0, 1500)}`,
      }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.replace(/```latex\n?/g, "").replace(/```\n?/g, "").trim() ?? "";
}

// ── Main component ─────────────────────────────────────────────
export default function LaTeXCVEditor() {
  const [code, setCode] = useState(TEMPLATES.faang.code);
  const [srcDoc, setSrcDoc] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState("faang");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiMode, setAIMode] = useState<"generate" | "improve">("generate");
  const [aiInfo, setAiInfo] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectionRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Listen for postMessage from iframe
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "latex-ok") { setRenderError(null); setRendering(false); }
      else if (ev.data?.type === "latex-err") { setRenderError(ev.data.msg ?? "Erreur"); setRendering(false); }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Debounced render
  const doRender = useCallback(() => {
    setRendering(true);
    setRenderError(null);
    setSrcDoc(buildSrcdoc(code));
  }, [code]);

  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(doRender, 900);
    return () => clearTimeout(debounceTimer.current);
  }, [code, doRender]);

  // Monaco loader
  useEffect(() => {
    const w = window as any;
    if (w.__monacoEditor) { setMonacoLoaded(true); return; }
    if (w.__monacoLoading) {
      const check = setInterval(() => { if (w.__monacoEditor) { setMonacoLoaded(true); clearInterval(check); } }, 200);
      return () => clearInterval(check);
    }
    if (document.querySelector('script[src*="monaco-editor"][src*="loader"]')) {
      const wait = setInterval(() => { if (w.monaco) { initMonaco(); clearInterval(wait); } }, 200);
      return () => clearInterval(wait);
    }
    w.__monacoLoading = true;
    const loader = document.createElement("script");
    loader.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.min.js";
    loader.async = true;
    loader.onload = () => {
      w.require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs" } });
      if (!w.monaco) w.require(["vs/editor/editor.main"], () => initMonaco());
      else initMonaco();
    };
    loader.onerror = () => { w.__monacoLoading = false; };
    document.head.appendChild(loader);
    return () => { const ed = (window as any).__monacoEditor; if (ed?.dispose) { ed.dispose(); delete (window as any).__monacoEditor; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initMonaco = () => {
    const w = window as any;
    if (!w.monaco || !editorRef.current || w.__monacoEditor) { setMonacoLoaded(true); return; }
    if (!w.monaco.languages.getLanguages().find((l: any) => l.id === "latex")) {
      w.monaco.languages.register({ id: "latex" });
      w.monaco.languages.setMonarchTokensProvider("latex", {
        tokenizer: { root: [
          [/\\[a-zA-Z@]+/, "keyword"], [/%.*$/, "comment"],
          [/[{}]/, "delimiter.curly"], [/[\[\]]/, "delimiter.square"],
          [/\$[^$]*\$/, "string"], [/[0-9]+/, "number"],
        ]},
      });
    }
    const editor = w.monaco.editor.create(editorRef.current, {
      value: code, language: "latex", theme: "vs-dark", fontSize: 13,
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      lineNumbers: "on", minimap: { enabled: false }, wordWrap: "on",
      scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2,
    });
    editor.onDidChangeModelContent(() => setCode(editor.getValue()));
    editor.onDidChangeCursorSelection(() => {
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty()) {
        const model = editor.getModel();
        const text = model?.getValueInRange(sel) ?? "";
        setSelectedText(text);
        const start = model?.getOffsetAt(sel.getStartPosition()) ?? 0;
        selectionRangeRef.current = { start, end: start + text.length };
      } else { setSelectedText(""); selectionRangeRef.current = null; }
    });
    w.__monacoEditor = editor;
    delete w.__monacoLoading;
    setMonacoLoaded(true);
  };

  useEffect(() => {
    const ed = (window as any).__monacoEditor;
    if (ed && ed.getValue() !== code) { const pos = ed.getPosition(); ed.setValue(code); if (pos) ed.setPosition(pos); }
  }, [code]);

  const handleTemplateChange = (id: string) => { setActiveTemplate(id); setCode(TEMPLATES[id].code); };

  const handleAIGenerate = async () => {
    if (!aiInfo.trim()) return;
    setAiLoading(true); setAiError("");
    try {
      const r = await aiGenerateLatex(aiInfo, TEMPLATES[activeTemplate].code, code);
      if (r.trim()) setCode(r.trim()); else setAiError("Aucun code retourné.");
    } catch (e: any) { setAiError(e.message); }
    setAiLoading(false);
  };

  const handleAIImprove = async () => {
    if (!selectedText.trim() || !aiInstruction.trim()) return;
    setAiLoading(true); setAiError("");
    try {
      const improved = await aiImproveSelection(selectedText, aiInstruction, code);
      if (improved) {
        const range = selectionRangeRef.current;
        if (range) setCode(prev => prev.slice(0, range.start) + improved + prev.slice(range.end));
        else { const idx = code.indexOf(selectedText); if (idx !== -1) setCode(prev => prev.slice(0, idx) + improved + prev.slice(idx + selectedText.length)); }
        setSelectedText(""); selectionRangeRef.current = null;
      } else setAiError("Aucune amélioration retournée.");
    } catch (e: any) { setAiError(e.message); }
    setAiLoading(false);
  };

  const handleDownloadTex = () => {
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([code], { type: "text/plain" })), download: "cv.tex",
    }).click();
  };

  const copyCode = () => navigator.clipboard.writeText(code);

  const statusColor = rendering ? "#f59e0b" : renderError ? "#ef4444" : srcDoc ? "#22c55e" : "#6b7280";
  const statusText  = rendering ? "Rendu…"  : renderError ? "Erreur"   : srcDoc ? "Rendu ✓" : "En attente";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh",
      background:"#0e1015", color:"#c9d1d9",
      fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", fontSize:13 }}>

      {/* HEADER */}
      <header style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap",
        padding:"10px 18px", background:"#13161d",
        borderBottom:"1px solid #21262d", flexShrink:0 }}>
        <div style={{ display:"flex", flexDirection:"column" }}>
          <span style={{ fontWeight:800, fontSize:15, color:"#e6edf3", letterSpacing:-0.3 }}>
            ⚗️ LaTeX CV Editor
          </span>
          <span style={{ fontSize:10, color:"#8b949e" }}>
            latex.js · domFragment · IA intégrée
          </span>
        </div>

        <div style={{ display:"flex", gap:5, marginLeft:10, flexWrap:"wrap" }}>
          {Object.entries(TEMPLATES).map(([id, t]) => (
            <button key={id} onClick={() => handleTemplateChange(id)} style={{
              padding:"5px 11px", borderRadius:6, fontSize:11, fontWeight:600,
              cursor:"pointer", border:"1px solid",
              borderColor: activeTemplate===id ? "#6366f1" : "#21262d",
              background: activeTemplate===id ? "rgba(99,102,241,.15)" : "#21262d",
              color: activeTemplate===id ? "#a5b4fc" : "#8b949e",
            }}>{t.emoji} {t.name}</button>
          ))}
        </div>

        <div style={{ marginLeft:"auto", display:"flex", gap:7, alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:statusColor }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:statusColor,
              animation: rendering ? "pulse 1s ease-in-out infinite" : "none" }} />
            {statusText}
          </div>
          <button onClick={() => setShowAIPanel(s => !s)} style={{
            padding:"6px 12px", borderRadius:7, fontSize:11.5, fontWeight:700,
            cursor:"pointer", border:"1px solid",
            borderColor: showAIPanel ? "#8b5cf6" : "#21262d",
            background: showAIPanel ? "rgba(139,92,246,.15)" : "#21262d",
            color: showAIPanel ? "#c084fc" : "#8b949e",
          }}>🤖 IA</button>
          <button onClick={copyCode} style={btnStyle}>📋 Copier</button>
          <button onClick={handleDownloadTex} style={btnStyle}>⬇ .tex</button>
        </div>
      </header>

      {/* BODY */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* AI PANEL */}
        {showAIPanel && (
          <div style={{ width:300, flexShrink:0, background:"#13161d",
            borderRight:"1px solid #21262d", display:"flex",
            flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"14px 16px", borderBottom:"1px solid #21262d" }}>
              <div style={{ fontWeight:800, fontSize:13, marginBottom:10, color:"#e6edf3" }}>🤖 Assistant IA</div>
              <div style={{ display:"flex", gap:5 }}>
                {(["generate","improve"] as const).map(m => (
                  <button key={m} onClick={() => setAIMode(m)} style={{
                    flex:1, padding:"6px 0", borderRadius:6, fontSize:11, fontWeight:700,
                    cursor:"pointer", border:"1px solid",
                    borderColor: aiMode===m ? "#6366f1" : "#21262d",
                    background: aiMode===m ? "rgba(99,102,241,.2)" : "transparent",
                    color: aiMode===m ? "#a5b4fc" : "#8b949e",
                  }}>{m==="generate" ? "⚡ Générer" : "✨ Améliorer"}</button>
                ))}
              </div>
            </div>

            <div style={{ flex:1, overflow:"auto", padding:16 }}>
              {aiMode === "generate" ? (
                <>
                  <div style={{ fontSize:11, color:"#8b949e", marginBottom:8, lineHeight:1.6 }}>
                    Décrivez votre profil — l'IA génère le LaTeX.
                  </div>
                  <textarea value={aiInfo} onChange={e => setAiInfo(e.target.value)}
                    placeholder={"Nom: Jean Dupont\nPoste: Data Scientist\nExp:\n- Google 2021: ML Eng\nFormation: Master IA\nComp: Python, TF..."} style={textareaStyle} />
                  <div style={{ fontSize:10, color:"#8b949e", marginTop:5, marginBottom:10 }}>
                    Template: {TEMPLATES[activeTemplate].emoji} {TEMPLATES[activeTemplate].name}
                  </div>
                  <button onClick={handleAIGenerate} disabled={aiLoading || !aiInfo.trim()} style={{
                    width:"100%", padding:"10px 0", borderRadius:8, fontWeight:800,
                    fontSize:12, cursor:"pointer", border:"none",
                    background: aiLoading ? "#21262d" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color:"#fff", opacity: aiLoading || !aiInfo.trim() ? 0.6 : 1,
                  }}>{aiLoading ? "⏳ Génération…" : "⚡ Générer le code LaTeX"}</button>
                </>
              ) : (
                <>
                  <div style={{
                    padding:10, borderRadius:7, marginBottom:10,
                    background: selectedText ? "rgba(34,197,94,.08)" : "rgba(245,158,11,.08)",
                    border: `1px solid ${selectedText ? "rgba(34,197,94,.25)" : "rgba(245,158,11,.25)"}`,
                    fontSize:11, color: selectedText ? "#4ade80" : "#fbbf24",
                  }}>
                    {selectedText ? `✅ ${selectedText.split("\n").length} ligne(s) sélectionnée(s)` : "⚠️ Sélectionnez du texte d'abord"}
                  </div>
                  {selectedText && (
                    <pre style={{ background:"#21262d", borderRadius:6, padding:8,
                      fontSize:10, color:"#c9d1d9", overflow:"auto", maxHeight:90,
                      marginBottom:10, lineHeight:1.5, border:"1px solid #30363d", whiteSpace:"pre-wrap" }}>
                      {selectedText.slice(0,200)}{selectedText.length>200?"…":""}
                    </pre>
                  )}
                  <textarea value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                    placeholder={"Ex:\n• 2 bullets avec metriques\n• Traduire en anglais\n• Corriger syntaxe"}
                    style={{ ...textareaStyle, minHeight:120, marginBottom:10 }} />
                  <button onClick={handleAIImprove}
                    disabled={aiLoading || !selectedText.trim() || !aiInstruction.trim()} style={{
                    width:"100%", padding:"10px 0", borderRadius:8, fontWeight:800,
                    fontSize:12, cursor:"pointer", border:"none",
                    background:"linear-gradient(135deg,#8b5cf6,#ec4899)", color:"#fff",
                    opacity: aiLoading || !selectedText || !aiInstruction ? 0.5 : 1,
                  }}>{aiLoading ? "⏳ Amélioration…" : "✨ Améliorer la sélection"}</button>
                </>
              )}
              {aiError && (
                <div style={{ marginTop:10, padding:"8px 10px", borderRadius:7,
                  background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)",
                  fontSize:11, color:"#f87171" }}>⚠️ {aiError}</div>
              )}
            </div>

            <div style={{ padding:"12px 16px", borderTop:"1px solid #21262d" }}>
              <div style={{ fontSize:10, color:"#8b949e", lineHeight:1.8 }}>
                <div>✅ <strong style={{ color:"#6b7280" }}>Packages OK:</strong></div>
                <div style={{ color:"#4ade80" }}>geometry, hyperref, array,</div>
                <div style={{ color:"#4ade80" }}>url, amsmath, xcolor, booktabs</div>
                <div style={{ marginTop:4 }}>❌ <strong style={{ color:"#6b7280" }}>Non supportés:</strong></div>
                <div style={{ color:"#f87171" }}>enumitem, titlesec, fancyhdr,</div>
                <div style={{ color:"#f87171" }}>babel, tabularx, moderncv</div>
              </div>
            </div>
          </div>
        )}

        {/* EDITOR */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, borderRight:"1px solid #21262d" }}>
          <div style={{ padding:"6px 14px", background:"#13161d",
            borderBottom:"1px solid #21262d", fontSize:11, color:"#8b949e",
            display:"flex", justifyContent:"space-between" }}>
            <span>📝 Éditeur LaTeX</span>
            <span>{code.split("\n").length} lignes</span>
          </div>
          <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
            <div ref={editorRef} style={{ position:"absolute", inset:0, visibility: monacoLoaded ? "visible" : "hidden" }} />
            {!monacoLoaded && (
              <textarea value={code} onChange={e => setCode(e.target.value)}
                style={{ position:"absolute", inset:0, width:"100%", height:"100%",
                  background:"#0d1117", color:"#c9d1d9", fontFamily:"monospace",
                  fontSize:13, border:"none", outline:"none", padding:16,
                  resize:"none", lineHeight:1.6, boxSizing:"border-box" }}
                spellCheck={false}
                onSelect={e => {
                  const ta = e.target as HTMLTextAreaElement;
                  const text = ta.value.slice(ta.selectionStart, ta.selectionEnd);
                  setSelectedText(text);
                  selectionRangeRef.current = { start:ta.selectionStart, end:ta.selectionEnd };
                }} />
            )}
            {!monacoLoaded && (
              <div style={{ position:"absolute", bottom:10, right:12,
                fontSize:11, color:"#6b7280", background:"rgba(13,17,23,.85)",
                padding:"3px 8px", borderRadius:5, pointerEvents:"none" }}>⚙️ Chargement Monaco…</div>
            )}
          </div>
        </div>

        {/* PREVIEW */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
          <div style={{ padding:"6px 14px", background:"#13161d",
            borderBottom:"1px solid #21262d", fontSize:11, color:"#8b949e",
            display:"flex", alignItems:"center", gap:8 }}>
            <span>👁 Aperçu live</span>
            {rendering && <span style={{ color:"#f59e0b", fontSize:10 }}>⏳ Rendu…</span>}
          </div>

          {renderError && (
            <div style={{ margin:12, padding:14, borderRadius:8, flexShrink:0,
              background:"#1a0000", border:"1px solid #7f1d1d",
              fontFamily:"monospace", fontSize:12, color:"#fca5a5",
              lineHeight:1.7, whiteSpace:"pre-wrap" }}>
              <div style={{ fontWeight:700, marginBottom:6, color:"#f87171" }}>⚠️ Erreur latex.js</div>
              {renderError}
              <div style={{ marginTop:8, color:"#6b7280", fontSize:11, fontFamily:"inherit" }}>
                💡 Packages OK: geometry, hyperref, array, url, amsmath, xcolor, booktabs
              </div>
            </div>
          )}

          {srcDoc ? (
            <iframe
              key={srcDoc.length}
              srcDoc={srcDoc}
              style={{ flex:1, border:"none", background:"#fff" }}
              title="LaTeX Preview"
              sandbox="allow-scripts"
            />
          ) : !renderError ? (
            <div style={{ flex:1, display:"flex", alignItems:"center",
              justifyContent:"center", color:"#4b5563", fontSize:13,
              flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:32 }}>📄</div>
              <div>Écrivez du LaTeX pour voir l'aperçu</div>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:#13161d; }
        ::-webkit-scrollbar-thumb { background:#21262d; border-radius:999px; }
        ::-webkit-scrollbar-thumb:hover { background:#30363d; }
        textarea::placeholder { color:#4b5563; }
      `}</style>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding:"6px 11px", borderRadius:7, fontSize:11, fontWeight:600,
  cursor:"pointer", border:"1px solid #21262d",
  background:"#21262d", color:"#8b949e",
};

const textareaStyle: React.CSSProperties = {
  width:"100%", background:"#21262d", border:"1px solid #30363d",
  borderRadius:7, color:"#e6edf3", fontSize:11.5, padding:"10px",
  resize:"vertical", fontFamily:"inherit", lineHeight:1.6,
  minHeight:160, outline:"none",
};