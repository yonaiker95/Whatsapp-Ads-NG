export interface Country {
  name: string;
  iso2: string;
  dial: string;
}

export const COUNTRIES: Country[] = [
  { name: 'México', iso2: 'MX', dial: '52' },
  { name: 'Estados Unidos', iso2: 'US', dial: '1' },
  { name: 'Venezuela', iso2: 'VE', dial: '58' },
  { name: 'Colombia', iso2: 'CO', dial: '57' },
  { name: 'Argentina', iso2: 'AR', dial: '54' },
  { name: 'España', iso2: 'ES', dial: '34' },
  { name: 'Perú', iso2: 'PE', dial: '51' },
  { name: 'Chile', iso2: 'CL', dial: '56' },
  { name: 'Ecuador', iso2: 'EC', dial: '593' },
  { name: 'República Dominicana', iso2: 'DO', dial: '1' },
  { name: 'Brasil', iso2: 'BR', dial: '55' },
  { name: 'Uruguay', iso2: 'UY', dial: '598' },
  { name: 'Bolivia', iso2: 'BO', dial: '591' },
  { name: 'Costa Rica', iso2: 'CR', dial: '506' },
  { name: 'Panamá', iso2: 'PA', dial: '507' },
  { name: 'Guatemala', iso2: 'GT', dial: '502' },
  { name: 'Honduras', iso2: 'HN', dial: '504' },
  { name: 'El Salvador', iso2: 'SV', dial: '503' },
  { name: 'Nicaragua', iso2: 'NI', dial: '505' },
  { name: 'Cuba', iso2: 'CU', dial: '53' },
  { name: 'Paraguay', iso2: 'PY', dial: '595' },
  { name: 'Puerto Rico', iso2: 'PR', dial: '1' },
  { name: 'Alemania', iso2: 'DE', dial: '49' },
  { name: 'Andorra', iso2: 'AD', dial: '376' },
  { name: 'Canadá', iso2: 'CA', dial: '1' },
  { name: 'China', iso2: 'CN', dial: '86' },
  { name: 'Corea del Sur', iso2: 'KR', dial: '82' },
  { name: 'Francia', iso2: 'FR', dial: '33' },
  { name: 'India', iso2: 'IN', dial: '91' },
  { name: 'Italia', iso2: 'IT', dial: '39' },
  { name: 'Japón', iso2: 'JP', dial: '81' },
  { name: 'Portugal', iso2: 'PT', dial: '351' },
  { name: 'Reino Unido', iso2: 'GB', dial: '44' },
  { name: 'Suiza', iso2: 'CH', dial: '41' },
];

export const DEFAULT_COUNTRY: Country = COUNTRIES[0];
