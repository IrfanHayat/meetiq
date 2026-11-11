import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface EntitlementSnapshot {
  isPremium: boolean;
  expiresAt: string | null;
  productId: string;
}

export interface StorePlan {
  id: 'monthly' | 'annual';
  title: string;
  priceString: string;
  billedLabel: string;
  perMonthLabel: string;
  raw: unknown;
}

let purchases: any = null;
let purchasesChecked = false;
let configured = false;

function loadPurchases(): any | null {
  if (purchasesChecked) return purchases;
  purchasesChecked = true;
  try {
    purchases = require('react-native-purchases');
  } catch (err) {
    console.warn('RevenueCat module unavailable', err);
    purchases = null;
  }
  return purchases;
}

export function revenueCatKey(): string {
  const extra = Constants.expoConfig?.extra as { revenuecatAndroidKey?: string } | undefined;
  return typeof extra?.revenuecatAndroidKey === 'string' ? extra.revenuecatAndroidKey.trim() : '';
}

export function purchasesAvailable(): boolean {
  return Platform.OS === 'android' && revenueCatKey().length > 0 && Boolean(loadPurchases()?.default);
}

function snapshot(info: any): EntitlementSnapshot {
  const active = info?.entitlements?.active?.premium;
  if (!active) return { isPremium: false, expiresAt: null, productId: '' };
  return {
    isPremium: true,
    expiresAt: typeof active.expirationDate === 'string' ? active.expirationDate : null,
    productId: typeof active.productIdentifier === 'string' ? active.productIdentifier : '',
  };
}

export async function initPurchases(appUserId: string): Promise<EntitlementSnapshot | null> {
  const key = revenueCatKey();
  if (Platform.OS !== 'android' || !key || !appUserId) return null;
  const mod = loadPurchases();
  const Purchases = mod?.default;
  if (!Purchases) return null;
  try {
    if (__DEV__ && mod.LOG_LEVEL) Purchases.setLogLevel(mod.LOG_LEVEL.DEBUG);
    if (!configured) {
      await Promise.resolve(Purchases.configure({ apiKey: key, appUserID: appUserId }));
      configured = true;
    }
    const info = await Purchases.getCustomerInfo();
    return snapshot(info);
  } catch (err) {
    console.warn('RevenueCat configure failed', err);
    return null;
  }
}

function formatMoney(amount: number, currency?: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function planFromPackage(id: 'monthly' | 'annual', pkg: any): StorePlan {
  const product = pkg?.product || {};
  const price = Number(product.price);
  const priceString = typeof product.priceString === 'string' ? product.priceString : id === 'monthly' ? '$9.99' : '$90.00';
  if (id === 'annual' && Number.isFinite(price) && price > 0) {
    return {
      id,
      title: 'Yearly plan',
      priceString,
      billedLabel: `Billed ${priceString} once a year`,
      perMonthLabel: formatMoney(price / 12, product.currencyCode),
      raw: pkg,
    };
  }
  return {
    id,
    title: 'Monthly plan',
    priceString,
    billedLabel: `Billed ${priceString} every month`,
    perMonthLabel: priceString,
    raw: pkg,
  };
}

export async function loadPlans(): Promise<{ monthly: StorePlan | null; annual: StorePlan | null }> {
  const fallback = { monthly: null, annual: null };
  if (!configured) return fallback;
  const Purchases = loadPurchases()?.default;
  if (!Purchases) return fallback;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current || offerings?.all?.default;
    const packages: any[] = current?.availablePackages || [];
    const monthlyPkg = packages.find((pkg) => pkg.identifier === '$rc_monthly' || pkg.product?.identifier === 'meetiq_monthly');
    const annualPkg = packages.find((pkg) => pkg.identifier === '$rc_annual' || pkg.product?.identifier === 'meetiq_yearly');
    return {
      monthly: monthlyPkg ? planFromPackage('monthly', monthlyPkg) : null,
      annual: annualPkg ? planFromPackage('annual', annualPkg) : null,
    };
  } catch (err) {
    console.warn('RevenueCat offerings failed', err);
    return fallback;
  }
}

export async function purchasePlan(plan: StorePlan): Promise<{ status: 'purchased' | 'cancelled' | 'failed'; entitlement: EntitlementSnapshot | null; message?: string }> {
  const mod = loadPurchases();
  const Purchases = mod?.default;
  if (!Purchases || !plan.raw) return { status: 'failed', entitlement: null, message: 'Purchases aren’t available right now.' };
  try {
    const result = await Purchases.purchasePackage(plan.raw);
    return { status: 'purchased', entitlement: snapshot(result?.customerInfo) };
  } catch (err: any) {
    const cancelled = Boolean(err?.userCancelled) || err?.code === mod?.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR;
    if (cancelled) return { status: 'cancelled', entitlement: null };
    return { status: 'failed', entitlement: null, message: 'The purchase didn’t go through. Please try again.' };
  }
}

export async function restorePurchases(): Promise<EntitlementSnapshot | null> {
  const Purchases = loadPurchases()?.default;
  if (!Purchases || !configured) return null;
  try {
    const info = await Purchases.restorePurchases();
    return snapshot(info);
  } catch (err) {
    console.warn('Restore failed', err);
    return null;
  }
}
