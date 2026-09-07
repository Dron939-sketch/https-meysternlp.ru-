// openers.js — три готовых первых вопроса под знаком вопроса у поля ввода.
//
// Зачем. За неделю 29 человек открыли Фреди и отправили 20 сообщений на
// всех: две трети не написали ни одного. Их встречает пустое поле
// «Напишите, что беспокоит…» — а сформулировать первый вопрос незнакомой
// программе трудно, даже когда есть о чём спросить.
//
// Почти все приходят с лекции Лектория, то есть минуту назад читали
// вполне конкретный текст. По рефереру узнаём курс и показываем три
// вопроса ровно по нему — из блоков «Частые вопросы» его же лекций.
//
// Вопросы свёрнуты под знак вопроса у поля ввода: открытым списком они
// добавляли на первый экран ещё три ярких прямоугольника поверх голосовой
// кнопки, режимов, модулей и быстрых действий. Опора осталась, шум ушёл.
//
// И это примеры, а не кнопки. Кнопка обещает действие и совершает его сама:
// человек нажимает, не дочитав, и уходит в разговор не о том, с чем пришёл.
// Задача проще — показать, какого рода вопросы здесь уместны. Формулировать
// свой он будет сам, и это уже его вопрос, а не наш.
//
// Данные: openers.json, собирается tools/build_chat_openers.py.
// Ничего не показываем, если разговор уже начат: подсказка нужна тому,
// кто ещё не сказал ни слова.

(function () {
    'use strict';

    var SRC = '/fredi/openers.json';
    var _data = null;
    var _shown = false;

    function _track(ev, data) {
        try {
            if (window.FrediTracker && window.FrediTracker.track)
                window.FrediTracker.track(ev, data || {});
        } catch (e) {}
    }

    // ---- откуда пришёл человек ----------------------------------------

    // ?from=<слаг> — явное указание, если ссылку когда-нибудь захотят
    // размечать руками. Иначе смотрим реферер, но только свой:
    // с поисковика или из мессенджера темы не выведешь.
    function _sourcePath() {
        var from = '';
        try { from = new URLSearchParams(location.search).get('from') || ''; }
        catch (e) {
            var m = (location.search || '').match(/[?&]from=([^&]+)/);
            from = m ? decodeURIComponent(m[1]) : '';
        }
        if (from) return from;
        var ref = document.referrer || '';
        if (!ref) return '';
        try {
            var u = new URL(ref, location.href);
            if (u.host !== location.host && !/(^|\.)meysternlp\.ru$/i.test(u.host)) return '';
            return u.pathname;
        } catch (e) { return ''; }
    }

    // /blog/lektorij/kak-dumat/            → kak-dumat
    // /blog/lekciya-dumat-3-vopros.html    → префикс dumat → kak-dumat
    function _courseFor(path) {
        if (!path || !_data) return null;
        var m = path.match(/\/blog\/lektorij\/([a-z0-9-]+)\/?$/);
        if (m && _data.courses[m[1]]) return m[1];
        m = path.match(/\/blog\/lekciya-([a-z0-9]+)-\d+/);
        if (m) {
            var slug = _data.prefixes[m[1]];
            if (slug && _data.courses[slug]) return slug;
        }
        return null;
    }

    // Посадочные-инструменты: /posle-rasstavaniya/ и такие же. С них
    // приходят не реже, чем с лекций, и приходят на пике — человек только
    // что сам разобрал свою историю. Общие вопросы здесь мимо: тому, кто
    // пять минут разбирал расставание, «как отличить усталость от
    // выгорания» сказать нечего.
    function _landingFor(path) {
        if (!path || !_data || !_data.landings) return null;
        // Статьи блога лежат по адресу с .html на конце, посадочные —
        // каталогами со слэшем. Сначала пробуем адрес как есть, иначе
        // приводим к виду каталога: без слэша статья не находилась.
        if (_data.landings[path]) return path;
        var p = path.replace(/index\.html$/, '');
        if (p.charAt(p.length - 1) !== '/') p += '/';
        return _data.landings[p] ? p : null;
    }

    // ---- разметка -------------------------------------------------------

    function _style() {
        if (document.getElementById('openersStyle')) return;
        var st = document.createElement('style');
        st.id = 'openersStyle';
        // Цвета — через переменные темы плюс полупрозрачный акцент:
        // читается и на тёмной, и на светлой.
        st.textContent =
            '.op-wrap{margin:0 0 10px}' +
            // Строка со знаком вопроса. Прижата вправо и занимает 26 px:
            // человек, который знает, что писать, её просто не замечает.
            '.op-bar{display:flex;justify-content:flex-end;align-items:center;gap:8px}' +
            '.op-ask{width:26px;height:26px;flex:0 0 auto;border-radius:50%;cursor:pointer;' +
            'font-family:inherit;font-size:14px;font-weight:600;line-height:1;color:var(--text-secondary);' +
            'background:transparent;border:1px solid var(--border-color,rgba(128,128,128,.35));' +
            'display:flex;align-items:center;justify-content:center;' +
            'transition:background .18s,border-color .18s,color .18s}' +
            '.op-ask:hover{background:rgba(59,130,255,.12);border-color:rgba(59,130,255,.5);color:var(--text-primary)}' +
            '.op-ask[aria-expanded="true"]{background:rgba(59,130,255,.16);border-color:rgba(59,130,255,.55);color:var(--text-primary)}' +
            '.op-hint{font-size:11px;color:var(--text-secondary);opacity:.75}' +
            '.op-panel{margin-top:8px}' +
            '.op-head{font-size:11px;color:var(--text-secondary);opacity:.8;margin-bottom:7px}' +
            // Список примеров, а не ряд кнопок: ничего не подсвечивается, не
            // наводится и не нажимается — читается и закрывается.
            '.op-list{list-style:none;margin:0;padding:0 0 0 2px;' +
            'display:flex;flex-direction:column;gap:5px}' +
            '.op-list li{position:relative;padding-left:14px;' +
            'font-size:13px;line-height:1.4;color:var(--text-secondary)}' +
            '.op-list li::before{content:"—";position:absolute;left:0;' +
            'color:rgba(59,130,255,.6)}' +
            // Подпись остаётся и на телефоне: одинокий знак вопроса в углу
            // ничего не обещает, и его просто не нажимают. Одиннадцать
            // пикселей серого текста — не тот шум, ради которого всё затевалось.
            '@media(max-width:600px){.op-list li{font-size:12.5px}.op-hint{font-size:10.5px}}';
        document.head.appendChild(st);
    }

    // Раньше три вопроса лежали открытым списком прямо над полем ввода.
    // Вместе с голосовой кнопкой, выбором режима, четырьмя модулями и восемью
    // быстрыми действиями это давало на первом экране полтора десятка ярких
    // мишеней — глазу не за что зацепиться. Теперь подсказки сложены под знак
    // вопроса: кто знает, о чём писать, их не видит, кому нужна опора —
    // раскрывает одним касанием.
    function _render(host, course) {
        _style();
        var wrap = document.createElement('div');
        wrap.className = 'op-wrap';
        wrap.id = 'openersWrap';

        var panel = document.createElement('div');
        panel.className = 'op-panel';
        panel.id = 'openersPanel';

        var bar = document.createElement('div');
        bar.className = 'op-bar';

        var hint = document.createElement('span');
        hint.className = 'op-hint';
        hint.textContent = 'не знаете, с чего начать?';
        bar.appendChild(hint);

        var ask = document.createElement('button');
        ask.type = 'button';
        ask.className = 'op-ask';
        ask.id = 'openersAsk';
        ask.textContent = '?';
        ask.setAttribute('aria-controls', 'openersPanel');
        ask.setAttribute('aria-label', 'О чём можно спросить');
        ask.title = 'О чём можно спросить';

        // Свёрнутыми вопросы лежат для того, кто пришёл сам и ещё не знает,
        // о чём тут говорят. Пришедший по ?from= — другой случай: он минуту
        // назад разбирал своё расставание или получил свои баллы по шкале и
        // уже внутри темы. Ему опора нужна сразу, а не за одно касание.
        // 4 сентября это узкое место стало видно в цифрах: 9 переходов в
        // приложение против 2 первых сообщений — люди доходят и не пишут.
        // Всем прочим ничего не меняется, панель по-прежнему свёрнута.
        var openByDefault = !!course.slug;
        panel.hidden = !openByDefault;
        ask.setAttribute('aria-expanded', openByDefault ? 'true' : 'false');
        if (openByDefault) {
            _track('opener_shown', { course: course.slug, kind: course.kind || '',
                                     n: course.q.length, auto: true });
        }
        ask.addEventListener('click', function () {
            var open = panel.hidden;
            panel.hidden = !open;
            ask.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) _track('opener_shown', { course: course.slug || '', kind: course.kind || '', n: course.q.length });
        });
        bar.appendChild(ask);
        wrap.appendChild(bar);

        var head = document.createElement('div');
        head.className = 'op-head';
        // «Читали» — про лекцию, «разбирали» — про посадочную: там человек
        // не читал, а сам жал карточки, и назвать это чтением значит
        // промахнуться мимо того, что он только что делал.
        var verb = course.kind === 'test' ? 'Вы проходили «'
                 : course.kind === 'landing' ? 'Вы разбирали «'
                 : 'Вы читали «';   // курсы Лектория и страницы-описания
        head.textContent = course.t ? verb + course.t + '». Можно спросить:'
                                    : 'Можно спросить:';
        panel.appendChild(head);

        // Примеры, а не кнопки. Кнопка обещает действие и сама его совершает —
        // человек нажимает, не дочитав, и уходит в разговор не о том. Здесь
        // задача другая: показать, какого рода вопросы тут уместны, и вернуть
        // человека к своему собственному. Формулировать он будет сам.
        var list = document.createElement('ul');
        list.className = 'op-list';
        course.q.forEach(function (q) {
            var li = document.createElement('li');
            // textContent, а не innerHTML: вопросы приходят из JSON, и
            // подставлять их как разметку незачем.
            li.textContent = q;
            list.appendChild(li);
        });
        panel.appendChild(list);
        wrap.appendChild(panel);

        host.insertBefore(wrap, host.firstChild);
        _shown = true;
        // Раньше это событие означало «человек увидел вопросы». Теперь показ и
        // раскрытие — разные вещи, иначе воронка «увидел → нажал» превратится
        // в неправду: opener_available считает доступность, opener_shown —
        // тех, кто действительно раскрыл список.
        _track('opener_available', { course: course.slug || '', kind: course.kind || '', n: course.q.length });
    }

    function _hide() {
        var w = document.getElementById('openersWrap');
        if (w && w.parentNode) w.parentNode.removeChild(w);
    }

    // ---- запуск ---------------------------------------------------------

    function _chatEmpty() {
        var s = document.getElementById('dashChatStream');
        return !s || !s.querySelector('.message');
    }

    function _try() {
        if (_shown) return true;
        var host = document.querySelector('.dash-composer');
        if (!host || !document.getElementById('dashComposerForm')) return false;
        if (!_chatEmpty()) return true;   // разговор уже идёт — не мешаем
        var path = _sourcePath();
        var slug = _courseFor(path);
        var course;
        if (slug) {
            course = { slug: slug, kind: 'course', t: _data.courses[slug].t, q: _data.courses[slug].q };
        } else {
            var lp = _landingFor(path);
            // Тип берём из данных, если он там проставлен: у страниц-описаний
            // режимов «разбирали» не подходит — их читают. Адрес как запасной
            // признак остаётся: /testy/ — это всегда пройденный тест.
            var L = lp ? _data.landings[lp] : null;
            course = L
                ? { slug: lp, kind: L.k || (lp.indexOf('/testy/') === 0 ? 'test' : 'landing'),
                    t: L.t, q: L.q }
                : { slug: '', kind: '', t: '', q: _data.default };
        }
        if (!course.q || !course.q.length) return true;
        _render(host, course);
        return true;
    }

    // ---- первое сообщение без пустого поля ------------------------------
    // ?ask=<текст>: страница результата теста (PHQ-9, GAD-7) знает балл и
    // уровень — и приводит человека в чат с уже отправленным вопросом, а
    // не к пустому полю. Причина в цифрах за семь дней до 04.09: тесты
    // дали 453 рекламных визита и 1 переход в продукт, а из 76 открывших
    // Фреди написали 5 — пустое поле и есть главный разрыв воронки.
    // То же окно наружу — window.FrediAsk(text, source): им пользуются
    // модули внутри приложения (натальная карта после интерпретации).
    var ASK_MAX = 600;
    var _askBusy = false;

    // ---- представление перед первым ответом ------------------------------
    // Человек, пришедший по кнопке из объявления, статьи или теста, не
    // формулировал вопрос сам и не знает, кто ему отвечает. За неделю до
    // 06.09 из 117 таких стартов продолжили 4. Поэтому через секунду после
    // отправки автовопроса в ленте появляется одна фраза — кто такой Фреди и
    // что он обещает, — и звучит его голосом (/fredi/sounds/intro-<v>.mp3,
    // тексты и способ записи в fredi/sounds/README.md). Пока человек слушает,
    // ответ на его вопрос уже генерируется: запрос ушёл при submit.
    // Показывается один раз за сессию и только в пустой чат — тому, кто уже
    // разговаривал, представляться заново незачем.
    //
    // A/B: две фразы. «а» — надёжные руки и «мы справимся», «б» — качество
    // жизни, психоэмоциональное состояние как основа, регион и ситуация.
    // Вариант выпадает случайно при первом показе и закрепляется за
    // браузером, чтобы вернувшийся не услышал вторую версию. Сравнивать по
    // Метрике: цели fredi_intro_<v> (показ) и fredi_intro_reply_<v> (человек
    // написал сам после ответа Фреди). Решать не раньше ~100 показов на
    // вариант — при 15–20 автовопросах в день это около недели.
    var INTROS = {
        a: { text: 'Я Фреди. Вы пришли по адресу. Моя задача — чтобы вам стало лучше: ' +
                   'не когда-нибудь, а в вашей жизни, в вашем городе, с вашими людьми. ' +
                   'Я рядом каждый день, столько, сколько нужно. С этим можно справиться — ' +
                   'и мы справимся. А теперь о конкретике.',
             src: '/fredi/sounds/intro-a.mp3' },
        b: { text: 'Я Фреди. Моя задача — улучшение качества вашей жизни, и в первую очередь ' +
                   'ваше психоэмоциональное состояние: это основа, с неё всё начинается. ' +
                   'Я буду учитывать ваш регион и вашу ситуацию и отвечать не вообще, ' +
                   'а именно про вас. А теперь о конкретике.',
             src: '/fredi/sounds/intro-b.mp3' }
    };
    var INTRO_KEY = 'fredi_intro_done';
    var VARIANT_KEY = 'fredi_intro_variant';
    var _introVariant = '';   // показанный в этой сессии вариант
    var _introReplied = false;

    function _pickVariant() {
        var v = '';
        try { v = localStorage.getItem(VARIANT_KEY) || ''; } catch (e) {}
        if (v !== 'a' && v !== 'b') {
            v = Math.random() < 0.5 ? 'a' : 'b';
            try { localStorage.setItem(VARIANT_KEY, v); } catch (e) {}
        }
        return v;
    }

    function _goal(name) {
        if (typeof window.ym !== 'function') return;
        // Оба счётчика — как у tracker.js: кампании Директа привязаны к обоим.
        [108965607, 108138656].forEach(function (c) {
            try { window.ym(c, 'reachGoal', name); } catch (e) {}
        });
    }

    function _introDue() {
        try { if (sessionStorage.getItem(INTRO_KEY)) return false; } catch (e) {}
        return _chatEmpty();
    }

    function _playIntro(source) {
        try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
        if (typeof window.addMessage !== 'function') return;
        var v = _pickVariant();
        var intro = INTROS[v];
        var bubble = window.addMessage(intro.text, 'bot');
        if (bubble) {
            bubble.classList.add('intro');
            // Ответ успел раньше секунды — представление всё равно должно
            // стоять перед ним, а не после.
            var s = bubble.parentNode;
            var first = s && s.querySelector('.message.bot:not(.thinking):not(.intro)');
            if (first) s.insertBefore(bubble, first);
        }
        // addMessage снимает «Фреди печатает…» — а ответ ещё в пути.
        if (typeof window._showThinkingBubble === 'function') {
            try { window._showThinkingBubble('Фреди печатает…'); } catch (e) {}
        }
        _introVariant = v;
        _track('intro_shown', { source: source || '', variant: v });
        _goal('fredi_intro_' + v);
        var audio;
        try { audio = new Audio(intro.src); } catch (e) { return; }
        audio.volume = 0.85;
        audio.onerror = function () {};
        // Без файла или при запрете автозапуска остаётся текст — этого
        // достаточно, звук здесь не условие.
        var p = audio.play();
        if (p && typeof p.then === 'function') p.then(function () {
            _track('intro_voiced', { source: source || '', variant: v });
        }).catch(function () {});
    }

    // Человек написал сам после представления — то, ради чего оно есть.
    // Считается только реплика, отправленная после того, как в ленте уже
    // стоит ответ Фреди: message_sent самого автовопроса может прийти и
    // позже секунды (пока идёт проверка лимита), и без этой проверки он
    // засчитался бы за ответ.
    function _onMessageSent() {
        if (!_introVariant || _introReplied) return;
        var s = document.getElementById('dashChatStream');
        if (!s || !s.querySelector('.message.bot:not(.thinking):not(.intro)')) return;
        _introReplied = true;
        _track('intro_reply', { variant: _introVariant });
        _goal('fredi_intro_reply_' + _introVariant);
    }

    function _submitAsk(text, source) {
        var form = document.getElementById('dashComposerForm');
        var input = document.getElementById('dashComposerInput');
        if (!form || !input || !form._wired) return false;
        var intro = _introDue();
        input.value = text;
        _hide();
        // Флаг для index.html: пока идёт автовопрос, страницу нельзя
        // перезагружать ради обновления service worker — ответ оборвётся.
        window.__frediAskBusy = true;
        _track('auto_ask', { source: source || '', len: text.length });
        // Через submit формы, а не прямым вызовом: send() в app.js закрыта
        // в замыкании, и только так срабатывают её проверки — лимит,
        // подтверждение личности, защёлка от двойной отправки.
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        // Секунда — чтобы реплика человека успела встать в ленту первой.
        if (intro) setTimeout(function () {
            // Если send() отказала (лимит, стена) — реплики в ленте нет, и
            // представляться некому.
            if (_chatEmpty()) return;
            _playIntro(source);
        }, 1000);
        return true;
    }

    function FrediAsk(text, source, fromPending) {
        text = String(text == null ? '' : text).trim().slice(0, ASK_MAX);
        if (!text || _askBusy) return;
        _askBusy = true;
        // Модуль (карта, тест) живёт на своём экране — сначала возвращаем
        // дашборд с полем ввода; он же и подключает форму.
        if (!document.getElementById('dashComposerForm') && typeof window.renderDashboard === 'function') {
            try { window.renderDashboard(); } catch (e) {}
        }
        var tries = 0;
        var iv = setInterval(function () {
            var ready = !!(document.getElementById('dashComposerForm') || {})._wired;
            // Вынимаем из хранилища ровно перед отправкой: до этого момента
            // перезагрузка не теряет вопрос, после — не повторяет его.
            if (ready && fromPending) _takePending();
            if (_submitAsk(text, source) || ++tries > 40) { clearInterval(iv); _askBusy = false; }
        }, 300);
    }
    window.FrediAsk = FrediAsk;

    // Вопрос из адреса переживает перезагрузку, но не отправляется дважды.
    // Приложение может перезагрузить страницу в первые секунды (login.js
    // после подтверждения личности) — если просто вырезать ?ask= из адреса и
    // отправить, перезагрузка успевает раньше и вопрос теряется; если не
    // вырезать — уходит второй раз. Поэтому: из адреса убираем сразу,
    // кладём в sessionStorage, а вынимаем оттуда в момент отправки.
    var PENDING_KEY = 'fredi_pending_ask';

    function _takePending() {
        try {
            var v = sessionStorage.getItem(PENDING_KEY) || '';
            if (v) sessionStorage.removeItem(PENDING_KEY);
            return v;
        } catch (e) { return ''; }
    }

    function _askFromUrl() {
        var ask = '';
        try {
            var sp = new URLSearchParams(location.search);
            ask = sp.get('ask') || '';
            // Директ подставляет в ссылку ключевую фразу макросом {keyword}:
            // тогда первое сообщение — слова самого человека, а не одна
            // фраза на всю группу (за неделю 64 одинаковых «нет сил» и 4
            // продолжения из 117). При показе по автотаргетингу макрос
            // пустой, кавычки остаются пустыми — берём запасной текст askf.
            // 06–07.09: при показе по автотаргетингу Директ подставляет в
            // макрос не пустоту, а служебное «---autotargeting» — 60 диалогов
            // за сутки начались с «Мой запрос в поиске: «---autotargeting»».
            // Любая служебная строка с дефисами в начале — тоже пустой макрос.
            if (/«\s*»|\{keyword\}|«\s*-{2,}/.test(ask)) ask = sp.get('askf') || '';
        } catch (e) {}
        if (ask) {
            try {
                var u = new URL(location.href);
                u.searchParams.delete('ask');
                u.searchParams.delete('askf');
                history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
            } catch (e) {}
            try { sessionStorage.setItem(PENDING_KEY, ask.slice(0, ASK_MAX)); } catch (e) {}
        }
        var pending = '';
        try { pending = sessionStorage.getItem(PENDING_KEY) || ''; } catch (e) { pending = ask; }
        if (!pending) return;
        window.__frediAskBusy = true;
        FrediAsk(pending, 'url:' + _sourcePath(), true);
    }

    function _start() {
        // Дашборд рисуется не сразу и может перерисоваться — ждём поле.
        var tries = 0;
        var iv = setInterval(function () {
            if (_try() || ++tries > 40) clearInterval(iv);
        }, 300);
        // Написал сам — подсказки больше не нужны.
        window.addEventListener('fredi:track', function (e) {
            var ev = e && e.detail && e.detail.event;
            if (ev === 'message_sent') { _hide(); _onMessageSent(); }
        });
    }

    function init() {
        // Вопрос из адреса не зависит от openers.json — если файл не
        // приехал, разговор всё равно должен начаться.
        _askFromUrl();
        fetch(SRC, { cache: 'force-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d || !d.courses) return;
                _data = d;
                _start();
            })
            .catch(function () {});
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else init();
})();
