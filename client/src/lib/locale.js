import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'tj-locale';

const STRINGS = {
  en: {
    today: 'Today',
    conversations: 'Conversations',
    performance: 'Performance',
    controls: 'Controls',
    capture: 'Capture',
    scope: 'Scope',
    allStations: 'All stations',
    sendBatch: 'Send a batch',
    pauseAll: 'Pause all outreach',
    needsYou: 'Needs you',
    thisWeek: 'This week',
    valueOfProgramme: 'Value of the programme',
    outreachRunning: 'Outreach is running',
    outreachPaused: 'Outreach is paused',
    goodMorning: 'Good morning',
    goodAfternoon: 'Good afternoon',
    goodEvening: 'Good evening',
  },
  fi: {
    today: 'Tänään',
    conversations: 'Keskustelut',
    performance: 'Suoritus',
    controls: 'Hallinta',
    capture: 'Kirjaus',
    scope: 'Alue',
    allStations: 'Kaikki asemat',
    sendBatch: 'Lähetä erä',
    pauseAll: 'Keskeytä kaikki',
    needsYou: 'Vaatii toimia',
    thisWeek: 'Tämä viikko',
    valueOfProgramme: 'Ohjelman arvo',
    outreachRunning: 'Lähetykset käynnissä',
    outreachPaused: 'Lähetykset tauolla',
    goodMorning: 'Hyvää huomenta',
    goodAfternoon: 'Hyvää iltapäivää',
    goodEvening: 'Hyvää iltaa',
  },
};

export function useLocale() {
  const [locale, setLocaleState] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    return localStorage.getItem(STORAGE_KEY) === 'fi' ? 'fi' : 'en';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next) => {
    setLocaleState(next === 'fi' ? 'fi' : 'en');
  }, []);

  const t = useCallback(
    (key) => STRINGS[locale]?.[key] || STRINGS.en[key] || key,
    [locale]
  );

  return { locale, setLocale, t };
}
