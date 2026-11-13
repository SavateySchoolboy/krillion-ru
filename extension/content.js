(() => {
  'use strict';
  if (document.getElementById('kr-ru-panel')) return;
  const {quick,russian,Draft} = globalThis.KrillionRUCore;
  let active = false, starting = false, generation = 0, scanTimer;
  let toRussian, toEnglish;
  const originals = new Map(), attributes = new Map(), cache = new Map();
  const bindings = new Map(), scheduled = new WeakMap();
  let queue = Promise.resolve();
  const host = document.createElement('div');
  host.id = 'kr-ru-panel';
  host.setAttribute('translate','no');
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `<style>
    :host{position:fixed;right:14px;top:75px;z-index:2147483647;font:12px/1.5 system-ui,sans-serif;color:#e5fcff;max-width:min(300px,calc(100vw - 28px))}
    .box{background:#102c38ed;border:1px solid #4d8795;border-radius:14px;padding:9px 12px;box-shadow:0 5px 20px #0004;backdrop-filter:blur(10px)}
    button{font:600 12px system-ui;border:0;border-radius:20px;background:#9aebe4;color:#102c38;padding:8px 12px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}
    .row{display:flex;gap:10px;align-items:center}.tag{font-weight:700;letter-spacing:.1em}
    p{margin:6px 0 0;font-size:11px;overflow-wrap:anywhere}#preview{color:#a4eee7}details{font-size:10px;margin-top:5px;color:#b3cbd0}summary{cursor:pointer}
  </style><div class="box"><div class="row"><span class="tag">KR · RU</span><button id="toggle">Включить перевод</button></div>
  <p id="status" role="status">Включи до начала игры.</p><p id="preview"></p>
  <details><summary>Как это работает</summary>Перевод выполняется в Chrome. Сначала загрузятся языковые пакеты. Русский черновик видишь ты, в игру поступает английский ответ. Таймер сайта продолжает идти.</details></div>`;
  document.documentElement.append(host);
  const toggle = shadow.getElementById('toggle');
  const status = shadow.getElementById('status');
  const preview = shadow.getElementById('preview');
  const say = text => { status.textContent = text; };
  const style = document.createElement('style');
  style.textContent = '[data-kr-ru-original]{display:none!important}[data-kr-ru-draft]{font-family:inherit}';
  document.documentElement.append(style);

  function setNative(input,value) {
    if (!input.isConnected) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function bindInput(input) {
    if (bindings.has(input) || input.hasAttribute('data-kr-ru-draft')) return;
    const form = input.form;
    const findSendButton = () => {
      if (form) {
        const submitter = form.querySelector('button[type="submit"],input[type="submit"]');
        if (submitter) return submitter;
      }
      const sendLabel = /(^|\b)(dive|send|submit|answer|guess|lock in|отправить|ответить|нырнуть|готово)(\b|$)/i;
      let parent = input.parentElement;
      for (let depth = 0; parent && parent !== document.body && depth < 6; depth++, parent = parent.parentElement) {
        const button = Array.from(parent.querySelectorAll('button,[role="button"]'))
          .find(el => sendLabel.test((el.getAttribute('aria-label') || el.textContent || '').trim()));
        if (button) return button;
      }
      return null;
    };
    const sendButton = findSendButton();
    const clone = input.cloneNode(false);
    clone.removeAttribute('name'); clone.removeAttribute('id');
    clone.removeAttribute('value'); clone.removeAttribute('data-kr-ru-original');
    clone.setAttribute('data-kr-ru-draft','');
    clone.setAttribute('translate','no');
    clone.setAttribute('aria-label','Ответ по-русски или по-английски');
    clone.placeholder = 'Напиши ответ по-русски…';
    clone.value = input.value;
    input.setAttribute('data-kr-ru-original','');
    input.before(clone);
    const state = new Draft();
    let pending = Promise.resolve(''), composing = false, sending = false;
    let expected = input.value, lastDraft = clone.value;
    const promptText = () => Array.from(document.querySelectorAll('[class*="prompt"]'))
      .filter(el => !el.closest('#kr-ru-panel')).map(el=>el.textContent).join('|');
    let prompt = promptText();
    const apply = value => {
      if (!active || !input.isConnected || !clone.isConnected) return;
      expected = value; setNative(input,value);
    };
    function update() {
      lastDraft = clone.value;
      preview.textContent = russian(lastDraft) ? 'Переводим ответ…' : '';
      const draft = lastDraft;
      pending = state.update(draft, text => toEnglish.translate(text), apply)
        .then(result => {
          if (result === null || !active || clone.value !== draft) return;
          preview.textContent = result ? 'В игру пойдёт: ' + result : '';
          say('Русский интерфейс · английские ответы');
          return result;
        }).catch(error => {
          if (clone.value === draft && active) {
            apply(''); say('Ответ не отправлен. ' + error.message);
            preview.textContent = 'Попробуй другое слово или напиши по-английски.';
          }
        });
    }
    const onInput = () => { state.cancel(); apply(''); if (!composing) update(); };
    const onStart = () => { composing = true; state.cancel(); apply(''); };
    const onEnd = () => { composing = false; update(); };
    async function submit(event) {
      if (!active || sending) return;
      if (composing || (!state.ready && russian(clone.value))) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (composing) return;
        const revision = state.revision;
        await pending;
        if (!active || revision !== state.revision || !state.ready || !state.output || !input.isConnected || !clone.isConnected || clone.disabled) return;
        // Let the site's controlled input commit English before replaying its submit action.
        await new Promise(resolve => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          requestAnimationFrame(() => requestAnimationFrame(finish));
          setTimeout(finish, 80);
        });
        if (revision !== state.revision || !input.isConnected || input.disabled) return;
        sending = true;
        try {
          if (form?.isConnected) form.requestSubmit();
          else if (sendButton?.isConnected && !sendButton.disabled) sendButton.click();
          else input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        } finally { sending = false; }
      }
    }
    const onKey = async event => {
      if(event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (composing) return;
      const revision = state.revision;
      await pending;
      if (!active || revision !== state.revision || !state.ready || !state.output || input.disabled) return;
      sending = true;
      try {
        if (form?.isConnected) form.requestSubmit();
        else if (sendButton?.isConnected && !sendButton.disabled) sendButton.click();
        else input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      } finally { sending = false; }
    };
    clone.addEventListener('input',onInput);
    clone.addEventListener('compositionstart',onStart);
    clone.addEventListener('compositionend',onEnd);
    clone.addEventListener('keydown',onKey);
    form?.addEventListener('submit',submit,true);
    // Some multiplayer controls use a button outside a native form.
    sendButton?.addEventListener('click',submit,true);
    bindings.set(input,{
      clone,
      sync() {
        clone.disabled = input.disabled;
        clone.readOnly = input.readOnly;
        const currentPrompt = promptText();
        // A new round or a site reset must never inherit the previous Russian draft.
        if ((prompt && currentPrompt !== prompt && !russian(currentPrompt)) || (expected && input.value === '' && state.ready)) {
          state.cancel(); expected=''; lastDraft=''; clone.value=''; preview.textContent='';
        }
        prompt = currentPrompt;
      },
      dispose() {
        state.cancel();
        form?.removeEventListener('submit',submit,true);
        sendButton?.removeEventListener('click',submit,true);
        clone.remove(); input.removeAttribute('data-kr-ru-original');
      }
    });
    if (input === document.activeElement) clone.focus();
    if (clone.value) update();
  }
  function skip(element) {
    return !element || element.closest('#kr-ru-panel,script,style,noscript,textarea,input,code,pre,svg,canvas,[contenteditable],[translate="no"],[data-kr-ru-draft]');
  }
  async function translation(text) {
    const direct = quick(text);
    if (direct !== null) return direct;
    if (cache.has(text)) return cache.get(text);
    const result = await toRussian.translate(text);
    if (cache.size > 1200) cache.delete(cache.keys().next().value);
    cache.set(text,result);
    return result;
  }
  function translateNode(node) {
    const value = node.nodeValue;
    if (!value || !/[a-z]{2}/i.test(value) || value.length>5000 || skip(node.parentElement)) return;
    const entry = originals.get(node);
    if(entry?.translated === value) return;
    if(scheduled.get(node) === value) return;
    const token = generation;
    const apply = result => {
      if(!active || token !== generation || !node.isConnected || node.nodeValue !== value) return;
      const leading=value.match(/^\s*/)[0], trailing=value.match(/\s*$/)[0];
      const translated=leading+result.trim()+trailing;
      originals.set(node,{original:value,translated});
      node.nodeValue=translated;
    };
    const direct=quick(value);
    if(direct !== null){apply(direct);return;}
    scheduled.set(node,value);
    queue=queue.then(async()=> {
      if(active && token===generation && node.isConnected && node.nodeValue===value) apply(await translation(value));
    }).catch(()=>say('Некоторые фразы не переведены. Можно выключить и включить перевод.')).finally(()=>scheduled.delete(node));
  }
  function scan() {
    if(!active) return;
    for(const [input,binding] of bindings) {
      if(!input.isConnected || !binding.clone.isConnected){binding.dispose();bindings.delete(input);}
      else binding.sync();
    }
    // Only the observed game-answer control. Login/password/search inputs are untouched.
    document.querySelectorAll('input.ds-input:not([data-kr-ru-draft]),input[aria-label="Your answer"]:not([data-kr-ru-draft])').forEach(input => {
      const label = `${input.getAttribute('aria-label') || ''} ${input.placeholder || ''}`.toLowerCase();
      const isAnswer = /answer|guess|ответ|вариант/.test(label) ||
        (input.classList.contains('ds-input') && input.maxLength > 32 && input.autocomplete !== 'nickname');
      // Leave lobby name and room-code fields untouched; they are short and not answer controls.
      const isLobbyField = input.autocomplete === 'nickname' || input.maxLength > 0 && input.maxLength <= 16 || /room code|код комнаты|kr[l]?p/i.test(label);
      if (isAnswer && !isLobbyField) bindInput(input);
    });
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node; while((node=walker.nextNode())) translateNode(node);
    document.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el=>{
      if(el.closest('#kr-ru-panel,[data-kr-ru-draft]'))return;
      for(const name of ['placeholder','aria-label','title']){
        const value=el.getAttribute(name);if(!value)continue;
        const translated=quick(value);if(!translated || translated===value)continue;
        if(!attributes.has(el))attributes.set(el,{});
        attributes.get(el)[name]={original:value,translated};
        el.setAttribute(name,translated);
      }
    });
    for(const node of originals.keys())if(!node.isConnected)originals.delete(node);
  }
  const observer=new MutationObserver(()=>{
    if(!active || scanTimer)return;
    // Throttle instead of a resetting debounce: continuously changing party timers
    // must not starve answer-field discovery.
    scanTimer=setTimeout(()=>{scanTimer=null;scan();},100);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','readonly']});
  function stop() {
    active=false;generation++;clearTimeout(scanTimer);
    bindings.forEach(b=>b.dispose());bindings.clear();
    for(const [node,e]of originals)if(node.isConnected && node.nodeValue===e.translated)node.nodeValue=e.original;
    originals.clear();
    for(const [el,attrs]of attributes)for(const [key,e]of Object.entries(attrs))if(el.getAttribute(key)===e.translated)el.setAttribute(key,e.original);
    attributes.clear();
    toggle.textContent='Включить перевод';say('Оригинальный сайт. Перевод выключен.');preview.textContent='';
  }
  toggle.addEventListener('click',async()=>{
    if(active){stop();return;}
    if(starting)return;
    if(!globalThis.Translator){say('Нужен настольный Google Chrome 138+ со встроенным Translator API. Обнови Chrome и открой сайт заново.');return;}
    starting=true;toggle.disabled=true;say('Подготовка языков EN ↔ RU…');
    try{
      const monitor=m=>m.addEventListener('downloadprogress',e=>say('Загрузка языкового пакета: '+Math.round(e.loaded*100)+'%. Не закрывай вкладку.'));
      // Chrome may consume the gesture when downloading a language pack.
      // Prepare each direction with its own explicit click.
      if (!toRussian) {
        toRussian = await Translator.create({sourceLanguage:'en',targetLanguage:'ru',monitor});
        toggle.textContent = 'Подготовить русский ввод';
        say('Перевод страницы готов. Нажми ещё раз для ответов RU → EN.');
        return;
      }
      if (!toEnglish) toEnglish = await Translator.create({sourceLanguage:'ru',targetLanguage:'en',monitor});
      active=true;generation++;toggle.textContent='Показать оригинал';
      say('Русский интерфейс · английские ответы');scan();
    }catch(error){say('Перевод недоступен: '+error.message+' Попробуй обновить Chrome или загрузить языки ещё раз.');}
    finally{starting=false;toggle.disabled=false;}
  });
})();

