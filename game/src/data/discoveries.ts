/**
 * Discovery log cards (PROMPT §3.5): visiting a landmark unlocks a short card, so the game doubles as
 * a mini city guide. Keyed by the landmark id from pipeline/landmarks.yaml (map labels carry it).
 * Facts are kept to well-documented basics; each card names where to read more.
 */
export interface Discovery {
  title: string;
  gu?: string;
  facts: string[];
  source: string;
}

export const DISCOVERIES: Record<string, Discovery> = {
  race_course: {
    title: 'Race Course', gu: 'રેસકોર્સ',
    facts: ['The green heart of Rajkot: a ring road, walking track, gardens and sports grounds.',
      'Every Janmashtami it hosts the lokmelo, the city\'s big public fair.'],
    source: 'Wikipedia: Rajkot',
  },
  cricket_ground: {
    title: 'Madhavrao Scindia Cricket Ground',
    facts: ['Rajkot\'s older cricket ground, at Race Course.',
      'International cricket in Rajkot has since moved to the Saurashtra Cricket Association Stadium at Khandheri.'],
    source: 'Wikipedia: Madhavrao Scindia Cricket Ground',
  },
  bal_bhavan: {
    title: 'Bal Bhavan', gu: 'બાલ ભવન',
    facts: ['A children\'s activity centre and park at Race Course.'],
    source: 'Rajkot Municipal Corporation',
  },
  jubilee_garden: {
    title: 'Jubilee Garden', gu: 'જ્યુબિલી બાગ',
    facts: ['A colonial-era garden named for Queen Victoria\'s jubilee.',
      'It holds the Watson Museum and Connaught Hall.'],
    source: 'Wikipedia: Watson Museum',
  },
  watson_museum: {
    title: 'Watson Museum', gu: 'વોટસન મ્યુઝિયમ',
    facts: ['Opened in 1888 and named after Colonel John Watson, a political agent of Kathiawar.',
      'One of the oldest museums in Gujarat: sculpture, coins, textiles and the history of the Saurashtra princely states.'],
    source: 'Wikipedia: Watson Museum',
  },
  connaught_hall: {
    title: 'Connaught Hall',
    facts: ['A colonial-era hall inside Jubilee Garden, next to the Watson Museum.'],
    source: 'Wikipedia: Watson Museum',
  },
  kaba_gandhi_no_delo: {
    title: 'Kaba Gandhi no Delo', gu: 'કબા ગાંધીનો ડેલો',
    facts: ['The family home of Karamchand "Kaba" Gandhi, Mahatma Gandhi\'s father, who was diwan of Rajkot.',
      'Gandhi lived here as a boy while studying in Rajkot.'],
    source: 'Wikipedia: Kaba Gandhi No Delo',
  },
  gandhi_museum: {
    title: 'Mahatma Gandhi Museum (Alfred High School)',
    facts: ['Gandhi studied at Alfred High School and finished school here in 1887.',
      'The school building became the Mahatma Gandhi Museum in 2018.'],
    source: 'Wikipedia: Mohandas Karamchand Gandhi High School',
  },
  dolls_museum: {
    title: 'Rotary Dolls Museum',
    facts: ['A museum of dolls in national costumes from countries around the world.'],
    source: 'Gujarat Tourism',
  },
  rajkumar_college: {
    title: 'Rajkumar College', gu: 'રાજકુમાર કોલેજ',
    facts: ['Founded in 1868 to educate the sons of the princely families of Kathiawar.',
      'One of the oldest boarding schools in India.'],
    source: 'Wikipedia: Rajkumar College, Rajkot',
  },
  rajkot_junction: {
    title: 'Rajkot Junction', gu: 'રાજકોટ જંક્શન',
    facts: ['The city\'s main railway station and headquarters of the Rajkot division of Western Railway.'],
    source: 'Wikipedia: Rajkot Junction railway station',
  },
  bhaktinagar_station: {
    title: 'Bhaktinagar station',
    facts: ['Rajkot\'s second railway station, in the south-east of the city.'],
    source: 'Wikipedia: Bhaktinagar railway station',
  },
  trikon_baug: {
    title: 'Trikon Baug', gu: 'ત્રિકોણ બાગ',
    facts: ['A small triangular garden at the city centre; the game\'s map origin is here.',
      'Its Ganesh festival pandal, "Trikon Baug no Raja", draws big crowds every year.'],
    source: 'Local knowledge (Rakshit)',
  },
  soni_bazaar: {
    title: 'Soni Bazaar', gu: 'સોની બજાર',
    facts: ['The old gold market. Rajkot is one of India\'s big centres of gold jewellery making.'],
    source: 'Wikipedia: Rajkot',
  },
  darbargadh: {
    title: 'Darbargadh', gu: 'દરબારગઢ',
    facts: ['The old palace quarter of the Jadeja rulers of Rajkot State, in the heart of the old city.'],
    source: 'Wikipedia: Rajkot State',
  },
  dharmendra_road: {
    title: 'Dharmendra Road',
    facts: ['A narrow, packed market street for clothes, shoes and everything else.'],
    source: 'Local knowledge (Rakshit)',
  },
  lakhajiraj_road: {
    title: 'Lakhajiraj Road',
    facts: ['Named after Thakore Saheb Lakhajiraj, ruler of Rajkot State from 1907 to 1930.'],
    source: 'Wikipedia: Rajkot State',
  },
  sadar_bazaar: {
    title: 'Sadar Bazaar', gu: 'સદર બજાર',
    facts: ['A busy market in the old civil station area.'],
    source: 'Local knowledge (Rakshit)',
  },
  atal_sarovar: {
    title: 'Atal Sarovar',
    facts: ['A new lakefront park built in Rajkot\'s smart-city area at Raiya.'],
    source: 'Rajkot Municipal Corporation',
  },
  aji_dam: {
    title: 'Aji-1 Dam', gu: 'આજી ડેમ',
    facts: ['A dam on the Aji river at the city\'s eastern edge, one of Rajkot\'s main water sources.'],
    source: 'Wikipedia: Aji Dam',
  },
  ramvan: {
    title: 'Ramvan', gu: 'રામવન',
    facts: ['An urban forest near Aji Dam, with sculptures telling the story of the Ramayana.'],
    source: 'Rajkot Municipal Corporation',
  },
  lalpari_randarda: {
    title: 'Lalpari and Randarda lakes',
    facts: ['Two lakes on the east side of the city, popular for evening outings.'],
    source: 'Gujarat Tourism',
  },
  nyari_dam: {
    title: 'Nyari-1 Dam', gu: 'ન્યારી ડેમ',
    facts: ['A dam on the Nyari river west of the city, another of Rajkot\'s water sources and a picnic spot.'],
    source: 'Wikipedia: Rajkot',
  },
  pradyuman_park: {
    title: 'Pradyuman Park (zoo)',
    facts: ['Rajkot\'s zoo, next to Lalpari lake.'],
    source: 'Rajkot Municipal Corporation',
  },
  ishwariya_park: {
    title: 'Ishwariya Park',
    facts: ['A large park with a lake on the city\'s north-western edge.'],
    source: 'Gujarat Tourism',
  },
  baps_kalawad: {
    title: 'BAPS Swaminarayan Mandir',
    facts: ['A carved stone Swaminarayan temple on Kalawad Road.'],
    source: 'BAPS',
  },
  ring_road_brts: {
    title: '150 Ft Ring Road and BRTS',
    facts: ['Rajkot\'s ring road, with the Rajpath BRTS "Blue Corridor" bus lanes, opened in 2012.'],
    source: 'Wikipedia: Rajkot BRTS',
  },
  saurashtra_university: {
    title: 'Saurashtra University',
    facts: ['A state university founded in 1967, with a large campus on Kalawad Road.'],
    source: 'Wikipedia: Saurashtra University',
  },
  old_airport: {
    title: 'Old Rajkot airport',
    facts: ['The city airport for decades; flights moved to the new Rajkot International Airport at Hirasar in 2023.'],
    source: 'Wikipedia: Rajkot Airport',
  },
  trimandir: {
    title: 'Trimandir',
    facts: ['A Dada Bhagwan temple that brings Jain, Vaishnav and Shaiv deities together under one roof.'],
    source: 'Dada Bhagwan Foundation',
  },
  darshan_university: {
    title: 'Darshan University',
    facts: ['A university at Hadala on the Rajkot–Morbi highway — Rakshit\'s college.'],
    source: 'Darshan University',
  },
};
