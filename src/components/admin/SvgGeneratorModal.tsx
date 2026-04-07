import React, { useState } from 'react';

interface SvgGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableFields: string[];
  getElementDimensions: (elementName: string) => { width: number; height: number } | null;
  onApplySvg: (elementName: string, svgContent: string) => void;
}

export function SvgGeneratorModal({
  isOpen,
  onClose,
  availableFields,
  getElementDimensions,
  onApplySvg
}: SvgGeneratorModalProps) {
  const [prompt, setPrompt] = useState('An ornate border graphic');
  const [targetField, setTargetField] = useState<string>(availableFields[0] || '');
  const [generating, setGenerating] = useState(false);
  const [resultSvg, setResultSvg] = useState<string | null>(null);
  
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  if (!isOpen) return null;

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !targetField) return;
    setGenerating(true);
    setResultSvg(null);
    setNotification(null);
    
    try {
      const publicHost = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
      
      const dims = getElementDimensions(targetField);

      const res = await fetch(`${publicHost}/functions/v1/baraja-generate-svg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          prompt,
          frameWidth: dims?.width,
          frameHeight: dims?.height
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json() as { svgPayload?: string };
      if (data.svgPayload) {
        setResultSvg(data.svgPayload);
        showNotification('✨ SVG graphic generated!', 'success');
      } else {
         throw new Error('No SVG returned');
      }

    } catch (e: unknown) {
      const err = e as Error;
      console.error(err);
      showNotification(`Error generating: ${err.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (!resultSvg || !targetField) return;
    onApplySvg(targetField, resultSvg);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, 
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)'
    }}>
      <div style={{
        background: '#1a1a1a', padding: 24, borderRadius: 12, width: '90%', maxWidth: 800,
        color: '#eee', display: 'flex', flexDirection: 'column', gap: 16,
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>✒️ AI Vector Generator</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: '#aaa' }}>Target Element</label>
              <select 
                value={targetField} 
                onChange={(e) => setTargetField(e.target.value)}
                style={{ width: '100%', padding: 12, background: '#2a2a2a', border: '1px solid #333', color: '#fff', borderRadius: 8 }}
              >
                {availableFields.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: '#aaa' }}>SVG Prompt</label>
              <textarea 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                style={{ width: '100%', height: 120, padding: 12, background: '#2a2a2a', border: '1px solid #333', color: '#fff', borderRadius: 8, resize: 'vertical' }}
                placeholder="Describe the SVG graphic..."
              />
            </div>

            <button 
              onClick={handleGenerate}
              disabled={generating || !targetField}
              style={{ padding: '12px 16px', background: generating ? '#555' : '#4caf50', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: generating ? 'not-allowed' : 'pointer' }}
            >
              {generating ? 'Generating SVG...' : '✒️ Generate Graphic'}
            </button>
            
            {resultSvg && (
              <button 
                onClick={handleApply}
                style={{ padding: '12px 16px', background: '#2196f3', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
              >
                ✅ Apply to Schema
              </button>
            )}

            {notification && (
              <div style={{ 
                padding: '12px', 
                borderRadius: 8, 
                background: notification.type === 'success' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                color: notification.type === 'success' ? '#81c784' : '#e57373',
                fontSize: '0.9rem',
                border: notification.type === 'success' ? '1px solid #4caf50' : '1px solid #f44336'
              }}>
                {notification.message}
              </div>
            )}
          </div>

          <div style={{ flex: '1 1 300px', minHeight: 300, background: '#111', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #333', overflow: 'hidden' }}>
            {generating ? (
              <div style={{ color: '#888' }}>Waiting for AI...</div>
            ) : resultSvg ? (
              <div dangerouslySetInnerHTML={{ __html: resultSvg }} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
            ) : (
              <div style={{ color: '#555' }}>SVG preview will appear here</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
