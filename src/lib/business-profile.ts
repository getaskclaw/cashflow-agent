import { prisma } from "@/lib/db";

export interface BusinessProfileData {
  companyName: string;
  senderName: string;
  senderEmail: string | null;
  locale: string;
  baseCurrency: string;
  vatNumber: string | null;
}

const DEFAULTS: BusinessProfileData = {
  companyName: "My Company",
  senderName: "Accounts Team",
  senderEmail: null,
  locale: "en-GB",
  baseCurrency: "GBP",
  vatNumber: null,
};

export async function getBusinessProfile(userId: string): Promise<BusinessProfileData> {
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
  });

  if (!profile) return DEFAULTS;

  return {
    companyName: profile.companyName,
    senderName: profile.senderName,
    senderEmail: profile.senderEmail,
    locale: profile.locale,
    baseCurrency: profile.baseCurrency,
    vatNumber: profile.vatNumber,
  };
}

export async function upsertBusinessProfile(
  userId: string,
  data: Partial<BusinessProfileData>
): Promise<BusinessProfileData> {
  const profile = await prisma.businessProfile.upsert({
    where: { userId },
    update: {
      ...(data.companyName !== undefined && { companyName: data.companyName }),
      ...(data.senderName !== undefined && { senderName: data.senderName }),
      ...(data.senderEmail !== undefined && { senderEmail: data.senderEmail }),
      ...(data.locale !== undefined && { locale: data.locale }),
      ...(data.baseCurrency !== undefined && { baseCurrency: data.baseCurrency }),
      ...(data.vatNumber !== undefined && { vatNumber: data.vatNumber }),
    },
    create: {
      userId,
      companyName: data.companyName || DEFAULTS.companyName,
      senderName: data.senderName || DEFAULTS.senderName,
      senderEmail: data.senderEmail || null,
      locale: data.locale || DEFAULTS.locale,
      baseCurrency: data.baseCurrency || DEFAULTS.baseCurrency,
      vatNumber: data.vatNumber || null,
    },
  });

  return {
    companyName: profile.companyName,
    senderName: profile.senderName,
    senderEmail: profile.senderEmail,
    locale: profile.locale,
    baseCurrency: profile.baseCurrency,
    vatNumber: profile.vatNumber,
  };
}

/**
 * Format a currency amount using the user's locale.
 */
export function formatCurrency(amountCents: number, currency: string, locale: string = "en-GB"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

/**
 * Get the currency symbol for a currency code.
 */
export function currencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    gbp: "£",
    usd: "$",
    eur: "€",
  };
  return symbols[currency.toLowerCase()] || "";
}
