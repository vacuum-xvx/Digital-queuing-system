/**
 * =============================================================================
 * МОДУЛЬ АУДИО-ОПОВЕЩЕНИЯ И ГОЛОСОВОГО ДИКТОРА АО «ПОЧТА РОССИИ» (СУО 3.0)
 * =============================================================================
 * Обеспечивает:
 *  1. Теплый акустический двухтональный гонг почтового отделения (Web Audio API)
 *     с гармоническим наслоением обертонов и мягким фильтром (lowpass 2600 Гц)
 *  2. Высококачественную русскую вежливую озвучку вызова клиентов:
 *     «Внимание. Клиент с талоном [буква] [число словами]. Пожалуйста, пройдите к окну номер [номер].»
 *  3. Интеллектуальный конвертер чисел в слова (42 -> «сорок два») и фонетику букв
 *  4. Умный ранжировщик естественных нейронных голосов (Google, Apple, Microsoft Natural)
 * =============================================================================
 */

export interface AnnouncementOptions {
  soundEnabled?: boolean;
  voiceEnabled?: boolean;
  speechRate?: number;
  speechPitch?: number;
  selectedVoiceName?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface AnnouncementData {
  phrase: string;
  displayText: string;
  phoneticTicket: string;
  windowPhrase: string;
  ticketNumber: string;
  windowId: number | string;
}

/**
 * Преобразование целого числа (0..999) в естественную русскую словесную форму
 * Предотвращает роботизированное «четыре два» или «ноль сорок два»
 */
export function numberToRussianWords(n: number): string {
  if (isNaN(n)) return '';
  if (n === 0) return 'ноль';

  const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = [
    'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
    'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'
  ];
  const tens = [
    '', '', 'двадцать', 'тридцать', 'сорок',
    'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'
  ];
  const hundreds = [
    '', 'сто', 'двести', 'триста', 'четыреста',
    'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'
  ];

  const words: string[] = [];

  const h = Math.floor(n / 100);
  const remainder = n % 100;
  const t = Math.floor(remainder / 10);
  const u = remainder % 10;

  if (h > 0 && h < 10) {
    words.push(hundreds[h]);
  }

  if (remainder >= 10 && remainder <= 19) {
    words.push(teens[remainder - 10]);
  } else {
    if (t >= 2) {
      words.push(tens[t]);
    }
    if (u > 0) {
      words.push(units[u]);
    }
  }

  return words.join(' ');
}

/**
 * Аутентичный теплый двухтональный гонг почтового отделения связи (Web Audio API)
 * 1-й тон: Ре (587.33 Гц) -> 2-й тон: Ля (880.00 Гц)
 * С гармоническим наслоением обертонов, мягкой атакой (anti-click) и фильтром 2600 Гц
 */
export function playPostalChime(volume: number = 0.28): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) {
        resolve();
        return;
      }

      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Мягкий мастер-фильтр низких частот (2600 Гц) для теплого бархатного звучания
      const masterFilter = ctx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.setValueAtTime(2600, now);
      masterFilter.Q.setValueAtTime(0.7, now);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(volume, now);

      masterFilter.connect(masterGain);
      masterGain.connect(ctx.destination);

      // Генератор акустического тона с мягкой атакой и гармоническим обертоном
      const playHarmonicTone = (freq: number, startTime: number, duration: number, gainLevel: number) => {
        // Фундаментальный тон (sine)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, startTime);

        // Мягкая атака (15 мс) исключает цифровой клик динамика
        gain1.gain.setValueAtTime(0.0001, startTime);
        gain1.gain.linearRampToValueAtTime(gainLevel, startTime + 0.015);
        gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc1.connect(gain1);
        gain1.connect(masterFilter);
        osc1.start(startTime);
        osc1.stop(startTime + duration + 0.05);

        // Вторая гармоника (октава вверх) для акустической чистоты
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, startTime);

        gain2.gain.setValueAtTime(0.0001, startTime);
        gain2.gain.linearRampToValueAtTime(gainLevel * 0.25, startTime + 0.012);
        gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.65);

        osc2.connect(gain2);
        gain2.connect(masterFilter);
        osc2.start(startTime);
        osc2.stop(startTime + duration * 0.7);
      };

      // Тон 1: Ре (D5 = 587.33 Гц)
      playHarmonicTone(587.33, now, 0.65, 0.9);

      // Тон 2: Ля (A5 = 880.00 Гц) — вступает на 240 мс
      playHarmonicTone(880.00, now + 0.24, 1.05, 1.0);

      // Тактильная виброотдача для мобильных устройств
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([120, 70, 130]);
        } catch {}
      }

      // Разрешаем промис чуть раньше затухания, чтобы речь диктора плавно следовала за гонгом
      setTimeout(resolve, 700);
    } catch (err) {
      console.warn('Audio chime failed:', err);
      resolve();
    }
  });
}

/**
 * Преобразование серии талона и номера в естественное звучание на русском языке
 */
export function formatAnnouncementPhrase(
  ticketNumber: string,
  windowId: number | string
): AnnouncementData {
  const cleanTicket = (ticketNumber || '').trim();
  const parts = cleanTicket.split('-');
  let phoneticTicket = cleanTicket;

  const letterPronunciations: Record<string, string> = {
    'А': 'А',
    'Б': 'Бэ',
    'В': 'Вэ',
    'Г': 'Гэ',
    'Д': 'Дэ',
    'Е': 'Е',
    'Ж': 'Жэ',
    'З': 'Зэ',
    'И': 'И',
    'К': 'Ка',
    'Л': 'Эль',
    'М': 'Эм',
    'Н': 'Эн',
    'О': 'О',
    'П': 'Пэ',
    'Р': 'Эр',
    'С': 'Эс',
    'Т': 'Тэ',
    'У': 'У',
    'Ф': 'Эф',
    'Ц': 'Цэ',
    'Ч': 'Че',
    'Ш': 'Ша',
    'Щ': 'Ща',
    'Э': 'Э',
    'Ю': 'Ю',
    'Я': 'Я'
  };

  if (parts.length === 2) {
    const letter = parts[0].trim().toUpperCase();
    const numInt = parseInt(parts[1], 10);
    const letterSpoken = letterPronunciations[letter] || letter;
    // Озвучиваем номер естественными словами на русском («сорок два», «семь», «сто пять»)
    const numSpoken = !isNaN(numInt) ? numberToRussianWords(numInt) : parts[1];
    phoneticTicket = `${letterSpoken}, ${numSpoken}`;
  }

  const windowNames: Record<string, string> = {
    '1': 'один',
    '2': 'два',
    '3': 'три',
    '4': 'четыре',
    '5': 'пять',
    '6': 'шесть',
    '7': 'семь',
    '8': 'восемь'
  };

  const windowPhrase = windowNames[String(windowId)] || String(windowId);

  // Вежливая, плавная и благозвучная фраза по современному регламенту Почты России
  // Знаки препинания (точки, запятые) обеспечивают естественные дыхательные паузы синтезатора
  const phrase = `Внимание. Клиент с талоном ${phoneticTicket}. Пожалуйста, пройдите к окну номер ${windowPhrase}.`;
  const displayText = `Клиент с талоном ${cleanTicket} → Окно № ${windowId}`;

  return {
    phrase,
    displayText,
    phoneticTicket,
    windowPhrase,
    ticketNumber: cleanTicket,
    windowId
  };
}

/**
 * Получение установленных в системе русских голосов с ранжированием по естественности
 * Приоритет отдается нейронным, Google, Apple Siri, Microsoft Natural и женским голосам
 */
export function getRussianSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  const voices = window.speechSynthesis.getVoices() || [];
  const ruVoices = voices.filter(
    (v) =>
      v.lang.toLowerCase().startsWith('ru') ||
      v.lang.toLowerCase().includes('rus') ||
      v.name.toLowerCase().includes('russian') ||
      v.name.toLowerCase().includes('рус')
  );

  const rateVoice = (voice: SpeechSynthesisVoice): number => {
    const name = (voice.name || '').toLowerCase();
    let score = 50;

    // Премиальные нейросетевые голоса
    if (name.includes('natural')) score += 60;
    if (name.includes('neural')) score += 55;
    if (name.includes('online')) score += 35;
    if (name.includes('enhanced') || name.includes('premium')) score += 40;

    // Фирменные качественные движки
    if (name.includes('google')) score += 45; // Google русский — мягкий, разборчивый
    if (name.includes('yandex')) score += 45; // Яндекс Алиса / диктор
    if (name.includes('milena') || name.includes('katya') || name.includes('yuri')) score += 40; // Apple voices
    if (name.includes('svetlana') || name.includes('daria') || name.includes('irina')) score += 35; // Windows Natural

    // Женские голоса звучат теплее и отчетливее в публичных залах
    if (
      name.includes('female') ||
      name.includes('жен') ||
      name.includes('svetlana') ||
      name.includes('daria') ||
      name.includes('milena') ||
      name.includes('elena') ||
      name.includes('irina') ||
      name.includes('tatyana') ||
      name.includes('victoria')
    ) {
      score += 20;
    }

    // Удаленный сервис обычно выше качеством, чем примитивный локальный синтезатор
    if (!voice.localService) score += 15;

    // Понижаем роботизированный eSpeak/speech-dispatcher
    if (name.includes('espeak') || name.includes('speech-dispatcher') || name.includes('synth')) {
      score -= 50;
    }

    return score;
  };

  return ruVoices.sort((a, b) => rateVoice(b) - rateVoice(a));
}

/**
 * Комплексное воспроизведение вызова клиента: гонг + вежливый диктор на русском языке
 */
export async function announceTicketCall(
  ticketNumber: string,
  windowId: number | string,
  options?: AnnouncementOptions
): Promise<AnnouncementData> {
  const {
    soundEnabled = true,
    voiceEnabled = true,
    speechRate = 0.88, // Неспешный, спокойный и уважительный темп речи
    speechPitch = 1.03, // Мягкий и благозвучный тембр
    selectedVoiceName,
    onStart,
    onEnd
  } = options || {};

  const announcementData = formatAnnouncementPhrase(ticketNumber, windowId);

  // 1. Проигрываем двухтональный гармонический гонг
  if (soundEnabled) {
    await playPostalChime(0.28);
  }

  // 2. Озвучиваем диктором через Web Speech API
  if (voiceEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(announcementData.phrase);
        utterance.lang = 'ru-RU';
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;

        const rankedVoices = getRussianSpeechVoices();
        if (selectedVoiceName) {
          const match = rankedVoices.find((v) => v.name === selectedVoiceName);
          if (match) utterance.voice = match;
        }

        if (!utterance.voice && rankedVoices.length > 0) {
          // Выбираем лучший ранжированный голос по умолчанию
          utterance.voice = rankedVoices[0];
        }

        let isFinished = false;
        let timeout: ReturnType<typeof setTimeout>;
        const handleFinish = () => {
          if (!isFinished) {
            isFinished = true;
            clearTimeout(timeout);
            if (onEnd) onEnd();
            resolve(announcementData);
          }
        };

        utterance.onstart = () => {
          if (onStart) onStart();
        };

        utterance.onend = handleFinish;
        utterance.onerror = (e) => {
          console.warn('Speech synthesis utterance error:', e);
          handleFinish();
        };

        window.speechSynthesis.speak(utterance);

        // Страховочный таймаут (если синтез зависнет в браузере)
        timeout = setTimeout(() => {
          window.speechSynthesis.cancel();
          handleFinish();
        }, 7000);
      } catch (err) {
        console.warn('Speech synthesis exception:', err);
        if (onEnd) onEnd();
        resolve(announcementData);
      }
    });
  } else {
    if (onStart) onStart();
    await new Promise<void>(resolve => setTimeout(() => {
      if (onEnd) onEnd();
      resolve();
    }, 1200));
    return announcementData;
  }
}
