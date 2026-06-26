import { useEffect, useState } from 'react';
import {
  getInstallPlatform,
  isMobilePortraitPlayViewport,
  isPwaStandalone,
  subscribeStandaloneMode,
  type PwaInstallPlatform,
} from '../lib/pwa';

export function usePwaStatus(): {
  installPlatform: PwaInstallPlatform;
  isStandalone: boolean;
} {
  const [isStandalone, setIsStandalone] = useState(() => isPwaStandalone());
  const [installPlatform, setInstallPlatform] = useState(() => getInstallPlatform());

  useEffect(() => {
    const update = () => {
      setIsStandalone(isPwaStandalone());
      setInstallPlatform(getInstallPlatform());
    };

    update();

    const unsubscribe = subscribeStandaloneMode(update);
    window.addEventListener('focus', update);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', update);
    };
  }, []);

  return { installPlatform, isStandalone };
}

export function useMobilePortraitPlayViewport(): boolean {
  const [isPortrait, setIsPortrait] = useState(() => isMobilePortraitPlayViewport());

  useEffect(() => {
    const update = () => setIsPortrait(isMobilePortraitPlayViewport());

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return isPortrait;
}
