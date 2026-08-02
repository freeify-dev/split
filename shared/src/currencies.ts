export interface Currency {
  code: string
  name: string
  /** ISO 4217 minor-unit exponent: USD=2, JPY=0, BHD=3 */
  exponent: number
  /** true → daily EUR reference rate available from the ECB feed; false → manual rate required */
  ecb: boolean
}

/** EUR first, then the ~30 ECB-quoted currencies, then common manual-rate currencies. */
export const CURRENCIES: readonly Currency[] = [
  { code: 'EUR', name: 'Euro', exponent: 2, ecb: true },
  { code: 'USD', name: 'US Dollar', exponent: 2, ecb: true },
  { code: 'GBP', name: 'British Pound', exponent: 2, ecb: true },
  { code: 'JPY', name: 'Japanese Yen', exponent: 0, ecb: true },
  { code: 'AUD', name: 'Australian Dollar', exponent: 2, ecb: true },
  { code: 'BGN', name: 'Bulgarian Lev', exponent: 2, ecb: true },
  { code: 'BRL', name: 'Brazilian Real', exponent: 2, ecb: true },
  { code: 'CAD', name: 'Canadian Dollar', exponent: 2, ecb: true },
  { code: 'CHF', name: 'Swiss Franc', exponent: 2, ecb: true },
  { code: 'CNY', name: 'Chinese Yuan', exponent: 2, ecb: true },
  { code: 'CZK', name: 'Czech Koruna', exponent: 2, ecb: true },
  { code: 'DKK', name: 'Danish Krone', exponent: 2, ecb: true },
  { code: 'HKD', name: 'Hong Kong Dollar', exponent: 2, ecb: true },
  { code: 'HUF', name: 'Hungarian Forint', exponent: 2, ecb: true },
  { code: 'IDR', name: 'Indonesian Rupiah', exponent: 2, ecb: true },
  { code: 'ILS', name: 'Israeli New Shekel', exponent: 2, ecb: true },
  { code: 'INR', name: 'Indian Rupee', exponent: 2, ecb: true },
  { code: 'ISK', name: 'Icelandic Krona', exponent: 0, ecb: true },
  { code: 'KRW', name: 'South Korean Won', exponent: 0, ecb: true },
  { code: 'MXN', name: 'Mexican Peso', exponent: 2, ecb: true },
  { code: 'MYR', name: 'Malaysian Ringgit', exponent: 2, ecb: true },
  { code: 'NOK', name: 'Norwegian Krone', exponent: 2, ecb: true },
  { code: 'NZD', name: 'New Zealand Dollar', exponent: 2, ecb: true },
  { code: 'PHP', name: 'Philippine Peso', exponent: 2, ecb: true },
  { code: 'PLN', name: 'Polish Zloty', exponent: 2, ecb: true },
  { code: 'RON', name: 'Romanian Leu', exponent: 2, ecb: true },
  { code: 'SEK', name: 'Swedish Krona', exponent: 2, ecb: true },
  { code: 'SGD', name: 'Singapore Dollar', exponent: 2, ecb: true },
  { code: 'THB', name: 'Thai Baht', exponent: 2, ecb: true },
  { code: 'TRY', name: 'Turkish Lira', exponent: 2, ecb: true },
  { code: 'ZAR', name: 'South African Rand', exponent: 2, ecb: true },
  { code: 'AED', name: 'UAE Dirham', exponent: 2, ecb: false },
  { code: 'ARS', name: 'Argentine Peso', exponent: 2, ecb: false },
  { code: 'BDT', name: 'Bangladeshi Taka', exponent: 2, ecb: false },
  { code: 'BHD', name: 'Bahraini Dinar', exponent: 3, ecb: false },
  { code: 'CLP', name: 'Chilean Peso', exponent: 0, ecb: false },
  { code: 'COP', name: 'Colombian Peso', exponent: 2, ecb: false },
  { code: 'EGP', name: 'Egyptian Pound', exponent: 2, ecb: false },
  { code: 'GEL', name: 'Georgian Lari', exponent: 2, ecb: false },
  { code: 'GHS', name: 'Ghanaian Cedi', exponent: 2, ecb: false },
  { code: 'JOD', name: 'Jordanian Dinar', exponent: 3, ecb: false },
  { code: 'KES', name: 'Kenyan Shilling', exponent: 2, ecb: false },
  { code: 'KWD', name: 'Kuwaiti Dinar', exponent: 3, ecb: false },
  { code: 'KZT', name: 'Kazakhstani Tenge', exponent: 2, ecb: false },
  { code: 'LKR', name: 'Sri Lankan Rupee', exponent: 2, ecb: false },
  { code: 'MAD', name: 'Moroccan Dirham', exponent: 2, ecb: false },
  { code: 'NGN', name: 'Nigerian Naira', exponent: 2, ecb: false },
  { code: 'OMR', name: 'Omani Rial', exponent: 3, ecb: false },
  { code: 'PEN', name: 'Peruvian Sol', exponent: 2, ecb: false },
  { code: 'PKR', name: 'Pakistani Rupee', exponent: 2, ecb: false },
  { code: 'QAR', name: 'Qatari Riyal', exponent: 2, ecb: false },
  { code: 'RSD', name: 'Serbian Dinar', exponent: 2, ecb: false },
  { code: 'SAR', name: 'Saudi Riyal', exponent: 2, ecb: false },
  { code: 'TND', name: 'Tunisian Dinar', exponent: 3, ecb: false },
  { code: 'TWD', name: 'New Taiwan Dollar', exponent: 2, ecb: false },
  { code: 'UAH', name: 'Ukrainian Hryvnia', exponent: 2, ecb: false },
  { code: 'UGX', name: 'Ugandan Shilling', exponent: 0, ecb: false },
  { code: 'UYU', name: 'Uruguayan Peso', exponent: 2, ecb: false },
  { code: 'VND', name: 'Vietnamese Dong', exponent: 0, ecb: false },
  { code: 'XOF', name: 'West African CFA Franc', exponent: 0, ecb: false },
]

const byCode: ReadonlyMap<string, Currency> = new Map(CURRENCIES.map((c) => [c.code, c]))

export function isCurrencyCode(code: string): boolean {
  return byCode.has(code)
}

export function getCurrency(code: string): Currency {
  const c = byCode.get(code)
  if (!c) throw new Error(`Unknown currency: ${code}`)
  return c
}

export function currencyExponent(code: string): number {
  return getCurrency(code).exponent
}
