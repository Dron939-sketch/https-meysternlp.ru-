// ============================================
// meter.js — Fading Fredi: free session limits UI
// Auto-intercepts chat/voice requests to check limits
// ============================================

(function () {
    if (window._meterLoaded) return;
    window._meterLoaded = true;

    function _api() { return window.CONFIG?.API_BASE_URL || ''; }
    function _uid() { return window.CONFIG?.USER_ID; }

    // Лимит привязан к пользователю, поэтому под временным
    // Date.now()-идентификатором его трогать нельзя: сервер завёл бы ещё
    // одного «нового» человека с полным бесплатным запасом, а настоящий
    // расход остался бы неучтённым. Отсюда и брались обнулённые лимиты
    // после перезагрузки, и лишние пользователи в аналитике.
    //
    // Пока личность не подтверждена, ждём её (потолок ожидания — в auth.js).
    // Не дождались — работаем как раньше, но это осознанный fail-open:
    // лучше пустить человека говорить, чем запереть из-за легшей сети.
    async function _uidConfirmed() {
        if (window.USER_ID_PROVISIONAL && window.identityReady) {
            try { await window.identityReady(); } catch (e) {}
        }
        return _uid();
    }
    function _toast(msg, type) { if (window.showToast) window.showToast(msg, type || 'info'); }

    function _injectBadgeStyles() {
        if (document.getElementById('meter-badge-styles')) return;
        var s = document.createElement('style');
        s.id = 'meter-badge-styles';
        s.textContent = [
            // Бадж-таймер в правом верхнем углу. Видим всегда для free-юзеров.
            // На мобильных — чуть меньше и ниже от safe-area, чтобы не перекрыть статус-бар.
            '.meter-badge{position:fixed;top:max(12px,env(safe-area-inset-top,12px));right:14px;z-index:9000;display:flex;align-items:center;gap:6px;padding:7px 11px;background:rgba(20,20,22,0.85);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(224,224,224,0.18);border-radius:14px;font-size:12px;font-weight:600;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e0e0e0;cursor:pointer;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px rgba(0,0,0,0.25);transition:transform 0.15s,border-color 0.2s,background 0.2s}',
            '.meter-badge:hover{transform:translateY(-1px);border-color:rgba(224,224,224,0.32)}',
            '.meter-badge:active{transform:scale(0.97)}',
            '.meter-badge-icon{font-size:14px;line-height:1}',
            '.meter-badge-time{min-width:34px;text-align:center}',
            '.meter-badge-day{font-size:10px;font-weight:600;color:#9b9b9d;letter-spacing:0.3px;border-left:1px solid rgba(224,224,224,0.18);padding-left:8px;margin-left:2px}',
            '.meter-badge.warn{border-color:rgba(252,206,40,0.45);background:rgba(70,55,15,0.7)}',
            '.meter-badge.danger{border-color:rgba(239,68,68,0.55);background:rgba(70,20,20,0.78);color:#ffcccc}',
            '@media (max-width:480px){.meter-badge{font-size:11px;padding:6px 10px}.meter-badge-day{font-size:9px}}'
        ].join('\n');
        document.head.appendChild(s);
    }

    function _injectMeterStyles() {
        if (document.getElementById('meter-styles')) return;
        var s = document.createElement('style');
        s.id = 'meter-styles';
        s.textContent = [
            '.meter-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:16px}',
            '.meter-modal{background:var(--black-matte,#111);border:1px solid rgba(224,224,224,0.1);border-radius:20px;padding:28px;max-width:400px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.6);color:var(--text-primary);max-height:90vh;overflow-y:auto}',
            '.meter-emoji{font-size:48px;text-align:center;margin-bottom:16px}',
            '.meter-title{font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px;text-align:center}',
            '.meter-text{font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:18px}',
            '.meter-timer{font-size:28px;font-weight:700;color:#3b82ff;text-align:center;margin-bottom:16px;font-variant-numeric:tabular-nums}',
            '.meter-hint{background:rgba(59,130,255,0.08);border:1px solid rgba(59,130,255,0.15);border-radius:14px;padding:14px;margin-bottom:18px;font-size:13px;color:var(--text-primary);line-height:1.5}',
            '.meter-hint-path{font-weight:600;color:#3b82ff}',
            '.meter-features{list-style:none;padding:0;margin:0 0 18px 0}',
            '.meter-features li{font-size:12px;color:var(--text-secondary);padding:4px 0;display:flex;align-items:center;gap:8px}',
            '.meter-features li span{flex-shrink:0;width:18px;text-align:center;font-size:14px}',
            '.meter-features-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;color:var(--text-secondary);margin-bottom:8px}',
            '.meter-btn{display:block;width:100%;padding:14px;border:none;border-radius:14px;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;text-align:center;margin-bottom:10px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform 0.15s}',
            '.meter-btn:active{transform:scale(0.98)}',
            '.meter-btn-primary{background:linear-gradient(135deg,#3b82ff 0%,#6366f1 100%);color:#fff}',
            '.meter-btn-secondary{background:rgba(224,224,224,0.07);border:1px solid rgba(224,224,224,0.18);color:var(--text-secondary)}'
        ].join('\n');
        document.head.appendChild(s);
    }

    var _lastCheck = null;
    var _lastCheckTime = 0;
    var _warningShown = false;       // флаг «soft» предупреждения (≤5 мин)
    var _criticalShown = false;      // флаг «critical» предупреждения (≤2 мин)
    var CHECK_CACHE_MS = 5000;

    async function checkCanSend() {
        var uid = await _uidConfirmed();
        if (!uid) return { can_send: true };
        var now = Date.now();
        if (_lastCheck && (now - _lastCheckTime) < CHECK_CACHE_MS) return _lastCheck;
        try {
            var r = await fetch(_api() + '/api/meter/can-send/' + uid);
            var data = await r.json();
            _lastCheck = data;
            _lastCheckTime = now;
            return data;
        } catch (e) {
            return { can_send: true };
        }
    }

    // Двухступенчатое предупреждение перед блокировкой.
    //
    // 5 мин ≤ rem  → пока тишина
    // 2 мин < rem ≤ 5 мин → soft: «осталось N мин» (info-toast)
    // rem ≤ 2 мин → critical: карточка апселла
    //
    // Каждый уровень показывается 1 раз за окно 2 мин (защита от спама).
    // Оба трекаются как `meter_warning` в аналитике с полем `level`.
    //
    // Почему это долго не работало. Ограничений два — минуты на сегодня и
    // общий бесплатный запас, — а предупреждение смотрело только на первое.
    // Пока запас считался в днях, человек упирался в paywall на четвёртый
    // заход с полными десятью минутами на счётчике: условие `rem <= 5`
    // не выполнялось никогда. В аналитике это лежало ровно так —
    // meter_warning 0 при meter_blocked_shown 10.
    //
    // Теперь бэкенд отдаёт `remaining_minutes` уже как минимум из двух
    // остатков, а `block_reason` говорит, какой из них ближе. Предупреждать
    // надо по ближайшему — и словами про него же: «на сегодня» и «бесплатные
    // минуты кончаются совсем» требуют разной реакции.
    function _trackWarning(level, rem, kind) {
        try {
            if (window.FrediTracker && window.FrediTracker.track) {
                window.FrediTracker.track('meter_warning', {
                    level: level,            // 'soft' | 'critical'
                    kind: kind,              // 'trial' | 'daily'
                    remaining_minutes: rem,
                });
            }
        } catch (e) {}
    }

    // Какое из двух ограничений упрётся первым.
    function _bindingKind(check) {
        var trial = check.remaining_trial_minutes;
        var day = check.remaining_today_minutes;
        if (trial == null) return 'daily';           // старый бэкенд
        if (day == null) return 'trial';
        return trial <= day ? 'trial' : 'daily';
    }

    // Карточка апселла — один раз за сессию. Окно в 2 минуты от спама
    // не спасало: critical-проверка срабатывает на каждом сообщении, и
    // человек, продолжающий разговор, получал карточку каждые 3–4 минуты.
    // По аналитике — три показа за 7 минут одному и тому же юзеру, три
    // «позже» подряд: каждый следующий показ не продавал, а дрессировал
    // закрывать. Повторные critical в той же сессии — только тост.
    function _upsellShownThisSession() {
        try { return sessionStorage.getItem('meterUpsellShownAt') != null; }
        catch (e) { return _upsellShownLocal; }
    }
    var _upsellShownLocal = false;
    function _rememberUpsellShown() {
        _upsellShownLocal = true;
        try { sessionStorage.setItem('meterUpsellShownAt', String(Date.now())); } catch (e) {}
    }

    function _showWarningToast(check) {
        if (!check || check.is_premium) return;
        var rem = check.remaining_minutes;
        if (rem == null) return;

        var kind = _bindingKind(check);

        // Пороги «осталось мало» масштабируются от лимита. Абсолютные 2/5
        // минут писались под лимит в 10: анониму с дневными 3 минутами
        // soft-порог ≤5 срабатывал на ПЕРВОМ же сообщении — человек ещё
        // ценности не увидел, а ему уже тикает таймер (наблюдение из
        // аналитики 02.09: meter_warning remaining=3 сразу после первого
        // message_sent). Для лимита 10 пороги остаются прежними (2 и 5),
        // для анонимных 3 минут — 1 и 1.5.
        var limitForKind = (kind === 'trial')
            ? (check.trial_limit_minutes || 10)
            : (check.limit_minutes || 10);
        var critThr = Math.min(2, limitForKind / 3);
        var softThr = Math.min(5, limitForKind / 2);

        // Critical: осталось ≤ 2 мин. Карточку апселла показываем один раз
        // за сессию (и не поверх только что закрытой стены) — дальше на
        // critical напоминаем тостом, раз за 2-мин окно. meter_warning
        // пишем в обоих случаях: это замер, а не UI.
        if (rem <= critThr && !_criticalShown) {
            _criticalShown = true;
            _trackWarning('critical', rem, kind);
            setTimeout(function() { _criticalShown = false; }, 120000);
            // Момент предложения. Новичку — никогда: он ещё не вернулся ни
            // разу. Вернувшемуся — только если разговор идёт (три сообщения
            // и больше): тогда Premium снимает помеху, а не берёт плату
            // за вход. В остальных случаях — тихий тост.
            var moment_ok = !_newcomer() && _engagedNow();
            if (moment_ok && !_upsellShownThisSession() && _dismissedAgo() >= PAYWALL_QUIET_SEC) {
                showUpsellCard(check, kind);
            } else if (!moment_ok) {
                _track('meter_upsell_suppressed', {
                    remaining_minutes: rem, kind: kind,
                    reason: _newcomer() ? 'newcomer' : 'no_conversation',
                    visits: _visits(), exchanges: _exchanges,
                });
                _toast('\u23F1 Осталось ~' + Math.max(1, Math.round(rem)) + ' мин', 'info');
            } else {
                _track('meter_upsell_suppressed', {
                    remaining_minutes: rem,
                    kind: kind,
                    reason: _upsellShownThisSession() ? 'already_shown' : 'paywall_quiet',
                });
                _toast('⏱ Осталось ~' + Math.max(1, Math.round(rem)) + ' мин — Premium снимает лимит', 'info');
            }
            return;
        }
        // Soft: critThr < rem ≤ softThr — мягкая подготовка.
        if (rem <= softThr && !_warningShown) {
            _warningShown = true;
            _toast(kind === 'trial'
                ? '⏱ Бесплатных минут осталось ' + Math.round(rem)
                : '⏱ Осталось ' + Math.round(rem) + ' мин на сегодня', 'info');
            _trackWarning('soft', rem, kind);
            setTimeout(function() { _warningShown = false; }, 120000);
        }
    }

    // Реальная цена обмена. Раньше каждый обмен стоил фиксированные 15
    // секунд — при этом реальный такт «написал → прочитал длинный ответ →
    // ответил» занимает 60-90 секунд. «10 бесплатных минут» на деле были
    // 40 обменами: пользователь с 36 сообщениями за несколько дней так и
    // не увидел стену, и подписка ему была ни к чему. Теперь списывается
    // время, реально прошедшее с прошлого обмена: минимум прежние 15
    // (быстрые короткие реплики не дороже, чем были), максимум 120 —
    // отходил от экрана не в счёт (и сервер всё равно режет по 120).
    var _lastExchangeTs = 0;
    function recordExchange() {
        var now = Date.now();
        var sec = 15;
        if (_lastExchangeTs) {
            sec = Math.round((now - _lastExchangeTs) / 1000);
            if (sec < 15) sec = 15;
            if (sec > 120) sec = 120;
        }
        _lastExchangeTs = now;
        return recordUsage(sec);
    }

    async function recordUsage(seconds) {
        var uid = await _uidConfirmed();
        if (!uid) return;
        try {
            await fetch(_api() + '/api/meter/record-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: uid, seconds: seconds || 30 })
            });
            _lastCheck = null;
            // После каждой записи — синхронизируем статус и показываем
            // warning если осталось ≤5 мин. Это покрывает голосовой
            // чат через WebSocket, который не идёт через apiCall/fetch
            // patch и иначе никогда не получает warning-toast.
            try {
                var check = await checkCanSend();
                if (check && !check.is_premium) {
                    _showWarningToast(check);
                    // Если бэк вернул блок — показываем modal
                    if (check.can_send === false) {
                        showFatigueModal(check);
                    }
                }
            } catch (e) {}
        } catch (e) {}
    }

    // Чем человек был занят перед стеной. Раньше стена показывала витрину
    // из двенадцати функций — список не покупают, покупают продолжение
    // начатого. За неделю: 101 показ стены, один клик, ноль оплат.
    var _lastAct = { kind: '', name: '', ts: 0 };
    var _exchanges = 0;          // сколько сообщений человек написал за сессию

    // Кому вообще уместно показывать цену.
    //
    // Сейчас стена приходит ко всем одинаково: и к тому, кто зашёл на девять
    // секунд, и к тому, кто ходит двадцать седьмой раз. За неделю это дало
    // 101 показ, один клик и ноль оплат. Возврат — единственный честный
    // сигнал намерения, который у нас есть: человек, пришедший второй раз,
    // сказал «мне это нужно» действием, а не кликом. Новичку в первую
    // сессию цену не показываем вообще — только «на сегодня всё».
    function _visits() {
        try { return parseInt(localStorage.getItem('fredi_visits_count') || '1', 10) || 1; }
        catch (e) { return 1; }
    }
    function _authed() { return !!window.IS_AUTHENTICATED; }
    function _newcomer() { return !_authed() && _visits() <= 1; }
    // Разговор состоялся — три и больше сообщений за сессию. Предложение
    // в середине живого разговора читается как «уберём помеху», а на
    // втором сообщении — как «плати за вход».
    function _engagedNow() { return _exchanges >= 3; }
    // Ступенька между анонимом и подпиской. У человека без аккаунта дневной
    // лимит меньше — бэкенд отдаёт в статусе оба числа, свои руками сюда не
    // вписываем. Аккаунт по смыслу не «заплати», а «останься»: разговор не
    // потеряется, и минут в день станет больше. Без этой ступеньки
    // единственным ответом на стену была цена в первый же вечер — 101
    // закрытая стена, один клик, ноль оплат.
    function _accountGain(data) {
        // Два независимых признака аккаунта: сессия на фронте и почта в
        // базе. Хватает любого — иначе человеку с протухшей кукой предложат
        // завести то, что у него уже есть.
        if (_authed()) return null;
        if (data && data.is_registered === true) return null;
        var big = data && data.registered_limit_minutes;
        var small = data && data.anon_limit_minutes;
        if (!big || !small || big <= small) return null;
        return { big: big, small: small, plus: Math.round((big - small) * 10) / 10 };
    }
    function _openRegister(source) {
        _track('meter_register_clicked', { source: source });
        if (window.FrediAuth && typeof window.FrediAuth.openRegister === 'function') {
            window.FrediAuth.openRegister({ source: source });
        } else if (typeof showSettingsScreen === 'function') {
            showSettingsScreen();
        }
    }
    var FEATURE_PHRASE = {
        kontur: 'разбирались, о чём умеете думать',
        mirrors: 'разбирали отношения в «Зеркале»',
        berne: 'разбирали роли по Берну',
        dreams: 'разбирали сон',
        doubles: 'искали свои двойные послания',
        tales: 'работали со сказкой',
        brand: 'собирали свой образ',
        esoterica: 'разбирали эзотерику на трезвую голову',
        perehod: 'проходили «Переход»',
        parus: 'разбирали перегрузку в «Парусе»',
        spiral: 'собирали день в «Спирали»',
        mysl: 'допрашивали тревожную мысль',
        skazhinet: 'тренировали отказ',
        opora: 'отвечали внутреннему критику в «Опоре»',
        messages: 'разбирали переписку',
        diary: 'вели дневник',
        hypnosis: 'слушали гипнотическую сессию'
    };
    try {
        window.addEventListener('fredi:track', function (e) {
            var ev = e && e.detail && e.detail.event;
            var d = (e && e.detail && e.detail.data) || {};
            if (ev === 'feature_opened' && d.feature) {
                _lastAct = { kind: 'feature', name: String(d.feature), ts: Date.now() };
            } else if (ev === 'message_sent') {
                _lastAct = { kind: 'chat', name: '', ts: Date.now() };
                _exchanges++;
            }
        });
    } catch (e) {}

    function _name() {
        var n = (window.CONFIG && window.CONFIG.USER_NAME) || '';
        n = String(n).trim();
        return (n && n !== 'друг' && n !== 'undefined') ? n : '';
    }

    // «Вы только что…» — одной строкой, и только если это было недавно.
    // Полчаса: дольше — человек уже занят другим, и напоминание соврёт.
    function _whatYouDid() {
        if (!_lastAct.kind || (Date.now() - _lastAct.ts) > 30 * 60 * 1000) return '';
        if (_lastAct.kind === 'chat') return 'разговаривали с Фреди';
        return FEATURE_PHRASE[_lastAct.name] || '';
    }

    function _esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // Три пункта вместо двенадцати: безлимит, весь Лекторий голосом,
    // инструменты. Больше человек за секунду всё равно не прочтёт.
    //
    // Без чисел. «102 курса» и «1250 статей» разъезжаются с каталогом в тот
    // же день, а пересчитывает их tools/sync_counters.py — и только в HTML
    // страниц, до JS приложения он не дотягивается. Здесь число осталось бы
    // навсегда тем, каким я его вписал.
    // Здесь стояло «Весь Лекторий: курсы целиком, лекции с озвучкой».
    // Лекторий лежит на /blog/lektorij/ и открыт всем, озвучка на
    // бэкенде тоже ничем не закрыта — человек проверял это одним
    // кликом по меню и переставал верить двум остальным пунктам.
    // Обещаем то, что подписка действительно снимает: каждый модуль
    // ниже ходит в /api/ai/generate и жжёт те же минуты счётчика,
    // поэтому «без счётчика» честно распространяется на весь список.
    // Роли закрыты подпиской напрямую (app.js, effectiveMode).
    //
    // keys — имена feature_opened из трекера: по последней использованной
    // функции витрина переставляется, см. _premiumFeatures(). Зачем
    // перестановка: по целям «открыл Фреди» за первые сутки их жизни
    // (03–04.09) натальная карта — 73 из 144 именных переходов, вдвое
    // больше любого другого входа, — а в витрине стояла пятой строкой.
    // Человек, упёршийся в лимит посреди разбора карты, должен первой
    // строкой увидеть карту, а не общий разговор. Когда последняя функция
    // неизвестна, порядок прежний: стена чаще всего прерывает разговор.
    var FEATURE_ITEMS = [
        { icon: '\u2728', text: 'Разговор с Фреди 24/7 — голосом и текстом, без счётчика минут', keys: [] },
        { icon: '\uD83C\uDFAD', text: 'Фреди в ролях: психолог, коуч и тренер', keys: [] },
        { icon: '\uD83D\uDCD3', text: 'Дневник эмоций, зеркало, мой портрет, разбор по Берну',
          keys: ['diary', 'mirrors', 'berne', 'kontur', 'messages', 'doubles',
                 'opora', 'mysl', 'skazhinet', 'spiral', 'parus', 'perehod'] },
        { icon: '\uD83C\uDF00', text: 'Гипноз, практики, якоря, толкование снов, сказки-катарсис',
          keys: ['hypnosis', 'dreams', 'tales'] },
        { icon: '\uD83D\uDD2E', text: 'Таро, гороскоп и натальная карта с разбором',
          keys: ['esoterica'] },
        { icon: '\uD83E\uDDED', text: 'Супервизор для психологов, «Мой бренд», игры-тренажёры',
          keys: ['brand'] }
    ];

    function _premiumFeatures() {
        var items = FEATURE_ITEMS.slice();
        // Свежесть та же, что у _whatYouDid: полчаса. Дольше — человек уже
        // занят другим, и поднятая наверх строка была бы про чужую сессию.
        var act = (_lastAct.kind === 'feature' && (Date.now() - _lastAct.ts) <= 30 * 60 * 1000)
            ? _lastAct.name : '';
        if (act) {
            for (var i = 1; i < items.length; i++) {
                if (items[i].keys.indexOf(act) !== -1) {
                    var hit = items.splice(i, 1)[0];
                    items.unshift({ icon: hit.icon, text: '<b>' + hit.text + '</b>', keys: hit.keys });
                    break;
                }
            }
        }
        var out = '<ul class="meter-features">';
        for (var j = 0; j < items.length; j++) {
            out += '<li><span>' + items[j].icon + '</span> ' + items[j].text + '</li>';
        }
        return out + '</ul>';
    }

    // Кому платят. На стене про автора не было ни слова — а это первый
    // молчаливый вопрос человека, который видит цену.
    var AUTHOR_NOTE =
        '<div class="meter-text" style="font-size:12px;opacity:0.75;margin-bottom:14px">' +
        'Фреди сделал психолог <a href="/obo-mne/" target="_blank" rel="noopener" ' +
        'style="color:#3b82ff">Андрей Мейстер</a> — двадцать лет практики, ' +
        'Лекторий и блог о том же самом.</div>';

    // Первая строка стены: имя, что человек только что делал, и почему
    // разговор прервался именно сейчас.
    function _personalLead(kind) {
        var who = _name();
        var did = _whatYouDid();
        var lead = who ? _esc(who) + ', ' : '';
        if (did) {
            lead += 'вы только что ' + did + '. ';
        }
        lead += (kind === 'trial')
            ? 'Бесплатное знакомство на этом заканчивается.'
            : 'На сегодня бесплатное время вышло.';
        return lead.charAt(0).toUpperCase() + lead.slice(1);
    }

    function _track(event, data) {
        try {
            if (window.FrediTracker && window.FrediTracker.track) {
                window.FrediTracker.track(event, data || {});
            }
        } catch (e) {}
    }

    function _formatResetCountdown(minutesUntil) {
        if (!minutesUntil || minutesUntil <= 0) return '00:00';
        var h = Math.floor(minutesUntil / 60);
        var m = minutesUntil % 60;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    // Сколько молчать после того, как человек закрыл стену.
    // Модалку зовут из шести мест (пре-чек apiCall, пре-чек fetch, ответ
    // 402 от обоих, синхронизация после recordUsage, клик по баджу), и
    // памяти о закрытии не было ни у одной: человек жал «Понятно, до
    // завтра» — и через пару секунд получал ту же стену снова. В логах
    // это выглядело как blocked → closed → blocked → closed восемь раз
    // за полторы минуты, после чего сессия заканчивалась.
    var PAYWALL_QUIET_SEC = 180;

    function _dismissedAgo() {
        try {
            var t = parseInt(sessionStorage.getItem('meterPaywallClosedAt') || '0', 10);
            return t ? (Date.now() - t) / 1000 : Infinity;
        } catch (e) { return _paywallClosedAt ? (Date.now() - _paywallClosedAt) / 1000 : Infinity; }
    }

    var _paywallClosedAt = 0;
    function _rememberDismiss() {
        _paywallClosedAt = Date.now();
        try { sessionStorage.setItem('meterPaywallClosedAt', String(_paywallClosedAt)); } catch (e) {}
    }

    function showFatigueModal(data) {
        data = data || {};
        // Нет аккаунта — это не пейволл, а дверь в регистрацию: с
        // платной моделью сервер отвечает block_reason='auth' всем без
        // почты. Основной гейт стоит в login.js на входе; сюда попадают
        // только гонки (сообщение ушло до модалки) и прямые вызовы API.
        if (data.block_reason === 'auth') {
            _track('meter_auth_gate', {});
            if (window.FrediAuth && typeof window.FrediAuth.openRegister === 'function') {
                window.FrediAuth.openRegister({ source: 'meter_auth', mandatory: true });
            }
            return;
        }
        // Только что закрыли — не показываем стену заново. Человек уже
        // прочитал её; вместо повтора напоминаем строкой, чтобы попытка
        // отправить сообщение не осталась без ответа.
        if (_dismissedAgo() < PAYWALL_QUIET_SEC) {
            _track('meter_blocked_suppressed', {
                block_reason: (data && data.block_reason) || '',
                since_dismiss_sec: Math.round(_dismissedAgo()),
            });
            try { _toast('⏱ Лимит исчерпан — Premium снимает ограничение', 'info'); } catch (e) {}
            return;
        }
        _injectMeterStyles();
        var existing = document.getElementById('meterOverlay');
        if (existing) existing.remove();

        // Новичок в первой сессии цены не видит. Он ещё ничего не получил,
        // и счёт за десять минут знакомства читается как наказание —
        // отсюда 101 закрытая стена при одном клике. Ему говорим только
        // то, что правда: на сегодня всё, завтра снова открыто.
        //
        // Но ТОЛЬКО когда это правда. Стена общего запаса (trial) — не
        // «завтра снова», полночь запас не вернёт: новичку с пустой пробой
        // показываем обычную стену с ценой, иначе он ждёт завтра впустую —
        // ровно та ошибка, что лежала в аналитике 31.08 (блок daily и
        // блок trial одному человеку с разницей в 12 секунд).
        // 04.09: терминального 'trial' для текста больше нет — окно
        // «всё включено» ограничивает только голос, а флаг trial_exhausted
        // при этом честно торчит true у любого давнего пользователя.
        // Выбирать ветку по флагу теперь нельзя: дневная стена показала бы
        // «закончились навсегда» тому, у кого завтра снова будут минуты, —
        // зеркальная форма ошибки 31.08. Только по причине.
        var _trialBlocked = data.block_reason === 'trial';
        if (_newcomer() && !_trialBlocked) {
            // Дневная стена новичку — лучший момент для аккаунта: разговор
            // уже состоялся, и предложение читается как продолжение, а не
            // как турникет. Когда кончился общий запас, аккаунт минут не
            // добавит — там только Premium, и обещать было бы обманом.
            var softGain = (!data || data.block_reason !== 'trial')
                ? _accountGain(data) : null;
            _track('meter_blocked_soft', {
                block_reason: (data && data.block_reason) || '',
                visits: _visits(), exchanges: _exchanges,
                account_offer: !!softGain,
            });
            var soft = document.createElement('div');
            soft.className = 'meter-overlay';
            soft.id = 'meterOverlay';
            soft.innerHTML =
                '<div class="meter-modal">' +
                    '<div class="meter-emoji">\u23F1\uFE0F</div>' +
                    '<div class="meter-title">На сегодня всё</div>' +
                    '<div class="meter-text">' + _personalLead('daily') +
                        '<br>Завтра Фреди снова свободен — приходите, ' +
                        'разговор продолжится с этого места.' +
                        (softGain
                            ? '<br><br>С аккаунтом времени больше: ' + softGain.big +
                              ' минут в день вместо ' + softGain.small + '. ' +
                              'И разговор не потеряется, если смените устройство. ' +
                              'Нужна только почта.'
                            : '') +
                    '</div>' +
                    (softGain
                        ? '<button class="meter-btn meter-btn-primary" id="meterSoftReg">📩 Завести аккаунт — ' +
                          softGain.big + ' минут в день</button>'
                        : '') +
                    '<button class="meter-btn meter-btn-secondary" id="meterSoftClose">Понятно</button>' +
                '</div>';
            document.body.appendChild(soft);
            if (softGain) {
                document.getElementById('meterSoftReg').onclick = function () {
                    _rememberDismiss();
                    soft.remove();
                    _openRegister('meter_soft_wall');
                };
            }
            document.getElementById('meterSoftClose').onclick = function () {
                _track('meter_closed', { reason: 'soft_ok' });
                _rememberDismiss();
                soft.remove();
            };
            soft.onclick = function (e) {
                if (e.target === soft) { _rememberDismiss(); soft.remove(); }
            };
            return;
        }

        var minutesUntilReset = data.minutes_until_reset || 0;
        var limit = data.limit_minutes || 5;
        // \u0415\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F paywall \u2014 \u0438\u0437\u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0439
        // \u0437\u0430\u043F\u0430\u0441. \u0420\u0430\u043D\u044C\u0448\u0435 \u0441\u044E\u0434\u0430 \u043F\u043E\u043F\u0430\u0434\u0430\u043B\u0438 \u0438 \u043F\u043E \u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0443 \u0434\u043D\u0435\u0439, \u0442\u043E \u0435\u0441\u0442\u044C \u043B\u044E\u0434\u0438,
        // \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043F\u043E\u0442\u0440\u0430\u0442\u0438\u0432\u0448\u0438\u0435: 10 \u043F\u043E\u043A\u0430\u0437\u043E\u0432 \u043F\u0440\u0438 8 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F\u0445 \u043D\u0430 \u0432\u0441\u044E \u0431\u0430\u0437\u0443
        // \u0438 \u043D\u043E\u043B\u044C \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u043E\u0432. \u0421\u043C\u043E\u0442\u0440\u0438\u043C \u043D\u0430 block_reason, \u0430 \u0435\u0441\u043B\u0438 \u0431\u044D\u043A\u0435\u043D\u0434 \u0441\u0442\u0430\u0440\u044B\u0439 \u2014
        // \u043D\u0430 trial_exhausted, \u043A\u0430\u043A \u0440\u0430\u043D\u044C\u0448\u0435.
        var trialExhausted = data.block_reason
            ? data.block_reason === 'trial'
            : !!data.trial_exhausted;
        var daysUsed = data.free_days_used || 0;
        var trialLimit = data.trial_limit_minutes || 15;
        // Человеку без аккаунта дневная стена предлагает сначала аккаунт, и
        // только потом цену: между «ничего» и 990 ₽ должна быть ступенька,
        // которая ничего не стоит и что-то даёт. На стене общего запаса
        // ступеньки нет — минуты там уже не про аккаунт.
        var gain = (data.block_reason === 'trial' || data.block_reason === 'voice')
            ? null : _accountGain(data);

        _track('meter_blocked_shown', {
            limit_minutes: limit,
            minutes_until_reset: minutesUntilReset,
            trial_exhausted: trialExhausted,
            block_reason: data.block_reason || (trialExhausted ? 'trial' : 'daily'),
            trial_used_minutes: data.trial_used_minutes,
            free_days_used: daysUsed,
            account_offer: !!gain,
        });

        var emoji, title, mainText, timerHtml;

        // 04.09: ветка выбирается по block_reason. Флаг trial_exhausted у
        // давнего пользователя всегда true (окно «всё включено» выговорено),
        // но его текст работает каждый день — финальную стену по флагу ему
        // показывать нельзя. 'trial' с бэка больше не приходит; ветка
        // оставлена для старых сборок бэка на время выката.
        if (data.block_reason === 'voice') {
            // Голосовая стена: дневные минуты ещё есть, кончился только
            // голос. Не смешиваем с дневной — голос в полночь не вернётся.
            emoji = '\uD83C\uDF99\uFE0F';
            title = 'Голосовые минуты знакомства закончились';
            mainText = 'Текстом можно продолжать бесплатно — дневной лимит ' +
                'на месте. Голос возвращается с Premium: без счётчика, ' +
                'в любое время.';
            timerHtml = '';
        } else if (data.block_reason === 'trial') {
            // Финальная стена: бесплатный запас израсходован.
            emoji = '\uD83D\uDD13';
            title = 'Бесплатные ' + trialLimit + ' минут закончились';
            mainText = _personalLead('trial') +
                '<br>С Premium разговор продолжается без счётчика.';
            timerHtml = '';
        } else {
            // Дневной лимит исчерпан, общий запас ещё есть.
            emoji = '\u23F1\uFE0F';
            title = 'На сегодня время вышло';
            mainText = _personalLead('daily') +
                '<br>Завтра снова будут ' + limit + ' бесплатных минут — ' +
                'или можно продолжить прямо сейчас.' +
                (gain
                    ? '<br><br>С аккаунтом дневное время больше: ' + gain.big +
                      ' минут вместо ' + gain.small + '. Нужна только почта — ' +
                      'и разговор перестанет зависеть от того, с какого ' +
                      'устройства вы зашли.'
                    : '');
            timerHtml = minutesUntilReset > 0
                ? '<div class="meter-timer" id="meterTimer">Новый день через ' + _formatResetCountdown(minutesUntilReset) + '</div>'
                : '';
        }

        var overlay = document.createElement('div');
        overlay.className = 'meter-overlay';
        overlay.id = 'meterOverlay';
        overlay.innerHTML =
            '<div class="meter-modal">' +
                '<div class="meter-emoji">' + emoji + '</div>' +
                '<div class="meter-title">' + title + '</div>' +
                timerHtml +
                '<div class="meter-text">' + mainText + '</div>' +
                '<div class="meter-features-title">Что даёт Premium:</div>' +
                _premiumFeatures() +
                AUTHOR_NOTE +
                (gain
                    ? '<button class="meter-btn meter-btn-primary" id="meterRegBtn">\uD83D\uDCE9 \u0417\u0430\u0432\u0435\u0441\u0442\u0438 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u2014 ' +
                      gain.big + ' \u043C\u0438\u043D\u0443\u0442 \u0432 \u0434\u0435\u043D\u044C</button>'
                    : '') +
                '<button class="meter-btn ' + (gain ? 'meter-btn-secondary' : 'meter-btn-primary') +
                    '" id="meterSubscribeBtn">✨ Попробовать неделю — 290 ₽</button>' +
                '<div class="meter-price-note" style="font-size:12px;opacity:.65;margin:2px 0 6px">Полный Premium на 7 дней: голос, все режимы, без счётчика. Потом 990 ₽ в месяц — меньше одной очной консультации; отключить можно в один клик.</div>' +
                (trialExhausted
                    ? '<button class="meter-btn meter-btn-secondary" id="meterCloseBtn">\u041F\u043E\u0434\u0443\u043C\u0430\u044E \u043F\u043E\u0437\u0436\u0435</button>'
                    : '<button class="meter-btn meter-btn-secondary" id="meterCloseBtn">\u041F\u043E\u043D\u044F\u0442\u043D\u043E, \u0434\u043E \u0437\u0430\u0432\u0442\u0440\u0430</button>') +
            '</div>';
        document.body.appendChild(overlay);

        if (gain) {
            document.getElementById('meterRegBtn').onclick = function () {
                _rememberDismiss();
                overlay.remove();
                _openRegister('meter_wall');
            };
        }
        document.getElementById('meterCloseBtn').onclick = function() {
            _track('meter_closed', { reason: 'continue_tomorrow' });
            _rememberDismiss();
            overlay.remove();
        };
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                _track('meter_dismissed_outside', {});
                _rememberDismiss();
                overlay.remove();
            }
        };
        document.getElementById('meterSubscribeBtn').onclick = function() {
            _track('meter_subscribe_clicked', {});
            // Иначе фоновая проверка накрывает стеной открывшийся чекаут.
            _rememberDismiss();
            overlay.remove();
            // Прямой чекаут из paywall (email + ЮKassa в один шаг),
            // без ухода в настройки, где оплата терялась.
            if (typeof window.openCheckout === 'function') {
                window.openCheckout('paywall');
            } else if (typeof showSettingsScreen === 'function') {
                showSettingsScreen();
            }
        };

        // \u0422\u0438\u043A\u0430\u044E\u0449\u0438\u0439 \u043E\u0431\u0440\u0430\u0442\u043D\u044B\u0439 \u043E\u0442\u0441\u0447\u0451\u0442 \u0434\u043E 00:00 UTC.
        if (minutesUntilReset > 0) {
            var timerEl = document.getElementById('meterTimer');
            var secsLeft = minutesUntilReset * 60;
            var iv = setInterval(function() {
                secsLeft--;
                if (secsLeft <= 0) {
                    clearInterval(iv);
                    overlay.remove();
                    _lastCheck = null;
                    _toast('\u0424\u0440\u0435\u0434\u0438 \u043E\u0442\u0434\u043E\u0445\u043D\u0443\u043B! \u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C.', 'success');
                    return;
                }
                var h = Math.floor(secsLeft / 3600);
                var m = Math.floor((secsLeft % 3600) / 60);
                var s = secsLeft % 60;
                if (timerEl) {
                    timerEl.textContent = '\u0421\u0438\u043B\u044B \u0432\u0435\u0440\u043D\u0443\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 ' +
                        (h < 10 ? '0' : '') + h + ':' +
                        (m < 10 ? '0' : '') + m + ':' +
                        (s < 10 ? '0' : '') + s;
                }
            }, 1000);
        }
    }

    // Мягкий апселл ДО блокировки. Показывается один раз ЗА СЕССИЮ
    // на critical-уровне (≤2 мин остатка). В отличие от soft-тоста —
    // это полноценная карточка с достижимой кнопкой Premium, поэтому
    // предложение вообще появляется до исчерпания лимита (по аналитике
    // paywall на самом блоке видели ~0 юзеров: сессия короче лимита).
    // Не блокирует ввод — юзер может закрыть и продолжить оставшиеся минуты.
    function showUpsellCard(check, kind) {
        _injectMeterStyles();
        if (document.getElementById('meterUpsellOverlay')) return;
        var rem = (check && check.remaining_minutes != null) ? Math.max(1, Math.round(check.remaining_minutes)) : 2;
        kind = kind || 'daily';
        // До подписки у человека без аккаунта есть более дешёвый шаг, и
        // предлагать сразу цену — значит пропускать его. На «кончается
        // сегодняшнее время» аккаунт добавляет минут прямо сейчас; на
        // «кончается весь бесплатный запас» — уже нет, там только Premium.
        var upGain = kind === 'trial' ? null : _accountGain(check);
        _rememberUpsellShown();
        _track('meter_upsell_shown', {
            remaining_minutes: rem, kind: kind, account_offer: !!upGain,
        });

        // Два разных сообщения. «На сегодня всё» — новость на один вечер,
        // человек вернётся и без подписки. «Бесплатные минуты кончаются» —
        // единственный момент, когда предложение Premium вообще по делу.
        var title = kind === 'trial'
            ? 'Бесплатных минут осталось ~' + rem
            : 'Осталось ~' + rem + ' мин на сегодня';
        var did = _whatYouDid();
        var who = _name();
        var text = (who ? _esc(who) + ', ' : '')
            + (did ? 'вы ' + did + ' — и до конца ' : 'до конца ')
            + (kind === 'trial' ? 'бесплатного знакомства' : 'сегодняшнего времени')
            + ' осталось около ' + rem + ' мин. '
            + (upGain
                ? 'С аккаунтом на сегодня будет ' + upGain.big + ' минут вместо ' +
                  upGain.small + ' — почта, и разговор продолжается. ' +
                  'С Premium счётчика нет вовсе.'
                // «Весь Лекторий с озвучкой» отсюда убрано по той же причине,
                // что из PREMIUM_FEATURES: Лекторий открыт всем, обещание
                // проверялось одним кликом и топило доверие к остальному.
                : 'С Premium счётчик исчезает: разговор, голос, карты, сны, игры — всё без лимита.');
        text = text.charAt(0).toUpperCase() + text.slice(1);

        var overlay = document.createElement('div');
        overlay.className = 'meter-overlay';
        overlay.id = 'meterUpsellOverlay';
        overlay.innerHTML =
            '<div class="meter-modal">' +
                '<div class="meter-emoji">⏱️</div>' +
                '<div class="meter-title">' + title + '</div>' +
                '<div class="meter-text">' + text + '</div>' +
                _premiumFeatures() +
                AUTHOR_NOTE +
                (upGain
                    ? '<button class="meter-btn meter-btn-primary" id="meterUpsellReg">📩 Завести аккаунт — ' +
                      upGain.big + ' минут в день</button>'
                    : '') +
                '<button class="meter-btn ' + (upGain ? 'meter-btn-secondary' : 'meter-btn-primary') +
                    '" id="meterUpsellSub">✨ Попробовать неделю — 290 ₽</button>' +
                '<div class="meter-price-note" style="font-size:12px;opacity:.65;margin:2px 0 6px">Полный Premium на 7 дней: голос, все режимы, без счётчика. Потом 990 ₽ в месяц — меньше одной очной консультации; отключить можно в один клик.</div>' +
                '<button class="meter-btn meter-btn-secondary" id="meterUpsellClose">Ещё немного</button>' +
            '</div>';
        document.body.appendChild(overlay);

        if (upGain) {
            document.getElementById('meterUpsellReg').onclick = function () {
                overlay.remove();
                _openRegister('upsell_critical');
            };
        }
        document.getElementById('meterUpsellClose').onclick = function() {
            _track('meter_upsell_dismissed', { reason: 'later' });
            overlay.remove();
        };
        overlay.onclick = function(e) {
            if (e.target === overlay) { _track('meter_upsell_dismissed', { reason: 'outside' }); overlay.remove(); }
        };
        document.getElementById('meterUpsellSub').onclick = function() {
            _track('meter_subscribe_clicked', { source: 'upsell_critical' });
            overlay.remove();
            if (typeof window.openCheckout === 'function') {
                window.openCheckout('upsell');
            } else if (typeof showSettingsScreen === 'function') {
                showSettingsScreen();
            }
        };
    }

    function _patchApiCall() {
        if (!window.apiCall || window._apiCallPatched) return;
        var _origApiCall = window.apiCall;
        window._apiCallPatched = true;
        window.apiCall = async function(endpoint, options) {
            var isAi = _isAiRequest(endpoint);
            if (isAi && options && (options.method === 'POST' || options.body)) {
                var check = await checkCanSend();
                if (!check.can_send) { showFatigueModal(check); throw new Error('METER_BLOCKED'); }
                _showWarningToast(check);
            }
            var result = await _origApiCall(endpoint, options);
            if (result && result.error === 'METER_BLOCKED') {
                _lastCheck = null;
                showFatigueModal(result);
            }
            // ВАЖНО: здесь recordUsage НЕ вызываем. _origApiCall внутри
            // ходит через window.fetch, который уже пропатчен (_patchFetch)
            // и сам записывает расход. Если записать ещё и тут — один
            // AI-запрос спишет лимит дважды (15с в fetch + до 60с тут =
            // до 75с за сообщение), и free-юзер упрётся в paywall в 3-5 раз
            // быстрее положенного. Расход пишет ровно один слой — fetch.
            return result;
        };
        console.log('meter: apiCall patched');
    }

    // Список AI-эндпоинтов, которые должен предварять meter-чек.
    // Держим в синхроне с _METER_AI_REGEX в backend/main.py.
    // voice\/process РАНЬШЕ не матчил /api/voice/process_stream (после
    // «process» шёл «_», а граница ждала /|$|? ) — из-за чего HTTP-путь
    // голоса проходил мимо пейволла И мимо учёта расхода. Расширяем до
    // process(_stream)?|stt|tts — в синхрон с _METER_AI_REGEX на бэке.
    var AI_URL_REGEX = /\/api\/(?:chat|voice\/(?:process(?:_stream)?|stt|tts)|ai\/generate|deep-analysis|hypno\/support|psychologist-thoughts\/generate|dreams\/(?:interpret|clarify)|reality\/(?:check|parse\/[^/]+)|brand\/transformation|mirrors\/(?:complete|[^/]+\/complete)|morning\/send-now|natal\/interpret|tarot\/interpret|horoscope)(?:\/|$|\?)/;

    function _isAiRequest(urlStr) {
        return AI_URL_REGEX.test(urlStr || '');
    }

    function _patchFetch() {
        if (window._fetchMeterPatched) return;
        var _origFetch = window.fetch;
        window._fetchMeterPatched = true;
        window.fetch = async function(url, options) {
            var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
            var isAi = _isAiRequest(urlStr);
            var method = (options && options.method) || 'GET';
            if (isAi && method === 'POST') {
                var check = await checkCanSend();
                if (!check.can_send) {
                    showFatigueModal(check);
                    return new Response(JSON.stringify({ success: false, error: 'METER_BLOCKED', response: check.message || '\u0424\u0440\u0435\u0434\u0438 \u0443\u0441\u0442\u0430\u043B' }), { status: 402, headers: { 'Content-Type': 'application/json' } });
                }
                _showWarningToast(check);
            }
            var response = await _origFetch.call(window, url, options);
            // Если бэк сам заблокировал (402) — достаём данные и показываем модалку.
            if (isAi && response.status === 402) {
                try {
                    var cloned = response.clone();
                    var blocked = await cloned.json();
                    if (blocked && blocked.error === 'METER_BLOCKED') {
                        _lastCheck = null;
                        showFatigueModal(blocked);
                    }
                } catch (e) {}
            }
            if (isAi && response.ok) recordExchange();
            return response;
        };
        console.log('meter: fetch patched');
    }

    // ============================================
    // PERSISTENT TIMER BADGE — правый верхний угол
    // ============================================
    // Идея: в trial юзер видит бадж «⏱ 7:32 · День 2/3» постоянно.
    // Полный функционал работает, но лимит виден → создаёт ясное
    // ощущение «free trial идёт» без агрессивного pull-в-подписку.
    //
    // Цвет:
    //   серый    — > 5 мин осталось
    //   жёлтый   — 1–5 мин
    //   красный  — < 1 мин
    // Premium-юзер бадж не видит вообще.

    function _formatTime(minutes) {
        if (minutes == null || minutes < 0) minutes = 0;
        var totalSec = Math.max(0, Math.round(minutes * 60));
        var m = Math.floor(totalSec / 60);
        var s = totalSec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function _ensureBadge() {
        _injectBadgeStyles();
        var badge = document.getElementById('meterBadge');
        if (badge) return badge;
        badge = document.createElement('div');
        badge.id = 'meterBadge';
        badge.className = 'meter-badge';
        // Подпись всплывает по наведению и на десктопе читается раньше клика.
        // С 04.09 лимит снова дневной и обновляется в полночь — подпись
        // обязана обещать ровно это, ни больше ни меньше: прошлая версия
        // («10 минут на аккаунт, дальше 990») осталась бы враньём в другую
        // сторону — человек не ждал бы завтрашних минут, которые придут.
        badge.title = 'Бесплатные минуты на сегодня — завтра будут снова. Premium — без счётчика.';
        badge.innerHTML = '<span class="meter-badge-icon">⏱</span>'
            + '<span class="meter-badge-time" id="meterBadgeTime">--:--</span>'
            + '<span class="meter-badge-day" id="meterBadgeDay"></span>';
        // Клик по баджу. Раньше он ВСЕГДА открывал модалку блокировки:
        // человек с нетронутым лимитом тыкал в таймер из любопытства и
        // видел стену «10 минут сегодня исчерпаны». В аналитике это лежало
        // как meter_blocked_shown с trial_used_minutes=0 и
        // minutes_until_reset=0 — блок, которого не было. Стена — только
        // когда блок настоящий; иначе — остатки цифрами.
        badge.addEventListener('click', function () {
            var c = _lastCheck;
            try {
                if (window.FrediTracker && window.FrediTracker.track) {
                    window.FrediTracker.track('meter_badge_clicked',
                        { blocked: !!(c && c.can_send === false) });
                }
            } catch (e) {}
            if (!c) return;
            if (c.can_send === false) { showFatigueModal(c); return; }
            var day = c.remaining_today_minutes;
            var trial = c.remaining_trial_minutes;
            if (day == null && trial == null) return;
            var parts = [];
            if (day != null) parts.push('сегодня осталось ' + Math.round(day) + ' мин');
            // Про окно «всё включено» — только пока оно есть. «Запас — 0 мин»
            // у давнего пользователя читался бы как «всё кончилось», хотя
            // кончился только голос, а текст обновляется каждый день.
            if (trial != null && trial > 0) parts.push('🎙 голос — ещё ' + Math.round(trial) + ' мин');
            _toast('⏱ ' + parts.join(' · '), 'info');
        });
        document.body.appendChild(badge);
        return badge;
    }

    function _renderBadge(check) {
        // Premium / нет данных / не free-юзер → бадж не показываем.
        if (!check || check.is_premium) {
            var existing = document.getElementById('meterBadge');
            if (existing) existing.remove();
            return;
        }
        var badge = _ensureBadge();
        var rem = check.remaining_minutes;
        var trialRem = check.remaining_trial_minutes;
        // Красное «Купить» — только когда отправка действительно закрыта.
        // Здесь стояло `if (check.trial_exhausted)` — зеркало ошибки 31.08,
        // уже починенной в стене (строка ~490), но не тут: с 04.09 флаг
        // trial_exhausted навсегда true у каждого со второго дня, а его
        // дневные минуты при этом на месте. Человек с полными пятью
        // минутами видел бы в углу красное «Trial · Купить» вместо счётчика
        // — постоянный сигнал «всё кончилось» при работающем бесплатном
        // уровне.
        if (check.can_send === false) {
            badge.classList.remove('warn');
            badge.classList.add('danger');
            var t = document.getElementById('meterBadgeTime');
            var d = document.getElementById('meterBadgeDay');
            if (t) t.textContent = '0:00';
            if (d) {
                // 'trial' приходит только со старого бэка, где запас
                // терминальный — там «Купить» правда. Дневная пауза —
                // «до завтра»: минуты вернутся, врать «кончилось» нельзя.
                d.textContent = (check.block_reason === 'trial') ? 'Купить' : 'до завтра';
                d.style.display = '';
            }
            return;
        }
        // Цвет по остатку минут.
        badge.classList.remove('warn', 'danger');
        if (rem != null) {
            if (rem < 1) badge.classList.add('danger');
            else if (rem <= 5) badge.classList.add('warn');
        }
        var timeEl = document.getElementById('meterBadgeTime');
        var dayEl = document.getElementById('meterBadgeDay');
        if (timeEl) timeEl.textContent = _formatTime(rem);
        if (dayEl) {
            // Вторая строка баджа — окно «всё включено» (04.09): пока оно
            // не выговорено, бесплатному уровню доступен и голос. «Запас»
            // тут больше писать нельзя — общий запас текст не ограничивает,
            // и слово обещало бы стену, которой нет.
            if (trialRem != null && trialRem > 0) {
                dayEl.textContent = '\uD83C\uDF99 голос: ' + Math.max(1, Math.round(trialRem)) + ' мин';
                dayEl.style.display = '';
            } else {
                // Окно выговорено: голос в Premium, текст — по дневному
                // лимиту из первой строки. Вторая строка молчит.
                dayEl.style.display = 'none';
            }
        }
    }

    // Локально тикаем таймер каждую секунду (без походов на сервер),
    // отталкиваясь от последнего известного remaining_minutes.
    var _tickInterval = null;
    function _startBadgeTicker() {
        if (_tickInterval) return;
        _tickInterval = setInterval(function () {
            // Если есть текущий чек, мы УЖЕ показали бадж.
            // Каждую секунду уменьшаем local-копию remaining_minutes на 1/60.
            // Бэк всё равно — источник правды; периодически (раз в 60 сек)
            // дёргаем checkCanSend, чтобы синхронизироваться.
            if (!_lastCheck || _lastCheck.is_premium) return;
            // Уменьшаем local remaining только если идёт активный chat?
            // Безопаснее НЕ уменьшать, а просто перерисовывать —
            // обновление пойдёт через recordUsage → invalidate cache → next checkCanSend.
            _renderBadge(_lastCheck);
        }, 1000);

        // Каждые 60 сек — освежаем данные с сервера.
        setInterval(function () {
            _lastCheck = null;
            checkCanSend().then(function (data) { _renderBadge(data); });
        }, 60000);
    }

    // При первой возможности — рисуем бадж.
    function _initBadge() {
        if (!_uid()) {
            // user_id не готов, повторим через 1 сек.
            setTimeout(_initBadge, 1000);
            return;
        }
        checkCanSend().then(function (data) {
            _renderBadge(data);
            _startBadgeTicker();
        });
    }

    function _applyPatches() {
        _patchFetch();
        _initBadge();
        if (window.apiCall) { _patchApiCall(); }
        else {
            setTimeout(function() { if (window.apiCall) _patchApiCall(); }, 2000);
            setTimeout(function() { if (window.apiCall) _patchApiCall(); }, 5000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _applyPatches);
    } else {
        _applyPatches();
    }

    // Предложение подписки в пиковый момент, а не по таймеру.
    // Выгрузка диалогов и Метрика за 5 сентября: до стены оплаты по
    // счётчику дошли двое за день, потому что пять бесплатных минут не
    // кончаются, а самые долгие разговоры — голосовые и без подписки.
    // Пиковых моментов три: Фреди подвёл итог и позвал продолжить завтра
    // (ритуал завершения из промпта), готов профиль большого теста, готова
    // интерпретация натальной карты. В эти секунды человек только что
    // получил ценность, и «сохранить и продолжать» читается как
    // продолжение, а не как турникет. Карточка не блокирует, закрывается
    // кликом мимо, показывается не чаще раза в сутки на браузер.
    var PEAK_KEY = 'meter_peak_offer_day';
    function showPeakOffer(source) {
        try {
            if (_lastCheck && _lastCheck.is_premium) return;
            var today = new Date().toISOString().slice(0, 10);
            var shown = '';
            try { shown = localStorage.getItem(PEAK_KEY) || ''; } catch (e) {}
            if (shown === today) return;
            if (document.getElementById('meterOverlay') || document.getElementById('meterUpsellOverlay')
                || document.getElementById('meterPeakOverlay') || document.getElementById('faAuthModal')) return;
            _injectMeterStyles();
            try { localStorage.setItem(PEAK_KEY, today); } catch (e) {}
            var anon = !!(_lastCheck && _lastCheck.is_registered === false);
            _track('meter_peak_offer_shown', { source: source || '', anon: anon });
            var who = _name();
            var lead = {
                closing: 'Разговор сегодня получился. ',
                bigtest: 'Ваш портрет готов. ',
                natal: 'Ваша карта разобрана. ',
            }[source] || '';
            var overlay = document.createElement('div');
            overlay.className = 'meter-overlay';
            overlay.id = 'meterPeakOverlay';
            overlay.innerHTML =
                '<div class="meter-modal">' +
                    '<div class="meter-emoji">🔖</div>' +
                    '<div class="meter-title">Сохранить и продолжать?</div>' +
                    '<div class="meter-text">' + (who ? _esc(who) + ', ' + lead.charAt(0).toLowerCase() + lead.slice(1) : lead) +
                        'С подпиской Фреди помнит каждый разговор и продолжает завтра с того же места. ' +
                        'Голос, все режимы, без счётчика минут.' +
                        (anon ? '<br><br>Без аккаунта этот разговор завтра не вспомнится: нужна почта и четыре цифры.' : '') +
                    '</div>' +
                    '<button class="meter-btn meter-btn-primary" id="meterPeakSub">✨ Попробовать неделю — 290 ₽</button>' +
                    '<div class="meter-price-note" style="font-size:12px;opacity:.65;margin:2px 0 6px">Полный Premium на 7 дней: голос, все режимы, память о каждом разговоре. Потом 990 ₽ в месяц; отключить можно в один клик.</div>' +
                    (anon ? '<button class="meter-btn meter-btn-secondary" id="meterPeakReg">📩 Сначала завести аккаунт</button>' : '') +
                    '<button class="meter-btn meter-btn-secondary" id="meterPeakLater">Позже</button>' +
                '</div>';
            document.body.appendChild(overlay);
            document.getElementById('meterPeakSub').onclick = function () {
                _track('meter_subscribe_clicked', { source: 'peak_' + (source || '') });
                overlay.remove();
                if (typeof window.openCheckout === 'function') window.openCheckout('peak_' + (source || ''));
            };
            var reg = document.getElementById('meterPeakReg');
            if (reg) reg.onclick = function () { overlay.remove(); _openRegister('peak_' + (source || '')); };
            document.getElementById('meterPeakLater').onclick = function () {
                _track('meter_peak_offer_dismissed', { source: source || '', reason: 'later' });
                overlay.remove();
            };
            overlay.onclick = function (e) {
                if (e.target === overlay) { _track('meter_peak_offer_dismissed', { source: source || '', reason: 'outside' }); overlay.remove(); }
            };
        } catch (e) { console.warn('showPeakOffer failed:', e); }
    }

    // Сильные игры — только по подписке (решение владельца 05.09.2026).
    // Единственный список: по нему kontur.js рисует значок и перехватывает
    // запуск, app.js закрывает прямые ссылки ?m=<игра>. Ключ — глобальная
    // функция запуска, потому что именно её зовут и хаб, и роутер.
    // Бесплатными остаются короткие тренажёры без Фреди-игротехника
    // (N-back, счёт, калибровка, данетки, Ферми, «Лови ошибку») и входные
    // игры первого экрана (Контур, Два потока, Мнемо, Чувства, Мысль под
    // допросом, Скажи «нет», Чайник Рассела, Вариатика Basic).
    var PREMIUM_GAMES = {
        showOdiScreen: 'ОДИ: игра всерьёз',
        showVsluhGame: 'Мысль вслух',
        showSpiralGame: 'Спираль',
        showParusGame: 'Парус',
        showPerehodGame: 'Переход',
        showLazejkaGame: 'Лазейка',
        showIstoriaGame: 'Другая история',
        showLgenijGame: 'Ленивый гений',
        showAlfavitGame: 'Алфавит',
        showSignalGame: 'Сигнал',
        showKlinGame: 'Клин клином',
        showRolGame: 'Смени роль',
        showOporaGame: 'Опора',
        showDeloGame: 'Своё дело',
        showSovetGame: 'Земля в опасности',
        showDostigatorGame: 'Достигатор',
        showKorkaGame: 'Короли и капуста',
        showMandatGame: 'Мандат: цена кресла',
        showMeisterGame: 'МЕЙСТЕР-КОД',
        showMarketologGame: 'Маркетолог',
        showProgressiveGame: 'Вариатика — Progressive',
        showIntensiveGame: 'Вариатика — Intensive',
        showImperativeGame: 'Императив',
        showExponentaGame: 'Экспонента',
        showPatternGame: 'Паттерн',
        showDotogokakScreen: 'До того, как',
    };
    function _isPremiumNow() {
        if (window.IS_PREMIUM === true) return true;
        return !!(_lastCheck && (_lastCheck.is_premium || _lastCheck.has_subscription));
    }
    // Заперта ли игра для этого человека: имя функции запуска → да/нет.
    function gameLocked(fn) {
        if (!fn || !PREMIUM_GAMES.hasOwnProperty(fn)) return false;
        return !_isPremiumNow();
    }
    function showGameLock(fn, source) {
        var name = PREMIUM_GAMES[fn] || 'эта игра';
        _injectMeterStyles();
        var old = document.getElementById('meterGameLock');
        if (old) old.remove();
        _track('game_lock_shown', { game: fn, source: source || '' });
        var overlay = document.createElement('div');
        overlay.className = 'meter-overlay';
        overlay.id = 'meterGameLock';
        overlay.innerHTML =
            '<div class="meter-modal">' +
                '<div class="meter-emoji">💎</div>' +
                '<div class="meter-title">«' + _esc(name) + '» — с подпиской</div>' +
                '<div class="meter-text">Сильные игры открываются в Premium вместе с голосом, всеми режимами ' +
                    'и памятью Фреди о каждом разговоре. Короткие тренажёры и вход в игры остаются бесплатными.</div>' +
                '<button class="meter-btn meter-btn-primary" id="meterGameLockSub">✨ Попробовать неделю — 290 ₽</button>' +
                '<div class="meter-price-note" style="font-size:12px;opacity:.65;margin:2px 0 6px">Полный Premium на 7 дней, потом 990 ₽ в месяц — меньше одной очной консультации; отключить можно в один клик.</div>' +
                '<button class="meter-btn meter-btn-secondary" id="meterGameLockClose">Понятно</button>' +
            '</div>';
        document.body.appendChild(overlay);
        document.getElementById('meterGameLockSub').onclick = function () {
            _track('meter_subscribe_clicked', { source: 'game_lock', game: fn });
            overlay.remove();
            if (typeof window.openCheckout === 'function') window.openCheckout('game_lock_' + fn);
        };
        document.getElementById('meterGameLockClose').onclick = function () {
            _track('game_lock_dismissed', { game: fn });
            overlay.remove();
        };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    }

    // Ранняя дверь аккаунта. 06.09: 99 первых сообщений за день и 3 просьбы
    // завести аккаунт. Стена аккаунта приходит, когда выговорены 10 минут,
    // а человек из объявления отвечает на автовопрос, пишет один раз сам и
    // уходит на третьей минуте — до стены он не доживает. Поэтому аккаунт
    // предлагается раньше: после второго сообщения сессии, когда Фреди уже
    // ответил на своё. Карточка не блокирует, закрывается кликом мимо,
    // раз в сутки на браузер, только анониму. Числа минут — из статуса
    // счётчика, руками не вписываются.
    var DOOR_KEY = 'meter_account_door_day';
    function showAccountDoor(source) {
        try {
            if (_authed()) return;
            if (_lastCheck && (_lastCheck.is_registered === true || _lastCheck.is_premium)) return;
            var today = new Date().toISOString().slice(0, 10);
            var shown = '';
            try { shown = localStorage.getItem(DOOR_KEY) || ''; } catch (e) {}
            if (shown === today) return;
            if (document.getElementById('meterOverlay') || document.getElementById('meterUpsellOverlay')
                || document.getElementById('meterPeakOverlay') || document.getElementById('meterDoorOverlay')
                || document.getElementById('faAuthModal')) return;
            _injectMeterStyles();
            try { localStorage.setItem(DOOR_KEY, today); } catch (e) {}
            var gain = _accountGain(_lastCheck);
            _track('meter_account_door_shown', { source: source || '', gain: !!gain });
            var who = _name();
            var overlay = document.createElement('div');
            overlay.className = 'meter-overlay';
            overlay.id = 'meterDoorOverlay';
            overlay.innerHTML =
                '<div class="meter-modal">' +
                    '<div class="meter-emoji">📩</div>' +
                    '<div class="meter-title">Продолжим завтра?</div>' +
                    '<div class="meter-text">' + (who ? _esc(who) + ', разговор пошёл. ' : 'Разговор пошёл. ') +
                        'Без аккаунта Фреди его завтра не вспомнит и начнёт с чистого листа. ' +
                        'Аккаунт — это почта и четыре цифры, минута времени.' +
                        (gain
                            ? ' С аккаунтом ' + gain.big + ' минут каждый день вместо ' + gain.small + '.'
                            : '') +
                    '</div>' +
                    '<button class="meter-btn meter-btn-primary" id="meterDoorReg">📩 Завести аккаунт</button>' +
                    '<button class="meter-btn meter-btn-secondary" id="meterDoorLater">Позже</button>' +
                '</div>';
            document.body.appendChild(overlay);
            document.getElementById('meterDoorReg').onclick = function () {
                overlay.remove();
                _openRegister('door_' + (source || ''));
            };
            document.getElementById('meterDoorLater').onclick = function () {
                _track('meter_account_door_dismissed', { source: source || '', reason: 'later' });
                overlay.remove();
            };
            overlay.onclick = function (e) {
                if (e.target === overlay) { _track('meter_account_door_dismissed', { source: source || '', reason: 'outside' }); overlay.remove(); }
            };
        } catch (e) { console.warn('showAccountDoor failed:', e); }
    }

    window.FrediMeter = {
        checkCanSend: checkCanSend,
        showPeakOffer: showPeakOffer,
        showAccountDoor: showAccountDoor,
        gameLocked: gameLocked,
        showGameLock: showGameLock,
        premiumGames: PREMIUM_GAMES,
        recordUsage: recordUsage,
        recordExchange: recordExchange,
        showFatigueModal: showFatigueModal,
        showUpsellCard: showUpsellCard,
        // Наружу — чтобы предупреждение можно было показать из голосового
        // пути (он не идёт через apiCall/fetch-патчи) и чтобы его поведение
        // на границах остатка можно было проверить, а не додумывать.
        showWarningToast: _showWarningToast,
        bindingKind: _bindingKind,
        // Последний известный статус метра. Нужен app.js, чтобы решить,
        // отправлять ли выбранную роль: пока идёт проба, роли работают.
        // Свойство, а не поле, — иначе отдавали бы снимок на момент
        // сборки объекта, то есть всегда null.
        get lastCheck() { return _lastCheck; },
    };
    console.log('meter.js loaded');
})();
