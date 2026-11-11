import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

class AdBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
import { adUnit, getAdsModule, initAds } from '../services/ads';
import { colors, fonts } from '../theme';

export function HomeBanner({ enabled }: { enabled: boolean }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    initAds()
      .then((ok) => {
        if (alive) setReady(ok);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  if (!enabled || failed || !ready) return null;
  try {
    const ads = getAdsModule();
    if (!ads?.BannerAd) return null;
    const BannerAd = ads.BannerAd;
    return (
      <AdBoundary>
        <View style={styles.bannerWrap}>
          <BannerAd
            unitId={adUnit('banner')}
            size={ads.BannerAdSize.BANNER}
            requestOptions={{}}
            onAdFailedToLoad={() => setFailed(true)}
          />
        </View>
      </AdBoundary>
    );
  } catch {
    return null;
  }
}

export function NativeListAd({ enabled }: { enabled: boolean }) {
  const [nativeAd, setNativeAd] = useState<any>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let created: any = null;
    initAds()
      .then(async (ok) => {
        const ads = getAdsModule();
        if (!alive || !ok || !ads?.NativeAd) return;
        try {
          created = await ads.NativeAd.createForAdRequest(adUnit('native'));
          if (alive) setNativeAd(created);
          else created?.destroy?.();
        } catch {
          if (alive) setNativeAd(null);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      created?.destroy?.();
    };
  }, [enabled]);

  if (!enabled || !nativeAd) return null;
  try {
    const ads = getAdsModule();
    if (!ads) return null;
    const { NativeAdView, NativeAsset, NativeAssetType } = ads;
    return (
      <AdBoundary>
      <NativeAdView nativeAd={nativeAd} style={styles.native}>
        <View style={styles.adBadge}>
          <Text style={styles.adBadgeText}>Ad</Text>
        </View>
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <Text style={styles.headline} numberOfLines={1}>{nativeAd.headline}</Text>
        </NativeAsset>
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={styles.body} numberOfLines={2}>{nativeAd.body}</Text>
        </NativeAsset>
        {nativeAd.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={styles.cta}>{nativeAd.callToAction}</Text>
          </NativeAsset>
        ) : null}
      </NativeAdView>
      </AdBoundary>
    );
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  bannerWrap: { alignItems: 'center', marginBottom: 6 },
  native: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  adBadge: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adBadgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.accentDeep },
  headline: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink2, lineHeight: 17 },
  cta: { marginTop: 4, fontFamily: fonts.bold, fontSize: 12, color: colors.accent },
});
