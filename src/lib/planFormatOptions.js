// Plan display-settings catalogues — the decorated half of the U1↔U3 contract.
// The KEYS live in seed.js (the createPlan clamp source, mirroring 0017's
// CHECK lists); this module only adds what the engine and the settings UI
// need on top: separator/grouping specs, date order/sep, placement labels,
// and the currency list. tests/plan-format.test.js pins options keys ===
// seed keys === the documented 0017 CHECK lists, so the key list can never
// fork. Static data — no runtime lookup cost, no React, no store.
import { PLAN_DATE_FORMATS, PLAN_NUMBER_FORMATS, PLAN_PLACEMENTS } from '../store/seed.js';

// Space-grouped formats RENDER a no-break space (a wrapped amount is two
// amounts to a skimming eye); parseAmount accepts a plain typed space too.
export const NBSP = '\u00a0';

// `label` is the worked example itself, YNAB-style — it doubles as the pinned
// fixture for makeFormatter(key).num(123456.78, true) (lakh: 1234567.89 shows
// the 3-then-2 rhythm within the same 8 digits everywhere else groups by 3).
const NUM_SPECS = {
  'comma-dot': { group: ',', decimal: '.', grouping: '3', label: '123,456.78' },
  'dot-comma': { group: '.', decimal: ',', grouping: '3', label: '123.456,78' },
  'space-dot': { group: NBSP, decimal: '.', grouping: '3', label: `123${NBSP}456.78` },
  'apostrophe-dot': { group: "'", decimal: '.', grouping: '3', label: "123'456.78" },
  'space-dash': { group: NBSP, decimal: '-', grouping: '3', label: `123${NBSP}456-78` },
  'space-comma': { group: NBSP, decimal: ',', grouping: '3', label: `123${NBSP}456,78` },
  'comma-slash': { group: ',', decimal: '/', grouping: '3', label: '123,456/78' },
  lakh: { group: ',', decimal: '.', grouping: '3-then-2', label: '1,23,456.78' },
};
export const NUMBER_FORMATS = PLAN_NUMBER_FORMATS.map(key => ({ key, ...NUM_SPECS[key] }));

// Derived mechanically from the pattern: the first letter names the leading
// unit, the first non-letter is the separator. The key IS the label.
export const DATE_FORMATS = PLAN_DATE_FORMATS.map(key => ({
  key,
  order: key[0] === 'Y' ? 'YMD' : key[0] === 'D' ? 'DMY' : 'MDY',
  sep: key.replace(/[YMD]/g, '')[0],
}));

// `example` takes the placement-appropriate symbol (symbolFor(code, key)).
export const PLACEMENTS = PLAN_PLACEMENTS.map(key => ({
  key,
  label: key === 'before' ? 'Before amount' : key === 'after' ? 'After amount' : "Don't show",
  example: sym => (key === 'before' ? sym + '123,456.78' : key === 'after' ? '123,456.78' + sym : '123,456.78'),
}));

// Curated symbols for common currencies. Letter-like symbols carry a trailing
// space (the legacy 'Rs ' spacing — 'Rs 123' not 'Rs123'); bare signs abut
// the amount as they conventionally do ('$123'). symbolFor turns either shape
// into the right prefix/suffix form.
export const SYMBOLS = {
  PKR: 'Rs ', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹',
  AUD: 'A$', CAD: 'C$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', TWD: 'NT$',
  BRL: 'R$', MXN: 'MX$', CHF: 'CHF ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ',
  TRY: '₺', RUB: '₽', SAR: '﷼ ', AED: 'د.إ ', QAR: '﷼ ', OMR: '﷼ ',
  ILS: '₪', PHP: '₱', UAH: '₴', KZT: '₸', GHS: '₵', CRC: '₡', PYG: '₲',
  LAK: '₭', MNT: '₮', AZN: '₼', GEL: '₾', AFN: '؋ ', KHR: '៛', NGN: '₦',
  ZAR: 'R ', MYR: 'RM ', BDT: '৳', KRW: '₩', VND: '₫', THB: '฿',
  IDR: 'Rp ', LKR: 'Rs ', NPR: 'Rs ', KES: 'KSh ', EGP: 'E£', PLN: 'zł ',
};

// Prefix use gets 'CODE ' when uncurated; suffix use gets ' CODE'. A curated
// symbol keeps its own spacing, mirrored to the suffix side when letter-like.
export function symbolFor(code, placement = 'before') {
  const raw = SYMBOLS[code];
  if (!raw) return placement === 'after' ? ' ' + code : code + ' ';
  if (placement === 'after') return raw.endsWith(' ') ? ' ' + raw.trim() : raw;
  return raw;
}

// Full ISO 4217 active list (code, name) for the plan-settings currency
// picker; rendered "Pakistan Rupee–PKR". Display-only — amounts never convert.
export const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'AFN', name: 'Afghani' },
  { code: 'ALL', name: 'Lek' },
  { code: 'AMD', name: 'Armenian Dram' },
  { code: 'ANG', name: 'Netherlands Antillean Guilder' },
  { code: 'AOA', name: 'Kwanza' },
  { code: 'ARS', name: 'Argentine Peso' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'AWG', name: 'Aruban Florin' },
  { code: 'AZN', name: 'Azerbaijan Manat' },
  { code: 'BAM', name: 'Convertible Mark' },
  { code: 'BBD', name: 'Barbados Dollar' },
  { code: 'BDT', name: 'Taka' },
  { code: 'BGN', name: 'Bulgarian Lev' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'BIF', name: 'Burundi Franc' },
  { code: 'BMD', name: 'Bermudian Dollar' },
  { code: 'BND', name: 'Brunei Dollar' },
  { code: 'BOB', name: 'Boliviano' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'BSD', name: 'Bahamian Dollar' },
  { code: 'BTN', name: 'Ngultrum' },
  { code: 'BWP', name: 'Pula' },
  { code: 'BYN', name: 'Belarusian Ruble' },
  { code: 'BZD', name: 'Belize Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CDF', name: 'Congolese Franc' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CLP', name: 'Chilean Peso' },
  { code: 'CNY', name: 'Yuan Renminbi' },
  { code: 'COP', name: 'Colombian Peso' },
  { code: 'CRC', name: 'Costa Rican Colon' },
  { code: 'CUP', name: 'Cuban Peso' },
  { code: 'CVE', name: 'Cabo Verde Escudo' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'DJF', name: 'Djibouti Franc' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'DOP', name: 'Dominican Peso' },
  { code: 'DZD', name: 'Algerian Dinar' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'ERN', name: 'Nakfa' },
  { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'EUR', name: 'Euro' },
  { code: 'FJD', name: 'Fiji Dollar' },
  { code: 'FKP', name: 'Falkland Islands Pound' },
  { code: 'GBP', name: 'Pound Sterling' },
  { code: 'GEL', name: 'Lari' },
  { code: 'GHS', name: 'Ghana Cedi' },
  { code: 'GIP', name: 'Gibraltar Pound' },
  { code: 'GMD', name: 'Dalasi' },
  { code: 'GNF', name: 'Guinean Franc' },
  { code: 'GTQ', name: 'Quetzal' },
  { code: 'GYD', name: 'Guyana Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'HNL', name: 'Lempira' },
  { code: 'HTG', name: 'Gourde' },
  { code: 'HUF', name: 'Forint' },
  { code: 'IDR', name: 'Rupiah' },
  { code: 'ILS', name: 'New Israeli Sheqel' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'IQD', name: 'Iraqi Dinar' },
  { code: 'IRR', name: 'Iranian Rial' },
  { code: 'ISK', name: 'Iceland Krona' },
  { code: 'JMD', name: 'Jamaican Dollar' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'JPY', name: 'Yen' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'KGS', name: 'Som' },
  { code: 'KHR', name: 'Riel' },
  { code: 'KMF', name: 'Comorian Franc' },
  { code: 'KPW', name: 'North Korean Won' },
  { code: 'KRW', name: 'Won' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'KYD', name: 'Cayman Islands Dollar' },
  { code: 'KZT', name: 'Tenge' },
  { code: 'LAK', name: 'Lao Kip' },
  { code: 'LBP', name: 'Lebanese Pound' },
  { code: 'LKR', name: 'Sri Lanka Rupee' },
  { code: 'LRD', name: 'Liberian Dollar' },
  { code: 'LSL', name: 'Loti' },
  { code: 'LYD', name: 'Libyan Dinar' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'MDL', name: 'Moldovan Leu' },
  { code: 'MGA', name: 'Malagasy Ariary' },
  { code: 'MKD', name: 'Denar' },
  { code: 'MMK', name: 'Kyat' },
  { code: 'MNT', name: 'Tugrik' },
  { code: 'MOP', name: 'Pataca' },
  { code: 'MRU', name: 'Ouguiya' },
  { code: 'MUR', name: 'Mauritius Rupee' },
  { code: 'MVR', name: 'Rufiyaa' },
  { code: 'MWK', name: 'Malawi Kwacha' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'MZN', name: 'Mozambique Metical' },
  { code: 'NAD', name: 'Namibia Dollar' },
  { code: 'NGN', name: 'Naira' },
  { code: 'NIO', name: 'Cordoba Oro' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'NPR', name: 'Nepalese Rupee' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'OMR', name: 'Rial Omani' },
  { code: 'PAB', name: 'Balboa' },
  { code: 'PEN', name: 'Sol' },
  { code: 'PGK', name: 'Kina' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'PKR', name: 'Pakistan Rupee' },
  { code: 'PLN', name: 'Zloty' },
  { code: 'PYG', name: 'Guarani' },
  { code: 'QAR', name: 'Qatari Rial' },
  { code: 'RON', name: 'Romanian Leu' },
  { code: 'RSD', name: 'Serbian Dinar' },
  { code: 'RUB', name: 'Russian Ruble' },
  { code: 'RWF', name: 'Rwanda Franc' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'SBD', name: 'Solomon Islands Dollar' },
  { code: 'SCR', name: 'Seychelles Rupee' },
  { code: 'SDG', name: 'Sudanese Pound' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'SHP', name: 'Saint Helena Pound' },
  { code: 'SLE', name: 'Leone' },
  { code: 'SOS', name: 'Somali Shilling' },
  { code: 'SRD', name: 'Surinam Dollar' },
  { code: 'SSP', name: 'South Sudanese Pound' },
  { code: 'STN', name: 'Dobra' },
  { code: 'SVC', name: 'El Salvador Colon' },
  { code: 'SYP', name: 'Syrian Pound' },
  { code: 'SZL', name: 'Lilangeni' },
  { code: 'THB', name: 'Baht' },
  { code: 'TJS', name: 'Somoni' },
  { code: 'TMT', name: 'Turkmenistan New Manat' },
  { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'TOP', name: 'Pa’anga' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'TTD', name: 'Trinidad and Tobago Dollar' },
  { code: 'TWD', name: 'New Taiwan Dollar' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UAH', name: 'Hryvnia' },
  { code: 'UGX', name: 'Uganda Shilling' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'UYU', name: 'Peso Uruguayo' },
  { code: 'UZS', name: 'Uzbekistan Sum' },
  { code: 'VED', name: 'Bolívar Soberano' },
  { code: 'VES', name: 'Bolívar Soberano' },
  { code: 'VND', name: 'Dong' },
  { code: 'VUV', name: 'Vatu' },
  { code: 'WST', name: 'Tala' },
  { code: 'XAF', name: 'CFA Franc BEAC' },
  { code: 'XCD', name: 'East Caribbean Dollar' },
  { code: 'XOF', name: 'CFA Franc BCEAO' },
  { code: 'XPF', name: 'CFP Franc' },
  { code: 'YER', name: 'Yemeni Rial' },
  { code: 'ZAR', name: 'Rand' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'ZWG', name: 'Zimbabwe Gold' },
];
