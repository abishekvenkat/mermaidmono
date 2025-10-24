'use client';

import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';

const defaultCode = `graph TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    B -->|No| D[End]
    C --> D`;

export default function Home() {
  const [code, setCode] = useState(defaultCode);
  const [error, setError] = useState<string | null>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const [diagramKey, setDiagramKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const mermaidRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);

    // Dynamically import mermaid
    import('mermaid').then((m) => {
      mermaidRef.current = m.default;
      m.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'JetBrains Mono, Courier New, monospace',
        er: {
          useMaxWidth: true,
          minEntityWidth: 180,
          minEntityHeight: 60,
          entityPadding: 20,
        },
        flowchart: {
          useMaxWidth: true,
          wrappingWidth: 200,
        },
        themeVariables: {
          fontSize: '14px',
        },
      });
      // Trigger initial render of default diagram
      setDiagramKey((prev) => prev + 1);
    });
  }, []);

  useEffect(() => {
    if (!mounted || !mermaidRef.current) return;

    const renderDiagram = async () => {
      if (!diagramRef.current || !code.trim()) {
        setError(null);
        return;
      }

      try {
        setError(null);
        const id = `mermaid-${diagramKey}`;
        const { svg } = await mermaidRef.current.render(id, code);
        diagramRef.current.innerHTML = svg;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid mermaid syntax');
        if (diagramRef.current) {
          diagramRef.current.innerHTML = '';
        }
      }
    };

    renderDiagram();
  }, [code, diagramKey, mounted]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCode(text);
      setDiagramKey((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleDownload = async (format: 'svg' | 'png' = 'svg') => {
    if (!diagramRef.current || error) return;

    try {
      console.log(`Starting ${format} download...`);
      const svg = diagramRef.current.querySelector('svg');
      if (!svg) {
        console.error('No SVG found in diagramRef');
        return;
      }

      console.log('Original SVG dimensions:', {
        width: svg.clientWidth,
        height: svg.clientHeight,
        viewBox: svg.getAttribute('viewBox')
      });

      // Clone the SVG
      const svgClone = svg.cloneNode(true) as SVGSVGElement;

      // Remove any clip-path attributes that might cause cutoff
      const allElements = svgClone.querySelectorAll('*');
      allElements.forEach((el) => {
        el.removeAttribute('clip-path');
        if (el instanceof SVGElement) {
          el.style.overflow = 'visible';
        }
      });

      // Calculate proper bounds including all text overflow
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      // Add clone to DOM temporarily for accurate measurements
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.visibility = 'hidden';
      tempContainer.appendChild(svgClone);
      document.body.appendChild(tempContainer);

      // Measure all graphic elements
      const graphicElements = svgClone.querySelectorAll('text, rect, path, circle, ellipse, line, polyline, polygon, g');
      graphicElements.forEach((el) => {
        try {
          const bbox = (el as SVGGraphicsElement).getBBox();
          if (bbox.width > 0 || bbox.height > 0) {
            minX = Math.min(minX, bbox.x);
            minY = Math.min(minY, bbox.y);
            maxX = Math.max(maxX, bbox.x + bbox.width);
            maxY = Math.max(maxY, bbox.y + bbox.height);
          }
        } catch (e) {
          // Ignore errors
        }
      });

      // Add generous padding
      const padding = 80;
      const finalWidth = (maxX - minX) + (padding * 2);
      const finalHeight = (maxY - minY) + (padding * 2);

      console.log('Calculated bounds:', { minX, minY, maxX, maxY, finalWidth, finalHeight });

      // Set new viewBox and dimensions
      svgClone.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${finalWidth} ${finalHeight}`);
      svgClone.setAttribute('width', finalWidth.toString());
      svgClone.setAttribute('height', finalHeight.toString());
      svgClone.style.overflow = 'visible';

      // Wait for rendering
      await new Promise(resolve => setTimeout(resolve, 100));

      if (format === 'svg') {
        console.log('Exporting as SVG...');
        // Get SVG as string
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const link = document.createElement('a');
        link.download = 'mermaid-diagram.svg';
        link.href = url;
        link.click();

        // Clean up
        document.body.removeChild(tempContainer);
        URL.revokeObjectURL(url);
        console.log('SVG download complete');
      } else {
        console.log('Exporting as PNG...');
        console.log('SVG clone before PNG conversion:', {
          width: svgClone.getAttribute('width'),
          height: svgClone.getAttribute('height'),
          viewBox: svgClone.getAttribute('viewBox'),
          clientWidth: svgClone.clientWidth,
          clientHeight: svgClone.clientHeight
        });

        // PNG export: Use data URL to avoid CORS issues
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));

        const canvas = document.createElement('canvas');
        canvas.width = finalWidth * 3; // 3x for high res
        canvas.height = finalHeight * 3;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          console.error('Could not get canvas context');
          document.body.removeChild(tempContainer);
          return;
        }

        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        console.log('Canvas created:', { width: canvas.width, height: canvas.height });

        const img = new Image();
        img.onload = () => {
          console.log('Image loaded successfully, drawing to canvas...');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          console.log('Converting canvas to PNG...');
          canvas.toBlob((blob) => {
            if (!blob) {
              console.error('Failed to create blob from canvas');
              document.body.removeChild(tempContainer);
              return;
            }

            console.log('PNG blob created, size:', blob.size);
            const pngUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.download = 'mermaid-diagram.png';
            link.href = pngUrl;
            link.click();

            // Clean up
            URL.revokeObjectURL(pngUrl);
            document.body.removeChild(tempContainer);
            console.log('PNG download complete');
          }, 'image/png');
        };

        img.onerror = (e) => {
          console.error('Failed to load SVG as image:', e);
          document.body.removeChild(tempContainer);
        };

        img.src = svgDataUrl;
      }
    } catch (err) {
      console.error('Failed to download diagram:', err);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black font-mono">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-3">MermaidMono</h1>
          <p className="text-sm text-gray-600">
            Visualize mermaid diagrams. Export as PNG.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Editor Section */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold">DIAGRAM CODE</label>
              <button
                onClick={handlePaste}
                className="px-4 py-1.5 text-xs border border-black hover:bg-black hover:text-white transition-colors"
              >
                PASTE
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setDiagramKey((prev) => prev + 1);
              }}
              className="flex-1 min-h-[500px] p-4 border border-black font-mono text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
              spellCheck={false}
            />
          </div>

          {/* Preview Section */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold">PREVIEW</label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload('svg')}
                  disabled={!!error || !code.trim()}
                  className="px-4 py-1.5 text-xs border border-black hover:bg-black hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-black"
                >
                  SVG
                </button>
                <button
                  onClick={() => handleDownload('png')}
                  disabled={!!error || !code.trim()}
                  className="px-4 py-1.5 text-xs border border-black hover:bg-black hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-black"
                >
                  PNG
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-[500px] p-4 border border-black flex items-center justify-center bg-white overflow-auto">
              {!mounted || !mermaidRef.current ? (
                <div className="text-gray-400 text-sm">Loading...</div>
              ) : error ? (
                <div className="text-red-600 text-sm p-4 text-center">
                  <p className="font-bold mb-2">Error:</p>
                  <p className="font-mono text-xs">{error}</p>
                </div>
              ) : (
                <div ref={diagramRef} className="max-w-full" />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center">
          <a
            href="https://github.com/abishekvenkat/mermaidmono"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm hover:underline"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            View Source on GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}
