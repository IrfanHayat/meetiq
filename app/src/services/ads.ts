import { keys, readString, writeString } from './storage';

const LIVE = {
  banner: 'ca-app-pub-6221471473747480/4023557714',
  interstitial: 'ca-app-pub-6221471473747480/7771231038',
  rewardedInterstitial: 'ca-app-pub-6221471473747480/5519492275',
  rewarded: 'ca-app-pub-6221471473747480/5053568358',
  native: 'ca-app-pub-6221471473747480/7420052251',
  appOpen: 'ca-app-pub-6221471473747480/8353539175',
};

const TEST_KEY = {
  banner: 'BANNER',
  interstitial: 'INTERSTITIAL',
  rewardedInterstitial: 'REWARDED_INTERSTITIAL',
  rewarded: 'REWARDED',
  native: 'NATIVE',
  appOpen: 'APP_OPEN',
} as const;

type AdKind = keyof typeof LIVE;

let adsModule: any = null;
let adsChecked = false;
let initPromise: Promise<boolean> | null = null;
let appOpenShown = false;

function loadAds(): any | null {
  if (adsChecked) return adsModule;
  adsChecked = true;
  try {
    adsModule = require('react-native-google-mobile-ads');
  } catch (err) {
    console.warn('AdMob module unavailable', err);
    adsModule = null;
  }
  return adsModule;
}

export function adUnit(kind: AdKind): string {
  const ads = loadAds();
  if (__DEV__ && ads?.TestIds?.[TEST_KEY[kind]]) return ads.TestIds[TEST_KEY[kind]] as string;
  return LIVE[kind];
}

export function getAdsModule(): any | null {
  return loadAds();
}

export function initAds(): Promise<boolean> {
  if (!initPromise) {
    initPromise = (async () => {
      const ads = loadAds();
      if (!ads?.default) return false;
      await ads.default().initialize();
      return true;
    })().catch((err) => {
      console.warn('AdMob init failed', err);
      initPromise = null;
      return false;
    });
  }
  return initPromise;
}

function waitFor(ad: any, loadedEvent: string, errorEvent: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      const unsubLoad = ad.addAdEventListener(loadedEvent, () => finish(true));
      const unsubError = ad.addAdEventListener(errorEvent, () => finish(false));
      ad.load();
      const original = finish;
      void unsubLoad;
      void unsubError;
      void original;
    } catch {
      finish(false);
    }
  });
}

export async function showInterstitialIfAllowed(isPremium: boolean): Promise<void> {
  if (isPremium) return;
  try {
    const ready = await initAds();
    const ads = loadAds();
    if (!ready || !ads?.InterstitialAd) return;
    const last = Number((await readString(keys.interstitialAt)) || '0');
    if (Date.now() - last < 3 * 60 * 1000) return;
    const ad = ads.InterstitialAd.createForAdRequest(adUnit('interstitial'));
    const loaded = await waitFor(ad, ads.AdEventType.LOADED, ads.AdEventType.ERROR, 4000);
    if (!loaded) return;
    await writeString(keys.interstitialAt, String(Date.now()));
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        ad.addAdEventListener(ads.AdEventType.CLOSED, finish);
        ad.addAdEventListener(ads.AdEventType.ERROR, finish);
        ad.show();
        setTimeout(finish, 12000);
      } catch {
        finish();
      }
    });
  } catch (err) {
    console.warn('Interstitial skipped', err);
  }
}

export async function showAppOpenIfAllowed(isPremium: boolean): Promise<void> {
  if (isPremium || appOpenShown) return;
  try {
    const launches = Number((await readString(keys.launches)) || '0');
    if (launches <= 1) return;
    const ready = await initAds();
    const ads = loadAds();
    if (!ready || !ads?.AppOpenAd) return;
    appOpenShown = true;
    const ad = ads.AppOpenAd.createForAdRequest(adUnit('appOpen'));
    const loaded = await waitFor(ad, ads.AdEventType.LOADED, ads.AdEventType.ERROR, 4000);
    if (!loaded) return;
    ad.show();
  } catch (err) {
    console.warn('App open ad skipped', err);
  }
}

export async function showRewarded(): Promise<boolean> {
  try {
    const ready = await initAds();
    const ads = loadAds();
    if (!ready || !ads?.RewardedAd) return false;
    const ad = ads.RewardedAd.createForAdRequest(adUnit('rewarded'));
    const loaded = await waitFor(ad, ads.RewardedAdEventType.LOADED, ads.AdEventType.ERROR, 8000);
    if (!loaded) return false;
    return await new Promise<boolean>((resolve) => {
      let earned = false;
      let done = false;
      const finish = (value: boolean) => {
        if (done) return;
        done = true;
        resolve(value);
      };
      try {
        ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        });
        ad.addAdEventListener(ads.AdEventType.CLOSED, () => finish(earned));
        ad.addAdEventListener(ads.AdEventType.ERROR, () => finish(false));
        ad.show();
        setTimeout(() => finish(earned), 20000);
      } catch {
        finish(false);
      }
    });
  } catch (err) {
    console.warn('Rewarded ad skipped', err);
    return false;
  }
}
