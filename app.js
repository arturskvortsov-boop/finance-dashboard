window.onerror=function(msg,url,line){var el=document.getElementById('fileStatus');if(el)el.textContent='❌ '+msg+' | стр.'+line;return false;};

(function(){
'use strict';

if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistrations().then(function(regs){
        for(var i=0;i<regs.length;i++)regs[i].unregister();
    }).catch(function(){});
}
if(window.caches&&caches.keys){
    caches.keys().then(function(keys){
        for(var i=0;i<keys.length;i++)caches.delete(keys[i]);
    }).catch(function(){});
}

function $(id){return document.getElementById(id);}

/* ===== TELEGRAM WEBAPP ===== */
var tg=null;
var tgUser=null;
var isTelegram=false;
try{
    if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData){
    tg=window.Telegram.WebApp;
    isTelegram=true;
    try{tg.ready();tg.expand();}catch(e){}
    try{if(tg.disableVerticalSwipes)tg.disableVerticalSwipes();}catch(e){}
    // Full Screen Mode (Bot API 8.0+)
    try{
        if(tg.requestFullscreen){
            tg.requestFullscreen();
        }
    }catch(e){}
    // Скрываем стандартные элементы управления
    try{
        if(tg.setHeaderColor)tg.setHeaderColor('#000000');
        if(tg.setBottomBarColor)tg.setBottomBarColor('#000000');
    }catch(e){}
        if(tg.initDataUnsafe && tg.initDataUnsafe.user){
            tgUser=tg.initDataUnsafe.user;
        }
        try{document.body.classList.add('tg-webapp');}catch(e){}
    // Отслеживаем состояние fullscreen
    try{
        if(tg.isFullscreen){
            document.body.classList.add('tg-fullscreen');
        }
        if(tg.onEvent){
            tg.onEvent('fullscreenChanged',function(){
                if(tg.isFullscreen){
                    document.body.classList.add('tg-fullscreen');
                } else {
                    document.body.classList.remove('tg-fullscreen');
                }
            });
        }
    }catch(e){}
}catch(e){}
function getTelegramUserId(){
    if(tgUser&&tgUser.id)return 'tg_'+tgUser.id;
    return null;
}
function getTelegramName(){
    if(!tgUser)return '';
    return tgUser.first_name||tgUser.username||'';
}


var STORAGE_KEY='financeDataTransactions';
var RATE_STORAGE_KEY='usdRate';
var RATE_HISTORY_KEY='rateHistory';
var TOKEN_KEY='githubPersonalToken';
var LAST_SYNC_KEY='lastSyncTime';
var TEMPLATES_FILE='templates.json';
var BUDGETS_FILE='budgets.json';
var GOALS_FILE='goals.json';
var TEMPLATES_KEY='financeTemplates';
var BUDGETS_KEY='financeBudgets';
var GOALS_KEY='financeGoals';
var HIDE_BALANCE_KEY='hideBalance';
var USER_ID_KEY='financeUserId';

var CATEGORIES_INCOME=['💰 Зарплата','🗓 Продажа','🎁 Подарок','💵 Другое'];
var CATEGORIES_EXPENSE=['🚘 Автомобиль','🍔 Еда','🏚️ Ипотека','☕️ Кафе','🎢 Развлечения','🛍 Покупки','💊 Здоровье','🏠 Коммуналка','📱 Связь','📚 Образование','💸 Другое'];

var COLORS=['#93c5fd','#a5b4fc','#c4b5fd','#f9a8d4','#fbcfe8','#fcd34d','#86efac','#5eead4','#fdba74','#d8b4fe','#a7f3d0','#fca5a5'];

var GOAL_ICONS=['🎯','🚗','🏠','✈️','💻','📱','🎓','💍','🏖️','🎁','💰','🎸','📷','🚴','⛷️','🛥️'];

var allTransactions=[];
var rateHistory=[];
var templates=[];
var budgets=[];
var goals=[];
var currentFilter='month';
var dataLoaded=false;
var currentUsdRate=85.00;
var expensePieChart=null,incomePieChart=null,rateHistoryChart=null,catDetailDonut=null,balanceHistoryChart=null;
var autoUpdateTimer=null, freshnessTimer=null, autoSyncTimer=null;
var editingIndex=-1;
var currentTxType='income';
var currentTxSearch='';
var currentTxTypeFilter='all';
var editingTemplateId=null;
var currentTplType='income';
var editingBudgetCategory=null;
var editingGoalId=null;
var currentGoalIcon='🎯';
var scrollY=0;
var hideBalance=false;
var userId='';
var calendarYear=0;
var calendarMonth=0;

function lockBackground(){
    scrollY=window.scrollY||window.pageYOffset||0;
    document.body.classList.add('modal-locked');
    document.body.style.top='-'+scrollY+'px';
}
function unlockBackground(){
    document.body.classList.remove('modal-locked');
    document.body.style.top='';
    window.scrollTo(0,scrollY);
}

function parseNumber(s){var m=String(s).replace(/\s/g,'').replace(',','.').match(/(\d+\.?\d*)/);return m?parseFloat(m[1]):0;}
function normalizeCategory(cat){
    if(!cat)return 'Без категории';
    var s=String(cat).replace(/[\uFE0E\uFE0F]/g,'');
    var trimmed=s.replace(/\s*[\(\[].*?[\)\]]\s*/g,' ').replace(/\s+/g,' ').trim();
    if(trimmed.length>=2) s=trimmed;
    return s;
}
function roundRub(n){if(isNaN(n))return 0;return Math.round(n);}
function roundUsd(n){if(isNaN(n))return 0;return Math.round(n*100)/100;}
function getCategoryEmoji(cat){
    if(!cat)return '💸';
    var m=String(cat).trim().match(/^(\S{1,3})/);
    return m?m[1]:'💸';
}
function getOrCreateUserId(){
    var tgId=getTelegramUserId();
    if(tgId)return tgId;
    try{
        var s=localStorage.getItem(USER_ID_KEY);
        if(s&&s.indexOf('tg_')!==0)return s;
        var id='u_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
        localStorage.setItem(USER_ID_KEY,id);
        return id;
    }catch(e){return 'u_unknown';}
}

function parseLine(line){
    try{
        var p=line.split('|');
        if(p.length<5)return null;
        for(var i=0;i<p.length;i++)p[i]=p[i].trim();
        var typeP=p[0],dtP=p[1],amtP=p[2],catP=p[3],noteP=p[4]||'';
        var type='';
        if(typeP.indexOf('ДОХОД')!==-1)type='income';
        else if(typeP.indexOf('РАСХОД')!==-1)type='expense';
        else return null;
        var dm=dtP.match(/(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})/);
        if(!dm)return null;
        var dateObj=new Date(+dm[3],+dm[2]-1,+dm[1],+dm[4],+dm[5]);
        var as=amtP.split('->');
        if(as.length!==2)return null;
        return {type:type,date:dateObj,dateStr:dm[3]+'-'+dm[2]+'-'+dm[1],usd:parseNumber(as[0]),rub:parseNumber(as[1]),category:normalizeCategory(catP),note:noteP};
    }catch(e){return null;}
}

function parseData(jsonText){
    try{
        var d=JSON.parse(jsonText);
        if(!d.text||typeof d.text!=='string')return [];
        var lines=d.text.split('\n');
        var txs=[];
        for(var i=0;i<lines.length;i++){
            if(!lines[i].trim())continue;
            var t=parseLine(lines[i]);
            if(t)txs.push(t);
        }
        return txs;
    }catch(e){return [];}
}

function parseRateHistory(text){
    var lines=text.split('\n');
    var h=[];
    for(var i=0;i<lines.length;i++){
        var line=lines[i];
        if(!line.trim())continue;
        if(line.toLowerCase().indexOf('курс')!==-1)continue;
        var p=line.split('|');
        if(p.length<2)continue;
        var nm=p[1].trim().match(/(\d+[.,]\d+)/);
        if(!nm)continue;
        var rate=parseFloat(nm[1].replace(',','.'));
        if(isNaN(rate)||rate<=0)continue;
        var dm=p[0].match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if(!dm)continue;
        var tm=p[0].match(/(\d{2}):(\d{2})/);
        h.push({date:new Date(+dm[3],+dm[2]-1,+dm[1],tm?+tm[1]:0,tm?+tm[2]:0),rate:rate});
    }
    h.sort(function(a,b){return a.date-b.date;});
    return h;
}

function filterTransactions(txs,period){
    if(!txs.length)return [];
    if(period==='all')return txs;
    var now=new Date();
    var start=new Date(now);
    if(period==='day')start.setHours(0,0,0,0);
    else if(period==='week'){start.setDate(now.getDate()-7);start.setHours(0,0,0,0);}
    else{start.setMonth(now.getMonth()-1);start.setHours(0,0,0,0);}
    return txs.filter(function(tx){return tx.date>=start;});
}

function txKey(tx){
    return tx.type+'|'+tx.date.toISOString()+'|'+tx.rub+'|'+tx.usd+'|'+(tx.category||'')+'|'+(tx.note||'');
}
function mergeTransactions(local, remote){
    var seen={};
    var merged=[];
    for(var i=0;i<local.length;i++){
        var k=txKey(local[i]);
        if(!seen[k]){seen[k]=true;merged.push(local[i]);}
    }
    for(var i=0;i<remote.length;i++){
        var k=txKey(remote[i]);
        if(!seen[k]){seen[k]=true;merged.push(remote[i]);}
    }
    merged.sort(function(a,b){return a.date-b.date;});
    return merged;
}

function aggregateByCategory(txs,type){
    var map={};
    for(var i=0;i<txs.length;i++){
        var tx=txs[i];
        if(tx.type!==type)continue;
        var c=tx.category||'Без категории';
        map[c]=(map[c]||0)+tx.rub;
    }
    var arr=[];
    for(var k in map)if(map.hasOwnProperty(k))arr.push({label:k,value:map[k]});
    arr.sort(function(a,b){return b.value-a.value;});
    return arr;
}

function saveTransactions(t){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(t));}catch(e){}}
function loadTransactions(){try{var s=localStorage.getItem(STORAGE_KEY);if(s)return JSON.parse(s).map(function(tx){tx.date=new Date(tx.date);return tx;});}catch(e){}return null;}
function saveRateHistory(h){try{localStorage.setItem(RATE_HISTORY_KEY,JSON.stringify(h));}catch(e){}}
function loadRateHistory(){try{var s=localStorage.getItem(RATE_HISTORY_KEY);if(s)return JSON.parse(s).map(function(i){i.date=new Date(i.date);return i;});}catch(e){}return null;}
function saveRate(r){try{localStorage.setItem(RATE_STORAGE_KEY,String(r));}catch(e){}}
function loadRate(){try{var s=localStorage.getItem(RATE_STORAGE_KEY);if(s){var r=parseFloat(s);if(!isNaN(r)&&r>0)return r;}}catch(e){}return null;}
function getToken(){return localStorage.getItem(TOKEN_KEY)||'';}
function setToken(t){localStorage.setItem(TOKEN_KEY,t);}
function saveTemplates(){try{localStorage.setItem(TEMPLATES_KEY,JSON.stringify(templates));}catch(e){}}
function loadTemplates(){try{var s=localStorage.getItem(TEMPLATES_KEY);if(s)return JSON.parse(s);}catch(e){}return [];}
function saveBudgets(){try{localStorage.setItem(BUDGETS_KEY,JSON.stringify(budgets));}catch(e){}}
function loadBudgets(){try{var s=localStorage.getItem(BUDGETS_KEY);if(s)return JSON.parse(s);}catch(e){}return [];}
function saveGoals(){try{localStorage.setItem(GOALS_KEY,JSON.stringify(goals));}catch(e){}}
function loadGoals(){try{var s=localStorage.getItem(GOALS_KEY);if(s)return JSON.parse(s);}catch(e){}return [];}

function markSynced(){
    try{localStorage.setItem(LAST_SYNC_KEY,String(Date.now()));}catch(e){}
    updateFreshness();
}
function getLastSync(){
    try{var s=localStorage.getItem(LAST_SYNC_KEY);return s?parseInt(s,10):0;}catch(e){return 0;}
}
function timeAgo(ts){
    if(!ts)return '—';
    var diff=Date.now()-ts;
    var mins=Math.floor(diff/60000);
    if(mins<1)return 'только что';
    if(mins<60)return mins+' мин назад';
    if(mins<1440)return Math.floor(mins/60)+' ч назад';
    return Math.floor(mins/1440)+' дн назад';
}
function updateFreshness(){
    var el=$('dataFreshness');
    if(!el)return;
    var ts=getLastSync();
    el.textContent=ts?'обновлено '+timeAgo(ts):'';
}
function renderRateFreshness(){
    var el=$('rateFreshness');
    if(!el)return;
    if(!rateHistory.length){el.textContent='Курс не загружен';return;}
    var last=rateHistory[rateHistory.length-1];
    el.textContent='Обновлён '+timeAgo(last.date.getTime());
}
function startFreshnessTimer(){
    if(freshnessTimer)clearInterval(freshnessTimer);
    freshnessTimer=setInterval(function(){updateFreshness();renderRateFreshness();},60000);
    updateFreshness();
    renderRateFreshness();
}

function pad(n){return n<10?'0'+n:''+n;}

function computeStats(txs){
    var rubIncome=0,rubExpense=0,usdIncome=0,usdExpense=0;
    for(var i=0;i<txs.length;i++){
        var t=txs[i];
        if(t.type==='income'){if(t.usd===0)rubIncome+=t.rub;else usdIncome+=t.usd;}
        else{if(t.usd===0)rubExpense+=t.rub;else usdExpense+=t.usd;}
    }
    var totalIncomeRub=rubIncome+usdIncome*currentUsdRate;
    var totalExpenseRub=rubExpense+usdExpense*currentUsdRate;
    var netRub=totalIncomeRub-totalExpenseRub;
    var netUsd=netRub/currentUsdRate;
    return {
        rubIncome:rubIncome,rubExpense:rubExpense,
        usdIncome:usdIncome,usdExpense:usdExpense,
        totalIncomeRub:totalIncomeRub,totalExpenseRub:totalExpenseRub,
        netRub:netRub,netUsd:netUsd,
        totalIncomeUsdEq:totalIncomeRub/currentUsdRate,
        totalExpenseUsdEq:totalExpenseRub/currentUsdRate
    };
}

/* ===== TOAST ===== */
function showToast(text,duration){
    duration=duration||3000;
    var t=document.createElement('div');
    t.className='toast';
    t.textContent=text;
    document.body.appendChild(t);
    setTimeout(function(){t.classList.add('show');},30);
    setTimeout(function(){
        t.classList.remove('show');
        setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},350);
    },duration);
}

/* ===== PRIVACY MODE ===== */
function applyHideBalance(){
    var els=['totalBalanceRubDisplay','totalBalanceUsdDisplay','monthIncomeDisplay','monthExpenseDisplay','totalIncomeRubOnly','totalExpenseRubOnly','totalIncomeUsd','totalExpenseUsd','balanceUsd','netIncome','dayIncome','dayExpense','weekIncome','weekExpense','monthIncome','monthExpense','currencyHeroUsd','usdDetails','rateProfit'];
    for(var i=0;i<els.length;i++){
        var el=$(els[i]);
        if(!el)continue;
        if(hideBalance)el.classList.add('bc-hidden');
        else el.classList.remove('bc-hidden');
    }
    var btn=$('hideBalanceBtn');
    if(btn){btn.textContent=hideBalance?'🙈':'👁';btn.classList.toggle('active',hideBalance);}
}
function toggleHideBalance(){
    hideBalance=!hideBalance;
    try{localStorage.setItem(HIDE_BALANCE_KEY, hideBalance?'1':'0');}catch(e){}
    applyHideBalance();
}

/* ===== REMINDERS ===== */
function templateMatchesTransaction(tpl,tx){
    if(tpl.type!==tx.type)return false;
    if(tpl.category!==tx.category)return false;
    if(tpl.rub>0&&tx.rub>0)return Math.abs(tpl.rub-tx.rub)/tpl.rub<=0.05;
    if(tpl.usd>0&&tx.usd>0)return Math.abs(tpl.usd-tx.usd)/tpl.usd<=0.05;
    return false;
}
function getPendingReminders(){
    if(!templates.length)return [];
    var now=new Date();
    var today=now.getDate();
    var monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    var monthEnd=new Date(now.getFullYear(),now.getMonth()+1,1);
    var thisMonthTxs=[];
    for(var i=0;i<allTransactions.length;i++){
        var tx=allTransactions[i];
        if(tx.date>=monthStart&&tx.date<monthEnd)thisMonthTxs.push(tx);
    }
    var pending=[];
    for(var i=0;i<templates.length;i++){
        var tpl=templates[i];
        if(!tpl.dayOfMonth||tpl.dayOfMonth<=0)continue;
        if(today<tpl.dayOfMonth)continue;
        if(today>tpl.dayOfMonth+3)continue;
        var already=false;
        for(var j=0;j<thisMonthTxs.length;j++){
            if(templateMatchesTransaction(tpl,thisMonthTxs[j])){already=true;break;}
        }
        if(!already)pending.push(tpl);
    }
    return pending;
}
function renderReminders(){
    var block=$('remindersBlock');
    var list=$('remindersList');
    if(!block||!list)return;
    var pending=getPendingReminders();
    if(!pending.length){block.classList.add('hidden');return;}
    block.classList.remove('hidden');
    if($('remindersCount'))$('remindersCount').textContent=pending.length+' шт.';
    list.innerHTML='';
    for(var i=0;i<pending.length;i++){
        var tpl=pending[i];
        var item=document.createElement('div');item.className='reminder-item';
        var ic=document.createElement('div');ic.className='reminder-icon';ic.textContent=tpl.type==='income'?'💰':'📌';
        var info=document.createElement('div');info.className='reminder-info';
        var nm=document.createElement('div');nm.className='reminder-name';nm.textContent=tpl.name;
        var meta=document.createElement('div');meta.className='reminder-meta';
        var amount=(tpl.rub>0?roundRub(tpl.rub).toLocaleString('ru-RU')+' ₽':tpl.usd.toFixed(2)+' $');
        meta.textContent=(tpl.type==='income'?'Доход':'Расход')+' · '+amount+' · '+tpl.dayOfMonth+'-е число';
        info.appendChild(nm);info.appendChild(meta);
        var btn=document.createElement('button');btn.className='reminder-btn';btn.textContent='Внести';
        (function(id){btn.addEventListener('click',function(e){e.stopPropagation();applyTemplate(id);});})(tpl.id);
        item.appendChild(ic);item.appendChild(info);item.appendChild(btn);
        list.appendChild(item);
    }
}

/* ===== CALENDAR ===== */
function renderCalendar(){
    var grid=$('calendarGrid');
    var title=$('calTitle');
    if(!grid||!title)return;
    if(!calendarYear&&!calendarMonth){
        var now=new Date();
        calendarYear=now.getFullYear();
        calendarMonth=now.getMonth();
    }
    var monthNames=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    title.textContent=monthNames[calendarMonth]+' '+calendarYear;

    // Считаем траты по дням выбранного месяца
    var monthStart=new Date(calendarYear,calendarMonth,1);
    var monthEnd=new Date(calendarYear,calendarMonth+1,0);
    var daysInMonth=monthEnd.getDate();
    var expenseByDay={};
    var maxExpense=0;
    for(var i=0;i<allTransactions.length;i++){
        var tx=allTransactions[i];
        if(tx.type!=='expense')continue;
        if(tx.date<monthStart||tx.date>monthEnd)continue;
        var day=tx.date.getDate();
        var rub=tx.rub;if(tx.usd>0)rub=tx.usd*currentUsdRate;
        expenseByDay[day]=(expenseByDay[day]||0)+rub;
        if(expenseByDay[day]>maxExpense)maxExpense=expenseByDay[day];
    }

    // Первый день недели (0 = Пн, 6 = Вс)
    var firstDayOfWeek=new Date(calendarYear,calendarMonth,1).getDay();
    var offset=(firstDayOfWeek===0)?6:firstDayOfWeek-1;

    var html='';
    for(var i=0;i<offset;i++)html+='<div class="cal-day empty"></div>';
    var today=new Date();
    var isCurrentMonth=(today.getFullYear()===calendarYear&&today.getMonth()===calendarMonth);

    for(var d=1;d<=daysInMonth;d++){
        var expense=expenseByDay[d]||0;
        var level=0;
        if(maxExpense>0&&expense>0){
            var ratio=expense/maxExpense;
            if(ratio>=0.8)level=4;
            else if(ratio>=0.55)level=3;
            else if(ratio>=0.3)level=2;
            else level=1;
        }
        var isToday=isCurrentMonth&&today.getDate()===d;
        var cls='cal-day lvl'+level+(isToday?' today':'');
        html+='<div class="'+cls+'" data-day="'+d+'">'+d+'</div>';
    }
    grid.innerHTML=html;

    // Обработчики кликов на дни
    var cells=grid.querySelectorAll('.cal-day:not(.empty)');
    for(var j=0;j<cells.length;j++){
        (function(el){
            el.addEventListener('click',function(){
                var day=parseInt(this.dataset.day,10);
                var spent=expenseByDay[day]||0;
                if(spent>0){
                    showToast('📅 '+day+' '+monthNames[calendarMonth]+': потрачено '+roundRub(spent).toLocaleString('ru-RU')+' ₽',3000);
                } else {
                    showToast('📅 '+day+' '+monthNames[calendarMonth]+': трат нет',2000);
                }
            });
        })(cells[j]);
    }
}


/* ===== FORECAST ===== */
function renderForecast(){
    var block=$('forecastBlock');
    var grid=$('forecastGrid');
    if(!block||!grid)return;
    if(!allTransactions.length){block.classList.add('hidden');return;}
    var now=new Date();
    var year=now.getFullYear(),month=now.getMonth();
    var monthStart=new Date(year,month,1);
    var monthEnd=new Date(year,month+1,0);
    var daysTotal=monthEnd.getDate();
    var daysPassed=now.getDate();
    var daysLeft=daysTotal-daysPassed;

    var incMonth=0,expMonth=0;
    for(var i=0;i<allTransactions.length;i++){
        var tx=allTransactions[i];
        if(tx.date<monthStart||tx.date>monthEnd)continue;
        var rub=tx.rub;if(tx.usd>0)rub=tx.usd*currentUsdRate;
        if(tx.type==='income')incMonth+=rub;
        else expMonth+=rub;
    }

    var monthNames=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    if($('forecastMonthLabel'))$('forecastMonthLabel').textContent=monthNames[month];

    var avgIncPerDay=daysPassed>0?incMonth/daysPassed:0;
    var avgExpPerDay=daysPassed>0?expMonth/daysPassed:0;
    var forecastInc=avgIncPerDay*daysTotal;
    var forecastExp=avgExpPerDay*daysTotal;
    var forecastBal=forecastInc-forecastExp;

    block.classList.remove('hidden');
    grid.innerHTML=
        '<div class="forecast-item income"><div class="fc-label">💰 Доход</div><div class="fc-value">'+roundRub(forecastInc).toLocaleString('ru-RU')+' ₽</div></div>'+
        '<div class="forecast-item expense"><div class="fc-label">💸 Расход</div><div class="fc-value">'+roundRub(forecastExp).toLocaleString('ru-RU')+' ₽</div></div>'+
        '<div class="forecast-item balance"><div class="fc-label">⚖️ Баланс</div><div class="fc-value">'+roundRub(forecastBal).toLocaleString('ru-RU')+' ₽</div></div>';

    var hint=document.createElement('div');
    hint.className='forecast-hint';
    hint.textContent='Осталось '+daysLeft+' дн. Прогноз по среднему темпу за '+daysPassed+' дн.';
    var existingHint=block.querySelector('.forecast-hint');
    if(existingHint)existingHint.remove();
    block.appendChild(hint);
}


/* ===== CBR ===== */
function fetchCbrRate(){
    return fetch('https://www.cbr-xml-daily.ru/daily_json.js', { cache: 'no-store' })
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data){
            if(!data || !data.Valute || !data.Valute.USD) throw new Error('Invalid CBR response');
            var usd = data.Valute.USD;
            return { rate: parseFloat(usd.Value), previous: parseFloat(usd.Previous), date: data.Date || '' };
        });
}
function renderCbrRate(){
    var valEl = $('cbrRateValue');
    var diffEl = $('cbrRateDiff');
    var marketEl = $('cbrMarketValue');
    var updEl = $('cbrUpdated');
    if(!valEl || !diffEl) return;
    valEl.textContent = '—';
    diffEl.textContent = '⏳ Загрузка...';
    diffEl.className = 'cbr-diff';
    if(marketEl) marketEl.textContent = currentUsdRate.toFixed(2) + ' ₽';
    if(updEl) updEl.textContent = '';
    fetchCbrRate()
        .then(function(res){
            valEl.textContent = res.rate.toFixed(4) + ' ₽';
            if(marketEl) marketEl.textContent = currentUsdRate.toFixed(2) + ' ₽';
            var diff = currentUsdRate - res.rate;
            var pct = res.rate > 0 ? (diff / res.rate) * 100 : 0;
            var sign = diff >= 0 ? '+' : '';
            diffEl.textContent = sign + diff.toFixed(2) + ' ₽ (' + sign + pct.toFixed(2) + '%)';
            diffEl.className = 'cbr-diff' + (diff < 0 ? ' negative' : '');
            if(updEl && res.date){
                try{var d=new Date(res.date);updEl.textContent='Курс на '+d.toLocaleDateString('ru-RU');}catch(e){}
            }
        })
        .catch(function(){
            valEl.textContent='—';
            diffEl.textContent='Ошибка загрузки';
            diffEl.className='cbr-diff negative';
        });
}

function getChartTheme(){
    return { text:'#f2f5fa', textMuted:'#9aa8c0', card:'#141820', border:'#2c3444', accent:'#60a5fa', green:'#22c55e', red:'#ef4444', grid:'rgba(255,255,255,0.07)' };
}

/* ===== INSIGHTS ===== */
function renderInsights(txs,period){
    var block=$('insightsBlock'),grid=$('insightGrid'),topList=$('topCatList');
    if(!block)return;
    if(!txs.length){block.style.display='none';return;}
    block.style.display='block';
    var s=computeStats(txs);
    var periodDays=1;
    if(period==='week')periodDays=7;
    else if(period==='month')periodDays=30;
    else if(period==='all'&&txs.length){
        var minD=txs[0].date.getTime(),maxD=txs[0].date.getTime();
        for(var i=1;i<txs.length;i++){var tm=txs[i].date.getTime();if(tm<minD)minD=tm;if(tm>maxD)maxD=tm;}
        periodDays=Math.max(1,Math.ceil((maxD-minD)/(1000*60*60*24))+1);
    }
    var avgIncome=s.totalIncomeRub/periodDays;
    var avgExpense=s.totalExpenseRub/periodDays;
    var pctSave=s.totalIncomeRub>0?Math.round((s.netRub/s.totalIncomeRub)*100):0;
    grid.innerHTML=
        '<div class="insight-item income"><div class="it-label">📊 Доход / день</div><div class="it-value">'+Math.round(avgIncome).toLocaleString('ru-RU')+' ₽</div><div class="it-sub">Всего: '+roundRub(s.totalIncomeRub).toLocaleString('ru-RU')+' ₽</div></div>'+
        '<div class="insight-item expense"><div class="it-label">📉 Расход / день</div><div class="it-value">'+Math.round(avgExpense).toLocaleString('ru-RU')+' ₽</div><div class="it-sub">Всего: '+roundRub(s.totalExpenseRub).toLocaleString('ru-RU')+' ₽</div></div>'+
        '<div class="insight-item"><div class="it-label">💾 Сбережения</div><div class="it-value">'+pctSave+'%</div><div class="it-sub">'+(pctSave>=30?'Отлично!':pctSave>=15?'Хорошо':pctSave>=0?'Можно лучше':'Расход > доход')+'</div></div>';
    var expCat=aggregateByCategory(txs,'expense');
    var top3=expCat.slice(0,3);
    var totalExp=0;
    for(var i=0;i<expCat.length;i++)totalExp+=expCat[i].value;
    if(top3.length){
        var html='<div style="font-size:0.68rem;color:var(--text-muted);margin-top:10px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.3px;">💸 Топ-3 расходов</div>';
        for(var i=0;i<top3.length;i++){
            var pct=totalExp?((top3[i].value/totalExp)*100).toFixed(1):0;
            var medal=['🥇','🥈','🥉'][i];
            html+='<div class="tc-item"><span class="tc-name">'+medal+' '+top3[i].label+'</span><span class="tc-value">'+roundRub(top3[i].value).toLocaleString('ru-RU')+' ₽ ('+pct+'%)</span></div>';
        }
        topList.innerHTML=html;
    } else topList.innerHTML='';
}

/* ===== DASHBOARD ===== */
function renderDashboard(txs,period){
    if(!txs.length){
        $('dashboard').classList.add('hidden');
        $('emptyState').classList.remove('hidden');
        return;
    }
    var s=computeStats(txs);
    var now=new Date();
    var dS=new Date(now);dS.setHours(0,0,0,0);
    var wS=new Date(now);wS.setDate(now.getDate()-7);wS.setHours(0,0,0,0);
    var mS=new Date(now);mS.setMonth(now.getMonth()-1);mS.setHours(0,0,0,0);
    function calc(start){var arr=txs.filter(function(t){return t.date>=start;});return computeStats(arr);}
    var d=calc(dS),w=calc(wS),m=calc(mS);

    $('totalBalanceRubDisplay').textContent=roundRub(s.netRub).toLocaleString('ru-RU')+' ₽';
    $('totalBalanceUsdDisplay').textContent=roundUsd(s.netUsd).toFixed(2)+' $';
    $('usdDetails').textContent='↑ $'+Math.round(s.totalIncomeUsdEq)+' · ↓ $'+Math.round(s.totalExpenseUsdEq);
    if($('currencyHeroUsd'))$('currencyHeroUsd').textContent=roundUsd(s.netUsd).toFixed(2)+' $';
    $('rateInfoSmall').textContent=currentUsdRate.toFixed(2)+' ₽';

    $('totalIncomeRubOnly').textContent=roundRub(s.rubIncome).toLocaleString('ru-RU')+' ₽';
    $('totalExpenseRubOnly').textContent=roundRub(s.rubExpense).toLocaleString('ru-RU')+' ₽';
    $('totalIncomeUsd').textContent=Math.round(s.totalIncomeUsdEq).toLocaleString('ru-RU')+' $';
    $('totalExpenseUsd').textContent=Math.round(s.totalExpenseUsdEq).toLocaleString('ru-RU')+' $';
    if($('balanceUsd'))$('balanceUsd').textContent=roundUsd(s.netUsd).toFixed(2)+' $';
    $('netIncome').textContent=roundRub(s.netRub).toLocaleString('ru-RU')+' ₽';
    $('recordCount').textContent=txs.length;

    var rateDiff=0;
    for(var i=0;i<txs.length;i++){if(txs[i].usd>0)rateDiff+=txs[i].usd*currentUsdRate-txs[i].rub;}
    $('rateProfit').textContent=(rateDiff>=0?'+':'')+roundRub(rateDiff).toLocaleString('ru-RU')+' ₽';

    function fmt(n){return roundRub(n).toLocaleString('ru-RU');}
    $('dayIncome').textContent=(d.totalIncomeRub>=0?'+':'')+fmt(d.totalIncomeRub);
    $('dayExpense').textContent=(d.totalExpenseRub>=0?'-':'')+fmt(d.totalExpenseRub);
    $('weekIncome').textContent=(w.totalIncomeRub>=0?'+':'')+fmt(w.totalIncomeRub);
    $('weekExpense').textContent=(w.totalExpenseRub>=0?'-':'')+fmt(w.totalExpenseRub);
    $('monthIncome').textContent=(m.totalIncomeRub>=0?'+':'')+fmt(m.totalIncomeRub);
    $('monthExpense').textContent=(m.totalExpenseRub>=0?'-':'')+fmt(m.totalExpenseRub);

    var monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    var monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);
    var monthTxs=allTransactions.filter(function(tx){return tx.date>=monthStart&&tx.date<=monthEnd;});
    var ms=computeStats(monthTxs);
    $('periodDisplay').textContent=monthStart.toLocaleDateString('ru-RU')+' — '+monthEnd.toLocaleDateString('ru-RU');

    // Сравнение с прошлым месяцем
    var prevMonthStart=new Date(now.getFullYear(),now.getMonth()-1,1);
    var prevMonthEnd=new Date(now.getFullYear(),now.getMonth(),0);
    var prevInc=0,prevExp=0;
    for(var pi=0;pi<allTransactions.length;pi++){
        var ptx=allTransactions[pi];
        if(ptx.date<prevMonthStart||ptx.date>prevMonthEnd)continue;
        var prub=ptx.rub;if(ptx.usd>0)prub=ptx.usd*currentUsdRate;
        if(ptx.type==='income')prevInc+=prub;
        else prevExp+=prub;
    }
    function fmtComparePct(cur,prev,invert){
        if(prev<=0)return '';
        var pct=((cur-prev)/prev)*100;
        var up=pct>=0;
        var good=invert?!up:up;
        var color=good?'var(--green)':'var(--red)';
        var arrow=up?'▲':'▼';
        return ' <span style="font-size:0.66rem;color:'+color+';opacity:0.85;font-weight:600">'+arrow+Math.abs(pct).toFixed(0)+'%</span>';
    }
    $('monthIncomeDisplay').innerHTML='↑ '+roundRub(ms.totalIncomeRub).toLocaleString('ru-RU')+fmtComparePct(ms.totalIncomeRub,prevInc,false);
    $('monthExpenseDisplay').innerHTML='↓ '+roundRub(ms.totalExpenseRub).toLocaleString('ru-RU')+fmtComparePct(ms.totalExpenseRub,prevExp,true);

    var theme=getChartTheme();
    if(expensePieChart){expensePieChart.destroy();expensePieChart=null;}
    if(incomePieChart){incomePieChart.destroy();incomePieChart=null;}

    var incCat=aggregateByCategory(txs,'income');
    var incEmpty=$('incomeEmpty'); if(incEmpty)incEmpty.style.display=incCat.length?'none':'flex';
    incomePieChart=new Chart($('incomePieChart'),{
        type:'doughnut',
        data:{labels:incCat.map(function(x){return x.label;}),datasets:[{data:incCat.map(function(x){return x.value;}),backgroundColor:COLORS.slice(0,incCat.length),borderColor:theme.card,borderWidth:2}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){var t=0;for(var i=0;i<c.dataset.data.length;i++)t+=c.dataset.data[i];return c.label+': '+roundRub(c.parsed).toLocaleString('ru-RU')+' ₽ ('+((c.parsed/t)*100).toFixed(1)+'%)';}}}}}
    });
    var incList=$('incomeCategoryList');incList.innerHTML='';
    var incTotal=0;
    for(var i=0;i<incCat.length;i++)incTotal+=incCat[i].value;
    for(var i=0;i<incCat.length;i++){
        var pct=incTotal?((incCat[i].value/incTotal)*100).toFixed(1):0;
        var dd=document.createElement('div');dd.className='cat-item';
        dd.innerHTML='<span>'+incCat[i].label+'</span><span class="value">'+roundRub(incCat[i].value).toLocaleString('ru-RU')+' ₽ · '+pct+'%</span>';
        incList.appendChild(dd);
    }
    var expCat=aggregateByCategory(txs,'expense');
    var expEmpty=$('expenseEmpty'); if(expEmpty)expEmpty.style.display=expCat.length?'none':'flex';
    expensePieChart=new Chart($('expensePieChart'),{
        type:'doughnut',
        data:{labels:expCat.map(function(x){return x.label;}),datasets:[{data:expCat.map(function(x){return x.value;}),backgroundColor:COLORS.slice(0,expCat.length),borderColor:theme.card,borderWidth:2}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){var t=0;for(var i=0;i<c.dataset.data.length;i++)t+=c.dataset.data[i];return c.label+': '+roundRub(c.parsed).toLocaleString('ru-RU')+' ₽ ('+((c.parsed/t)*100).toFixed(1)+'%)';}}}}}
    });
    var expList=$('expenseCategoryList');expList.innerHTML='';
    var expTotal=0;
    for(var i=0;i<expCat.length;i++)expTotal+=expCat[i].value;
    for(var i=0;i<expCat.length;i++){
        var pct=expTotal?((expCat[i].value/expTotal)*100).toFixed(1):0;
        var dd=document.createElement('div');dd.className='cat-item';
        dd.innerHTML='<span>'+expCat[i].label+'</span><span class="value">'+roundRub(expCat[i].value).toLocaleString('ru-RU')+' ₽ · '+pct+'%</span>';
        expList.appendChild(dd);
    }

    var indexed=[];
    for(var i=0;i<txs.length;i++)indexed.push({tx:txs[i],i:i});
    indexed.sort(function(a,b){return b.tx.date-a.tx.date;});
    var searchQ=(currentTxSearch||'').toLowerCase().trim();
    var typeF=currentTxTypeFilter||'all';
    if(searchQ||typeF!=='all'){
        indexed=indexed.filter(function(item){
            var tx=item.tx;
            if(typeF!=='all'&&tx.type!==typeF)return false;
            if(searchQ){
                var hay=(tx.category+' '+(tx.note||'')).toLowerCase();
                if(hay.indexOf(searchQ)===-1)return false;
            }
            return true;
        });
    }
    var list=$('transactionList');list.innerHTML='';
    if(!indexed.length){
        var empty=document.createElement('div');empty.className='tx-empty';
        empty.textContent=(searchQ||typeF!=='all')?'Ничего не найдено':'Нет транзакций за период';
        list.appendChild(empty);
    }
    if($('txCount')){$('txCount').textContent=indexed.length?('Показано '+Math.min(indexed.length,100)+' из '+indexed.length):'';}
    var slice=indexed.slice(0,100);
    for(var k=0;k<slice.length;k++){
        var tx=slice[k].tx;
        var div=document.createElement('div');div.className='tx-item tx-anim';
        div.style.animationDelay=(Math.min(k,15)*0.02)+'s';
        var left=document.createElement('div');left.className='left';
        var txIcon=document.createElement('div');
        txIcon.className='tx-icon '+(tx.type==='income'?'income':'expense');
        txIcon.textContent=getCategoryEmoji(tx.category);
        var txInfo=document.createElement('div');txInfo.className='tx-info';
        txInfo.innerHTML='<span class="cat">'+tx.category+'</span><span class="date">'+tx.date.toLocaleDateString('ru-RU')+' '+tx.date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'</span>'+(tx.note&&tx.note!=='-'?'<span class="note">'+tx.note+'</span>':'');
        left.appendChild(txIcon);left.appendChild(txInfo);
        var right=document.createElement('span');
        right.className='right '+(tx.type==='income'?'income':'expense');
        right.textContent=(tx.type==='income'?'+':'-')+roundRub(tx.rub).toLocaleString('ru-RU')+' ₽'+(tx.usd>0?' ('+tx.usd.toFixed(2)+' $)':'');
        var actions=document.createElement('div');actions.className='tx-actions';
        var eBtn=document.createElement('button');eBtn.className='edit';eBtn.textContent='✏️';
        (function(idx){eBtn.addEventListener('click',function(){editTransaction(idx);});})(slice[k].i);
        var dBtn=document.createElement('button');dBtn.className='del';dBtn.textContent='🗑️';
        (function(idx){dBtn.addEventListener('click',function(){deleteTransaction(idx);});})(slice[k].i);
        actions.appendChild(eBtn);actions.appendChild(dBtn);
        div.appendChild(left);div.appendChild(right);div.appendChild(actions);
        list.appendChild(div);
    }

    renderInsights(txs,period);
    drawBalanceHistoryChart(txs,period);
    renderBudgets();
    renderGoals();
    renderReminders();
    renderForecast();
    renderCalendar();
    $('dashboard').classList.remove('hidden');
}

function updateWithFilter(period){
    if(!dataLoaded)return;
    var f=filterTransactions(allTransactions,period);
    renderDashboard(f,period);
    var names={day:'за сегодня',week:'за последние 7 дней',month:'за последние 30 дней',all:'за всё время'};
    $('periodLabel').textContent=names[period]||'';
}
function initData(txs){
    allTransactions=txs;dataLoaded=true;saveTransactions(txs);
    var fb=document.querySelectorAll('.filter-btn');
    for(var i=0;i<fb.length;i++)fb[i].classList.remove('disabled');
    var active=document.querySelector('.filter-btn[data-period="'+currentFilter+'"]');
    if(active)active.classList.add('active');
    updateWithFilter(currentFilter);
    if(!autoUpdateTimer)startAutoUpdate();
}

/* ===== BALANCE HISTORY CHART (cumulative from beginning) ===== */
function drawBalanceHistoryChart(txs,period){
    var c=$('balanceHistoryChart');if(!c)return;
    var emptyEl=$('balanceChartEmpty');
    if(balanceHistoryChart){balanceHistoryChart.destroy();balanceHistoryChart=null;}
    if(!txs.length){if(emptyEl)emptyEl.style.display='flex';c.style.display='none';return;}
    if(emptyEl)emptyEl.style.display='none';c.style.display='block';

    period=period||currentFilter;
    var sorted=txs.slice().sort(function(a,b){return a.date-b.date;});
    var windowStart=sorted[0].date.getTime();

    // Считаем накопленное ДО начала окна
    var incomeBefore=0, expenseBefore=0;
    for(var i=0;i<allTransactions.length;i++){
        var tx=allTransactions[i];
        if(tx.date.getTime()>=windowStart)continue;
        var rub=tx.rub;if(tx.usd>0)rub=tx.usd*currentUsdRate;
        if(tx.type==='income')incomeBefore+=rub;
        else expenseBefore+=rub;
    }

    var incomeBuckets=[], expenseBuckets=[], labels=[];

    if(period==='day'){
        for(var i=0;i<24;i++){incomeBuckets.push(0);expenseBuckets.push(0);labels.push((i<10?'0'+i:i)+':00');}
        for(var i=0;i<sorted.length;i++){
            var tx=sorted[i];
            var hr=tx.date.getHours();
            var rub=tx.rub;if(tx.usd>0)rub=tx.usd*currentUsdRate;
            if(tx.type==='income')incomeBuckets[hr]+=rub;
            else expenseBuckets[hr]+=rub;
        }
    } else if(period==='week'){
        var byDay={};
        for(var i=0;i<sorted.length;i++){
            var tx=sorted[i];
            var key=tx.date.getFullYear()+'-'+pad(tx.date.getMonth()+1)+'-'+pad(tx.date.getDate());
            if(!byDay[key])byDay[key]={income:0,expense:0,date:tx.date};
            var rub=tx.rub;if(tx.usd>0)rub=tx.usd*currentUsdRate;
            if(tx.type==='income')byDay[key].income+=rub;
            else byDay[key].expense+=rub;
        }
        var keys=Object.keys(byDay).sort();
        for(var i=0;i<keys.length;i++){
            var parts=keys[i].split('-');
            labels.push(parts[2]+'.'+parts[1]);
            incomeBuckets.push(byDay[keys[i]].income);
            expenseBuckets.push(byDay[keys[i]].expense);
        }
    } else if(period==='month'){
        var weeks=[
            {label:'1-7',income:0,expense:0},
            {label:'8-14',income:0,expense:0},
            {label:'15-21',income:0,expense:0},
            {label:'22-28',income:0,expense:0},
            {label:'29+',income:0,expense:0}
        ];
        for(var i=0;i<sorted.length;i++){
            var tx=sorted[i];
            var day=tx.date.getDate();
            var idx=Math.min(Math.floor((day-1)/7),4);
            var rub=tx.rub;if(tx.usd>0)rub=tx.usd*currentUsdRate;
            if(tx.type==='income')weeks[idx].income+=rub;
            else weeks[idx].expense+=rub;
        }
        for(var i=0;i<5;i++){
            labels.push(weeks[i].label);
            incomeBuckets.push(weeks[i].income);
            expenseBuckets.push(weeks[i].expense);
        }
    } else {
        var byMonth={};
        var monthNames=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        for(var i=0;i<sorted.length;i++){
            var tx=sorted[i];
            var key=tx.date.getFullYear()+'-'+pad(tx.date.getMonth()+1);
            if(!byMonth[key])byMonth[key]={income:0,expense:0,date:tx.date};
            var rub=tx.rub;if(tx.usd>0)rub=tx.usd*currentUsdRate;
            if(tx.type==='income')byMonth[key].income+=rub;
            else byMonth[key].expense+=rub;
        }
        var keys=Object.keys(byMonth).sort();
        for(var i=0;i<keys.length;i++){
            var d=byMonth[keys[i]].date;
            labels.push(monthNames[d.getMonth()]+' '+String(d.getFullYear()).slice(2));
            incomeBuckets.push(byMonth[keys[i]].income);
            expenseBuckets.push(byMonth[keys[i]].expense);
        }
    }

    var cumIncome=[], cumExpense=[];
    var runI=incomeBefore, runE=expenseBefore;
    for(var i=0;i<incomeBuckets.length;i++){
        runI+=incomeBuckets[i];
        runE+=expenseBuckets[i];
        cumIncome.push(roundRub(runI));
        cumExpense.push(roundRub(runE));
    }

    var showPoints=labels.length<=8;
    var theme=getChartTheme();
    balanceHistoryChart=new Chart(c.getContext('2d'),{
        type:'line',
        data:{
            labels:labels,
            datasets:[
                {
                    label:'Доход',
                    data:cumIncome,
                    borderColor:theme.green,
                    backgroundColor:'rgba(34,197,94,0.15)',
                    borderWidth:3,
                    pointBackgroundColor:theme.green,
                    pointBorderColor:theme.green,
                    pointRadius:showPoints?4:0,
                    pointHoverRadius:5,
                    tension:0.4,
                    fill:true
                },
                {
                    label:'Расход',
                    data:cumExpense,
                    borderColor:theme.red,
                    backgroundColor:'rgba(239,68,68,0.12)',
                    borderWidth:3,
                    pointBackgroundColor:theme.red,
                    pointBorderColor:theme.red,
                    pointRadius:showPoints?4:0,
                    pointHoverRadius:5,
                    tension:0.4,
                    fill:true
                }
            ]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            interaction:{mode:'index',intersect:false},
            plugins:{
                legend:{display:true,labels:{color:theme.textMuted,boxWidth:10,boxHeight:10,font:{size:10},padding:8,usePointStyle:true,pointStyle:'circle'}},
                tooltip:{
                    backgroundColor:'#1c2230',
                    borderColor:'#2c3444',
                    borderWidth:1,
                    titleColor:'#f2f5fa',
                    bodyColor:'#f2f5fa',
                    callbacks:{
                        label:function(ctx){return ctx.dataset.label+': '+roundRub(ctx.parsed.y).toLocaleString('ru-RU')+' ₽';},
                        afterBody:function(items){
                            if(!items.length)return '';
                            var inc=cumIncome[items[0].dataIndex];
                            var exp=cumExpense[items[0].dataIndex];
                            var bal=inc-exp;
                            return 'Баланс: '+roundRub(bal).toLocaleString('ru-RU')+' ₽';
                        }
                    }
                }
            },
            scales:{
                y:{
                    grid:{color:theme.grid},
                    ticks:{color:theme.textMuted,callback:function(v){
                        if(Math.abs(v)>=1000000)return (v/1000000).toFixed(1)+'M';
                        if(Math.abs(v)>=1000)return (v/1000).toFixed(0)+'k';
                        return v;
                    }}
                },
                x:{
                    grid:{color:theme.grid},
                    ticks:{color:theme.textMuted,maxTicksLimit:8,maxRotation:0,autoSkip:true,font:{size:10}}
                }
            }
        }
    });
}

function drawRateHistoryChart(){
    var c=$('rateHistoryChart');if(!c)return;
    if(rateHistoryChart){rateHistoryChart.destroy();rateHistoryChart=null;}
    var ctx=c.getContext('2d');var theme=getChartTheme();
    if(rateHistory.length<2){
        rateHistoryChart=new Chart(ctx,{type:'line',data:{labels:[],datasets:[{label:'Курс',data:[],borderColor:theme.accent,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:theme.textMuted}}}}});
        return;
    }

    // Определяем общий тренд: сравниваем первый и последний курс
    var firstRate=rateHistory[0].rate;
    var lastRate=rateHistory[rateHistory.length-1].rate;
    var isRising=lastRate>=firstRate;

    var lineColor=isRising?'#22c55e':'#ef4444';
    var fillTop=isRising?'rgba(34,197,94,0.28)':'rgba(239,68,68,0.28)';
    var fillBottom=isRising?'rgba(34,197,94,0.01)':'rgba(239,68,68,0.01)';

    // Градиент под линией
    var gradient=ctx.createLinearGradient(0,0,0,180);
    gradient.addColorStop(0,fillTop);
    gradient.addColorStop(1,fillBottom);

    rateHistoryChart=new Chart(ctx,{
        type:'line',
        data:{
            labels:rateHistory.map(function(x){return x.date.toLocaleDateString('ru-RU')+' '+x.date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}),
            datasets:[{
                label:'Курс USD/RUB',
                data:rateHistory.map(function(x){return x.rate;}),
                borderColor:lineColor,
                backgroundColor:gradient,
                borderWidth:3,
                pointRadius:0,
                pointHoverRadius:6,
                pointHoverBackgroundColor:lineColor,
                pointHoverBorderColor:'#fff',
                pointHoverBorderWidth:2,
                tension:0.45,
                fill:true,
                cubicInterpolationMode:'monotone'
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            interaction:{mode:'index',intersect:false},
            plugins:{
                legend:{display:false},
                tooltip:{
                    backgroundColor:'#1c2230',
                    borderColor:'#2c3444',
                    borderWidth:1,
                    titleColor:'#f2f5fa',
                    bodyColor:'#f2f5fa',
                    callbacks:{label:function(c){return c.parsed.y.toFixed(2)+' ₽';}}
                }
            },
            scales:{
                y:{
                    grid:{color:theme.grid},
                    ticks:{color:theme.textMuted,callback:function(v){return v.toFixed(2)+' ₽';}}
                },
                x:{
                    grid:{color:theme.grid},
                    ticks:{color:theme.textMuted,maxTicksLimit:6,maxRotation:30,autoSkip:true,font:{size:9}}
                }
            }
        }
    });
}
function setRate(rate){
    if(isNaN(rate)||rate<=0){alert('Введите корректный курс');return;}
    var old=currentUsdRate;currentUsdRate=rate;saveRate(rate);
    $('rateInfo').textContent='1 USD = '+rate.toFixed(2)+' ₽';
    $('rateInfoSmall').textContent=rate.toFixed(2)+' ₽';
    var diff=((rate-old)/old*100).toFixed(2);
    var rc=$('rateChangeInfo');
    rc.textContent=diff>=0?'📈 +'+diff+'%':'📉 '+diff+'%';
    rc.style.background=diff>=0?'var(--green-bg)':'var(--red-bg)';
    rc.style.color=diff>=0?'var(--green)':'var(--red)';
    updateWithFilter(currentFilter);
}
function fetchLiveRate(){
    return fetch('https://open.er-api.com/v6/latest/USD',{cache:'no-store'})
        .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .then(function(data){
            if(data.result!=='success'||!data.rates||!data.rates.RUB)throw new Error('Invalid response');
            var rubRate=data.rates.RUB;
            if(isNaN(rubRate)||rubRate<=0)throw new Error('Invalid rate');
            return {rate:rubRate,updatedAt:data.time_last_update_utc||''};
        });
}
function updateRateFromAPI(){
    var btn=$('fetchRateBtn');
    if(btn){btn.disabled=true;btn.textContent='⏳ Загрузка...';}
    $('fileStatus').textContent='🌐 Запрос курса...';
    fetchLiveRate()
        .then(function(res){
            setRate(res.rate);
            $('usdRateInput').value=res.rate.toFixed(2);
            $('fileStatus').textContent='✅ Курс: '+res.rate.toFixed(2)+' ₽';
            var now=new Date();
            var alreadyToday=rateHistory.some(function(h){return h.date.toDateString()===now.toDateString()&&Math.abs(h.rate-res.rate)<0.001;});
            if(!alreadyToday){rateHistory.push({date:now,rate:res.rate});saveRateHistory(rateHistory);drawRateHistoryChart();}
            markSynced();renderRateFreshness();renderCbrRate();
            pushRateToGitHub();
        })
        .catch(function(e){$('fileStatus').textContent='❌ '+e.message;})
        .finally(function(){if(btn){btn.disabled=false;btn.textContent='🔄 Онлайн';}});
}
function pushRateToGitHub(){
    var token=getToken();
    if(!token){$('fileStatus').textContent='⚠️ Курс обновлён локально.';return Promise.resolve(false);}
    var lines=rateHistory.map(function(h){
        var d=pad(h.date.getDate()),mo=pad(h.date.getMonth()+1),y=h.date.getFullYear();
        var hh=pad(h.date.getHours()),mi=pad(h.date.getMinutes());
        return d+'.'+mo+'.'+y+', '+hh+':'+mi+' | '+h.rate.toFixed(2);
    });
    var newText=lines.join('\n');
    var updatedJson=JSON.stringify({text:newText});
    var updatedB64=btoa(unescape(encodeURIComponent(updatedJson)));
    function attempt(retriesLeft){
        return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/rate.json',{headers:{'Authorization':'token '+token},cache:'no-store'})
            .then(function(r){if(r.status===404)return{sha:null};if(!r.ok)throw new Error('GET: '+r.status);return r.json();})
            .then(function(meta){
                var body={message:'Курс '+currentUsdRate.toFixed(2)+' ₽ ('+rateHistory.length+')',content:updatedB64};
                if(meta.sha)body.sha=meta.sha;
                return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/rate.json',{
                    method:'PUT',
                    headers:{'Authorization':'token '+token,'Content-Type':'application/json'},
                    body:JSON.stringify(body)
                });
            })
            .then(function(r){
                if(r.status===409&&retriesLeft>0)return attempt(retriesLeft-1);
                if(!r.ok)throw new Error('PUT: '+r.status);
                return r.json();
            });
    }
    return attempt(3).then(function(){markSynced();renderRateFreshness();return true;}).catch(function(){return false;});
}

function loadData(showStatus){
    if(showStatus)$('fileStatus').textContent='⏳ Загрузка...';
    return fetch('stats2.json?t='+Date.now(),{cache:'no-store'})
        .then(function(r){if(!r.ok)throw new Error('not found');return r.text();})
        .then(function(txt){
            var txs=parseData(txt);
            if(txs.length){
                var local=loadTransactions()||[];
                var merged=mergeTransactions(local,txs);
                initData(merged);markSynced();
                if(showStatus)$('fileStatus').textContent='✅ Загружено: '+merged.length;
                return true;
            }
            throw new Error('empty');
        })
        .catch(function(){
            var stored=loadTransactions();
            if(stored&&stored.length){initData(stored);if(showStatus)$('fileStatus').textContent='📂 Из кэша: '+stored.length;return true;}
            if(showStatus)$('fileStatus').textContent='📂 Нет данных';
            return false;
        });
}
function loadRateHistoryFromServer(showStatus){
    if(showStatus)$('fileStatus').textContent='⏳ Загрузка rate.json...';
    return fetch('https://raw.githubusercontent.com/arturskvortsov-boop/finance-dashboard/main/rate.json?t='+Date.now(),{cache:'no-store'})
        .then(function(r){if(!r.ok)throw new Error('not found');return r.text();})
        .then(function(txt){
            var history=[];
            try{var j=JSON.parse(txt);history=j.text?parseRateHistory(j.text):parseRateHistory(txt);}
            catch(e){history=parseRateHistory(txt);}
            if(history.length){
                rateHistory=history;saveRateHistory(history);setRate(history[history.length-1].rate);
                $('usdRateInput').value=history[history.length-1].rate.toFixed(2);
                if(showStatus)$('fileStatus').textContent='✅ Курс: '+history.length;
                drawRateHistoryChart();renderRateFreshness();
                return true;
            }
            throw new Error('empty');
        })
        .catch(function(){
            var stored=loadRateHistory();
            if(stored&&stored.length){rateHistory=stored;setRate(stored[stored.length-1].rate);$('usdRateInput').value=stored[stored.length-1].rate.toFixed(2);drawRateHistoryChart();renderRateFreshness();return true;}
            return false;
        });
}

function fillCategories(type,selectId){
    var list=type==='income'?CATEGORIES_INCOME:CATEGORIES_EXPENSE;
    var sel=$(selectId);sel.innerHTML='';
    for(var i=0;i<list.length;i++){
        var o=document.createElement('option');o.value=list[i];o.textContent=list[i];sel.appendChild(o);
    }
}

/* ===== TX MODAL ===== */
function repeatLastTransaction(){
    if(!allTransactions.length){showToast('ℹ️ Нет транзакций для повтора');return;}
    var latest=null;
    for(var i=0;i<allTransactions.length;i++){
        if(!latest||allTransactions[i].date>latest.date)latest=allTransactions[i];
    }
    if(!latest){showToast('ℹ️ Нет данных');return;}
    openTxModal(-1,latest.type,{
        type:latest.type,
        rub:latest.rub,
        usd:latest.usd,
        category:latest.category,
        note:(latest.note&&latest.note!=='-')?latest.note:''
    });
    showToast('🔁 Повтор: '+latest.category,2000);
}

function openTxModal(editIdx,presetType,presetData){
    editingIndex=(typeof editIdx==='number')?editIdx:-1;
    var title=$('txModalTitle');
    var isNew=(editingIndex<0);
    if($('saveAsTemplateRow'))$('saveAsTemplateRow').classList.toggle('hidden',!isNew);
    if($('templateNameRow'))$('templateNameRow').classList.add('hidden');
    if($('templateDayRow'))$('templateDayRow').classList.add('hidden');
    if($('saveAsTemplate'))$('saveAsTemplate').checked=false;
    if($('txTemplateName'))$('txTemplateName').value='';
    if($('txTemplateDay'))$('txTemplateDay').value='';
    if(editingIndex>=0){
        var tx=allTransactions[editingIndex];
        title.textContent='✏️ Редактировать';
        currentTxType=tx.type;
        var btns=document.querySelectorAll('#txModal .type-btn');
        for(var i=0;i<btns.length;i++)btns[i].classList.toggle('active',btns[i].dataset.type===tx.type);
        fillCategories(tx.type,'txCategory');
        $('txRub').value=tx.rub||'';
        $('txUsd').value=tx.usd||'';
        $('txNote').value=(tx.note&&tx.note!=='-')?tx.note:'';
        var d=tx.date;
        $('txDateTime').value=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
        if(tx.category){
            var exists=false;var opts=$('txCategory').options;
            for(var i=0;i<opts.length;i++)if(opts[i].value===tx.category){exists=true;break;}
            if(!exists){var o=document.createElement('option');o.value=tx.category;o.textContent=tx.category;$('txCategory').appendChild(o);}
            $('txCategory').value=tx.category;
        }
    } else {
        title.textContent='➕ Новая транзакция';
        currentTxType=(presetData&&presetData.type)||presetType||'income';
        var btns=document.querySelectorAll('#txModal .type-btn');
        for(var i=0;i<btns.length;i++)btns[i].classList.toggle('active',btns[i].dataset.type===currentTxType);
        fillCategories(currentTxType,'txCategory');
        $('txRub').value=(presetData&&presetData.rub)||'';
        $('txUsd').value=(presetData&&presetData.usd)||'';
        $('txNote').value=(presetData&&presetData.note)||'';
        if(presetData&&presetData.category){
            var exists=false;var opts=$('txCategory').options;
            for(var i=0;i<opts.length;i++)if(opts[i].value===presetData.category){exists=true;break;}
            if(!exists){var o=document.createElement('option');o.value=presetData.category;o.textContent=presetData.category;$('txCategory').appendChild(o);}
            $('txCategory').value=presetData.category;
        }
        var now=new Date();
        now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
        $('txDateTime').value=now.toISOString().slice(0,16);
    }
    $('txModal').classList.add('open');
    lockBackground();
}
function closeTxModal(){$('txModal').classList.remove('open');editingIndex=-1;unlockBackground();}
function editTransaction(i){openTxModal(i);}
function deleteTransaction(i){
    var tx=allTransactions[i];if(!tx)return;
    if(!confirm('Удалить транзакцию?\n'+tx.category+'\n'+tx.rub+' ₽'))return;
    allTransactions.splice(i,1);saveTransactions(allTransactions);updateWithFilter(currentFilter);
    $('fileStatus').textContent='🗑️ Удалено';
    scheduleAutoSync();
}

/* ===== CATEGORY DETAIL ===== */
function openCategoryDetail(type){
    var filtered=filterTransactions(allTransactions,currentFilter);
    var catList=aggregateByCategory(filtered,type);
    if(!catList.length){alert('Нет данных за выбранный период');return;}
    var total=0;for(var i=0;i<catList.length;i++)total+=catList[i].value;
    var periodNames={day:'Сегодня',week:'За 7 дней',month:'За месяц',all:'За всё время'};
    var typeName=type==='expense'?'Расходы':'Доходы';
    $('catDetailTitle').textContent=typeName+' '+periodNames[currentFilter].toLowerCase();
    $('catDetailTotal').textContent=roundRub(total).toLocaleString('ru-RU')+' ₽';
    $('catDetailTotalLabel').textContent=type==='expense'?'всего расходов':'всего доходов';
    var top=catList[0];var topPct=((top.value/total)*100).toFixed(1);
    $('catDetailTopCat').textContent=top.label;
    $('catDetailTopDesc').textContent=roundRub(top.value).toLocaleString('ru-RU')+' ₽ · '+topPct+'% всех '+(type==='expense'?'расходов':'доходов');
    if(catDetailDonut){catDetailDonut.destroy();catDetailDonut=null;}
    var colors=catList.map(function(_,i){return COLORS[i%COLORS.length];});
    var theme=getChartTheme();
    catDetailDonut=new Chart($('catDetailDonut'),{
        type:'doughnut',
        data:{labels:catList.map(function(x){return x.label;}),datasets:[{data:catList.map(function(x){return x.value;}),backgroundColor:colors,borderColor:theme.card,borderWidth:2}]},
        options:{responsive:true,maintainAspectRatio:true,cutout:'65%',plugins:{legend:{display:false},tooltip:{enabled:false}}}
    });
    var listEl=$('catDetailList');listEl.innerHTML='';
    for(var i=0;i<catList.length;i++){
        var x=catList[i];var pct=(x.value/total)*100;
        var item=document.createElement('div');item.className='cdl-item';
        item.innerHTML='<div class="cdl-row"><div class="cdl-left"><span class="cdl-dot" style="background:'+colors[i]+'"></span><span class="cdl-name">'+x.label+'</span></div><div class="cdl-right"><span class="cdl-amount">'+roundRub(x.value).toLocaleString('ru-RU')+' ₽</span><span class="cdl-percent">'+pct.toFixed(1)+'%</span></div></div><div class="cdl-bar"><div class="cdl-bar-fill" style="width:'+pct+'%;background:'+colors[i]+'"></div></div>';
        listEl.appendChild(item);
    }
    $('catDetailModal').classList.add('open');
    lockBackground();
}
function closeCatDetail(){
    $('catDetailModal').classList.remove('open');
    if(catDetailDonut){catDetailDonut.destroy();catDetailDonut=null;}
    unlockBackground();
}

/* ===== AUTO UPDATE ===== */
function startAutoUpdate(){
    if(autoUpdateTimer)clearInterval(autoUpdateTimer);
    autoUpdateTimer=setInterval(function(){
        if(!dataLoaded)return;
        fetch('stats2.json?t='+Date.now(),{cache:'no-store'})
            .then(function(r){if(!r.ok)throw 0;return r.text();})
            .then(function(txt){
                var remote=parseData(txt);if(!remote.length)return;
                var merged=mergeTransactions(allTransactions,remote);
                if(merged.length!==allTransactions.length){
                    allTransactions=merged;saveTransactions(allTransactions);updateWithFilter(currentFilter);
                }
            })
            .catch(function(){});
    },60000);
}

/* ===== СИНХРОНИЗАЦИЯ JSON-ФАЙЛОВ ===== */
function fetchJsonFile(path){
    return fetch('https://raw.githubusercontent.com/arturskvortsov-boop/finance-dashboard/main/'+path+'?t='+Date.now(),{cache:'no-store'})
        .then(function(r){if(r.status===404)return null;if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .catch(function(){return null;});
}
function putJsonFile(path,data,message){
    var token=getToken();
    if(!token)return Promise.resolve(false);
    var json=JSON.stringify(data,null,2);
    var b64=btoa(unescape(encodeURIComponent(json)));
    function attempt(retriesLeft){
        return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/'+path,{headers:{'Authorization':'token '+token},cache:'no-store'})
            .then(function(r){if(r.status===404)return{sha:null};if(!r.ok)throw new Error('GET: '+r.status);return r.json();})
            .then(function(meta){
                var body={message:message||('Update '+path),content:b64};
                if(meta.sha)body.sha=meta.sha;
                return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/'+path,{
                    method:'PUT',
                    headers:{'Authorization':'token '+token,'Content-Type':'application/json'},
                    body:JSON.stringify(body)
                });
            })
            .then(function(r){
                if(r.status===409&&retriesLeft>0){return new Promise(function(res){setTimeout(res,600);}).then(function(){return attempt(retriesLeft-1);});}
                if(!r.ok)throw new Error('PUT: '+r.status);
                return r.json();
            });
    }
    return attempt(4);
}
function mergeById(local,remote){
    var seen={};
    var merged=[];
    for(var i=0;i<local.length;i++){if(local[i].id)seen[local[i].id]=true;merged.push(local[i]);}
    for(var i=0;i<remote.length;i++){if(remote[i].id&&!seen[remote[i].id]){seen[remote[i].id]=true;merged.push(remote[i]);}}
    return merged;
}
function mergeBudgets(local,remote){
    var seen={};
    var merged=[];
    for(var i=0;i<local.length;i++){if(local[i].category)seen[local[i].category]=true;merged.push(local[i]);}
    for(var i=0;i<remote.length;i++){if(remote[i].category&&!seen[remote[i].category]){seen[remote[i].category]=true;merged.push(remote[i]);}}
    return merged;
}
function syncTemplates(){
    if(!getToken())return Promise.resolve(false);
    return putJsonFile(TEMPLATES_FILE,templates,'Шаблоны ('+templates.length+')').catch(function(){return false;});
}
function syncBudgets(){
    if(!getToken())return Promise.resolve(false);
    return putJsonFile(BUDGETS_FILE,budgets,'Бюджеты ('+budgets.length+')').catch(function(){return false;});
}
function syncGoals(){
    if(!getToken())return Promise.resolve(false);
    return putJsonFile(GOALS_FILE,goals,'Цели ('+goals.length+')').catch(function(){return false;});
}
function loadTemplatesFromServer(){
    return fetchJsonFile(TEMPLATES_FILE).then(function(data){
        if(!data||!Array.isArray(data))return false;
        templates=mergeById(templates,data);
        saveTemplates();
        return true;
    });
}
function loadBudgetsFromServer(){
    return fetchJsonFile(BUDGETS_FILE).then(function(data){
        if(!data||!Array.isArray(data))return false;
        budgets=mergeBudgets(budgets,data);
        saveBudgets();
        return true;
    });
}
function loadGoalsFromServer(){
    return fetchJsonFile(GOALS_FILE).then(function(data){
        if(!data||!Array.isArray(data))return false;
        goals=mergeById(goals,data);
        saveGoals();
        return true;
    });
}
function syncAllExtras(){
    if(!getToken())return;
    syncTemplates();
    syncBudgets();
    syncGoals();
}

/* ===== АВТОСИНХРОНИЗАЦИЯ ===== */
function scheduleAutoSync(){
    if(!getToken())return;
    if(!allTransactions.length)return;
    if(autoSyncTimer)clearTimeout(autoSyncTimer);
    autoSyncTimer=setTimeout(function(){silentSync();},2000);
}

var extrasSyncTimer=null;
function scheduleSyncExtras(){
    if(!getToken())return;
    if(extrasSyncTimer)clearTimeout(extrasSyncTimer);
    extrasSyncTimer=setTimeout(function(){syncAllExtras();},1500);
}


function silentSync(){
    if(!getToken())return;
    if(!allTransactions.length)return;
    var token=getToken();
    var sorted=allTransactions.slice().sort(function(a,b){return a.date-b.date;});
    var lines=[];
    for(var i=0;i<sorted.length;i++){
        var tx=sorted[i];
        var d=pad(tx.date.getDate()),mo=pad(tx.date.getMonth()+1),y=tx.date.getFullYear(),h=pad(tx.date.getHours()),mi=pad(tx.date.getMinutes());
        var dateStr=d+'.'+mo+'.'+y+', '+h+':'+mi;
        var typeLabel=tx.type==='income'?'🟢 ДОХОД':'🔴 РАСХОД';
        var usdLabel=tx.usd>0?tx.usd+' Долларов 🇺🇸':'0 Долларов 🇺🇸';
        var rubLabel=tx.rub+' Рублей 🇷🇺';
        lines.push(typeLabel+' | '+dateStr+' | '+usdLabel+'  -> '+rubLabel+' | '+tx.category+' | '+(tx.note||'-'));
    }
    var newText=lines.join('\n');
    var updatedJson=JSON.stringify({text:newText});
    var updatedB64=btoa(unescape(encodeURIComponent(updatedJson)));
    function attempt(retriesLeft){
        return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/stats2.json',{headers:{'Authorization':'token '+token},cache:'no-store'})
            .then(function(r){if(!r.ok)throw new Error('GET: '+r.status);return r.json();})
            .then(function(meta){
                return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/stats2.json',{
                    method:'PUT',
                    headers:{'Authorization':'token '+token,'Content-Type':'application/json'},
                    body:JSON.stringify({message:'Автосинхронизация ('+allTransactions.length+')',content:updatedB64,sha:meta.sha})
                });
            })
            .then(function(r){
                if(r.status===409&&retriesLeft>0){return new Promise(function(resolve){setTimeout(resolve,600);}).then(function(){return attempt(retriesLeft-1);});}
                if(!r.ok)throw new Error('PUT: '+r.status);
                return r.json();
            });
    }
    return attempt(4)
        .then(function(){
            markSynced();
            var fs=$('fileStatus');
            if(fs)fs.textContent='☁️ Сохранено: '+allTransactions.length;
        })
        .catch(function(e){
            var fs=$('fileStatus');
            if(fs)fs.textContent='⚠️ '+e.message;
        });
}

/* ===== SETTINGS ===== */
function updateTokenStatus(){
    var el=$('tokenStatus');if(!el)return;
    var t=getToken();
    if(t){el.textContent='✓ '+t.slice(0,7)+'...'+t.slice(-4);el.style.color='var(--green)';}
    else{el.textContent='не задан';el.style.color='var(--text-muted)';}
}
function renderSettingsStats(){
    if($('settingsTxCount'))$('settingsTxCount').textContent=allTransactions.length;
    if($('settingsRateCount'))$('settingsRateCount').textContent=rateHistory.length;
    if($('settingsLastSync')){var ts=getLastSync();$('settingsLastSync').textContent=ts?timeAgo(ts):'—';}
    if($('settingsUserId'))$('settingsUserId').textContent=userId||'—';
}

/* ===== TEMPLATES ===== */
function renderTemplatesList(containerId,mode){
    var container=$(containerId);if(!container)return;
    container.innerHTML='';
    if(!templates.length){
        var empty=document.createElement('div');empty.className='template-empty';
        empty.textContent=mode==='quick'?'Пока нет шаблонов.\nСоздайте первый через ⚙️ Настройки.':'Нет шаблонов.\nСоздайте первый кнопкой ниже.';
        container.appendChild(empty);return;
    }
    for(var i=0;i<templates.length;i++){
        var tpl=templates[i];
        var item=document.createElement('div');item.className='template-item';
        var dot=document.createElement('span');dot.className='tpl-dot '+(tpl.type==='income'?'income':'expense');
        var info=document.createElement('div');info.className='tpl-info';
        var nameEl=document.createElement('div');nameEl.className='tpl-name';nameEl.textContent=tpl.name;
        var metaEl=document.createElement('div');metaEl.className='tpl-meta';
        var metaParts=[];if(tpl.category)metaParts.push(tpl.category);if(tpl.dayOfMonth)metaParts.push(tpl.dayOfMonth+'-е число');
        metaEl.textContent=metaParts.join(' · ');
        info.appendChild(nameEl);info.appendChild(metaEl);
        var amt=document.createElement('div');amt.className='tpl-amount '+(tpl.type==='income'?'income':'expense');
        var sumText=(tpl.rub>0?roundRub(tpl.rub).toLocaleString('ru-RU')+' ₽':(tpl.usd>0?tpl.usd.toFixed(2)+' $':'-'));
        amt.textContent=(tpl.type==='income'?'+':'-')+sumText;
        item.appendChild(dot);item.appendChild(info);item.appendChild(amt);
        if(mode==='quick'){
            (function(id){item.addEventListener('click',function(){applyTemplate(id);});})(tpl.id);
        } else {
            var actions=document.createElement('div');actions.className='tpl-actions';
            var eBtn=document.createElement('button');eBtn.textContent='✏️';
            (function(id){eBtn.addEventListener('click',function(e){e.stopPropagation();openTemplateEditModal(id);});})(tpl.id);
            var dBtn=document.createElement('button');dBtn.textContent='🗑️';
            (function(id){dBtn.addEventListener('click',function(e){e.stopPropagation();deleteTemplate(id);});})(tpl.id);
            actions.appendChild(eBtn);actions.appendChild(dBtn);item.appendChild(actions);
        }
        container.appendChild(item);
    }
}
function openQuickAddModal(){renderTemplatesList('quickAddTemplatesList','quick');$('quickAddModal').classList.add('open');lockBackground();}
function closeQuickAddModal(){$('quickAddModal').classList.remove('open');unlockBackground();}
function applyTemplate(id){
    var tpl=null;for(var i=0;i<templates.length;i++)if(templates[i].id===id){tpl=templates[i];break;}
    if(!tpl)return;
    closeQuickAddModal();
    closeMoreSheet();
    setTimeout(function(){openTxModal(-1,tpl.type,{type:tpl.type,rub:tpl.rub,usd:tpl.usd,category:tpl.category,note:tpl.note});},250);
}
function openTemplateEditModal(id){
    editingTemplateId=id||null;
    var title=$('templateEditTitle');
    if(id){
        var tpl=null;for(var i=0;i<templates.length;i++)if(templates[i].id===id){tpl=templates[i];break;}
        if(!tpl)return;
        title.textContent='✏️ Редактировать шаблон';
        currentTplType=tpl.type;
        $('tplName').value=tpl.name;$('tplRub').value=tpl.rub||'';$('tplUsd').value=tpl.usd||'';
        $('tplNote').value=tpl.note||'';$('tplDay').value=tpl.dayOfMonth||'';
        fillCategories(tpl.type,'tplCategory');
        var exists=false;var opts=$('tplCategory').options;
        for(var j=0;j<opts.length;j++)if(opts[j].value===tpl.category){exists=true;break;}
        if(!exists){var o=document.createElement('option');o.value=tpl.category;o.textContent=tpl.category;$('tplCategory').appendChild(o);}
        $('tplCategory').value=tpl.category;
    } else {
        title.textContent='🔁 Новый шаблон';
        currentTplType='expense';
        $('tplName').value='';$('tplRub').value='';$('tplUsd').value='';$('tplNote').value='';$('tplDay').value='';
        fillCategories('expense','tplCategory');
    }
    var btns=document.querySelectorAll('#templateEditModal .type-btn');
    for(var i=0;i<btns.length;i++)btns[i].classList.toggle('active',btns[i].dataset.type===currentTplType);
    $('templateEditModal').classList.add('open');
    lockBackground();
}
function closeTemplateEditModal(){$('templateEditModal').classList.remove('open');editingTemplateId=null;unlockBackground();}
function saveTemplate(){
    var name=$('tplName').value.trim();
    var rub=parseFloat($('tplRub').value)||0;
    var usd=parseFloat($('tplUsd').value)||0;
    var category=$('tplCategory').value;
    var note=$('tplNote').value.trim()||'';
    var day=parseInt($('tplDay').value)||0;
    if(!name){alert('Введите название шаблона');return;}
    if(rub<=0&&usd<=0){alert('Введите хотя бы одну сумму');return;}
    if(day<0||day>31){alert('День месяца должен быть от 1 до 31');return;}
    if(editingTemplateId){
        for(var i=0;i<templates.length;i++)if(templates[i].id===editingTemplateId){
            templates[i].name=name;templates[i].type=currentTplType;templates[i].rub=rub;
            templates[i].usd=usd;templates[i].category=category;templates[i].note=note;templates[i].dayOfMonth=day;break;
        }
        $('fileStatus').textContent='✏️ Шаблон обновлён';
    } else {
        templates.push({id:'tpl_'+Date.now()+'_'+Math.floor(Math.random()*1000),name:name,type:currentTplType,rub:rub,usd:usd,category:category,note:note,dayOfMonth:day});
        $('fileStatus').textContent='➕ Шаблон создан';
    }
    saveTemplates();renderTemplatesList('settingsTemplatesList','settings');closeTemplateEditModal();
    scheduleSyncExtras();
}
function deleteTemplate(id){
    var tpl=null;for(var i=0;i<templates.length;i++)if(templates[i].id===id){tpl=templates[i];break;}
    if(!tpl)return;
    if(!confirm('Удалить шаблон «'+tpl.name+'»?'))return;
    templates=templates.filter(function(t){return t.id!==id;});
    saveTemplates();renderTemplatesList('settingsTemplatesList','settings');
    if($('quickAddModal').classList.contains('open'))renderTemplatesList('quickAddTemplatesList','quick');
    $('fileStatus').textContent='🗑️ Шаблон удалён';
    scheduleSyncExtras();
}

/* ===== BUDGETS ===== */
function getCurrentMonthExpenses(){
    var now=new Date();
    var monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    var monthEnd=new Date(now.getFullYear(),now.getMonth()+1,1);
    var map={};
    for(var i=0;i<allTransactions.length;i++){
        var tx=allTransactions[i];
        if(tx.type!=='expense')continue;
        if(tx.date<monthStart||tx.date>=monthEnd)continue;
        var c=tx.category||'Без категории';map[c]=(map[c]||0)+tx.rub;
    }
    return map;
}
function renderBudgets(){
    var block=$('budgetsBlock');var listEl=$('budgetsList');
    if(!block||!listEl)return;
    if(!budgets.length){block.classList.add('hidden');return;}
    block.classList.remove('hidden');
    var now=new Date();
    var monthNames=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    if($('budgetsMonthLabel'))$('budgetsMonthLabel').textContent=monthNames[now.getMonth()]+' '+now.getFullYear();
    var expenses=getCurrentMonthExpenses();listEl.innerHTML='';
    var sorted=budgets.slice().sort(function(a,b){return a.category.localeCompare(b.category);});
    for(var i=0;i<sorted.length;i++){
        var b=sorted[i];var spent=expenses[b.category]||0;var limit=b.limit||0;
        var pct=limit>0?(spent/limit)*100:0;var pctCapped=Math.min(pct,100);var remaining=limit-spent;
        var cls='safe';if(pct>=90)cls='danger';else if(pct>=70)cls='warn';
        var item=document.createElement('div');item.className='budget-item';
        var row=document.createElement('div');row.className='budget-row';
        var catEl=document.createElement('span');catEl.className='budget-cat';catEl.textContent=b.category;
        var nums=document.createElement('span');nums.className='budget-nums'+(pct>=90?' over':'');
        nums.textContent=roundRub(spent).toLocaleString('ru-RU')+' / '+roundRub(limit).toLocaleString('ru-RU')+' ₽';
        row.appendChild(catEl);row.appendChild(nums);
        var bar=document.createElement('div');bar.className='budget-bar';
        var fill=document.createElement('div');fill.className='budget-bar-fill '+cls;fill.style.width=pctCapped.toFixed(1)+'%';
        bar.appendChild(fill);
        var sub=document.createElement('div');sub.className='budget-sub';
        var leftSpan=document.createElement('span');
        if(remaining<0){leftSpan.className='over-text';leftSpan.textContent='превышен на '+roundRub(Math.abs(remaining)).toLocaleString('ru-RU')+' ₽';}
        else{leftSpan.className='left-text';leftSpan.textContent='осталось '+roundRub(remaining).toLocaleString('ru-RU')+' ₽';}
        var pctSpan=document.createElement('span');pctSpan.textContent=Math.round(pct)+'%';
        sub.appendChild(leftSpan);sub.appendChild(pctSpan);
        item.appendChild(row);item.appendChild(bar);item.appendChild(sub);
        listEl.appendChild(item);
    }
}
function renderSettingsBudgetsList(){
    var container=$('settingsBudgetsList');if(!container)return;
    container.innerHTML='';
    if(!budgets.length){
        var empty=document.createElement('div');empty.className='template-empty';
        empty.textContent='Бюджеты не заданы.\nДобавьте первый, нажав кнопку ниже.';
        container.appendChild(empty);return;
    }
    for(var i=0;i<budgets.length;i++){
        var b=budgets[i];
        var item=document.createElement('div');item.className='budget-manage-item';
        var info=document.createElement('div');info.className='bmi-info';
        var catEl=document.createElement('div');catEl.className='bmi-cat';catEl.textContent=b.category;
        var limEl=document.createElement('div');limEl.className='bmi-limit';
        limEl.textContent='Лимит: '+roundRub(b.limit).toLocaleString('ru-RU')+' ₽ / мес';
        info.appendChild(catEl);info.appendChild(limEl);item.appendChild(info);
        var actions=document.createElement('div');actions.className='bmi-actions';
        var eBtn=document.createElement('button');eBtn.textContent='✏️';
        (function(cat){eBtn.addEventListener('click',function(){openBudgetEditModal(cat);});})(b.category);
        var dBtn=document.createElement('button');dBtn.textContent='🗑️';
        (function(cat){dBtn.addEventListener('click',function(){deleteBudget(cat);});})(b.category);
        actions.appendChild(eBtn);actions.appendChild(dBtn);item.appendChild(actions);
        container.appendChild(item);
    }
}
function openBudgetEditModal(category){
    editingBudgetCategory=category||null;
    var title=$('budgetEditTitle');var sel=$('budgetCategory');
    sel.innerHTML='';
    for(var i=0;i<CATEGORIES_EXPENSE.length;i++){
        var o=document.createElement('option');o.value=CATEGORIES_EXPENSE[i];o.textContent=CATEGORIES_EXPENSE[i];sel.appendChild(o);
    }
    if(category){
        title.textContent='✏️ Редактировать бюджет';sel.value=category;sel.disabled=true;
        for(var i=0;i<budgets.length;i++)if(budgets[i].category===category){$('budgetLimit').value=budgets[i].limit;break;}
    } else {
        title.textContent='🎯 Новый бюджет';sel.disabled=false;$('budgetLimit').value='';
    }
    $('budgetEditModal').classList.add('open');lockBackground();
}
function closeBudgetEditModal(){$('budgetEditModal').classList.remove('open');editingBudgetCategory=null;unlockBackground();}
function saveBudget(){
    var category=$('budgetCategory').value;
    var limit=parseFloat($('budgetLimit').value)||0;
    if(!category){alert('Выберите категорию');return;}
    if(limit<=0){alert('Введите корректный лимит');return;}
    if(editingBudgetCategory){
        for(var i=0;i<budgets.length;i++)if(budgets[i].category===editingBudgetCategory){budgets[i].limit=limit;break;}
        $('fileStatus').textContent='✏️ Бюджет обновлён';
    } else {
        var exists=false;for(var i=0;i<budgets.length;i++)if(budgets[i].category===category){exists=true;break;}
        if(exists){alert('Для этой категории бюджет уже задан');return;}
        budgets.push({category:category,limit:limit});
        $('fileStatus').textContent='➕ Бюджет добавлен';
    }
    saveBudgets();renderBudgets();renderSettingsBudgetsList();closeBudgetEditModal();
    scheduleSyncExtras();
}
function deleteBudget(category){
    if(!confirm('Удалить бюджет для «'+category+'»?'))return;
    budgets=budgets.filter(function(b){return b.category!==category;});
    saveBudgets();renderBudgets();renderSettingsBudgetsList();
    $('fileStatus').textContent='🗑️ Бюджет удалён';
    scheduleSyncExtras();
}

/* ===== GOALS ===== */
function renderGoals(){
    var block=$('goalsBlock');var listEl=$('goalsList');
    if(!block||!listEl)return;
    if(!goals.length){block.classList.add('hidden');return;}
    block.classList.remove('hidden');
    if($('goalsCount'))$('goalsCount').textContent=goals.length+' '+(goals.length===1?'цель':'цели');
    listEl.innerHTML='';
    for(var i=0;i<goals.length;i++){
        var g=goals[i];var target=g.target||0;var saved=g.saved||0;
        var pct=target>0?Math.min((saved/target)*100,100):0;
        var remaining=Math.max(target-saved,0);var isDone=saved>=target&&target>0;
        var cls='low';if(isDone)cls='done';else if(pct>=75)cls='high';else if(pct>=40)cls='mid';
        var item=document.createElement('div');item.className='goal-item';
        var row=document.createElement('div');row.className='goal-row';
        var nameEl=document.createElement('span');nameEl.className='goal-name';
        nameEl.textContent=(g.icon||'🎯')+' '+g.name;
        var nums=document.createElement('span');nums.className='goal-nums'+(isDone?' complete':'');
        nums.textContent=roundRub(saved).toLocaleString('ru-RU')+' / '+roundRub(target).toLocaleString('ru-RU')+' ₽';
        row.appendChild(nameEl);row.appendChild(nums);
        var bar=document.createElement('div');bar.className='goal-bar';
        var fill=document.createElement('div');fill.className='goal-bar-fill '+cls;fill.style.width=pct.toFixed(1)+'%';
        bar.appendChild(fill);
        var sub=document.createElement('div');sub.className='goal-sub';
        var leftSpan=document.createElement('span');
        if(isDone){leftSpan.textContent='✅ Цель достигнута';}
        else{
            leftSpan.textContent='осталось '+roundRub(remaining).toLocaleString('ru-RU')+' ₽';
            if(g.deadline){try{var dl=new Date(g.deadline);if(!isNaN(dl.getTime()))leftSpan.textContent+=' · до '+dl.toLocaleDateString('ru-RU');}catch(e){}}
        }
        var pctSpan=document.createElement('span');pctSpan.className='goal-pct';pctSpan.textContent=Math.round(pct)+'%';
        sub.appendChild(leftSpan);sub.appendChild(pctSpan);
        item.appendChild(row);item.appendChild(bar);item.appendChild(sub);
        (function(id){item.addEventListener('click',function(){openGoalDepositModal(id);});})(g.id);
        listEl.appendChild(item);
    }
}
function renderSettingsGoalsList(){
    var container=$('settingsGoalsList');if(!container)return;
    container.innerHTML='';
    if(!goals.length){
        var empty=document.createElement('div');empty.className='template-empty';
        empty.textContent='Целей пока нет.\nСоздайте первую кнопкой ниже.';
        container.appendChild(empty);return;
    }
    for(var i=0;i<goals.length;i++){
        var g=goals[i];var pct=g.target>0?Math.min((g.saved/g.target)*100,100):0;
        var item=document.createElement('div');item.className='goal-manage-item';
        var info=document.createElement('div');info.className='gmi-info';
        var nameEl=document.createElement('div');nameEl.className='gmi-name';nameEl.textContent=(g.icon||'🎯')+' '+g.name;
        var metaEl=document.createElement('div');metaEl.className='gmi-meta';
        metaEl.textContent=roundRub(g.saved).toLocaleString('ru-RU')+' / '+roundRub(g.target).toLocaleString('ru-RU')+' ₽ · '+Math.round(pct)+'%';
        info.appendChild(nameEl);info.appendChild(metaEl);item.appendChild(info);
        var actions=document.createElement('div');actions.className='gmi-actions';
        var eBtn=document.createElement('button');eBtn.textContent='✏️';
        (function(id){eBtn.addEventListener('click',function(){openGoalEditModal(id);});})(g.id);
        var dBtn=document.createElement('button');dBtn.textContent='🗑️';
        (function(id){dBtn.addEventListener('click',function(){deleteGoal(id);});})(g.id);
        actions.appendChild(eBtn);actions.appendChild(dBtn);item.appendChild(actions);
        container.appendChild(item);
    }
}
function renderGoalIconPicker(){
    var picker=$('goalIconPicker');if(!picker)return;
    picker.innerHTML='';
    for(var i=0;i<GOAL_ICONS.length;i++){
        var btn=document.createElement('button');btn.type='button';
        btn.className='goal-icon-btn'+(GOAL_ICONS[i]===currentGoalIcon?' active':'');
        btn.textContent=GOAL_ICONS[i];
        (function(icon){btn.addEventListener('click',function(){currentGoalIcon=icon;renderGoalIconPicker();});})(GOAL_ICONS[i]);
        picker.appendChild(btn);
    }
}
function openGoalEditModal(id){
    editingGoalId=id||null;var title=$('goalEditTitle');
    if(id){
        var g=null;for(var i=0;i<goals.length;i++)if(goals[i].id===id){g=goals[i];break;}
        if(!g)return;
        title.textContent='✏️ Редактировать цель';currentGoalIcon=g.icon||'🎯';
        $('goalName').value=g.name||'';$('goalTarget').value=g.target||'';$('goalSaved').value=g.saved||'';$('goalDeadline').value=g.deadline||'';
    } else {
        title.textContent='🏆 Новая цель';currentGoalIcon='🎯';
        $('goalName').value='';$('goalTarget').value='';$('goalSaved').value='';$('goalDeadline').value='';
    }
    renderGoalIconPicker();$('goalEditModal').classList.add('open');lockBackground();
}
function closeGoalEditModal(){$('goalEditModal').classList.remove('open');editingGoalId=null;unlockBackground();}
function saveGoal(){
    var name=$('goalName').value.trim();
    var target=parseFloat($('goalTarget').value)||0;
    var saved=parseFloat($('goalSaved').value)||0;
    var deadline=$('goalDeadline').value||'';
    if(!name){alert('Введите название цели');return;}
    if(target<=0){alert('Введите целевую сумму');return;}
    if(saved<0){alert('Накоплено не может быть отрицательным');return;}
    if(editingGoalId){
        for(var i=0;i<goals.length;i++)if(goals[i].id===editingGoalId){
            goals[i].name=name;goals[i].icon=currentGoalIcon;goals[i].target=target;goals[i].saved=saved;goals[i].deadline=deadline;break;
        }
        $('fileStatus').textContent='✏️ Цель обновлена';
    } else {
        goals.push({id:'goal_'+Date.now()+'_'+Math.floor(Math.random()*1000),name:name,icon:currentGoalIcon,target:target,saved:saved,deadline:deadline});
        $('fileStatus').textContent='➕ Цель создана';
    }
    saveGoals();renderGoals();renderSettingsGoalsList();closeGoalEditModal();
    scheduleSyncExtras();
}
function deleteGoal(id){
    var g=null;for(var i=0;i<goals.length;i++)if(goals[i].id===id){g=goals[i];break;}
    if(!g)return;
    if(!confirm('Удалить цель «'+g.name+'»?'))return;
    goals=goals.filter(function(x){return x.id!==id;});
    saveGoals();renderGoals();renderSettingsGoalsList();
    $('fileStatus').textContent='🗑️ Цель удалена';
    scheduleSyncExtras();
}
function openGoalDepositModal(id){
    var g=null;for(var i=0;i<goals.length;i++)if(goals[i].id===id){g=goals[i];break;}
    if(!g)return;
    editingGoalId=id;
    $('goalDepositTitle').textContent=(g.icon||'🎯')+' '+g.name;
    $('goalDepositCurrent').textContent=roundRub(g.saved).toLocaleString('ru-RU')+' / '+roundRub(g.target).toLocaleString('ru-RU')+' ₽';
    $('goalDepositAmount').value='';
    $('goalDepositModal').classList.add('open');lockBackground();
}
function closeGoalDepositModal(){$('goalDepositModal').classList.remove('open');editingGoalId=null;unlockBackground();}
function saveGoalDeposit(){
    var amount=parseFloat($('goalDepositAmount').value)||0;
    if(amount===0){alert('Введите сумму');return;}
    var g=null;for(var i=0;i<goals.length;i++)if(goals[i].id===editingGoalId){g=goals[i];break;}
    if(!g)return;
    g.saved=Math.max(0,g.saved+amount);
    saveGoals();renderGoals();renderSettingsGoalsList();closeGoalDepositModal();
    $('fileStatus').textContent='✅ '+g.name+': '+roundRub(g.saved).toLocaleString('ru-RU')+' ₽';
    scheduleSyncExtras();
}

/* ===== EXPORT / IMPORT ===== */
function exportAllDataCSV(){
    if(!allTransactions.length){alert('Нет транзакций для экспорта');return;}
    var sorted=allTransactions.slice().sort(function(a,b){return a.date-b.date;});
    var rows=['Дата;Время;Тип;Категория;USD;RUB;Комментарий'];
    for(var i=0;i<sorted.length;i++){
        var tx=sorted[i];
        var d=pad(tx.date.getDate())+'.'+pad(tx.date.getMonth()+1)+'.'+tx.date.getFullYear();
        var t=pad(tx.date.getHours())+':'+pad(tx.date.getMinutes());
        var type=tx.type==='income'?'ДОХОД':'РАСХОД';
        var usd=tx.usd?tx.usd.toFixed(2):'0';
        var rub=tx.rub?tx.rub.toFixed(2):'0';
        var cat=(tx.category||'').replace(/;/g,',');
        var note=(tx.note||'').replace(/;/g,',').replace(/\n/g,' ');
        rows.push([d,t,type,cat,usd,rub,note].join(';'));
    }
    var csv='\ufeff'+rows.join('\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    var url=URL.createObjectURL(blob);var a=document.createElement('a');
    var dd=new Date();var ds=dd.getFullYear()+'-'+pad(dd.getMonth()+1)+'-'+pad(dd.getDate());
    a.href=url;a.download='finance-export-'+ds+'.csv';
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    $('fileStatus').textContent='📊 CSV: '+sorted.length;
}
function exportAllData(){
    if(!allTransactions.length&&!rateHistory.length&&!templates.length&&!budgets.length&&!goals.length){alert('Нет данных');return;}
    var data={
        version:4,exportedAt:new Date().toISOString(),currentUsdRate:currentUsdRate,
        transactions:allTransactions.map(function(tx){return {type:tx.type,date:tx.date.toISOString(),usd:tx.usd,rub:tx.rub,category:tx.category,note:tx.note};}),
        rateHistory:rateHistory.map(function(h){return {date:h.date.toISOString(),rate:h.rate};}),
        templates:templates.slice(),budgets:budgets.slice(),goals:goals.slice()
    };
    var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);var a=document.createElement('a');
    var d=new Date();var ds=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    a.href=url;a.download='finance-backup-'+ds+'.json';
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    $('fileStatus').textContent='💾 Экспортировано: '+allTransactions.length;
}
function importAllData(file){
    var reader=new FileReader();
    reader.onload=function(e){
        try{
            var data=JSON.parse(e.target.result);var txs=[];
            if(data.transactions&&Array.isArray(data.transactions)){
                txs=data.transactions.map(function(t){return {type:t.type,date:new Date(t.date),usd:t.usd||0,rub:t.rub||0,category:normalizeCategory(t.category),note:t.note||'-'};});
            } else if(data.text&&typeof data.text==='string'){txs=parseData(JSON.stringify(data));}
            else throw new Error('Неверный формат файла');
            if(!txs.length){alert('Файл не содержит транзакций');return;}
            if(!confirm('Импортировать '+txs.length+' транзакций?\nТекущие данные будут заменены.'))return;
            allTransactions=txs;saveTransactions(allTransactions);
            if(data.rateHistory&&Array.isArray(data.rateHistory)){
                rateHistory=data.rateHistory.map(function(h){return {date:new Date(h.date),rate:h.rate};});
                saveRateHistory(rateHistory);
                if(rateHistory.length){setRate(rateHistory[rateHistory.length-1].rate);$('usdRateInput').value=rateHistory[rateHistory.length-1].rate.toFixed(2);drawRateHistoryChart();renderRateFreshness();}
            }
            if(data.templates&&Array.isArray(data.templates)){
                templates=data.templates.map(function(t){return {id:t.id||('tpl_'+Date.now()+'_'+Math.floor(Math.random()*1000)),name:t.name||'Шаблон',type:t.type||'expense',rub:t.rub||0,usd:t.usd||0,category:t.category||'💸 Другое',note:t.note||'',dayOfMonth:t.dayOfMonth||0};});
                saveTemplates();renderTemplatesList('settingsTemplatesList','settings');
            }
            if(data.budgets&&Array.isArray(data.budgets)){
                budgets=data.budgets.map(function(b){return {category:b.category||'💸 Другое',limit:b.limit||0};}).filter(function(b){return b.limit>0;});
                saveBudgets();renderBudgets();renderSettingsBudgetsList();
            }
            if(data.goals&&Array.isArray(data.goals)){
                goals=data.goals.map(function(g){return {id:g.id||('goal_'+Date.now()+'_'+Math.floor(Math.random()*1000)),name:g.name||'Цель',icon:g.icon||'🎯',target:g.target||0,saved:g.saved||0,deadline:g.deadline||''};}).filter(function(g){return g.target>0;});
                saveGoals();renderGoals();renderSettingsGoalsList();
            }
            dataLoaded=true;
            var fb=document.querySelectorAll('.filter-btn');for(var i=0;i<fb.length;i++)fb[i].classList.remove('disabled');
            updateWithFilter(currentFilter);renderSettingsStats();
            $('fileStatus').textContent='✅ Импортировано: '+txs.length;
        }catch(err){$('fileStatus').textContent='❌ '+err.message;alert('Ошибка: '+err.message);}
    };
    reader.readAsText(file);
}
function clearAllDataConfirm(){
    if(!confirm('Удалить ВСЕ данные?'))return;
    if(!confirm('Точно удалить? Нажмите OK.'))return;
    localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(RATE_STORAGE_KEY);
    localStorage.removeItem(RATE_HISTORY_KEY);localStorage.removeItem(LAST_SYNC_KEY);
    localStorage.removeItem(TEMPLATES_KEY);localStorage.removeItem(BUDGETS_KEY);localStorage.removeItem(GOALS_KEY);
    allTransactions=[];rateHistory=[];templates=[];budgets=[];goals=[];dataLoaded=false;
    $('dashboard').classList.add('hidden');$('emptyState').classList.remove('hidden');
    var fb=document.querySelectorAll('.filter-btn');for(var i=0;i<fb.length;i++)fb[i].classList.add('disabled');
    if(expensePieChart){expensePieChart.destroy();expensePieChart=null;}
    if(incomePieChart){incomePieChart.destroy();incomePieChart=null;}
    if(rateHistoryChart){rateHistoryChart.destroy();rateHistoryChart=null;}
    if(balanceHistoryChart){balanceHistoryChart.destroy();balanceHistoryChart=null;}
    if(autoUpdateTimer){clearInterval(autoUpdateTimer);autoUpdateTimer=null;}
    renderSettingsStats();renderTemplatesList('settingsTemplatesList','settings');
    renderSettingsBudgetsList();renderSettingsGoalsList();
    if($('budgetsBlock'))$('budgetsBlock').classList.add('hidden');
    if($('goalsBlock'))$('goalsBlock').classList.add('hidden');
    updateFreshness();renderRateFreshness();
    $('fileStatus').textContent='🗑️ Очищено';
}

/* ===== BOTTOM NAV ===== */
var navPages=['dashboard','currency','settings'];
function updateBottomNav(page){
    var home=$('bnHomeBtn');if(home)home.classList.toggle('active',page==='dashboard');
    var tabs=document.querySelectorAll('.bn-tab[data-page]');
    for(var i=0;i<tabs.length;i++)tabs[i].classList.toggle('active',tabs[i].dataset.page===page);
}
function switchPage(page,direction){
    var currentPage='';
    var tabs=document.querySelectorAll('.bn-tab[data-page]');
    for(var i=0;i<tabs.length;i++)if(tabs[i].classList.contains('active'))currentPage=tabs[i].dataset.page;
    if($('bnHomeBtn')&&$('bnHomeBtn').classList.contains('active'))currentPage='dashboard';
    if(currentPage===page&&!direction)return;
    if(!direction&&currentPage){
        var oi=navPages.indexOf(currentPage),ni=navPages.indexOf(page);
        if(oi>=0&&ni>=0&&oi!==ni)direction=ni>oi?'left':'right';
    }
    if(!direction)direction='left';
    updateBottomNav(page);
    var pgMap={dashboard:$('pageDashboard'),currency:$('pageCurrency'),settings:$('pageSettings')};
    var next=pgMap[page];if(!next)return;
    for(var k in pgMap){
        if(!pgMap.hasOwnProperty(k))continue;
        pgMap[k].classList.remove('active');
        pgMap[k].classList.remove('page-enter-left');
        pgMap[k].classList.remove('page-enter-right');
    }
    next.classList.add('active');
    next.classList.add(direction==='left'?'page-enter-right':'page-enter-left');
    void next.offsetWidth;
    if(page==='currency'){
        setTimeout(function(){
            if(rateHistoryChart){try{rateHistoryChart.resize();}catch(e){}}
            animateCurrencyNumbers();renderRateFreshness();renderCbrRate();
        },80);
    } else if(page==='settings'){
        updateTokenStatus();renderSettingsStats();
        renderTemplatesList('settingsTemplatesList','settings');
        renderSettingsBudgetsList();renderSettingsGoalsList();
    } else {
        setTimeout(function(){
            if(incomePieChart){try{incomePieChart.resize();}catch(e){}}
            if(expensePieChart){try{expensePieChart.resize();}catch(e){}}
            if(balanceHistoryChart){try{balanceHistoryChart.resize();}catch(e){}}
        },80);
    }
    window.scrollTo({top:0,behavior:'smooth'});
}

/* ===== FAB ===== */
function openFabFan(){
    var fan=$('fabFan');var fab=$('bnFabBtn');
    if(!fan||!fab)return;
    fan.classList.add('open');fab.classList.add('open');
    setTimeout(function(){document.addEventListener('click',closeFabOutside);},10);
}
function closeFabFan(){
    var fan=$('fabFan');var fab=$('bnFabBtn');
    if(!fan||!fab)return;
    fan.classList.remove('open');fab.classList.remove('open');
    document.removeEventListener('click',closeFabOutside);
}
function closeFabOutside(e){
    var fan=$('fabFan');var fab=$('bnFabBtn');
    if(fan.contains(e.target)||fab.contains(e.target))return;
    closeFabFan();
}

/* ===== MORE SHEET ===== */
function openMoreSheet(){
    $('moreSheet').classList.add('open');
    $('bsOverlay').classList.add('open');
    lockBackground();
}
function closeMoreSheet(){
    $('moreSheet').classList.remove('open');
    $('bsOverlay').classList.remove('open');
    unlockBackground();
}

/* ===== PULL TO REFRESH ===== */
var pullStartY=0,pullActive=false,pullY=0,pullRefreshing=false;
var PULL_THRESHOLD=80,PULL_MAX=120;
document.addEventListener('touchstart',function(e){
    if(e.touches.length!==1){pullActive=false;return;}
    if(window.scrollY>5){pullActive=false;return;}
    if(document.querySelector('.modal-overlay.open')||document.querySelector('.bottom-sheet.open')){pullActive=false;return;}
    if($('fabFan')&&$('fabFan').classList.contains('open')){pullActive=false;return;}
    pullStartY=e.touches[0].clientY;
    pullActive=true;
    pullY=0;
},{passive:true});
document.addEventListener('touchmove',function(e){
    if(!pullActive||pullRefreshing)return;
    if(e.touches.length!==1)return;
    if(window.scrollY>5){pullActive=false;hidePullIndicator();return;}
    var dy=e.touches[0].clientY-pullStartY;
    if(dy<=0){pullActive=false;hidePullIndicator();return;}
    var capped=Math.min(dy*0.5,PULL_MAX);
    pullY=capped;
    var ind=$('pullIndicator');
    if(!ind)return;
    ind.classList.add('visible');
    ind.style.transform='translateY('+(capped-PULL_MAX)+'px)';
    var txt=$('pullText');
    if(dy>=PULL_THRESHOLD*2){
        ind.classList.add('ready');
        if(txt)txt.textContent='Отпустите для обновления';
    }else{
        ind.classList.remove('ready');
        if(txt)txt.textContent='Потяните вниз...';
    }
},{passive:true});
document.addEventListener('touchend',function(e){
    if(!pullActive)return;
    pullActive=false;
    if(pullY>=PULL_THRESHOLD){doPullRefresh();}
    else{hidePullIndicator();}
    pullY=0;
},{passive:true});
function hidePullIndicator(){
    var ind=$('pullIndicator');
    if(!ind)return;
    ind.classList.remove('visible','ready');
    ind.style.transform='translateY(-70px)';
}
function doPullRefresh(){
    if(pullRefreshing)return;
    pullRefreshing=true;
    var ind=$('pullIndicator');
    if(ind){
        ind.classList.add('visible','spinning','ready');
        ind.style.transform='translateY(0)';
        var txt=$('pullText');
        if(txt)txt.textContent='Обновление...';
    }
    Promise.resolve()
        .then(function(){return loadData(false);})
        .then(function(){return Promise.all([loadRateHistoryFromServer(false),loadTemplatesFromServer(),loadBudgetsFromServer(),loadGoalsFromServer()]);})
        .then(function(){renderTemplatesList('settingsTemplatesList','settings');renderSettingsBudgetsList();renderSettingsGoalsList();renderCbrRate();return new Promise(function(r){setTimeout(r,300);});})
        .then(function(){
            pullRefreshing=false;
            if(ind){
                ind.classList.remove('spinning');
                var txt=$('pullText');
                if(txt)txt.textContent='✅ Обновлено';
            }
            setTimeout(function(){
                hidePullIndicator();
                var txt=$('pullText');
                if(txt)txt.textContent='Потяните вниз...';
            },500);
        })
        .catch(function(){
            pullRefreshing=false;
            hidePullIndicator();
        });
}

/* ===== SYNC ===== */
function doSync(){
    if(!allTransactions.length){showToast('ℹ️ Нет данных для синхронизации');return;}
    var token=getToken();
    if(!token){$('tokenModal').classList.add('open');lockBackground();return;}
    showToast('⏳ Синхронизация...',2000);
    pushRateToGitHub();
    fetch('https://raw.githubusercontent.com/arturskvortsov-boop/finance-dashboard/main/stats2.json?t='+Date.now(),{cache:'no-store'})
        .then(function(r){if(!r.ok)return null;return r.text();})
        .catch(function(){return null;})
        .then(function(txt){
            var remote=txt?parseData(txt):[];
            var merged=mergeTransactions(allTransactions,remote);
            allTransactions=merged;saveTransactions(allTransactions);
            var sorted=allTransactions.slice().sort(function(a,b){return a.date-b.date;});
            var lines=[];
            for(var i=0;i<sorted.length;i++){
                var tx=sorted[i];
                var d=pad(tx.date.getDate()),mo=pad(tx.date.getMonth()+1),y=tx.date.getFullYear(),h=pad(tx.date.getHours()),mi=pad(tx.date.getMinutes());
                var dateStr=d+'.'+mo+'.'+y+', '+h+':'+mi;
                var typeLabel=tx.type==='income'?'🟢 ДОХОД':'🔴 РАСХОД';
                var usdLabel=tx.usd>0?tx.usd+' Долларов 🇺🇸':'0 Долларов 🇺🇸';
                var rubLabel=tx.rub+' Рублей 🇷🇺';
                lines.push(typeLabel+' | '+dateStr+' | '+usdLabel+'  -> '+rubLabel+' | '+tx.category+' | '+(tx.note||'-'));
            }
            var newText=lines.join('\n');
            var updatedJson=JSON.stringify({text:newText});
            var updatedB64=btoa(unescape(encodeURIComponent(updatedJson)));
            function attemptStats(retriesLeft){
                return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/stats2.json',{headers:{'Authorization':'token '+token},cache:'no-store'})
                    .then(function(r){if(!r.ok)throw new Error('GET: '+r.status);return r.json();})
                    .then(function(meta){
                        return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/stats2.json',{
                            method:'PUT',
                            headers:{'Authorization':'token '+token,'Content-Type':'application/json'},
                            body:JSON.stringify({message:'Синхронизация PWA ('+allTransactions.length+')',content:updatedB64,sha:meta.sha})
                        });
                    })
                    .then(function(r){
                        if(r.status===409&&retriesLeft>0){return new Promise(function(resolve){setTimeout(resolve,500);}).then(function(){return attemptStats(retriesLeft-1);});}
                        if(!r.ok)throw new Error('PUT: '+r.status);
                        return r.json();
                    });
            }
            return attemptStats(4);
        })
        .then(function(){markSynced();updateWithFilter(currentFilter);showToast('✅ Синхронизировано: '+allTransactions.length);})
        .catch(function(e){showToast('❌ '+e.message);});
}
function doRefresh(){
    showToast('🔄 Обновление...',1500);
    loadData(false)
        .then(function(){return Promise.all([loadRateHistoryFromServer(false),loadTemplatesFromServer(),loadBudgetsFromServer(),loadGoalsFromServer()]);})
        .then(function(){
            renderTemplatesList('settingsTemplatesList','settings');
            renderSettingsBudgetsList();
            renderSettingsGoalsList();
            renderCbrRate();
            showToast('✅ Данные обновлены');
        });
}

/* ===== EVENTS ===== */
/* ===== CALENDAR EVENTS ===== */
$('calPrev').addEventListener('click',function(){
    calendarMonth--;
    if(calendarMonth<0){calendarMonth=11;calendarYear--;}
    renderCalendar();
});
$('calNext').addEventListener('click',function(){
    calendarMonth++;
    if(calendarMonth>11){calendarMonth=0;calendarYear++;}
    renderCalendar();
});
var filterBtns=document.querySelectorAll('.filter-btn');
for(var i=0;i<filterBtns.length;i++){
    (function(btn){
        btn.addEventListener('click',function(){
            if(this.classList.contains('disabled'))return;
            for(var j=0;j<filterBtns.length;j++)filterBtns[j].classList.remove('active');
            this.classList.add('active');
            currentFilter=this.dataset.period;
            if(dataLoaded)updateWithFilter(currentFilter);
        });
    })(filterBtns[i]);
}
var collapsibleHeaders=document.querySelectorAll('.collapsible-header');
for(var i=0;i<collapsibleHeaders.length;i++){
    (function(h){
        h.addEventListener('click',function(){
            var c=$(this.dataset.target);
            var t=this.querySelector('.toggle');
            var p=this.closest('.collapsible');
            if(c){c.classList.toggle('open');t.classList.toggle('open');if(p)p.classList.toggle('closed');}
        });
    })(collapsibleHeaders[i]);
}

$('closeTxModal').addEventListener('click',closeTxModal);
$('cancelTxBtn').addEventListener('click',closeTxModal);
var typeBtns=document.querySelectorAll('#txModal .type-btn');
for(var i=0;i<typeBtns.length;i++){
    (function(btn){
        btn.addEventListener('click',function(){
            currentTxType=this.dataset.type;
            for(var j=0;j<typeBtns.length;j++)typeBtns[j].classList.remove('active');
            this.classList.add('active');
            fillCategories(currentTxType,'txCategory');
        });
    })(typeBtns[i]);
}
var saveAsTplCb=$('saveAsTemplate');
if(saveAsTplCb){
    saveAsTplCb.addEventListener('change',function(){
        var on=this.checked;
        if($('templateNameRow'))$('templateNameRow').classList.toggle('hidden',!on);
        if($('templateDayRow'))$('templateDayRow').classList.toggle('hidden',!on);
    });
}
$('saveTxBtn').addEventListener('click',function(){
    var rub=parseFloat($('txRub').value)||0;
    var usd=parseFloat($('txUsd').value)||0;
    var category=$('txCategory').value;
    var note=$('txNote').value.trim()||'-';
    var dtVal=$('txDateTime').value;
    if(rub<=0&&usd<=0){alert('Введите хотя бы одну сумму');return;}
    if(!dtVal){alert('Укажите дату и время');return;}
    if(editingIndex<0&&$('saveAsTemplate')&&$('saveAsTemplate').checked){
        var tplNameVal=$('txTemplateName').value.trim();
        if(!tplNameVal){alert('Введите название шаблона');return;}
        var tplDayVal=parseInt($('txTemplateDay').value)||0;
        templates.push({id:'tpl_'+Date.now()+'_'+Math.floor(Math.random()*1000),name:tplNameVal,type:currentTxType,rub:rub,usd:usd,category:category,note:(note==='-')?'':note,dayOfMonth:tplDayVal});
        saveTemplates();renderTemplatesList('settingsTemplatesList','settings');
    }
    var dt=new Date(dtVal);
    var d=pad(dt.getDate()),mo=pad(dt.getMonth()+1),y=dt.getFullYear(),h=pad(dt.getHours()),mi=pad(dt.getMinutes());
    var dateStr=d+'.'+mo+'.'+y+', '+h+':'+mi;
    var typeLabel=currentTxType==='income'?'🟢 ДОХОД':'🔴 РАСХОД';
    var usdLabel=usd>0?usd+' Долларов 🇺🇸':'0 Долларов 🇺🇸';
    var rubLabel=rub+' Рублей 🇷🇺';
    var line=typeLabel+' | '+dateStr+' | '+usdLabel+'  -> '+rubLabel+' | '+category+' | '+note;
    var newTx=parseLine(line);
    if(!newTx){alert('Ошибка при разборе');return;}
    if(editingIndex>=0){allTransactions[editingIndex]=newTx;$('fileStatus').textContent='✏️ Отредактировано';}
    else{allTransactions.push(newTx);$('fileStatus').textContent='➕ Добавлено';}
    saveTransactions(allTransactions);updateWithFilter(currentFilter);scheduleAutoSync();closeTxModal();
});

$('incomeChartBox').addEventListener('click',function(){openCategoryDetail('income');});
$('expenseChartBox').addEventListener('click',function(){openCategoryDetail('expense');});
$('closeCatDetailModal').addEventListener('click',closeCatDetail);
$('catDetailModal').addEventListener('click',function(e){if(e.target===this)closeCatDetail();});

$('settingsAddBudgetBtn').addEventListener('click',function(){openBudgetEditModal(null);});
$('closeBudgetEditModal').addEventListener('click',closeBudgetEditModal);
$('cancelBudgetEditBtn').addEventListener('click',closeBudgetEditModal);
$('saveBudgetBtn').addEventListener('click',saveBudget);

$('settingsAddGoalBtn').addEventListener('click',function(){openGoalEditModal(null);});
$('closeGoalEditModal').addEventListener('click',closeGoalEditModal);
$('cancelGoalEditBtn').addEventListener('click',closeGoalEditModal);
$('saveGoalBtn').addEventListener('click',saveGoal);
$('closeGoalDepositModal').addEventListener('click',closeGoalDepositModal);
$('cancelGoalDepositBtn').addEventListener('click',closeGoalDepositModal);
$('saveGoalDepositBtn').addEventListener('click',saveGoalDeposit);

$('closeQuickAddModal').addEventListener('click',closeQuickAddModal);
$('cancelQuickAddBtn').addEventListener('click',closeQuickAddModal);
$('newTemplateFromQuickBtn').addEventListener('click',function(){closeQuickAddModal();setTimeout(function(){openTemplateEditModal(null);},220);});
$('closeTemplateEditModal').addEventListener('click',closeTemplateEditModal);
$('cancelTemplateEditBtn').addEventListener('click',closeTemplateEditModal);
$('saveTemplateBtn').addEventListener('click',saveTemplate);
$('settingsNewTemplateBtn').addEventListener('click',function(){openTemplateEditModal(null);});
var tplTypeBtns=document.querySelectorAll('#templateEditModal .type-btn');
for(var i=0;i<tplTypeBtns.length;i++){
    (function(btn){
        btn.addEventListener('click',function(){
            currentTplType=this.dataset.type;
            for(var j=0;j<tplTypeBtns.length;j++)tplTypeBtns[j].classList.remove('active');
            this.classList.add('active');
            fillCategories(currentTplType,'tplCategory');
        });
    })(tplTypeBtns[i]);
}

$('closeTokenModal').addEventListener('click',function(){$('tokenModal').classList.remove('open');unlockBackground();});
$('cancelTokenBtn').addEventListener('click',function(){$('tokenModal').classList.remove('open');unlockBackground();});
$('saveTokenBtn').addEventListener('click',function(){
    var t=$('githubTokenInput').value.trim();
    if(!t){alert('Введите токен');return;}
    setToken(t);$('tokenModal').classList.remove('open');unlockBackground();updateTokenStatus();
    $('fileStatus').textContent='✅ Токен сохранён';
});

$('refreshRateChartBtn').addEventListener('click',function(e){e.preventDefault();drawRateHistoryChart();showToast('🔄 График обновлён');});
$('fetchRateBtn').addEventListener('click',function(e){e.preventDefault();updateRateFromAPI();});
$('usdRateInput').addEventListener('keydown',function(e){if(e.key==='Enter')setRate(parseFloat(this.value));});
$('updateRateBtn').addEventListener('click',function(){setRate(parseFloat($('usdRateInput').value));});

$('settingsTokenBtn').addEventListener('click',function(){
    $('githubTokenInput').value=getToken();
    $('tokenModal').classList.add('open');lockBackground();
});
$('settingsClearTokenBtn').addEventListener('click',function(){
    if(!getToken()){alert('Токен не задан');return;}
    if(!confirm('Удалить сохранённый GitHub-токен?'))return;
    localStorage.removeItem(TOKEN_KEY);updateTokenStatus();
    $('fileStatus').textContent='🔑 Токен удалён';
});
$('settingsExportBtn').addEventListener('click',function(){exportAllData();});
$('settingsExportCsvBtn').addEventListener('click',function(){exportAllDataCSV();});
$('settingsImportBtn').addEventListener('click',function(){$('settingsImportInput').click();});
$('settingsImportInput').addEventListener('change',function(e){
    if(e.target.files&&e.target.files[0]){importAllData(e.target.files[0]);e.target.value='';}
});
$('settingsClearBtn').addEventListener('click',function(){clearAllDataConfirm();});

var hideBtn=$('hideBalanceBtn');
if(hideBtn)hideBtn.addEventListener('click',function(e){e.stopPropagation();toggleHideBalance();});
var qaInc=$('qaIncomeBtn');
if(qaInc)qaInc.addEventListener('click',function(){openTxModal(-1,'income');});
var qaExp=$('qaExpenseBtn');
if(qaExp)qaExp.addEventListener('click',function(){openTxModal(-1,'expense');});
var usdQuick=$('bcUsdQuick');
if(usdQuick)usdQuick.addEventListener('click',function(){switchPage('currency');});

var txSearchInput=$('txSearch');
if(txSearchInput){
    txSearchInput.addEventListener('input',function(){
        currentTxSearch=this.value;
        if(dataLoaded)updateWithFilter(currentFilter);
    });
}
var txTypeBtns=document.querySelectorAll('.tx-type-btn');
for(var i=0;i<txTypeBtns.length;i++){
    (function(b){
        b.addEventListener('click',function(){
            for(var j=0;j<txTypeBtns.length;j++)txTypeBtns[j].classList.remove('active');
            this.classList.add('active');
            currentTxTypeFilter=this.dataset.txtype;
            if(dataLoaded)updateWithFilter(currentFilter);
        });
    })(txTypeBtns[i]);
}

$('bnHomeBtn').addEventListener('click',function(){switchPage('dashboard');});
var bnTabs=document.querySelectorAll('.bn-tab[data-page]');
for(var i=0;i<bnTabs.length;i++){
    (function(t){t.addEventListener('click',function(){switchPage(this.dataset.page);});})(bnTabs[i]);
}
$('bnMoreBtn').addEventListener('click',openMoreSheet);
$('bsOverlay').addEventListener('click',closeMoreSheet);

$('bnFabBtn').addEventListener('click',function(e){
    e.stopPropagation();
    var fan=$('fabFan');
    if(fan.classList.contains('open')){closeFabFan();}
    else{openFabFan();}
});
$('fabRepeat').addEventListener('click',function(){closeFabFan();setTimeout(function(){repeatLastTransaction();},150);});
$('fabAddTx').addEventListener('click',function(){closeFabFan();setTimeout(function(){openTxModal(-1);},150);});
$('fabQuick').addEventListener('click',function(){closeFabFan();setTimeout(function(){openQuickAddModal();},150);});
$('fabSync').addEventListener('click',function(){closeFabFan();setTimeout(function(){doSync();},150);});
$('fabRefresh').addEventListener('click',function(){closeFabFan();setTimeout(function(){doRefresh();},150);});

$('bsReminders').addEventListener('click',function(){closeMoreSheet();switchPage('dashboard');setTimeout(function(){var b=$('remindersBlock');if(b&&!b.classList.contains('hidden')){b.classList.add('highlight');try{b.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}setTimeout(function(){b.classList.remove('highlight');},3500);}else{showToast('📌 Напоминаний пока нет');}},400);});
$('bsBudgets').addEventListener('click',function(){closeMoreSheet();switchPage('dashboard');setTimeout(function(){var b=$('budgetsBlock');if(b&&!b.classList.contains('hidden')){b.scrollIntoView({behavior:'smooth',block:'center'});}else{showToast('🎯 Бюджеты не заданы');}},400);});
$('bsGoals').addEventListener('click',function(){closeMoreSheet();switchPage('dashboard');setTimeout(function(){var b=$('goalsBlock');if(b&&!b.classList.contains('hidden')){b.scrollIntoView({behavior:'smooth',block:'center'});}else{showToast('🏆 Целей пока нет');}},400);});
$('bsTemplates').addEventListener('click',function(){closeMoreSheet();switchPage('settings');setTimeout(function(){var b=$('settingsTemplatesList');if(b)b.scrollIntoView({behavior:'smooth',block:'center'});},400);});
$('bsSync').addEventListener('click',function(){closeMoreSheet();setTimeout(function(){doSync();},250);});
$('bsRefresh').addEventListener('click',function(){closeMoreSheet();setTimeout(function(){doRefresh();},250);});
$('bsExportCsv').addEventListener('click',function(){closeMoreSheet();setTimeout(function(){exportAllDataCSV();},250);});
$('bsExportJson').addEventListener('click',function(){closeMoreSheet();setTimeout(function(){exportAllData();},250);});
$('bsImport').addEventListener('click',function(){closeMoreSheet();setTimeout(function(){$('settingsImportInput').click();},250);});
$('bsAbout').addEventListener('click',function(){closeMoreSheet();setTimeout(function(){showToast('💼 Финансовый дашборд v4 · Личный проект');},300);});

var swipeStartX=0,swipeStartY=0,swipeActive=false;
document.addEventListener('touchstart',function(e){
    if(e.touches.length!==1){swipeActive=false;return;}
    if(document.querySelector('.modal-overlay.open')||document.querySelector('.bottom-sheet.open')){swipeActive=false;return;}
    swipeStartX=e.touches[0].clientX;
    swipeStartY=e.touches[0].clientY;
    swipeActive=true;
},{passive:true});
document.addEventListener('touchend',function(e){
    if(!swipeActive)return;
    swipeActive=false;
    if(e.changedTouches.length===0)return;
    var dx=e.changedTouches[0].clientX-swipeStartX;
    var dy=e.changedTouches[0].clientY-swipeStartY;
    if(Math.abs(dx)<70)return;
    if(Math.abs(dy)>Math.abs(dx))return;
    var tgt=e.target;
    if(tgt&&(tgt.tagName==='INPUT'||tgt.tagName==='TEXTAREA'||tgt.tagName==='SELECT'||tgt.tagName==='CANVAS'))return;
    var cur='dashboard';
    var tabs=document.querySelectorAll('.bn-tab[data-page]');
    for(var i=0;i<tabs.length;i++)if(tabs[i].classList.contains('active'))cur=tabs[i].dataset.page;
    if($('bnHomeBtn').classList.contains('active'))cur='dashboard';
    var idx=navPages.indexOf(cur);
    if(idx<0)return;
    if(dx<0&&idx<navPages.length-1)switchPage(navPages[idx+1],'left');
    else if(dx>0&&idx>0)switchPage(navPages[idx-1],'right');
},{passive:true});

function animateValue(el,target,suffix,decimals,prefixPositive){
    if(!el)return;
    suffix=suffix||'';decimals=decimals||0;
    var t0=null,dur=800;
    function fmt(v){
        var s=v.toLocaleString('ru-RU',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
        if(prefixPositive&&v>0)s='+'+s;
        return s+suffix;
    }
    function step(ts){
        if(!t0)t0=ts;
        var p=Math.min(1,(ts-t0)/dur);
        var e=1-Math.pow(1-p,3);
        el.textContent=fmt(target*e);
        if(p<1)requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}
function animateCurrencyNumbers(){
    if(!dataLoaded||!allTransactions.length)return;
    var s=computeStats(filterTransactions(allTransactions,currentFilter));
    animateValue($('currencyHeroUsd'),s.netUsd,' $',2);
    animateValue($('totalIncomeUsd'),s.totalIncomeUsdEq,' $',0);
    animateValue($('totalExpenseUsd'),s.totalExpenseUsdEq,' $',0);
    if($('balanceUsd'))animateValue($('balanceUsd'),s.netUsd,' $',2);
    var rateDiff=0;
    for(var i=0;i<allTransactions.length;i++){var t=allTransactions[i];if(t.usd>0)rateDiff+=t.usd*currentUsdRate-t.rub;}
    animateValue($('rateProfit'),rateDiff,' ₽',0,true);
}

/* ===== VISIBILITY SYNC ===== */
document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden'){
        silentSync();
    } else if(document.visibilityState==='visible'){
        loadTemplatesFromServer().then(function(){renderTemplatesList('settingsTemplatesList','settings');});
        loadBudgetsFromServer().then(function(){renderSettingsBudgetsList();});
        loadGoalsFromServer().then(function(){renderSettingsGoalsList();});
        fetch('stats2.json?t='+Date.now(),{cache:'no-store'})
            .then(function(r){if(!r.ok)throw 0;return r.text();})
            .then(function(txt){
                var remote=parseData(txt);if(!remote.length)return;
                var merged=mergeTransactions(allTransactions,remote);
                if(merged.length!==allTransactions.length){
                    allTransactions=merged;saveTransactions(allTransactions);updateWithFilter(currentFilter);
                }
            })
            .catch(function(){});
    }
});

/* ===== TELEGRAM BACK BUTTON ===== */
if(isTelegram&&tg){
    tg.BackButton.onClick(function(){
        // Приоритет закрытия: модалка → bottom sheet → FAB-веер
        var modal=document.querySelector('.modal-overlay.open');
        if(modal){
            modal.classList.remove('open');
            unlockBackground();
            try{tg.BackButton.hide();}catch(e){}
            return;
        }
        var sheet=$('moreSheet');
        if(sheet&&sheet.classList.contains('open')){
            closeMoreSheet();
            try{tg.BackButton.hide();}catch(e){}
            return;
        }
        var fan=$('fabFan');
        if(fan&&fan.classList.contains('open')){
            closeFabFan();
            try{tg.BackButton.hide();}catch(e){}
            return;
        }
    });
    // Показываем Back Button только когда есть что закрыть
    var observer=new MutationObserver(function(){
        var hasOpen=document.querySelector('.modal-overlay.open, .bottom-sheet.open, .fab-fan.open');
        if(hasOpen){try{tg.BackButton.show();}catch(e){}}
        else{try{tg.BackButton.hide();}catch(e){}}
    });
    observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});
}

/* ===== TELEGRAM UI TWEAKS ===== */
if(isTelegram&&tg){
    try{tg.setHeaderColor('#0b0e14');}catch(e){}
    try{tg.setBackgroundColor('#000000');}catch(e){}
    var tgName=getTelegramName();
    if(tgName){
        setTimeout(function(){
            showToast('👋 Привет, '+tgName+'!',2500);
        },1500);
    }
}


/* START */
try{hideBalance=(localStorage.getItem(HIDE_BALANCE_KEY)==='1');}catch(e){}
userId=getOrCreateUserId();
templates=loadTemplates()||[];
budgets=loadBudgets()||[];
goals=loadGoals()||[];

var savedRate=loadRate();
if(savedRate){
    currentUsdRate=savedRate;
    $('usdRateInput').value=savedRate.toFixed(2);
    $('rateInfo').textContent='1 USD = '+savedRate.toFixed(2)+' ₽';
    $('rateInfoSmall').textContent=savedRate.toFixed(2)+' ₽';
}

renderTemplatesList('settingsTemplatesList','settings');
renderSettingsBudgetsList();
renderSettingsGoalsList();
updateBottomNav('dashboard');

loadData(true).then(function(loaded){
    if(!loaded){
        $('dashboard').classList.add('hidden');
        $('emptyState').classList.remove('hidden');
        if(!$('fileStatus').textContent||$('fileStatus').textContent==='⏳ Загрузка...')$('fileStatus').textContent='📂 Загрузите JSON или проверьте GitHub';
    }
    return Promise.all([loadRateHistoryFromServer(false),loadTemplatesFromServer(),loadBudgetsFromServer(),loadGoalsFromServer()]);
}).then(function(){
    setTimeout(drawRateHistoryChart,500);
    startFreshnessTimer();
    updateTokenStatus();
    renderSettingsStats();
    setTimeout(applyHideBalance,100);

    try{
        var MIGRATION_KEY='categoryMigration_v1';
        if(localStorage.getItem(MIGRATION_KEY)!=='1'){
            var stored=loadTransactions();
            if(stored&&stored.length){
                var changed=0;
                for(var mi=0;mi<stored.length;mi++){
                    var oldCat=stored[mi].category;
                    var newCat=normalizeCategory(oldCat);
                    if(oldCat!==newCat){stored[mi].category=newCat;changed++;}
                }
                if(changed>0){
                    allTransactions=stored;
                    saveTransactions(allTransactions);
                    updateWithFilter(currentFilter);
                }
            }
            localStorage.setItem(MIGRATION_KEY,'1');
        }
    }catch(e){}

    try{
        var urlParams=new URLSearchParams(location.search);
        if(urlParams.get('reminders')==='1'){
            setTimeout(function(){
                var pending=getPendingReminders();
                var block=$('remindersBlock');
                if(pending.length){
                    showToast('📌 Напоминаний: '+pending.length,4000);
                    if(block){
                        block.classList.add('highlight');
                        try{block.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}
                        setTimeout(function(){block.classList.remove('highlight');},3500);
                    }
                } else showToast('✅ Всё внесено, напоминаний нет.',3000);
            },700);
        }
    }catch(e){}

    var lastRateEntry=rateHistory[rateHistory.length-1];
    var stale=!lastRateEntry||(Date.now()-lastRateEntry.date.getTime())>12*60*60*1000;
    if(stale)setTimeout(function(){updateRateFromAPI();},1200);
});

})();