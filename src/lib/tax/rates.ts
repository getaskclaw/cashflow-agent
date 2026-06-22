// Tax rate database — hardcoded for MVP, sourced from public government data
// US states: combined state + estimated average local sales tax rates
// EU: standard VAT rates
// Other countries: GST/VAT

export interface TaxRate {
  jurisdictionCode: string;   // e.g. "US-CA", "DE", "AU"
  jurisdictionName: string;    // e.g. "California", "Germany"
  jurisdictionType: "us_state" | "eu_country" | "ca_province" | "au" | "other";
  rate: number;                // decimal, e.g. 0.0875 for 8.75%
  stateRate?: number;          // state-level portion
  localRate?: number;          // local/city portion
  countryRate?: number;        // country-level portion
  currency: string;
}

// US state sales tax rates (state rate + estimated average local)
// Sources: taxfoundation.org, sales tax handbook, state revenue depts
const US_STATE_RATES: Record<string, { state: number; local: number; name: string }> = {
  "AL": { state: 0.04, local: 0.0514, name: "Alabama" },
  "AK": { state: 0.00, local: 0.0182, name: "Alaska" },
  "AZ": { state: 0.056, local: 0.0277, name: "Arizona" },
  "AR": { state: 0.065, local: 0.0347, name: "Arkansas" },
  "CA": { state: 0.0725, local: 0.0138, name: "California" },
  "CO": { state: 0.029, local: 0.0483, name: "Colorado" },
  "CT": { state: 0.0635, local: 0.0000, name: "Connecticut" },
  "DE": { state: 0.00, local: 0.0000, name: "Delaware" },
  "FL": { state: 0.06, local: 0.0084, name: "Florida" },
  "GA": { state: 0.04, local: 0.0338, name: "Georgia" },
  "HI": { state: 0.04, local: 0.0044, name: "Hawaii" },
  "ID": { state: 0.06, local: 0.0002, name: "Idaho" },
  "IL": { state: 0.0625, local: 0.0257, name: "Illinois" },
  "IN": { state: 0.07, local: 0.0000, name: "Indiana" },
  "IA": { state: 0.06, local: 0.0101, name: "Iowa" },
  "KS": { state: 0.065, local: 0.0252, name: "Kansas" },
  "KY": { state: 0.06, local: 0.0000, name: "Kentucky" },
  "LA": { state: 0.0445, local: 0.0500, name: "Louisiana" },
  "ME": { state: 0.055, local: 0.0000, name: "Maine" },
  "MD": { state: 0.06, local: 0.0000, name: "Maryland" },
  "MA": { state: 0.0625, local: 0.0000, name: "Massachusetts" },
  "MI": { state: 0.06, local: 0.0000, name: "Michigan" },
  "MN": { state: 0.06875, local: 0.0031, name: "Minnesota" },
  "MS": { state: 0.07, local: 0.0007, name: "Mississippi" },
  "MO": { state: 0.04225, local: 0.0413, name: "Missouri" },
  "MT": { state: 0.00, local: 0.0000, name: "Montana" },
  "NE": { state: 0.055, local: 0.0151, name: "Nebraska" },
  "NV": { state: 0.068, local: 0.0116, name: "Nevada" },
  "NH": { state: 0.00, local: 0.0000, name: "New Hampshire" },
  "NJ": { state: 0.06625, local: 0.0003, name: "New Jersey" },
  "NM": { state: 0.04875, local: 0.0273, name: "New Mexico" },
  "NY": { state: 0.04, local: 0.0453, name: "New York" },
  "NC": { state: 0.0475, local: 0.0227, name: "North Carolina" },
  "ND": { state: 0.05, local: 0.0164, name: "North Dakota" },
  "OH": { state: 0.0575, local: 0.0141, name: "Ohio" },
  "OK": { state: 0.045, local: 0.0457, name: "Oklahoma" },
  "OR": { state: 0.00, local: 0.0000, name: "Oregon" },
  "PA": { state: 0.06, local: 0.0017, name: "Pennsylvania" },
  "RI": { state: 0.07, local: 0.0000, name: "Rhode Island" },
  "SC": { state: 0.06, local: 0.0170, name: "South Carolina" },
  "SD": { state: 0.045, local: 0.0173, name: "South Dakota" },
  "TN": { state: 0.07, local: 0.0250, name: "Tennessee" },
  "TX": { state: 0.0625, local: 0.0195, name: "Texas" },
  "UT": { state: 0.0485, local: 0.0113, name: "Utah" },
  "VT": { state: 0.06, local: 0.0018, name: "Vermont" },
  "VA": { state: 0.053, local: 0.0043, name: "Virginia" },
  "WA": { state: 0.065, local: 0.0228, name: "Washington" },
  "WV": { state: 0.06, local: 0.0031, name: "West Virginia" },
  "WI": { state: 0.05, local: 0.0066, name: "Wisconsin" },
  "WY": { state: 0.04, local: 0.0141, name: "Wyoming" },
  "DC": { state: 0.06, local: 0.0000, name: "District of Columbia" },
};

// EU standard VAT rates
// Sources: European Commission VAT rates, national tax authorities
const EU_VAT_RATES: Record<string, { rate: number; name: string }> = {
  "AT": { rate: 0.20, name: "Austria" },
  "BE": { rate: 0.21, name: "Belgium" },
  "BG": { rate: 0.20, name: "Bulgaria" },
  "HR": { rate: 0.25, name: "Croatia" },
  "CY": { rate: 0.19, name: "Cyprus" },
  "CZ": { rate: 0.21, name: "Czech Republic" },
  "DK": { rate: 0.25, name: "Denmark" },
  "EE": { rate: 0.22, name: "Estonia" },
  "FI": { rate: 0.255, name: "Finland" },
  "FR": { rate: 0.20, name: "France" },
  "DE": { rate: 0.19, name: "Germany" },
  "GR": { rate: 0.24, name: "Greece" },
  "HU": { rate: 0.27, name: "Hungary" },
  "IE": { rate: 0.23, name: "Ireland" },
  "IT": { rate: 0.22, name: "Italy" },
  "LV": { rate: 0.21, name: "Latvia" },
  "LT": { rate: 0.21, name: "Lithuania" },
  "LU": { rate: 0.17, name: "Luxembourg" },
  "MT": { rate: 0.18, name: "Malta" },
  "NL": { rate: 0.21, name: "Netherlands" },
  "PL": { rate: 0.23, name: "Poland" },
  "PT": { rate: 0.23, name: "Portugal" },
  "RO": { rate: 0.19, name: "Romania" },
  "SK": { rate: 0.23, name: "Slovakia" },
  "SI": { rate: 0.22, name: "Slovenia" },
  "ES": { rate: 0.21, name: "Spain" },
  "SE": { rate: 0.25, name: "Sweden" },
  "GB": { rate: 0.20, name: "United Kingdom" }, // no longer EU but keeps VAT
};

// Canadian provincial sales tax rates (HST/GST + PST)
const CA_PROVINCE_RATES: Record<string, { rate: number; name: string }> = {
  "AB": { rate: 0.05, name: "Alberta" },
  "BC": { rate: 0.12, name: "British Columbia" },
  "MB": { rate: 0.12, name: "Manitoba" },
  "NB": { rate: 0.15, name: "New Brunswick" },
  "NL": { rate: 0.15, name: "Newfoundland and Labrador" },
  "NT": { rate: 0.05, name: "Northwest Territories" },
  "NS": { rate: 0.15, name: "Nova Scotia" },
  "NU": { rate: 0.05, name: "Nunavut" },
  "ON": { rate: 0.13, name: "Ontario" },
  "PE": { rate: 0.15, name: "Prince Edward Island" },
  "QC": { rate: 0.14975, name: "Quebec" },
  "SK": { rate: 0.11, name: "Saskatchewan" },
  "YT": { rate: 0.05, name: "Yukon" },
};

// Other country VAT/GST rates
const OTHER_COUNTRY_RATES: Record<string, { rate: number; name: string }> = {
  "AU": { rate: 0.10, name: "Australia" },
  "NZ": { rate: 0.15, name: "New Zealand" },
  "JP": { rate: 0.10, name: "Japan" },
  "KR": { rate: 0.10, name: "South Korea" },
  "SG": { rate: 0.09, name: "Singapore" },
  "MY": { rate: 0.08, name: "Malaysia" },
  "TH": { rate: 0.07, name: "Thailand" },
  "VN": { rate: 0.10, name: "Vietnam" },
  "IN": { rate: 0.18, name: "India" },
  "ZA": { rate: 0.15, name: "South Africa" },
  "MX": { rate: 0.16, name: "Mexico" },
  "BR": { rate: 0.17, name: "Brazil" },
  "CH": { rate: 0.081, name: "Switzerland" },
  "NO": { rate: 0.25, name: "Norway" },
  "IL": { rate: 0.17, name: "Israel" },
  "AE": { rate: 0.05, name: "United Arab Emirates" },
  "SA": { rate: 0.15, name: "Saudi Arabia" },
  "TR": { rate: 0.20, name: "Turkey" },
};

export const TAX_RATES = {
  us_states: US_STATE_RATES,
  eu_countries: EU_VAT_RATES,
  ca_provinces: CA_PROVINCE_RATES,
  other: OTHER_COUNTRY_RATES,
};

export function getRateForJurisdiction(
  country: string,
  state?: string | null
): TaxRate | null {
  const countryUpper = country.toUpperCase();

  // US state
  if (countryUpper === "US" && state) {
    const stateUpper = state.toUpperCase();
    const usRate = US_STATE_RATES[stateUpper];
    if (usRate) {
      const combined = usRate.state + usRate.local;
      return {
        jurisdictionCode: `US-${stateUpper}`,
        jurisdictionName: usRate.name,
        jurisdictionType: "us_state",
        rate: combined,
        stateRate: usRate.state,
        localRate: usRate.local,
        currency: "USD",
      };
    }
  }

  // Canada province
  if (countryUpper === "CA" && state) {
    const stateUpper = state.toUpperCase();
    const caRate = CA_PROVINCE_RATES[stateUpper];
    if (caRate) {
      return {
        jurisdictionCode: `CA-${stateUpper}`,
        jurisdictionName: caRate.name,
        jurisdictionType: "ca_province",
        rate: caRate.rate,
        countryRate: 0.05, // federal GST portion
        localRate: caRate.rate - 0.05,
        currency: "CAD",
      };
    }
  }

  // EU country
  if (EU_VAT_RATES[countryUpper]) {
    const euRate = EU_VAT_RATES[countryUpper];
    return {
      jurisdictionCode: countryUpper,
      jurisdictionName: euRate.name,
      jurisdictionType: "eu_country",
      rate: euRate.rate,
      countryRate: euRate.rate,
      currency: "EUR",
    };
  }

  // Other countries
  if (OTHER_COUNTRY_RATES[countryUpper]) {
    const otherRate = OTHER_COUNTRY_RATES[countryUpper];
    return {
      jurisdictionCode: countryUpper,
      jurisdictionName: otherRate.name,
      jurisdictionType: countryUpper === "AU" ? "au" : "other",
      rate: otherRate.rate,
      countryRate: otherRate.rate,
      currency: countryUpper === "AU" ? "AUD" : "USD",
    };
  }

  return null;
}

export function calculateTax(
  amountCents: number,
  country: string,
  state?: string | null
): { rate: TaxRate | null; taxAmountCents: number; taxableAmountCents: number } {
  const rate = getRateForJurisdiction(country, state);

  if (!rate) {
    return { rate: null, taxAmountCents: 0, taxableAmountCents: amountCents };
  }

  const taxAmountCents = Math.round(amountCents * rate.rate);
  return {
    rate,
    taxAmountCents,
    taxableAmountCents: amountCents,
  };
}

export function getSupportedJurisdictions(): { code: string; name: string; type: string }[] {
  const list: { code: string; name: string; type: string }[] = [];

  for (const [code, data] of Object.entries(US_STATE_RATES)) {
    list.push({ code: `US-${code}`, name: data.name, type: "us_state" });
  }
  for (const [code, data] of Object.entries(EU_VAT_RATES)) {
    list.push({ code, name: data.name, type: "eu_country" });
  }
  for (const [code, data] of Object.entries(CA_PROVINCE_RATES)) {
    list.push({ code: `CA-${code}`, name: data.name, type: "ca_province" });
  }
  for (const [code, data] of Object.entries(OTHER_COUNTRY_RATES)) {
    list.push({ code, name: data.name, type: "other" });
  }

  return list.sort((a, b) => a.name.localeCompare(b.name));
}
