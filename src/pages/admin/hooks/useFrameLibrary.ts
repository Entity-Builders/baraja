import { useCallback, useEffect, useState } from 'react';
import type { GeneratedFrame, FramesLibraryResponse, LibraryFrame } from '../frameGeneratorTypes';

interface UseFrameLibraryOptions {
  onError: (message: string) => void;
}

export function useFrameLibrary({ onError }: UseFrameLibraryOptions) {
  const [frames, setFrames] = useState<LibraryFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchLibrary = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/__cms__/list-frames-library');
      const data = await response.json() as FramesLibraryResponse;

      if (data.success && data.frames) {
        setFrames(data.frames);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveToLibrary = useCallback(async (frame: GeneratedFrame) => {
    try {
      setSaving(true);
      const response = await fetch('/__cms__/save-frame-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: frame.dataUrl,
          prompt: frame.prompt,
          typography: frame.typography,
          face: frame.face,
          widthMm: frame.widthMm,
          heightMm: frame.heightMm,
          presetId: frame.presetId,
        }),
      });
      const data = await response.json() as { success: boolean; error?: string };

      if (data.success) {
        void fetchLibrary();
        return;
      }

      throw new Error(data.error);
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [fetchLibrary, onError]);

  useEffect(() => {
    void fetchLibrary();
  }, [fetchLibrary]);

  return {
    fetchLibrary,
    frames,
    loading,
    saveToLibrary,
    saving,
  };
}
