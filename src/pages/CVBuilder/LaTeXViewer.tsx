// LaTeXViewer.tsx
import React, { useEffect, useRef, useState } from 'react';

interface LaTeXViewerProps {
  latex: string;
  onError?: (error: string) => void;
}

export const LaTeXViewer: React.FC<LaTeXViewerProps> = ({ latex, onError }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function renderLaTeX() {
      try {
        // Utiliser import() dynamique avec type any
        const module: any = await import("https://cdn.jsdelivr.net/npm/latex.js/dist/latex.mjs");
        const { HtmlGenerator } = module;
        
        const generator = new HtmlGenerator({
          hyphenate: true,
          documentClass: 'article'
        });
        
        module.parse(latex, { generator });
        
        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = '';
          
          const styles = generator.stylesAndScripts('https://cdn.jsdelivr.net/npm/latex.js/dist/');
          const fragment = generator.domFragment();
          
          containerRef.current.appendChild(styles);
          containerRef.current.appendChild(fragment);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Erreur LaTeX:', err);
        setLoading(false);
        if (onError) {
          onError(err.message || 'Erreur de compilation LaTeX');
        }
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div style="color: #ef4444; padding: 20px; text-align: center;">
              <strong>❌ Erreur de compilation</strong>
              <pre style="font-size: 12px; margin-top: 10px;">${err.message}</pre>
            </div>
          `;
        }
      }
    }

    renderLaTeX();

    return () => {
      mounted = false;
    };
  }, [latex, onError]);

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'auto' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#6b7280'
        }}>
          ⏳ Chargement...
        </div>
      )}
      <div 
        ref={containerRef}
        style={{
          padding: '30px',
          background: 'white',
          fontFamily: "'Times New Roman', serif",
          lineHeight: 1.5,
          fontSize: '14px',
          minHeight: '100%'
        }}
      />
    </div>
  );
};