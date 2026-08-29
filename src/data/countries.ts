/**
 * The 40 party countries. Each guest gets one; the costume itself is up to
 * them — the app only hands out the country and its anthem. This file is the single source of truth:
 * `scripts/fetch-anthems.mjs` reads `anthem.source` from here to build
 * `public/anthems/<code>.mp3`.
 *
 * `code` is the stable identity stored in the assignments JSON — never
 * change a code once the party has started, or people lose their country.
 */
export type Country = {
  code: string;
  name: string;
  flag: string;
  /**
   * Local 4:3 SVG, present for every country. This is what the UI renders —
   * emoji flags are drawn by the platform font, so they differ across iOS,
   * Android and Windows and several (Catalonia) do not exist at all. `flag`
   * is kept only for plain-text contexts such as the CSV export.
   */
  flagImage: string;
  /** Two hex colours pulled from the flag, used for the reveal gradient. */
  colors: [string, string];
  anthem: {
    /** Human-readable anthem title. Always present. */
    title: string;
    /**
     * Wikimedia Commons file name (no "File:" prefix) to build the clip from.
     * Omitted where no freely-licensed recording exists — North Korea's and
     * Mongolia's anthems are both still in copyright, so those two countries
     * ship without audio and the player degrades to the title alone.
     */
    source?: string;
  };
};

export const COUNTRIES: Country[] = [
  {
    code: "BR",
    name: "Brasil",
    flag: "🇧🇷",
    flagImage: "/flags/BR.svg",
    colors: ["#009B3A", "#FFDF00"],
    anthem: { title: "Hino Nacional Brasileiro", source: "Hino-Nacional-Brasil-instrumental-mec.ogg" },
  },
  {
    code: "US",
    name: "Estats Units",
    flag: "🇺🇸",
    flagImage: "/flags/US.svg",
    colors: ["#B22234", "#3C3B6E"],
    anthem: { title: "The Star-Spangled Banner", source: "Star Spangled Banner instrumental.ogg" },
  },
  {
    code: "DE",
    name: "Alemanya",
    flag: "🇩🇪",
    flagImage: "/flags/DE.svg",
    colors: ["#000000", "#DD0000"],
    anthem: { title: "Das Lied der Deutschen", source: "National anthem of Germany - U.S. Army 1st Armored Division Band.ogg" },
  },
  {
    code: "AT",
    name: "Àustria",
    flag: "🇦🇹",
    flagImage: "/flags/AT.svg",
    colors: ["#ED2939", "#FFFFFF"],
    anthem: { title: "Land der Berge, Land am Strome", source: "Land der Berge Land am Strome instrumental.ogg" },
  },
  {
    code: "MX",
    name: "Mèxic",
    flag: "🇲🇽",
    flagImage: "/flags/MX.svg",
    colors: ["#006847", "#CE1126"],
    anthem: { title: "Himno Nacional Mexicano", source: "Himno Nacional Mexicano instrumental.ogg" },
  },
  {
    code: "JP",
    name: "Japó",
    flag: "🇯🇵",
    flagImage: "/flags/JP.svg",
    colors: ["#BC002D", "#FFFFFF"],
    anthem: { title: "Kimigayo", source: "Kimi ga Yo instrumental.ogg" },
  },
  {
    code: "FR",
    name: "França",
    flag: "🇫🇷",
    flagImage: "/flags/FR.svg",
    colors: ["#0055A4", "#EF4135"],
    anthem: { title: "La Marseillaise", source: "La Marseillaise.ogg" },
  },
  {
    code: "IT",
    name: "Itàlia",
    flag: "🇮🇹",
    flagImage: "/flags/IT.svg",
    colors: ["#008C45", "#CD212A"],
    anthem: { title: "Il Canto degli Italiani", source: "Inno di Mameli instrumental.ogg" },
  },
  {
    code: "ES",
    name: "Espanya",
    flag: "🇪🇸",
    flagImage: "/flags/ES.svg",
    colors: ["#AA151B", "#F1BF00"],
    anthem: { title: "Marcha Real", source: "Marcha Real-Royal March by US Navy Band.ogg" },
  },
  {
    code: "GB",
    name: "Regne Unit",
    flag: "🇬🇧",
    flagImage: "/flags/GB.svg",
    colors: ["#012169", "#C8102E"],
    anthem: { title: "God Save the King", source: "United States Navy Band - God Save the Queen.oga" },
  },
  {
    code: "IN",
    name: "Índia",
    flag: "🇮🇳",
    flagImage: "/flags/IN.svg",
    colors: ["#FF9933", "#138808"],
    anthem: { title: "Jana Gana Mana", source: "Jana Gana Mana instrumental.ogg" },
  },
  {
    code: "CN",
    name: "Xina",
    flag: "🇨🇳",
    flagImage: "/flags/CN.svg",
    colors: ["#DE2910", "#FFDE00"],
    anthem: { title: "March of the Volunteers", source: "March of the Volunteers instrumental.ogg" },
  },
  {
    code: "RU",
    name: "Rússia",
    flag: "🇷🇺",
    flagImage: "/flags/RU.svg",
    colors: ["#0039A6", "#D52B1E"],
    anthem: { title: "Himne de la Federació Russa", source: "Russian Anthem chorus.ogg" },
  },
  {
    code: "CA",
    name: "Canadà",
    flag: "🇨🇦",
    flagImage: "/flags/CA.svg",
    colors: ["#FF0000", "#FFFFFF"],
    anthem: { title: "O Canada", source: "United States Navy Band - O Canada.ogg" },
  },
  {
    code: "AU",
    name: "Austràlia",
    flag: "🇦🇺",
    flagImage: "/flags/AU.svg",
    colors: ["#00247D", "#FFFFFF"],
    anthem: { title: "Advance Australia Fair", source: "Advance Australia Fair (1927).ogg" },
  },
  {
    code: "JM",
    name: "Jamaica",
    flag: "🇯🇲",
    flagImage: "/flags/JM.svg",
    colors: ["#009B3A", "#FED100"],
    anthem: { title: "Jamaica, Land We Love", source: '"Jamaica, Land We Love", performed by the United States Navy Band.oga' },
  },
  {
    code: "NL",
    name: "Països Baixos",
    flag: "🇳🇱",
    flagImage: "/flags/NL.svg",
    colors: ["#AE1C28", "#21468B"],
    anthem: { title: "Het Wilhelmus", source: "Wilhelmus koor.oga" },
  },
  {
    code: "SE",
    name: "Suècia",
    flag: "🇸🇪",
    flagImage: "/flags/SE.svg",
    colors: ["#006AA7", "#FECC00"],
    anthem: { title: "Du gamla, du fria", source: "Du gamla, du fria.ogg" },
  },
  {
    code: "NO",
    name: "Noruega",
    flag: "🇳🇴",
    flagImage: "/flags/NO.svg",
    colors: ["#BA0C2F", "#00205B"],
    anthem: { title: "Ja, vi elsker dette landet", source: "Norway (National Anthem).ogg" },
  },
  {
    code: "GR",
    name: "Grècia",
    flag: "🇬🇷",
    flagImage: "/flags/GR.svg",
    colors: ["#0D5EAF", "#FFFFFF"],
    anthem: { title: "Hymn to Liberty", source: "Hymn to liberty instrumental.oga" },
  },
  {
    code: "EG",
    name: "Egipte",
    flag: "🇪🇬",
    flagImage: "/flags/EG.svg",
    colors: ["#CE1126", "#C09300"],
    anthem: { title: "Bilady, Bilady, Bilady", source: "Bilady, Bilady, Bilady.ogg" },
  },
  {
    code: "AR",
    name: "Argentina",
    flag: "🇦🇷",
    flagImage: "/flags/AR.svg",
    colors: ["#75AADB", "#FCBF49"],
    anthem: { title: "Himno Nacional Argentino", source: "Himno Nacional Argentino instrumental.ogg" },
  },
  {
    code: "CU",
    name: "Cuba",
    flag: "🇨🇺",
    flagImage: "/flags/CU.svg",
    colors: ["#002A8F", "#CF142B"],
    anthem: { title: "La Bayamesa", source: "La Bayamesa (1945).ogg" },
  },
  {
    code: "CH",
    name: "Suïssa",
    flag: "🇨🇭",
    flagImage: "/flags/CH.svg",
    colors: ["#D52B1E", "#FFFFFF"],
    anthem: { title: "Schweizerpsalm", source: "Swiss Psalm.ogg" },
  },
  {
    code: "IE",
    name: "Irlanda",
    flag: "🇮🇪",
    flagImage: "/flags/IE.svg",
    colors: ["#169B62", "#FF883E"],
    anthem: { title: "Amhrán na bhFiann", source: "Ireland National Anthem (Amhrán na bhFiann) 1960s.ogg" },
  },
  {
    code: "KR",
    name: "Corea del Sud",
    flag: "🇰🇷",
    flagImage: "/flags/KR.svg",
    colors: ["#003478", "#C60C30"],
    anthem: { title: "Aegukga", source: "National anthem of South Korea, performed by the United States Navy Band.wav" },
  },
  {
    code: "TR",
    name: "Turquia",
    flag: "🇹🇷",
    flagImage: "/flags/TR.svg",
    colors: ["#E30A17", "#FFFFFF"],
    anthem: { title: "İstiklâl Marşı", source: "Istiklâl Marsi instrumetal.ogg" },
  },
  {
    code: "MA",
    name: "Marroc",
    flag: "🇲🇦",
    flagImage: "/flags/MA.svg",
    colors: ["#C1272D", "#006233"],
    anthem: { title: "Hymne Chérifien", source: "National Anthem of Morocco.ogg" },
  },
  {
    code: "PE",
    name: "Perú",
    flag: "🇵🇪",
    flagImage: "/flags/PE.svg",
    colors: ["#D91023", "#FFFFFF"],
    anthem: { title: "Himno Nacional del Perú", source: "United States Navy Band - Marcha Nacional del Perú.ogg" },
  },
  {
    code: "TH",
    name: "Tailàndia",
    flag: "🇹🇭",
    flagImage: "/flags/TH.svg",
    colors: ["#A51931", "#2D2A4A"],
    anthem: { title: "Phleng Chat Thai", source: "Thai National Anthem - US Navy Band.ogg" },
  },
  {
    code: "PT",
    name: "Portugal",
    flag: "🇵🇹",
    flagImage: "/flags/PT.svg",
    colors: ["#006600", "#FF0000"],
    anthem: { title: "A Portuguesa", source: "A Portuguesa - Banda do Batalhão da Guarda Presidencial, 2025.ogg" },
  },
  {
    code: "CO",
    name: "Colòmbia",
    flag: "🇨🇴",
    flagImage: "/flags/CO.svg",
    colors: ["#FCD116", "#003893"],
    anthem: { title: "¡Oh, gloria inmarcesible!", source: "United States Navy Band - ¡Oh, gloria inmarcesible!.ogg" },
  },
  {
    code: "CT",
    name: "Catalunya",
    flag: "🏴",
    flagImage: "/flags/CT.svg",
    colors: ["#FCDD09", "#DA121A"],
    anthem: { title: "Els Segadors", source: "Els Segadors.ogg" },
  },
  {
    code: "EC",
    name: "Equador",
    flag: "🇪🇨",
    flagImage: "/flags/EC.svg",
    colors: ["#FFDD00", "#0072CE"],
    anthem: { title: "¡Salve, Oh Patria!", source: "Anthem of Ecuador.ogg" },
  },
  {
    code: "KP",
    name: "Corea del Nord",
    flag: "🇰🇵",
    flagImage: "/flags/KP.svg",
    colors: ["#024FA2", "#ED1C27"],
    anthem: { title: "Aegukka" },
  },
  {
    code: "VA",
    name: "Vaticà",
    flag: "🇻🇦",
    flagImage: "/flags/VA.svg",
    colors: ["#FFE000", "#C9A227"],
    anthem: { title: "Inno e Marcia Pontificale", source: "United States Navy Band - Inno e Marcia Pontificale.ogg" },
  },
  {
    code: "AF",
    name: "Afganistan",
    flag: "🇦🇫",
    flagImage: "/flags/AF.svg",
    colors: ["#007A36", "#D32011"],
    anthem: { title: "Milli Surood", source: "National Anthem of Afghanistan (Instrumental).ogg" },
  },
  {
    code: "IL",
    name: "Israel",
    flag: "🇮🇱",
    flagImage: "/flags/IL.svg",
    colors: ["#0038B8", "#4A7EBB"],
    anthem: { title: "Hatikvah", source: "Hatikvah instrumental.ogg" },
  },
  {
    code: "CD",
    name: "Congo",
    flag: "🇨🇩",
    flagImage: "/flags/CD.svg",
    colors: ["#007FFF", "#F7D618"],
    anthem: { title: "Debout Congolais", source: "Debout Congolais.ogg" },
  },
  {
    code: "MN",
    name: "Mongòlia",
    flag: "🇲🇳",
    flagImage: "/flags/MN.svg",
    colors: ["#C4272F", "#015197"],
    anthem: { title: "Mongol Ulsyn töriin duulal" },
  },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): Country | undefined {
  return COUNTRY_BY_CODE.get(code);
}
