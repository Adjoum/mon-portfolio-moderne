import React, { useState, useEffect, useRef, useCallback } from "react";
import { runAiFeature } from "../../lib/aiClient";
import { useAiAvailability } from "../../hooks/useAiAvailability";
import { compileLatexPdf, LatexCompileError, stripCodeFences } from "../../lib/latexCompile";
import { TEMPLATES, buildFinalLatex } from "./latexTemplates";

// Fonctions IA de l'éditeur : exécutées par blog-api (latex.generate / latex.improve).
// Prompts et modèle sont définis côté serveur ; aucune clé dans le navigateur.
async function aiGenerateLatex(info: string, template: string, existing: string): Promise<string> {
  return stripCodeFences(await runAiFeature("latex.generate", { info, template, existing }));
}


async function aiImproveSelection(selection: string, instruction: string, fullCode: string): Promise<string> {
  const content = await runAiFeature("latex.improve", {
    selection, instruction, context: fullCode.slice(0, 3000),
  });
  return content.replace(/```latex\n?/g, "").replace(/```\n?/g, "").trim();
}

// Aperçu PDF : compilé par le service isolé latex-runner, via blog-api (src/lib/latexCompile.ts).
// Compilation à la demande (bouton, Ctrl+S) ou automatique 3 s après la dernière frappe ;
// immédiate après un changement de template, une génération IA ou une modification de la photo.
const AUTO_COMPILE_DELAY_MS = 3000;


function CropModal({
  src, onCancel, onConfirm,
}: { src: string; onCancel: () => void; onConfirm: (dataUrl: string) => void }) {
  const ASPECT = 35 / 45;
  const MAX_W = 280, MAX_H = 360;
  const imgRef = useRef<HTMLImageElement>(null);
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ x: 0, y: 0, w: 0 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const clampBox = (b: { x: number; y: number; w: number }, d = disp) => {
    const w = Math.min(b.w, d.w, d.h * ASPECT);
    const h = w / ASPECT;
    return { x: Math.min(Math.max(0, b.x), d.w - w), y: Math.min(Math.max(0, b.y), d.h - h), w };
  };

  const onImgLoad = () => {
    const img = imgRef.current!;
    const r = img.naturalWidth / img.naturalHeight;
    let w = MAX_W, h = MAX_W / r;
    if (h > MAX_H) { h = MAX_H; w = MAX_H * r; }
    const d = { w, h };
    setDisp(d);
    const bw = Math.min(w * 0.7, h * ASPECT);
    setBox(clampBox({ x: (w - bw) / 2, y: Math.max(0, (h - bw / ASPECT) / 2), w: bw }, d));
  };

  const startDrag = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - box.x, dy: e.clientY - box.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setBox((b) => clampBox({ ...b, x: e.clientX - dragRef.current!.dx, y: e.clientY - dragRef.current!.dy }));
  };
  const endDrag = () => { dragRef.current = null; };

  const confirm = () => {
    const img = imgRef.current!;
    const scale = img.naturalWidth / disp.w;
    const OUT_W = 350, OUT_H = 450;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W; canvas.height = OUT_H;
    canvas.getContext("2d")!.drawImage(
      img,
      box.x * scale, box.y * scale, box.w * scale, (box.w / ASPECT) * scale,
      0, 0, OUT_W, OUT_H
    );
    onConfirm(canvas.toDataURL("image/jpeg", 0.9));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#13161d", border: "1px solid #21262d", borderRadius: 12, padding: 16, width: 320, maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 800, color: "#e6edf3" }}>✂️ Recadrer (photo d'identité)</div>
        <div style={{ position: "relative", width: disp.w, height: disp.h, margin: "0 auto", userSelect: "none", touchAction: "none" }}>
          <img ref={imgRef} src={src} onLoad={onImgLoad} draggable={false} style={{ width: disp.w, height: disp.h, display: "block", borderRadius: 6 }} />
          {disp.w > 0 && (
            <div
              onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag}
              style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.w / ASPECT, border: "2px solid #6366f1", boxShadow: "0 0 0 9999px rgba(0,0,0,.55)", cursor: "move", borderRadius: 2 }}
            />
          )}
        </div>
        {disp.w > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Taille du cadre</div>
            <input
              type="range" min={Math.max(40, disp.w * 0.25)} max={disp.w} step={1} value={box.w}
              onChange={(e) => setBox((b) => clampBox({ ...b, w: parseFloat(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ ...btnStyle, flex: 1, padding: "9px 0" }}>Annuler</button>
          <button onClick={confirm} style={{ ...btnStyle, flex: 1, padding: "9px 0", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none" }}>✓ Valider</button>
        </div>
      </div>
    </div>
  );
}




export default function LaTeXCVEditor() {
  const [code, setCode] = useState(TEMPLATES.overleafClassic.code);
  const [pdfUrl, setPdfUrl] = useState("");
  const [compiledKey, setCompiledKey] = useState("");
  const [compileError, setCompileError] = useState<LatexCompileError | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [autoCompile, setAutoCompile] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState("overleafClassic");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiMode, setAIMode] = useState<"generate" | "improve">("generate");
  const [aiInfo, setAiInfo] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const aiAvailable = useAiAvailability();
  const [selectedText, setSelectedText] = useState("");
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoWidth, setPhotoWidth] = useState(3.2);
  const [showPhotoPanel, setShowPhotoPanel] = useState(false);
  const [rawPhoto, setRawPhoto] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<{ start: number; end: number } | null>(null);

  // État de la compilation, hors rendu : une seule requête à la fois par onglet
  const latestRef = useRef({ code, photoData, photoWidth });
  const pdfUrlRef = useRef("");
  const compileRef = useRef({ running: false, pending: false, lastKey: "", pausedUntil: 0, downloadWhenReady: false });
  const compileNowRef = useRef(true);   // première compilation dès l'ouverture
  const runCompileRef = useRef<(force: boolean) => Promise<void>>(async () => {});

  // Code final : %%PHOTO%% devient la photo (photo.jpg) ou un cadre vide (latexTemplates.ts)
  const buildFinalCode = useCallback((raw: string) => buildFinalLatex(raw, !!photoData, photoWidth), [photoData, photoWidth]);
  const currentKey = `${buildFinalCode(code)}\u0000${photoData ?? ""}`;

  useEffect(() => {
    latestRef.current = { code, photoData, photoWidth };
  }, [code, photoData, photoWidth]);

  const downloadPdf = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "cv.pdf";
    a.click();
  };

  const runCompile = useCallback(async (force: boolean) => {
    const state = compileRef.current;
    if (state.running) {
      state.pending = true;
      return;
    }
    const latest = latestRef.current;
    const finalCode = buildFinalLatex(latest.code, !!latest.photoData, latest.photoWidth);
    const key = `${finalCode}\u0000${latest.photoData ?? ""}`;
    if (!force && (key === state.lastKey || Date.now() < state.pausedUntil)) return;

    state.running = true;
    setRendering(true);
    try {
      const blob = await compileLatexPdf(finalCode, latest.photoData);
      const url = URL.createObjectURL(blob);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = url;
      state.lastKey = key;
      setPdfUrl(url);
      setCompiledKey(key);
      setCompileError(null);
      setPreviewUnavailable(false);
      if (state.downloadWhenReady) downloadPdf(url);
    } catch (e) {
      const err = e instanceof LatexCompileError
        ? e
        : new LatexCompileError("LATEX_NETWORK", 0, "Service de compilation injoignable.");
      setCompileError(err);
      if (err.unavailable) setPreviewUnavailable(true);
      if (err.code === "LATEX_BUSY") {
        // Service occupé : nouvel essai automatique après le délai indiqué
        const delay = (err.retryAfterSec ?? 3) * 1000;
        setTimeout(() => void runCompileRef.current(false), delay);
      } else if (err.throttled) {
        state.pausedUntil = Date.now() + (err.retryAfterSec ?? 60) * 1000;
      } else if (!err.unavailable) {
        // Erreur du document : pas de nouvelle tentative tant qu'il n'est pas modifié
        state.lastKey = key;
      }
    } finally {
      state.running = false;
      state.downloadWhenReady = false;
      setRendering(false);
      if (state.pending) {
        state.pending = false;
        void runCompileRef.current(false);
      }
    }
  }, []);

  useEffect(() => {
    runCompileRef.current = runCompile;
  }, [runCompile]);

  // Compilation automatique : immédiate après un template, l'IA ou la photo ; sinon 3 s après la frappe
  useEffect(() => {
    if (!autoCompile || previewUnavailable) return;
    const delay = compileNowRef.current ? 0 : AUTO_COMPILE_DELAY_MS;
    compileNowRef.current = false;
    const timer = setTimeout(() => void runCompile(false), delay);
    return () => clearTimeout(timer);
  }, [code, photoData, photoWidth, autoCompile, previewUnavailable, runCompile]);

  useEffect(() => () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
  }, []);

  // Ctrl+S / Cmd+S : compiler maintenant (hors de Monaco, qui a sa propre commande)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void runCompileRef.current(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const compileNow = () => {
    setPreviewUnavailable(false);
    void runCompile(true);
  };

  const goToLine = (line: number) => {
    type LineTarget = { revealLineInCenter(n: number): void; setPosition(p: { lineNumber: number; column: number }): void; focus(): void };
    const ed = (window as unknown as { __monacoEditor?: LineTarget }).__monacoEditor;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.focus();
  };

  // Lit la photo, la redimensionne (max 500px) et la compresse en JPEG
  /*const handlePhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 500;
        let w = img.width, h = img.height;
        if (w > MAX) { h = (h * MAX) / w; w = MAX; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        setPhotoData(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };  */

  const handlePhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setRawPhoto(url);  // on garde l'original pour pouvoir re-recadrer
      setCropSrc(url);   // ouvre la fenêtre de recadrage
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const w = window as any;

    if (w.__monacoEditor) {
      setMonacoLoaded(true);
      return;
    }

    if (w.__monacoLoading) {
      const check = setInterval(() => {
        if (w.__monacoEditor) {
          setMonacoLoaded(true);
          clearInterval(check);
        }
      }, 200);
      return () => clearInterval(check);
    }

    w.__monacoLoading = true;

    const loader = document.createElement("script");
    loader.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.min.js";
    loader.async = true;

    loader.onload = () => {
      w.require.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs" },
      });

      w.require(["vs/editor/editor.main"], () => {
        if (!editorRef.current || w.__monacoEditor) {
          setMonacoLoaded(true);
          return;
        }

        if (!w.monaco.languages.getLanguages().find((l: any) => l.id === "latex")) {
          w.monaco.languages.register({ id: "latex" });
        }

        const editor = w.monaco.editor.create(editorRef.current, {
          value: code,
          language: "latex",
          theme: "vs-dark",
          fontSize: 13,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          lineNumbers: "on",
          minimap: { enabled: false },
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
        });

        editor.onDidChangeModelContent(() => setCode(editor.getValue()));
        // Ctrl+S / Cmd+S dans l'éditeur : compiler maintenant
        editor.addCommand(w.monaco.KeyMod.CtrlCmd | w.monaco.KeyCode.KeyS, () => void runCompileRef.current(true));

        editor.onDidChangeCursorSelection(() => {
          const sel = editor.getSelection();
          if (sel && !sel.isEmpty()) {
            const model = editor.getModel();
            const text = model?.getValueInRange(sel) ?? "";
            setSelectedText(text);
            const start = model?.getOffsetAt(sel.getStartPosition()) ?? 0;
            selectionRangeRef.current = { start, end: start + text.length };
          } else {
            setSelectedText("");
            selectionRangeRef.current = null;
          }
        });

        w.__monacoEditor = editor;
        delete w.__monacoLoading;
        setMonacoLoaded(true);
      });
    };

    document.head.appendChild(loader);

    return () => {
      const ed = (window as any).__monacoEditor;
      if (ed?.dispose) {
        ed.dispose();
        delete (window as any).__monacoEditor;
      }
    };
  }, []);

  useEffect(() => {
    const ed = (window as any).__monacoEditor;
    if (ed && ed.getValue() !== code) {
      const pos = ed.getPosition();
      ed.setValue(code);
      if (pos) ed.setPosition(pos);
    }
  }, [code]);

  const handleTemplateChange = (id: string) => {
    compileNowRef.current = true;
    setActiveTemplate(id);
    setCode(TEMPLATES[id].code);
  };

  const handleAIGenerate = async () => {
    if (!aiInfo.trim()) return;
    setAiLoading(true);
    setAiError("");

    try {
      const r = await aiGenerateLatex(aiInfo, TEMPLATES[activeTemplate].code, code);
      if (r.trim()) {
        compileNowRef.current = true;
        setCode(r.trim());
      }
      else setAiError("Aucun code retourné.");
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIImprove = async () => {
    if (!selectedText.trim() || !aiInstruction.trim()) return;
    setAiLoading(true);
    setAiError("");

    try {
      const improved = await aiImproveSelection(selectedText, aiInstruction, code);
      if (improved) {
        const range = selectionRangeRef.current;
        if (range) {
          compileNowRef.current = true;
          setCode((prev) => prev.slice(0, range.start) + improved + prev.slice(range.end));
        }
      } else {
        setAiError("Aucune amélioration retournée.");
      }
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadTex = () => {
    const url = URL.createObjectURL(new Blob([buildFinalCode(code)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cv.tex";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // PDF à jour : téléchargé tel quel ; sinon compilé d'abord, puis téléchargé
  const pdfStale = !!pdfUrl && compiledKey !== currentKey;
  const handleDownloadPdf = () => {
    if (pdfUrl && !pdfStale) return downloadPdf(pdfUrl);
    compileRef.current.downloadWhenReady = true;
    compileNow();
  };

  const copyCode = () => navigator.clipboard.writeText(code);

  const statusColor = rendering ? "#f59e0b"
    : previewUnavailable ? "#6b7280"
    : compileError ? "#ef4444"
    : pdfStale ? "#60a5fa"
    : pdfUrl ? "#22c55e" : "#6b7280";
  const statusText = rendering ? "Compilation..."
    : previewUnavailable ? "Aperçu indisponible"
    : compileError ? (compileError.throttled ? "Limite atteinte" : "Erreur")
    : pdfStale ? "Modifié, non compilé"
    : pdfUrl ? "PDF prêt" : "En attente";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0e1015",
        color: "#c9d1d9",
        fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
        fontSize: 13,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 18px",
          background: "#13161d",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#e6edf3" }}>📘 LaTeX CV Editor</span>
          <span style={{ fontSize: 10, color: "#8b949e" }}>mode Overleaf-compatible · PDF compilé en environnement isolé</span>
          
        </div>
        <button
            onClick={() => window.location.href = '/cv-generator'}
            style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', border: '1px solid #21262d',
              background: '#21262d', color: '#8b949e',
              whiteSpace: 'nowrap',
            }}
          >
            ← CV Generator
          </button>

        <div style={{ display: "flex", gap: 5, marginLeft: 10, flexWrap: "wrap" }}>
          {Object.entries(TEMPLATES).map(([id, t]) => (
            <button
              key={id}
              onClick={() => handleTemplateChange(id)}
              style={{
                padding: "5px 11px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid",
                borderColor: activeTemplate === id ? "#6366f1" : "#21262d",
                background: activeTemplate === id ? "rgba(99,102,241,.15)" : "#21262d",
                color: activeTemplate === id ? "#a5b4fc" : "#8b949e",
              }}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 7, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: statusColor }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: statusColor,
              }}
            />
            {statusText}
          </div>

          <button onClick={() => setShowPhotoPanel((s) => !s)} style={btnStyle}>
            📷 Photo
          </button>

          <button onClick={() => setShowAIPanel((s) => !s)} style={btnStyle}>
            🤖 IA
          </button>
          <button onClick={copyCode} style={btnStyle}>
            📋 Copier
          </button>
          <button onClick={handleDownloadTex} style={btnStyle} title="Télécharger le code source (.tex)">
            ⬇ .tex
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={rendering || (previewUnavailable && !pdfUrl)}
            style={{
              ...btnStyle,
              background: pdfUrl && !pdfStale ? "#1f6feb" : btnStyle.background,
              color: pdfUrl && !pdfStale ? "#fff" : btnStyle.color,
              opacity: rendering || (previewUnavailable && !pdfUrl) ? 0.5 : 1,
            }}
            title={pdfStale ? "Compiler les dernières modifications puis télécharger le PDF" : "Télécharger le PDF compilé"}
          >
            ⬇ PDF
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {showPhotoPanel && (
          <div style={{ width: 280, flexShrink: 0, background: "#13161d", borderRight: "1px solid #21262d", display: "flex", flexDirection: "column", padding: 16, gap: 12, overflow: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#e6edf3" }}>📷 Photo du CV</div>
            <div style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.6 }}>
              La photo s'insère à l'emplacement <code>%%PHOTO%%</code> (présent dans le template « Premium Hero »).
            </div>

            <label style={{ ...btnStyle, textAlign: "center", display: "block", padding: "9px 0" }}>
              {photoData ? "🔄 Changer la photo" : "⬆ Choisir une photo"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }}
              />
            </label>

            {photoData && (
              <>
                <img src={photoData} alt="aperçu" style={{ width: "100%", borderRadius: 8, border: "1px solid #30363d" }} />
                {rawPhoto && (
                  <button onClick={() => setCropSrc(rawPhoto)} style={{ ...btnStyle, textAlign: "center" }}>
                    ✂️ Recadrer
                  </button>
                )}
                <div style={{ fontSize: 11, color: "#8b949e" }}>Largeur : <strong>{photoWidth.toFixed(1)} cm</strong></div>
                <input
                  type="range" min={2} max={5} step={0.1} value={photoWidth}
                  onChange={(e) => setPhotoWidth(parseFloat(e.target.value))}
                  style={{ width: "100%" }}
                />
                <button
                  onClick={() => { compileNowRef.current = true; setPhotoData(null); }}
                  style={{ ...btnStyle, color: "#f87171", borderColor: "#7f1d1d", background: "rgba(239,68,68,.08)" }}
                >
                  🗑 Retirer la photo
                </button>
              </>
            )}
          </div>
        )}
        {showAIPanel && (
          <div
            style={{
              width: 300,
              flexShrink: 0,
              background: "#13161d",
              borderRight: "1px solid #21262d",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #21262d" }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10, color: "#e6edf3" }}>🤖 Assistant IA</div>
              <div style={{ display: "flex", gap: 5 }}>
                {(["generate", "improve"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setAIMode(m)}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "1px solid",
                      borderColor: aiMode === m ? "#6366f1" : "#21262d",
                      background: aiMode === m ? "rgba(99,102,241,.2)" : "transparent",
                      color: aiMode === m ? "#a5b4fc" : "#8b949e",
                    }}
                  >
                    {m === "generate" ? "⚡ Générer" : "✨ Améliorer"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {aiMode === "generate" ? (
                <>
                  <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 8, lineHeight: 1.6 }}>
                    Décrivez votre profil, l'IA génère un LaTeX compatible Overleaf.
                  </div>

                  <textarea
                    value={aiInfo}
                    onChange={(e) => setAiInfo(e.target.value)}
                    placeholder={"Nom: Koffi Wilfried Adjoumani\nPoste: Data Analyst\nExpérience:\n- CHR San-Pedro\nFormation:\n- M1 Big Data Analytics\nCompétences:\n- Python, SQL, Power BI"}
                    style={textareaStyle}
                  />

                  <button
                    onClick={handleAIGenerate}
                    disabled={aiLoading || !aiInfo.trim() || !aiAvailable("latex.generate")}
                    style={{
                      width: "100%",
                      padding: "10px 0",
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                      border: "none",
                      background: aiLoading ? "#21262d" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                      color: "#fff",
                      opacity: aiLoading || !aiInfo.trim() ? 0.6 : 1,
                    }}
                  >
                    {aiLoading ? "⏳ Génération..." : "⚡ Générer le code LaTeX"}
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 7,
                      marginBottom: 10,
                      background: selectedText ? "rgba(34,197,94,.08)" : "rgba(245,158,11,.08)",
                      border: `1px solid ${selectedText ? "rgba(34,197,94,.25)" : "rgba(245,158,11,.25)"}`,
                      fontSize: 11,
                      color: selectedText ? "#4ade80" : "#fbbf24",
                    }}
                  >
                    {selectedText ? `✅ ${selectedText.split("\n").length} ligne(s) sélectionnée(s)` : "⚠️ Sélectionnez du texte d'abord"}
                  </div>

                  <textarea
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    placeholder={"Ex:\n• rends cette section plus professionnelle\n• ajoute des métriques\n• corrige la syntaxe LaTeX"}
                    style={{ ...textareaStyle, minHeight: 120, marginBottom: 10 }}
                  />

                  <button
                    onClick={handleAIImprove}
                    disabled={aiLoading || !selectedText.trim() || !aiInstruction.trim() || !aiAvailable("latex.improve")}
                    style={{
                      width: "100%",
                      padding: "10px 0",
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                      border: "none",
                      background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                      color: "#fff",
                      opacity: aiLoading || !selectedText || !aiInstruction ? 0.5 : 1,
                    }}
                  >
                    {aiLoading ? "⏳ Amélioration..." : "✨ Améliorer la sélection"}
                  </button>
                </>
              )}

              {!aiAvailable(aiMode === "generate" ? "latex.generate" : "latex.improve") && (
                <div
                  role="status"
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    borderRadius: 7,
                    background: "rgba(245,158,11,.08)",
                    border: "1px solid rgba(245,158,11,.3)",
                    fontSize: 11,
                    color: "#fbbf24",
                  }}
                >
                  ℹ️ Cette fonction IA est momentanément indisponible. L'édition manuelle et le
                  téléchargement du fichier .tex restent disponibles.
                </div>
              )}

              {aiError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    borderRadius: 7,
                    background: "rgba(239,68,68,.1)",
                    border: "1px solid rgba(239,68,68,.3)",
                    fontSize: 11,
                    color: "#f87171",
                  }}
                >
                  ⚠️ {aiError}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: "1px solid #21262d" }}>
          <div
            style={{
              padding: "6px 14px",
              background: "#13161d",
              borderBottom: "1px solid #21262d",
              fontSize: 11,
              color: "#8b949e",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>📝 Éditeur LaTeX</span>
            <span>{code.split("\n").length} lignes</span>
          </div>

          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div ref={editorRef} style={{ position: "absolute", inset: 0, visibility: monacoLoaded ? "visible" : "hidden" }} />

            {!monacoLoaded && (
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  background: "#0d1117",
                  color: "#c9d1d9",
                  fontFamily: "monospace",
                  fontSize: 13,
                  border: "none",
                  outline: "none",
                  padding: 16,
                  resize: "none",
                  lineHeight: 1.6,
                  boxSizing: "border-box",
                }}
                spellCheck={false}
                onSelect={(e) => {
                  const ta = e.target as HTMLTextAreaElement;
                  const text = ta.value.slice(ta.selectionStart, ta.selectionEnd);
                  setSelectedText(text);
                  selectionRangeRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
                }}
              />
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              padding: "6px 14px",
              background: "#13161d",
              borderBottom: "1px solid #21262d",
              fontSize: 11,
              color: "#8b949e",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>👁 Aperçu PDF</span>
            {rendering && <span style={{ color: "#f59e0b", fontSize: 10 }}>⏳ Compilation...</span>}
            <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }} title="Compiler automatiquement 3 s après la dernière modification">
              <input type="checkbox" checked={autoCompile} onChange={(e) => setAutoCompile(e.target.checked)} />
              Auto
            </label>
            <button
              onClick={compileNow}
              disabled={rendering}
              style={{ ...btnStyle, padding: "4px 10px", color: "#e6edf3", opacity: rendering ? 0.5 : 1 }}
              title="Compiler maintenant (Ctrl+S)"
            >
              ▶ Compiler
            </button>
          </div>

          {compileError && !previewUnavailable && (
            <div
              role="alert"
              style={{
                margin: 12,
                padding: 14,
                borderRadius: 8,
                flexShrink: 0,
                maxHeight: "40%",
                overflow: "auto",
                background: compileError.throttled || compileError.code === "LATEX_BUSY" ? "rgba(245,158,11,.08)" : "#1a0000",
                border: `1px solid ${compileError.throttled || compileError.code === "LATEX_BUSY" ? "rgba(245,158,11,.35)" : "#7f1d1d"}`,
                fontSize: 12,
                color: compileError.throttled || compileError.code === "LATEX_BUSY" ? "#fbbf24" : "#fca5a5",
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ {compileError.message}</div>
              {compileError.line && !compileError.details.length && (
                <button onClick={() => goToLine(compileError.line!)} style={lineLinkStyle}>Aller à la ligne {compileError.line}</button>
              )}
              {compileError.details.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontFamily: "monospace", display: "flex", flexDirection: "column", gap: 6 }}>
                  {compileError.details.map((d, i) => (
                    <li key={i}>
                      {d.line ? (
                        <button onClick={() => goToLine(d.line!)} style={lineLinkStyle}>Ligne {d.line}</button>
                      ) : null}{" "}
                      {d.message}
                      {d.context && <div style={{ color: "#8b949e", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{d.context}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {pdfUrl && <div style={{ marginTop: 8, color: "#8b949e", fontSize: 11 }}>Dernier PDF valide affiché ci-dessous.</div>}
            </div>
          )}

          {previewUnavailable ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8b949e", fontSize: 13, flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 32 }}>📄</div>
              <div style={{ maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
                {compileError?.message ?? "L'aperçu PDF est momentanément indisponible."}
                <br />
                Le fichier <strong>.tex</strong> reste téléchargeable pour Overleaf ou votre distribution LaTeX.
                <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
                  <button onClick={handleDownloadTex} style={{ ...btnStyle, background: "#1f6feb", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                    ⬇ Télécharger .tex
                  </button>
                  <button onClick={compileNow} style={{ ...btnStyle, fontSize: 12 }}>
                    ↻ Réessayer
                  </button>
                </div>
              </div>
            </div>
          ) : pdfUrl ? (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              style={{ flex: 1, border: "none", background: "#fff", opacity: compileError ? 0.6 : 1 }}
              title="Aperçu PDF du CV"
            />
          ) : !compileError ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4b5563", fontSize: 13, flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 32 }}>📄</div>
              <div>{rendering ? "Compilation du PDF..." : "Le PDF compilé apparaîtra ici"}</div>
            </div>
          ) : null}
        </div>
      </div>
      {cropSrc && (
        <CropModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => { compileNowRef.current = true; setPhotoData(dataUrl); setCropSrc(null); }}
        />
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid #21262d",
  background: "#21262d",
  color: "#8b949e",
};

const lineLinkStyle: React.CSSProperties = {
  padding: "1px 6px",
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  border: "1px solid #7f1d1d",
  background: "rgba(239,68,68,.12)",
  color: "#fecaca",
  fontFamily: "inherit",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "#21262d",
  border: "1px solid #30363d",
  borderRadius: 7,
  color: "#e6edf3",
  fontSize: 11.5,
  padding: "10px",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.6,
  minHeight: 160,
  outline: "none",
};