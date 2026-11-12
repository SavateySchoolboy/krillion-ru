(() => {
  'use strict';
  const dictionary = {
    'Daily dive':'Погружение дня','Unlimited':'Без ограничений','Puffer Party':'Вечеринка фугу',
    'Archive':'Архив','Themed packs':'Тематические наборы','My Krillion':'Мой Krillion',
    'Friends':'Друзья','Settings':'Настройки','FAQ':'Вопросы и ответы','Menu':'Меню',
    'HOW TO PLAY':'КАК ИГРАТЬ','BEGIN DESCENT':'НАЧАТЬ ПОГРУЖЕНИЕ','DIVE':'НЫРНУТЬ',
    'DEPTH':'ГЛУБИНА','SCORE':'СЧЁТ','Your answer':'Твой ответ',
    'type one answer…':'напиши один ответ…','Open menu':'Открыть меню','Close menu':'Закрыть меню',
    'Open settings':'Открыть настройки','Open wardrobe':'Открыть гардероб',
    'turn sound off':'Выключить звук','turn sound on':'Включить звук',
    'Next':'Далее','Continue':'Продолжить','Play again':'Сыграть ещё','Share':'Поделиться',
    'Privacy':'Конфиденциальность','descending…':'погружаемся…'
  };
  const russian = text => /[а-яё]/i.test(text);
  function quick(text) {
    const trimmed = text.trim();
    if (dictionary[trimmed]) return text.replace(trimmed,dictionary[trimmed]);
    let out = text.replace(/PROMPT (\d+) OF (\d+)/g,'ВОПРОС $1 ИЗ $2')
      .replace(/DIVE #\s*(\d+)/g,'ПОГРУЖЕНИЕ № $1');
    for (const key of ['BEGIN DESCENT','HOW TO PLAY','ARCHIVE','UNLIMITED','THEMED PACKS']) {
      out = out.replace(key, dictionary[key] || {'ARCHIVE':'АРХИВ','UNLIMITED':'БЕЗ ОГРАНИЧЕНИЙ','THEMED PACKS':'ТЕМАТИЧЕСКИЕ НАБОРЫ'}[key]);
    }
    return out !== text ? out : null;
  }
  // A new draft invalidates every earlier in-flight translation immediately.
  class Draft {
    revision = 0;
    ready = false;
    output = '';
    async update(text, translate, apply) {
      const revision = ++this.revision;
      this.ready = false;
      this.output = '';
      apply('');
      if (!text.trim()) { this.ready = true; return ''; }
      const output = russian(text) ? await translate(text.trim()) : text.trim();
      if (revision !== this.revision) return null;
      if (!output || russian(output)) throw Error('Не удалось получить английский ответ.');
      this.output = output.trim();
      this.ready = true;
      apply(this.output);
      return this.output;
    }
    cancel() { this.revision++; this.ready = false; this.output = ''; }
  }
  globalThis.KrillionRUCore = Object.freeze({quick,russian,Draft});
})();

