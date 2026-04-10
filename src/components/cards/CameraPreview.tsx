// src/components/cards/CameraPreview.tsx
// Premium camera preview with gyroscope-driven card tilt + holographic shine.
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { CardCanvas } from './CardCanvas';
import styles from './CameraPreview.module.css';

interface CameraPreviewProps {
  card: Card;
  deck: DeckSchema;
  onClose: () => void;
}

/** Clamp a value between min and max */
function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export function CameraPreview({ card, deck, onClose }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flipped, setFlipped] = useState(false);
  const [scale, setScale] = useState(0.55);
  const [showHint, setShowHint] = useState(true);
  const [gyroEnabled, setGyroEnabled] = useState(false);

  // Gyroscope tilt — stored as refs for 60fps performance (no re-renders)
  const tiltRef = useRef({ x: 0, y: 0 });
  const cardWrapperRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // ── Start camera ──
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 3840 },  // Request 4K for maximum quality
          height: { ideal: 2160 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      return { ok: true as const };
    } catch (err) {
      console.error('Camera access failed:', err);
      return {
        ok: false as const,
        message: (err as Error).name === 'NotAllowedError'
          ? 'Permitir acceso a la cámara en ajustes del navegador.'
          : `No se pudo acceder a la cámara: ${(err as Error).message}`,
      };
    }
  }, []);

  // Camera init
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await startCamera(facingMode);
      if (cancelled) return;
      if (result.ok) {
        setCameraReady(true);
        setCameraError(null);
      } else {
        setCameraError(result.message);
      }
    })();
    const hintTimer = setTimeout(() => setShowHint(false), 4000);
    return () => {
      cancelled = true;
      clearTimeout(hintTimer);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gyroscope ──
  useEffect(() => {
    if (!gyroEnabled) {
      // Reset tilt when disabled
      tiltRef.current = { x: 0, y: 0 };
      applyTiltFrame();
      return;
    }

    function handleOrientation(e: DeviceOrientationEvent) {
      // beta = front-to-back tilt (-180..180), gamma = left-to-right tilt (-90..90)
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      // Map to ±25 degrees of card tilt
      tiltRef.current = {
        x: clamp(gamma * 0.5, -25, 25),   // left-right
        y: clamp((beta - 45) * 0.4, -25, 25),  // front-back (45° = phone "at rest" upright)
      };
    }

    window.addEventListener('deviceorientation', handleOrientation, true);
    // Start render loop
    function tick() {
      applyTiltFrame();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [gyroEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Apply tilt transform directly to DOM for 60fps (no React re-render) */
  function applyTiltFrame() {
    const { x, y } = tiltRef.current;
    if (cardWrapperRef.current) {
      cardWrapperRef.current.style.transform =
        `perspective(800px) rotateY(${x}deg) rotateX(${-y}deg)`;
    }
    // Move shine highlight based on tilt
    if (shineRef.current) {
      const shineX = 50 + x * 1.5;
      const shineY = 50 + y * 1.5;
      shineRef.current.style.background =
        `radial-gradient(ellipse at ${shineX}% ${shineY}%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 30%, transparent 70%)`;
      shineRef.current.style.opacity = gyroEnabled ? '1' : '0';
    }
    // Dynamic shadow based on tilt
    if (shadowRef.current) {
      const shadowX = -x * 1.2;
      const shadowY = y * 1.2 + 20;
      const blur = 40 + Math.abs(x) + Math.abs(y);
      shadowRef.current.style.boxShadow =
        `${shadowX}px ${shadowY}px ${blur}px rgba(0,0,0,0.7), 0 0 80px rgba(0,0,0,0.3)`;
    }
  }

  // ── Request gyroscope permission (iOS 13+) ──
  async function handleToggleGyro() {
    if (gyroEnabled) {
      setGyroEnabled(false);
      return;
    }
    // iOS 13+ requires explicit permission
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof doe.requestPermission === 'function') {
      try {
        const permission = await doe.requestPermission();
        if (permission === 'granted') {
          setGyroEnabled(true);
        }
      } catch {
        console.warn('Gyroscope permission denied');
      }
    } else {
      // Android / desktop — just enable
      setGyroEnabled(true);
    }
  }

  // ── Switch camera ──
  async function handleSwitchCamera() {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    const result = await startCamera(newFacing);
    if (result.ok) {
      setCameraReady(true);
      setCameraError(null);
    } else {
      setCameraError(result.message);
    }
  }

  // ── Pinch-to-zoom ──
  const lastDistRef = useRef<number | null>(null);
  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastDistRef.current !== null) {
        const delta = (dist - lastDistRef.current) * 0.003;
        setScale(prev => clamp(prev + delta, 0.2, 1.5));
      }
      lastDistRef.current = dist;
    }
  }
  function handleTouchEnd() {
    lastDistRef.current = null;
  }

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      {/* Camera Feed */}
      <video
        ref={videoRef}
        className={styles.videoFeed}
        playsInline
        muted
        autoPlay
        style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }}
      />

      {/* Vignette overlay — makes card pop against camera */}
      <div className={styles.vignette} />

      {/* Permission Error */}
      {cameraError && (
        <div className={styles.permissionError}>
          <h3>📷 Acceso a Cámara</h3>
          <p>{cameraError}</p>
          <button className={styles.btnControl} onClick={onClose}>Cerrar</button>
        </div>
      )}

      {/* Hint */}
      {showHint && cameraReady && (
        <div className={styles.hint}>
          <div className={styles.hintIcon}>📱</div>
          <span>Mové el teléfono para ver el efecto 3D</span>
          <span className={styles.hintSub}>Pinch para agrandar · Tap para voltear</span>
        </div>
      )}

      {/* Card Layer */}
      <div
        className={styles.cardLayer}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 3D Transform Wrapper */}
        <div
          ref={cardWrapperRef}
          className={styles.cardTransform}
          style={{ width: `${scale * 380}px` }}
        >
          {/* Dynamic shadow layer (under the card) */}
          <div ref={shadowRef} className={styles.dynamicShadow} />

          {/* The actual card */}
          <div className={styles.cardInner}>
            <CardCanvas
              card={card}
              deck={deck}
              flipped={flipped}
              onFlip={() => setFlipped(!flipped)}
            />

            {/* Holographic shine overlay (on top of card) */}
            <div ref={shineRef} className={styles.holoShine} />
          </div>
        </div>
      </div>

      {/* Top Bar */}
      <div className={styles.topBar}>
        <span className={styles.topBarTitle}>
          {card.front.title}
        </span>
        <button className={styles.btnClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {/* Bottom Controls */}
      <div className={styles.bottomBar}>
        {/* Scale Slider */}
        <div className={styles.scaleControl}>
          <span>TAMAÑO</span>
          <input
            type="range"
            min="0.25"
            max="1.2"
            step="0.01"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className={styles.scaleSlider}
          />
          <span>{Math.round(scale * 100)}%</span>
        </div>

        {/* Action Buttons */}
        <div className={styles.controlsRow}>
          <button
            className={`${styles.btnControl} ${gyroEnabled ? styles.btnControlActive : ''}`}
            onClick={handleToggleGyro}
          >
            {gyroEnabled ? '🔮 3D On' : '🔮 3D Off'}
          </button>
          <button
            className={`${styles.btnControl} ${flipped ? styles.btnControlActive : ''}`}
            onClick={() => setFlipped(!flipped)}
          >
            🔄 Voltear
          </button>
          <button className={styles.btnControl} onClick={handleSwitchCamera}>
            📸 Cámara
          </button>
          <button
            className={styles.btnControl}
            onClick={() => { setScale(0.55); setGyroEnabled(false); setFlipped(false); }}
          >
            ↺ Reset
          </button>
        </div>
      </div>
    </div>
  );
}
