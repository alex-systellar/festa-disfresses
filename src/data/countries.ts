/**
 * The 41 party countries. Each guest gets one; the costume itself is up to
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
  /**
   * Seed for `scripts/fetch-songs.mjs`, which resolves it against the iTunes
   * Search API and writes the result to `src/data/songs.json`. Omitted where
   * the anthem is the point (USA, France) — those play the anthem clip alone.
   *
   * The preview is streamed from Apple's CDN, never re-hosted: their previews
   * are licensed for playback alongside a link back to the store, so
   * `songs.json` holds URLs and metadata and `public/anthems/<CODE>.mp3`
   * stays the offline fallback.
   */
  song?: {
    /** Free-text query. Hand-written: "a famous song from <country>" finds library music. */
    search: string;
    /**
     * Lowercased substring matched against "<track> — <artist>" to pick from
     * the results. Without it the top hit is often a cover or a Kidz Bop version.
     */
    match: string;
    /**
     * Seconds to skip into the preview, so playback lands on the chorus rather
     * than wherever Apple's 30s window happens to open. Read straight from
     * here by the player, so retuning one is a one-number edit with no refetch.
     *
     * Bounded by the window: Apple chooses the excerpt, so if the chorus falls
     * outside it no offset reaches it and the fix is a different `match`.
     */
    start?: number;
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
    song: { search: "Samba do Brasil Bellini", match: "samba do brasil — bellini", start: 20 },
  },
  {
    code: "US",
    name: "Estats Units",
    flag: "🇺🇸",
    flagImage: "/flags/US.svg",
    colors: ["#B22234", "#3C3B6E"],
    anthem: { title: "The Star-Spangled Banner", source: "Star Spangled Banner instrumental.ogg" },
    song: { search: "Take Me Home Country Roads John Denver", match: "original version" },
  },
  {
    code: "DE",
    name: "Alemanya",
    flag: "🇩🇪",
    flagImage: "/flags/DE.svg",
    colors: ["#000000", "#DD0000"],
    anthem: { title: "Das Lied der Deutschen", source: "National anthem of Germany - U.S. Army 1st Armored Division Band.ogg" },
    song: { search: "Wir singen und marschieren Soldatenlieder", match: "major hans friess", start: 20 },
  },
  {
    code: "AT",
    name: "Àustria",
    flag: "🇦🇹",
    flagImage: "/flags/AT.svg",
    colors: ["#ED2939", "#FFFFFF"],
    anthem: { title: "Land der Berge, Land am Strome", source: "Land der Berge Land am Strome instrumental.ogg" },
    song: { search: "Anton aus Tirol DJ Otzi", match: "anton aus tirol — anton" },
  },
  {
    code: "MX",
    name: "Mèxic",
    flag: "🇲🇽",
    flagImage: "/flags/MX.svg",
    colors: ["#006847", "#CE1126"],
    anthem: { title: "Himno Nacional Mexicano", source: "Himno Nacional Mexicano instrumental.ogg" },
    song: { search: "La Chona Los Tucanes de Tijuana", match: "la chona" },
  },
  {
    code: "JP",
    name: "Japó",
    flag: "🇯🇵",
    flagImage: "/flags/JP.svg",
    colors: ["#BC002D", "#FFFFFF"],
    anthem: { title: "Kimigayo", source: "Kimi ga Yo instrumental.ogg" },
    song: { search: "Renai Circulation Kana Hanazawa", match: "monogatari" },
  },
  {
    code: "FR",
    name: "França",
    flag: "🇫🇷",
    flagImage: "/flags/FR.svg",
    colors: ["#0055A4", "#EF4135"],
    anthem: { title: "La Marseillaise", source: "La Marseillaise.ogg" },
    song: { search: "Alexandrie Alexandra Claude Francois", match: "alexandrie alexandra — claude" },
  },
  {
    code: "IT",
    name: "Itàlia",
    flag: "🇮🇹",
    flagImage: "/flags/IT.svg",
    colors: ["#008C45", "#CD212A"],
    anthem: { title: "Il Canto degli Italiani", source: "Inno di Mameli instrumental.ogg" },
    song: { search: "Nel blu dipinto di blu Volare Domenico Modugno", match: "modugno" },
  },
  {
    code: "ES",
    name: "Espanya",
    flag: "🇪🇸",
    flagImage: "/flags/ES.svg",
    colors: ["#AA151B", "#F1BF00"],
    anthem: { title: "Marcha Real", source: "Marcha Real-Royal March by US Navy Band.ogg" },
    song: { search: "Cara al Sol remix", match: "stormxx" },
  },
  {
    code: "GB",
    name: "Regne Unit",
    flag: "🇬🇧",
    flagImage: "/flags/GB.svg",
    colors: ["#012169", "#C8102E"],
    anthem: { title: "God Save the King", source: "United States Navy Band - God Save the Queen.oga" },
    song: { search: "Never Gonna Give You Up Rick Astley", match: "rick astley" },
  },
  {
    code: "IN",
    name: "Índia",
    flag: "🇮🇳",
    flagImage: "/flags/IN.svg",
    colors: ["#FF9933", "#138808"],
    anthem: { title: "Jana Gana Mana", source: "Jana Gana Mana instrumental.ogg" },
    song: { search: "Mundian To Bach Ke Panjabi MC", match: "mundian to bach ke — panjabi mc" },
  },
  {
    code: "CN",
    name: "Xina",
    flag: "🇨🇳",
    flagImage: "/flags/CN.svg",
    colors: ["#DE2910", "#FFDE00"],
    anthem: { title: "March of the Volunteers", source: "March of the Volunteers instrumental.ogg" },
    song: { search: "Yi Jian Mei Fei Yu-Ching", match: "xue hua piao piao" },
  },
  {
    code: "RU",
    name: "Rússia",
    flag: "🇷🇺",
    flagImage: "/flags/RU.svg",
    colors: ["#0039A6", "#D52B1E"],
    anthem: { title: "Himne de la Federació Russa", source: "Russian Anthem chorus.ogg" },
    song: { search: "Hymne National de LUrss Alexandrov Ensemble", match: "soviet national anthem" },
  },
  {
    code: "CA",
    name: "Canadà",
    flag: "🇨🇦",
    flagImage: "/flags/CA.svg",
    colors: ["#FF0000", "#FFFFFF"],
    anthem: { title: "O Canada", source: "United States Navy Band - O Canada.ogg" },
    song: { search: "Let's Go to the Mall Robin Sparkles", match: "robin sparkles" },
  },
  {
    code: "AU",
    name: "Austràlia",
    flag: "🇦🇺",
    flagImage: "/flags/AU.svg",
    colors: ["#00247D", "#FFFFFF"],
    anthem: { title: "Advance Australia Fair", source: "Advance Australia Fair (1927).ogg" },
    song: { search: "Down Under Men at Work", match: "down under — men at work" },
  },
  {
    code: "JM",
    name: "Jamaica",
    flag: "🇯🇲",
    flagImage: "/flags/JM.svg",
    colors: ["#009B3A", "#FED100"],
    anthem: { title: "Jamaica, Land We Love", source: '"Jamaica, Land We Love", performed by the United States Navy Band.oga' },
    song: { search: "Could You Be Loved Bob Marley", match: "could you be loved — bob" },
  },
  {
    code: "NL",
    name: "Països Baixos",
    flag: "🇳🇱",
    flagImage: "/flags/NL.svg",
    colors: ["#AE1C28", "#21468B"],
    anthem: { title: "Het Wilhelmus", source: "Wilhelmus koor.oga" },
    song: { search: "Boom Boom Boom Boom Vengaboys", match: "vengaboys" },
  },
  {
    code: "SE",
    name: "Suècia",
    flag: "🇸🇪",
    flagImage: "/flags/SE.svg",
    colors: ["#006AA7", "#FECC00"],
    anthem: { title: "Du gamla, du fria", source: "Du gamla, du fria.ogg" },
    song: { search: "Dancing Queen ABBA", match: "dancing queen — abba" },
  },
  {
    code: "NO",
    name: "Noruega",
    flag: "🇳🇴",
    flagImage: "/flags/NO.svg",
    colors: ["#BA0C2F", "#00205B"],
    anthem: { title: "Ja, vi elsker dette landet", source: "Norway (National Anthem).ogg" },
    song: { search: "The Fox What Does the Fox Say Ylvis", match: "ylvis" },
  },
  {
    code: "GR",
    name: "Grècia",
    flag: "🇬🇷",
    flagImage: "/flags/GR.svg",
    colors: ["#0D5EAF", "#FFFFFF"],
    anthem: { title: "Hymn to Liberty", source: "Hymn to liberty instrumental.oga" },
    song: { search: "Zorba the Greek Sirtaki Theodorakis", match: "theodorakis", start: 20 },
  },
  {
    code: "EG",
    name: "Egipte",
    flag: "🇪🇬",
    flagImage: "/flags/EG.svg",
    colors: ["#CE1126", "#C09300"],
    anthem: { title: "Bilady, Bilady, Bilady", source: "Bilady, Bilady, Bilady.ogg" },
    song: { search: "Enta Omri Umm Kulthum", match: "enta oumry" },
  },
  {
    code: "AR",
    name: "Argentina",
    flag: "🇦🇷",
    flagImage: "/flags/AR.svg",
    colors: ["#75AADB", "#FCBF49"],
    anthem: { title: "Himno Nacional Argentino", source: "Himno Nacional Argentino instrumental.ogg" },
    song: { search: "Muchachos ahora nos volvimos a ilusionar", match: "la mosca" },
  },
  {
    code: "CU",
    name: "Cuba",
    flag: "🇨🇺",
    flagImage: "/flags/CU.svg",
    colors: ["#002A8F", "#CF142B"],
    anthem: { title: "La Bayamesa", source: "La Bayamesa (1945).ogg" },
    song: { search: "El meu avi", match: "el meu avi — los manolos" },
  },
  {
    code: "CH",
    name: "Suïssa",
    flag: "🇨🇭",
    flagImage: "/flags/CH.svg",
    colors: ["#D52B1E", "#FFFFFF"],
    anthem: { title: "Schweizerpsalm", source: "Swiss Psalm.ogg" },
    song: { search: "Chihuahua DJ BoBo", match: "chihuahua — dj bobo" },
  },
  {
    code: "IE",
    name: "Irlanda",
    flag: "🇮🇪",
    flagImage: "/flags/IE.svg",
    colors: ["#169B62", "#FF883E"],
    anthem: { title: "Amhrán na bhFiann", source: "Ireland National Anthem (Amhrán na bhFiann) 1960s.ogg" },
    song: { search: "Drunken Sailor Irish Rovers", match: "drunken sailor — the irish rovers" },
  },
  {
    code: "KR",
    name: "Corea del Sud",
    flag: "🇰🇷",
    flagImage: "/flags/KR.svg",
    colors: ["#003478", "#C60C30"],
    anthem: { title: "Aegukga", source: "National anthem of South Korea, performed by the United States Navy Band.wav" },
    song: { search: "Gangnam Style PSY", match: "gangnam style — psy" },
  },
  {
    code: "TR",
    name: "Turquia",
    flag: "🇹🇷",
    flagImage: "/flags/TR.svg",
    colors: ["#E30A17", "#FFFFFF"],
    anthem: { title: "İstiklâl Marşı", source: "Istiklâl Marsi instrumetal.ogg" },
    song: { search: "Simarik Tarkan", match: "tarkan" },
  },
  {
    code: "MA",
    name: "Marroc",
    flag: "🇲🇦",
    flagImage: "/flags/MA.svg",
    colors: ["#C1272D", "#006233"],
    anthem: { title: "Hymne Chérifien", source: "National Anthem of Morocco.ogg" },
    song: { search: "Lm3allem Saad Lamjarred", match: "lamaallem" },
  },
  {
    code: "PE",
    name: "Perú",
    flag: "🇵🇪",
    flagImage: "/flags/PE.svg",
    colors: ["#D91023", "#FFFFFF"],
    anthem: { title: "Himno Nacional del Perú", source: "United States Navy Band - Marcha Nacional del Perú.ogg" },
    song: { search: "Wendy Sulca Mi Tetita", match: "la tetita — wendy", start: 20 },
  },
  {
    code: "TH",
    name: "Tailàndia",
    flag: "🇹🇭",
    flagImage: "/flags/TH.svg",
    colors: ["#A51931", "#2D2A4A"],
    anthem: { title: "Phleng Chat Thai", source: "Thai National Anthem - US Navy Band.ogg" },
    song: { search: "Made in Thailand Carabao", match: "carabao" },
  },
  {
    code: "PT",
    name: "Portugal",
    flag: "🇵🇹",
    flagImage: "/flags/PT.svg",
    colors: ["#006600", "#FF0000"],
    anthem: { title: "A Portuguesa", source: "A Portuguesa - Banda do Batalhão da Guarda Presidencial, 2025.ogg" },
    song: { search: "A Cabritinha Quim Barreiros", match: "cabritinha" },
  },
  {
    code: "CO",
    name: "Colòmbia",
    flag: "🇨🇴",
    flagImage: "/flags/CO.svg",
    colors: ["#FCD116", "#003893"],
    anthem: { title: "¡Oh, gloria inmarcesible!", source: "United States Navy Band - ¡Oh, gloria inmarcesible!.ogg" },
    song: { search: "Hips Don't Lie Shakira", match: "wyclef jean) — shakira" },
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
    song: { search: "Nuestro Juramento Julio Jaramillo", match: "nuestro juramento — julio" },
  },
  {
    code: "KP",
    name: "Corea del Nord",
    flag: "🇰🇵",
    flagImage: "/flags/KP.svg",
    colors: ["#024FA2", "#ED1C27"],
    anthem: { title: "Aegukka" },
    song: { search: "Arirang Korean folk song", match: "arirang" },
  },
  {
    code: "VA",
    name: "Vaticà",
    flag: "🇻🇦",
    flagImage: "/flags/VA.svg",
    colors: ["#FFE000", "#C9A227"],
    anthem: { title: "Inno e Marcia Pontificale", source: "United States Navy Band - Inno e Marcia Pontificale.ogg" },
    song: { search: "Ave Maria Gregorian chant", match: "christ the king choir" },
  },
  {
    code: "AF",
    name: "Afganistan",
    flag: "🇦🇫",
    flagImage: "/flags/AF.svg",
    colors: ["#007A36", "#D32011"],
    anthem: { title: "Milli Surood", source: "National Anthem of Afghanistan (Instrumental).ogg" },
    song: { search: "Ahmad Zahir", match: "tanha shudam" },
  },
  {
    code: "IL",
    name: "Israel",
    flag: "🇮🇱",
    flagImage: "/flags/IL.svg",
    colors: ["#0038B8", "#4A7EBB"],
    anthem: { title: "Hatikvah", source: "Hatikvah instrumental.ogg" },
    song: { search: "Hava Nagila", match: "jewish starlight" },
  },
  {
    code: "CD",
    name: "Congo",
    flag: "🇨🇩",
    flagImage: "/flags/CD.svg",
    colors: ["#007FFF", "#F7D618"],
    anthem: { title: "Debout Congolais", source: "Debout Congolais.ogg" },
    song: { search: "Independance Cha Cha Grand Kalle", match: "grand kalle" },
  },
  {
    code: "MN",
    name: "Mongòlia",
    flag: "🇲🇳",
    flagImage: "/flags/MN.svg",
    colors: ["#C4272F", "#015197"],
    anthem: { title: "Mongol Ulsyn töriin duulal" },
    song: { search: "Yuve Yuve Yu The HU", match: "yuve yuve yu (live" },
  },
  {
    code: "KZ",
    name: "Kazakhstan",
    flag: "🇰🇿",
    flagImage: "/flags/KZ.svg",
    colors: ["#00AFCA", "#FEC50C"],
    anthem: {
      title: "Meñiñ Qazaqstanım",
      source: "Kazakhstan national anthem, played by the U.S. Navy Band.ogg",
    },
    song: { search: "Borat Erran Baron Cohen", match: "o kazakhstan" },
  },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): Country | undefined {
  return COUNTRY_BY_CODE.get(code);
}
