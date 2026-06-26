export type PwaInstallPlatform =
  | 'standalone'
  | 'ios-safari'
  | 'android-chrome'
  | 'desktop-chrome'
  | 'browser';

interface StandaloneNavigator extends Navigator {
  standalone?: boolean;
}

export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const navigatorStandalone = (window.navigator as StandaloneNavigator).standalone === true;

  return displayModeStandalone || navigatorStandalone;
}

export function getInstallPlatform(userAgent = getUserAgent()): PwaInstallPlatform {
  if (isPwaStandalone()) {
    return 'standalone';
  }

  const normalized = userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(normalized);
  const isAndroid = normalized.includes('android');
  const isChrome = normalized.includes('chrome') || normalized.includes('crios');
  const isSafari = normalized.includes('safari') && !normalized.includes('chrome');

  if (isIos && isSafari) {
    return 'ios-safari';
  }

  if (isAndroid && isChrome) {
    return 'android-chrome';
  }

  if (!isIos && !isAndroid && isChrome) {
    return 'desktop-chrome';
  }

  return 'browser';
}

export function getViewportOrientation(): 'landscape' | 'portrait' {
  if (typeof window === 'undefined') {
    return 'landscape';
  }

  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

export function isMobilePortraitPlayViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(orientation: portrait) and (max-width: 900px)').matches;
}

export function subscribeStandaloneMode(callback: (isStandalone: boolean) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const media = window.matchMedia('(display-mode: standalone)');
  const listener = () => callback(isPwaStandalone());

  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function getUserAgent(): string {
  if (typeof navigator === 'undefined') {
    return '';
  }

  return navigator.userAgent;
}
