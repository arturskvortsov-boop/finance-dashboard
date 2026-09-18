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

var STORAGE_KEY='financeDataTransactions';
var RATE_STORAGE_KEY='usdRate';
var RATE_HISTORY_KEY='rateHistory';
var TOKEN_KEY='githubPersonalToken';
var LAST_SYNC_KEY='lastSyncTime';
var THEME_KEY='appTheme';

var CATEGORIES_INCOME=['💰 Зарплата','🗓 Продажа','🎁 Подарок','💵 Другое'];
var CATEGORIES_EXPENSE=['🚘 Автомобиль','🍔 Еда','🏚️ Ипотека','☕️ Кафе','🎢 Развлечения','🛍 Покупки','💊 Здоровье','🏠 Коммуналка','📱 Связь','📚 Образование','💸 Другое'];

var COLORS=['#93c5fd','#a5b4fc','#c4b5fd','#f9a8d4','#fbcfe8','#fcd34d','#86efac','#5eead4','#fdba74','#d8b4fe','#a7f3d0','#fca5a5'];

var allTransactions=[];
var rateHistory=[];
var currentFilter='month';
var dataLoaded=false;
var currentUsdRate=85.00;
var expensePieChart=null,incomePieChart=null,rateHistoryChart=null,catDetailDonut=null,balanceHistoryChart=null;
var autoUpdateTimer=null, freshnessTimer=null;
var editingIndex=-1;
var currentTxType='income';
var currentTxSearch='';
var currentTxTypeFilter='all';
var scrollY=0;
var currentTheme='dark';

/* ===== THEME ===== */
function getPreferredTheme(){
    var saved=localStorage.getItem(THEME_KEY)||'dark';
    if(saved==='auto'){
        return (window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';
    }
    return saved;
}
function getChartTheme(){
    var isLight=document.documentElement.getAttribute('data-theme')==='light';
    return isLight?{
        text:'#161d29', textMuted:'#5d6d86', card:'#ffffff', border:'#e2e7f0',
        accent:'#2f6fed', green:'#16a34a', red:'#dc2626', grid:'rgba(0,0,0,0.06)'
    }:{
        text:'#e8edf5', textMuted:'#8b9bb5', card:'#141820', border:'#232a36',
        accent:'#93c5fd', green:'#86efac', red:'#fca5a5', grid:'rgba(255,255,255,0.05)'
    };
}
function applyTheme(mode){
    currentTheme=mode;
    var actual=(mode==='auto')?((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark'):mode;
    if(actual==='light'){document.documentElement.setAttribute('data-theme','light');}
    else{document.documentElement.removeAttribute('data-theme');}
    var meta=$('metaThemeColor');
    if(meta)meta.setAttribute('content',actual==='light'?'#eef1f6':'#0b0e14');
    var tbtns=document.querySelectorAll('.theme-btn');
    for(var i=0;i<tbtns.length;i++)tbtns[i].classList.toggle('active',tbtns[i].dataset.theme===mode);
    redrawAllCharts();
}
function setTheme(mode){
    localStorage.setItem(THEME_KEY,mode);
    applyTheme(mode);
}
function redrawAllCharts(){
    if(expensePieChart||incomePieChart){
        var f=filterTransactions(allTransactions,currentFilter);
        if(f.length)renderDashboard(f,currentFilter);
    }else{
        if(balanceHistoryChart){
            var f2=filterTransactions(allTransactions,currentFilter);
            drawBalanceHistoryChart(f2);
        }
    }
    if(rateHistory.length)drawRateHistoryChart();
}

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
        return {type:type,date:dateObj,dateStr:dm[3]+'-'+dm[2]+'-'+dm[1],usd:parseNumber(as[0]),rub:parseNumber(as[1]),category:catP||'Без категории',note:noteP};
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
    el.textContent=ts?'· обновлено '+timeAgo(ts):'';
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
    freshnessTimer=setInterval(function(){
        updateFreshness();
        renderRateFreshness();
    },60000);
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
        '<div class="insight-item income"><div class="it-label">📊 Доход / день</div><div class="it-value">'+Math.round(avgIncome).toLocaleString('ru-RU')+' ₽</div><div class="it-sub">Всего: '+s.totalIncomeRub.toLocaleString('ru-RU')+' ₽</div></div>'+
        '<div class="insight-item expense"><div class="it-label">📉 Расход / день</div><div class="it-value">'+Math.round(avgExpense).toLocaleString('ru-RU')+' ₽</div><div class="it-sub">Всего: '+s.totalExpenseRub.toLocaleString('ru-RU')+' ₽</div></div>'+
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
            html+='<div class="tc-item"><span class="tc-name">'+medal+' '+top3[i].label+'</span><span class="tc-value">'+top3[i].value.toLocaleString('ru-RU')+' ₽ ('+pct+'%)</span></div>';
        }
        topList.innerHTML=html;
    } else topList.innerHTML='';
}

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

    function calc(start){
        var arr=txs.filter(function(t){return t.date>=start;});
        return computeStats(arr);
    }
    var d=calc(dS),w=calc(wS),m=calc(mS);

    $('totalBalanceRubDisplay').textContent=s.netRub.toLocaleString('ru-RU')+' ₽';
    $('totalBalanceUsdDisplay').textContent=s.netUsd.toFixed(2)+' $';
    $('usdDetails').textContent='↑ $'+s.totalIncomeUsdEq.toFixed(0)+' · ↓ $'+s.totalExpenseUsdEq.toFixed(0);
    if($('currencyHeroUsd'))$('currencyHeroUsd').textContent=s.netUsd.toFixed(2)+' $';
    $('rateInfoSmall').textContent='1 USD = '+currentUsdRate.toFixed(2)+' ₽';

    $('totalIncomeRubOnly').textContent=s.rubIncome.toLocaleString('ru-RU')+' ₽';
    $('totalExpenseRubOnly').textContent=s.rubExpense.toLocaleString('ru-RU')+' ₽';
    $('totalIncomeUsd').textContent=Math.round(s.totalIncomeUsdEq).toLocaleString('ru-RU')+' $';
    $('totalExpenseUsd').textContent=Math.round(s.totalExpenseUsdEq).toLocaleString('ru-RU')+' $';
    if($('balanceUsd'))$('balanceUsd').textContent=s.netUsd.toFixed(2)+' $';
    $('netIncome').textContent=s.netRub.toLocaleString('ru-RU')+' ₽';
    $('recordCount').textContent=txs.length;

    var rateDiff=0;
    for(var i=0;i<txs.length;i++){if(txs[i].usd>0)rateDiff+=txs[i].usd*currentUsdRate-txs[i].rub;}
    $('rateProfit').textContent=(rateDiff>=0?'+':'')+rateDiff.toLocaleString('ru-RU')+' ₽';

    function fmt(n){return n.toLocaleString('ru-RU');}
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
    $('monthIncomeDisplay').textContent='↑ '+ms.totalIncomeRub.toLocaleString('ru-RU');
    $('monthExpenseDisplay').textContent='↓ '+ms.totalExpenseRub.toLocaleString('ru-RU');

    var theme=getChartTheme();

    if(expensePieChart){expensePieChart.destroy();expensePieChart=null;}
    if(incomePieChart){incomePieChart.destroy();incomePieChart=null;}

    var incCat=aggregateByCategory(txs,'income');
    var incEmpty=$('incomeEmpty'); if(incEmpty)incEmpty.style.display=incCat.length?'none':'flex';
    incomePieChart=new Chart($('incomePieChart'),{
        type:'doughnut',
        data:{labels:incCat.map(function(x){return x.label;}),datasets:[{data:incCat.map(function(x){return x.value;}),backgroundColor:COLORS.slice(0,incCat.length),borderColor:theme.card,borderWidth:2}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){var t=0;for(var i=0;i<c.dataset.data.length;i++)t+=c.dataset.data[i];return c.label+': '+c.parsed.toLocaleString('ru-RU')+' ₽ ('+((c.parsed/t)*100).toFixed(1)+'%)';}}}}}
    });
    var incList=$('incomeCategoryList');incList.innerHTML='';
    var incTotal=0;
    for(var i=0;i<incCat.length;i++)incTotal+=incCat[i].value;
    for(var i=0;i<incCat.length;i++){
        var pct=incTotal?((incCat[i].value/incTotal)*100).toFixed(1):0;
        var dd=document.createElement('div');dd.className='cat-item';
        dd.innerHTML='<span>'+incCat[i].label+'</span><span class="value">'+incCat[i].value.toLocaleString('ru-RU')+' ₽ · '+pct+'%</span>';
        incList.appendChild(dd);
    }

    var expCat=aggregateByCategory(txs,'expense');
    var expEmpty=$('expenseEmpty'); if(expEmpty)expEmpty.style.display=expCat.length?'none':'flex';
    expensePieChart=new Chart($('expensePieChart'),{
        type:'doughnut',
        data:{labels:expCat.map(function(x){return x.label;}),datasets:[{data:expCat.map(function(x){return x.value;}),backgroundColor:COLORS.slice(0,expCat.length),borderColor:theme.card,borderWidth:2}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){var t=0;for(var i=0;i<c.dataset.data.length;i++)t+=c.dataset.data[i];return c.label+': '+c.parsed.toLocaleString('ru-RU')+' ₽ ('+((c.parsed/t)*100).toFixed(1)+'%)';}}}}}
    });
    var expList=$('expenseCategoryList');expList.innerHTML='';
    var expTotal=0;
    for(var i=0;i<expCat.length;i++)expTotal+=expCat[i].value;
    for(var i=0;i<expCat.length;i++){
        var pct=expTotal?((expCat[i].value/expTotal)*100).toFixed(1):0;
        var dd=document.createElement('div');dd.className='cat-item';
        dd.innerHTML='<span>'+expCat[i].label+'</span><span class="value">'+expCat[i].value.toLocaleString('ru-RU')+' ₽ · '+pct+'%</span>';
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
        var empty=document.createElement('div');
        empty.className='tx-empty';
        empty.textContent=(searchQ||typeF!=='all')?'Ничего не найдено':'Нет транзакций за период';
        list.appendChild(empty);
    }
    if($('txCount')){
        $('txCount').textContent=indexed.length?('Показано '+Math.min(indexed.length,100)+' из '+indexed.length):'';
    }
    var slice=indexed.slice(0,100);
    for(var k=0;k<slice.length;k++){
        var tx=slice[k].tx;
        var div=document.createElement('div');div.className='tx-item';
        var left=document.createElement('div');left.className='left';
        left.innerHTML='<span class="cat">'+tx.category+'</span><span class="date">'+tx.date.toLocaleDateString('ru-RU')+' '+tx.date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'</span>'+(tx.note&&tx.note!=='-'?'<span class="note">'+tx.note+'</span>':'');
        var right=document.createElement('span');
        right.className='right '+(tx.type==='income'?'income':'expense');
        right.textContent=(tx.type==='income'?'+':'-')+tx.rub.toLocaleString('ru-RU')+' ₽'+(tx.usd>0?' ('+tx.usd.toFixed(2)+' $)':'');
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
    drawBalanceHistoryChart(txs);
    $('dashboard').classList.remove('hidden');
    $('emptyState').classList.add('hidden');
}

function updateWithFilter(period){
    if(!dataLoaded)return;
    var f=filterTransactions(allTransactions,period);
    renderDashboard(f,period);
    var names={day:'за сегодня',week:'за последние 7 дней',month:'за последние 30 дней',all:'за всё время'};
    $('periodLabel').textContent=names[period]||'';
}

function initData(txs){
    allTransactions=txs;
    dataLoaded=true;
    saveTransactions(txs);
    var fb=document.querySelectorAll('.filter-btn');
    for(var i=0;i<fb.length;i++)fb[i].classList.remove('disabled');
    var active=document.querySelector('.filter-btn[data-period="'+currentFilter+'"]');
    if(active)active.classList.add('active');
    updateWithFilter(currentFilter);
    if(!autoUpdateTimer)startAutoUpdate();
}

function drawBalanceHistoryChart(txs){
    var c=$('balanceHistoryChart');
    if(!c)return;
    var emptyEl=$('balanceChartEmpty');

    if(balanceHistoryChart){balanceHistoryChart.destroy();balanceHistoryChart=null;}

    if(!txs.length){
        if(emptyEl)emptyEl.style.display='flex';
        c.style.display='none';
        return;
    }
    if(emptyEl)emptyEl.style.display='none';
    c.style.display='block';

    var sorted=txs.slice().sort(function(a,b){return a.date-b.date;});
    var byDay={};
    for(var i=0;i<sorted.length;i++){
        var tx=sorted[i];
        var key=tx.date.getFullYear()+'-'+pad(tx.date.getMonth()+1)+'-'+pad(tx.date.getDate());
        if(!byDay[key])byDay[key]=0;
        var rub=tx.rub;
        if(tx.usd>0)rub=tx.usd*currentUsdRate;
        byDay[key]+=(tx.type==='income'?rub:-rub);
    }

    var keys=Object.keys(byDay).sort();
    var labels=[];
    var values=[];
    var running=0;
    for(var i=0;i<keys.length;i++){
        running+=byDay[keys[i]];
        var parts=keys[i].split('-');
        labels.push(parts[2]+'.'+parts[1]);
        values.push(running);
    }
    if(values.length===1){
        labels.unshift('');
        values.unshift(0);
    }

    var theme=getChartTheme();

    balanceHistoryChart=new Chart(c.getContext('2d'),{
        type:'line',
        data:{
            labels:labels,
            datasets:[{
                label:'Баланс, ₽',
                data:values,
                borderColor:theme.green,
                backgroundColor:theme.grid,
                borderWidth:2,
                pointBackgroundColor:theme.green,
                pointRadius:2,
                tension:0.25,
                fill:true
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                legend:{display:false},
                tooltip:{callbacks:{label:function(ctx){return ctx.parsed.y.toLocaleString('ru-RU')+' ₽';}}}
            },
            scales:{
                y:{grid:{color:theme.grid},ticks:{color:theme.textMuted,callback:function(v){
                    if(Math.abs(v)>=1000000)return (v/1000000).toFixed(1)+'M';
                    if(Math.abs(v)>=1000)return (v/1000).toFixed(0)+'k';
                    return v;
                }}},
                x:{grid:{color:theme.grid},ticks:{color:theme.textMuted,maxTicksLimit:10,maxRotation:30,autoSkip:true}}
            }
        }
    });
}

function drawRateHistoryChart(){
    var c=$('rateHistoryChart');
    if(!c)return;
    if(rateHistoryChart){rateHistoryChart.destroy();rateHistoryChart=null;}
    var ctx=c.getContext('2d');
    var theme=getChartTheme();

    if(rateHistory.length<2){
        rateHistoryChart=new Chart(ctx,{type:'line',data:{labels:[],datasets:[{label:'Курс',data:[],borderColor:theme.accent,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:theme.textMuted}}}}});
        return;
    }
    rateHistoryChart=new Chart(ctx,{
        type:'line',
        data:{labels:rateHistory.map(function(x){return x.date.toLocaleDateString('ru-RU')+' '+x.date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}),datasets:[{label:'Курс USD/RUB',data:rateHistory.map(function(x){return x.rate;}),borderColor:theme.accent,backgroundColor:theme.grid,borderWidth:2,pointBackgroundColor:theme.accent,pointRadius:2,tension:0.2,fill:true}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:theme.textMuted}},tooltip:{callbacks:{label:function(c){return c.parsed.y.toFixed(2)+' ₽';}}}},scales:{y:{grid:{color:theme.grid},ticks:{color:theme.textMuted,callback:function(v){return v.toFixed(2)+' ₽';}}},x:{grid:{color:theme.grid},ticks:{color:theme.textMuted,maxTicksLimit:15,maxRotation:30,autoSkip:true}}}}
    });
}

function setRate(rate){
    if(isNaN(rate)||rate<=0){alert('Введите корректный курс');return;}
    var old=currentUsdRate;
    currentUsdRate=rate;
    saveRate(rate);
    $('rateInfo').textContent='1 USD = '+rate.toFixed(2)+' ₽';
    $('rateInfoSmall').textContent='1 USD = '+rate.toFixed(2)+' ₽';
    var diff=((rate-old)/old*100).toFixed(2);
    var rc=$('rateChangeInfo');
    rc.textContent=diff>=0?'📈 +'+diff+'%':'📉 '+diff+'%';
    rc.style.background=diff>=0?'var(--green-bg)':'var(--red-bg)';
    rc.style.color=diff>=0?'var(--green)':'var(--red)';
    updateWithFilter(currentFilter);
}

function fetchLiveRate(){
    return fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            if (data.result !== 'success' || !data.rates || !data.rates.RUB) throw new Error('Invalid response');
            var rubRate = data.rates.RUB;
            if (isNaN(rubRate) || rubRate <= 0) throw new Error('Invalid rate');
            return { rate: rubRate, updatedAt: data.time_last_update_utc || '' };
        });
}

function updateRateFromAPI(){
    var btn = $('fetchRateBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Загрузка...'; }
    $('fileStatus').textContent = '🌐 Запрос курса с open.er-api.com...';

    fetchLiveRate()
        .then(function(res) {
            setRate(res.rate);
            $('usdRateInput').value = res.rate.toFixed(2);
            $('fileStatus').textContent = '✅ Курс: 1 USD = ' + res.rate.toFixed(2) + ' ₽';

            var now = new Date();
            var alreadyToday = rateHistory.some(function(h) {
                return h.date.toDateString() === now.toDateString() && Math.abs(h.rate - res.rate) < 0.001;
            });
            if (!alreadyToday) {
                rateHistory.push({ date: now, rate: res.rate });
                saveRateHistory(rateHistory);
                drawRateHistoryChart();
            }
            markSynced();
            renderRateFreshness();
            pushRateToGitHub();
        })
        .catch(function(e) {
            $('fileStatus').textContent = '❌ Не удалось получить курс: ' + e.message;
        })
        .finally(function() {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Онлайн'; }
        });
}

function pushRateToGitHub(){
    var token = getToken();
    if (!token) {
        $('fileStatus').textContent = '⚠️ Курс обновлён локально. Для синхронизации нужен токен.';
        return Promise.resolve(false);
    }

    var lines = rateHistory.map(function(h) {
        var d = pad(h.date.getDate()), mo = pad(h.date.getMonth() + 1), y = h.date.getFullYear();
        var hh = pad(h.date.getHours()), mi = pad(h.date.getMinutes());
        return d + '.' + mo + '.' + y + ', ' + hh + ':' + mi + ' | ' + h.rate.toFixed(2);
    });
    var newText = lines.join('\n');
    var updatedJson = JSON.stringify({ text: newText });
    var updatedB64 = btoa(unescape(encodeURIComponent(updatedJson)));

    function attempt(retriesLeft){
        return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/rate.json', {
            headers: { 'Authorization': 'token ' + token },
            cache: 'no-store'
        })
        .then(function(r) {
            if (r.status === 404) return { sha: null };
            if (!r.ok) throw new Error('GET: ' + r.status);
            return r.json();
        })
        .then(function(meta) {
            var body = { message: 'Курс ' + currentUsdRate.toFixed(2) + ' ₽ (' + rateHistory.length + ')', content: updatedB64 };
            if (meta.sha) body.sha = meta.sha;
            return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/rate.json', {
                method: 'PUT',
                headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        })
        .then(function(r) {
            if (r.status === 409 && retriesLeft > 0) {
                return attempt(retriesLeft - 1);
            }
            if (!r.ok) throw new Error('PUT: ' + r.status);
            return r.json();
        });
    }

    return attempt(3)
    .then(function() { $('fileStatus').textContent = '✅ rate.json обновлён (' + rateHistory.length + ')'; markSynced(); renderRateFreshness(); return true; })
    .catch(function(e) { $('fileStatus').textContent = '❌ rate.json: ' + e.message; return false; });
}

function loadData(showStatus){
    if(showStatus)$('fileStatus').textContent='⏳ Загрузка...';
    return fetch('stats2.json?t='+Date.now(),{cache:'no-store'})
        .then(function(r){if(!r.ok)throw new Error('not found');return r.text();})
        .then(function(txt){
            var txs=parseData(txt);
            if(txs.length){
                initData(txs);
                markSynced();
                if(showStatus)$('fileStatus').textContent='✅ Загружено с GitHub: '+txs.length;
                return true;
            }
            throw new Error('empty');
        })
        .catch(function(){
            var stored=loadTransactions();
            if(stored&&stored.length){
                initData(stored);
                if(showStatus)$('fileStatus').textContent='📂 Из кэша: '+stored.length;
                return true;
            }
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
                rateHistory=history;
                saveRateHistory(history);
                setRate(history[history.length-1].rate);
                $('usdRateInput').value=history[history.length-1].rate.toFixed(2);
                if(showStatus)$('fileStatus').textContent='✅ Курс: '+history.length+' записей';
                drawRateHistoryChart();
                renderRateFreshness();
                return true;
            }
            throw new Error('empty');
        })
        .catch(function(){
            var stored=loadRateHistory();
            if(stored&&stored.length){
                rateHistory=stored;
                setRate(stored[stored.length-1].rate);
                $('usdRateInput').value=stored[stored.length-1].rate.toFixed(2);
                drawRateHistoryChart();
                renderRateFreshness();
                return true;
            }
            return false;
        });
}

function fillCategories(type){
    var list=type==='income'?CATEGORIES_INCOME:CATEGORIES_EXPENSE;
    var sel=$('txCategory');sel.innerHTML='';
    for(var i=0;i<list.length;i++){
        var o=document.createElement('option');o.value=list[i];o.textContent=list[i];sel.appendChild(o);
    }
}

function openTxModal(editIdx,presetType){
    editingIndex=(typeof editIdx==='number')?editIdx:-1;
    var title=$('txModalTitle');
    if(editingIndex>=0){
        var tx=allTransactions[editingIndex];
        title.textContent='✏️ Редактировать';
        currentTxType=tx.type;
        var btns=document.querySelectorAll('.type-btn');
        for(var i=0;i<btns.length;i++)btns[i].classList.toggle('active',btns[i].dataset.type===tx.type);
        fillCategories(tx.type);
        $('txRub').value=tx.rub||'';
        $('txUsd').value=tx.usd||'';
        $('txNote').value=(tx.note&&tx.note!=='-')?tx.note:'';
        var d=tx.date;
        $('txDateTime').value=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
        if(tx.category){
            var exists=false;
            var opts=$('txCategory').options;
            for(var i=0;i<opts.length;i++)if(opts[i].value===tx.category){exists=true;break;}
            if(!exists){var o=document.createElement('option');o.value=tx.category;o.textContent=tx.category;$('txCategory').appendChild(o);}
            $('txCategory').value=tx.category;
        }
    } else {
        title.textContent='➕ Новая транзакция';
        currentTxType=presetType||'income';
        var btns=document.querySelectorAll('.type-btn');
        for(var i=0;i<btns.length;i++)btns[i].classList.toggle('active',btns[i].dataset.type===currentTxType);
        fillCategories(currentTxType);
        $('txRub').value='';$('txUsd').value='';$('txNote').value='';
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
    var tx=allTransactions[i];
    if(!tx)return;
    if(!confirm('Удалить транзакцию?\n'+tx.category+'\n'+tx.rub+' ₽'))return;
    allTransactions.splice(i,1);
    saveTransactions(allTransactions);
    updateWithFilter(currentFilter);
    $('fileStatus').textContent='🗑️ Удалено';
}

function openCategoryDetail(type){
    var filtered=filterTransactions(allTransactions,currentFilter);
    var catList=aggregateByCategory(filtered,type);
    if(!catList.length){alert('Нет данных за выбранный период');return;}
    var total=0;
    for(var i=0;i<catList.length;i++)total+=catList[i].value;
    var periodNames={day:'Сегодня',week:'За 7 дней',month:'За месяц',all:'За всё время'};
    var typeName=type==='expense'?'Расходы':'Доходы';

    $('catDetailTitle').textContent=typeName+' '+periodNames[currentFilter].toLowerCase();
    $('catDetailTotal').textContent=total.toLocaleString('ru-RU')+' ₽';
    $('catDetailTotalLabel').textContent=type==='expense'?'всего расходов':'всего доходов';

    var top=catList[0];
    var topPct=((top.value/total)*100).toFixed(1);
    $('catDetailTopCat').textContent=top.label;
    $('catDetailTopDesc').textContent=top.value.toLocaleString('ru-RU')+' ₽ · '+topPct+'% всех '+(type==='expense'?'расходов':'доходов');

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
        var x=catList[i];
        var pct=(x.value/total)*100;
        var item=document.createElement('div');item.className='cdl-item';
        item.innerHTML='<div class="cdl-row"><div class="cdl-left"><span class="cdl-dot" style="background:'+colors[i]+'"></span><span class="cdl-name">'+x.label+'</span></div><div class="cdl-right"><span class="cdl-amount">'+x.value.toLocaleString('ru-RU')+' ₽</span><span class="cdl-percent">'+pct.toFixed(1)+'%</span></div></div><div class="cdl-bar"><div class="cdl-bar-fill" style="width:'+pct+'%;background:'+colors[i]+'"></div></div>';
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

function startAutoUpdate(){
    if(autoUpdateTimer)clearInterval(autoUpdateTimer);
    autoUpdateTimer=setInterval(function(){
        if(!dataLoaded)return;
        fetch('stats2.json?t='+Date.now(),{cache:'no-store'})
            .then(function(r){if(!r.ok)throw 0;return r.text();})
            .then(function(txt){
                var txs=parseData(txt);
                if(txs.length&&txs.length!==allTransactions.length){
                    allTransactions=txs;
                    saveTransactions(txs);
                    updateWithFilter(currentFilter);
                }
            })
            .catch(function(){});
    },60000);
}

/* ===== SETTINGS PAGE ===== */
function updateTokenStatus(){
    var el=$('tokenStatus');
    if(!el)return;
    var t=getToken();
    if(t){
        el.textContent='✓ '+t.slice(0,7)+'...'+t.slice(-4);
        el.style.color='var(--green)';
    } else {
        el.textContent='не задан';
        el.style.color='var(--text-muted)';
    }
}

function renderSettingsStats(){
    if($('settingsTxCount'))$('settingsTxCount').textContent=allTransactions.length;
    if($('settingsRateCount'))$('settingsRateCount').textContent=rateHistory.length;
    if($('settingsLastSync')){
        var ts=getLastSync();
        $('settingsLastSync').textContent=ts?timeAgo(ts):'—';
    }
}

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
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    var dd=new Date();
    var ds=dd.getFullYear()+'-'+pad(dd.getMonth()+1)+'-'+pad(dd.getDate());
    a.href=url;
    a.download='finance-export-'+ds+'.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $('fileStatus').textContent='📊 CSV: '+sorted.length+' транзакций';
}

function exportAllData(){
    if(!allTransactions.length&&!rateHistory.length){alert('Нет данных для экспорта');return;}
    var data={
        version:1,
        exportedAt:new Date().toISOString(),
        currentUsdRate:currentUsdRate,
        transactions:allTransactions.map(function(tx){
            return {type:tx.type,date:tx.date.toISOString(),usd:tx.usd,rub:tx.rub,category:tx.category,note:tx.note};
        }),
        rateHistory:rateHistory.map(function(h){
            return {date:h.date.toISOString(),rate:h.rate};
        })
    };
    var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    var d=new Date();
    var ds=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    a.href=url;
    a.download='finance-backup-'+ds+'.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $('fileStatus').textContent='💾 Экспортировано: '+allTransactions.length+' транзакций';
}

function importAllData(file){
    var reader=new FileReader();
    reader.onload=function(e){
        try{
            var data=JSON.parse(e.target.result);
            var txs=[];
            if(data.transactions&&Array.isArray(data.transactions)){
                txs=data.transactions.map(function(t){
                    return {type:t.type,date:new Date(t.date),usd:t.usd||0,rub:t.rub||0,category:t.category||'Без категории',note:t.note||'-'};
                });
            } else if(data.text&&typeof data.text==='string'){
                txs=parseData(JSON.stringify(data));
            } else {
                throw new Error('Неверный формат файла');
            }
            if(!txs.length){alert('Файл не содержит транзакций');return;}
            if(!confirm('Импортировать '+txs.length+' транзакций?\nТекущие данные будут заменены.'))return;

            allTransactions=txs;
            saveTransactions(allTransactions);

            if(data.rateHistory&&Array.isArray(data.rateHistory)){
                rateHistory=data.rateHistory.map(function(h){return {date:new Date(h.date),rate:h.rate};});
                saveRateHistory(rateHistory);
                if(rateHistory.length){
                    setRate(rateHistory[rateHistory.length-1].rate);
                    $('usdRateInput').value=rateHistory[rateHistory.length-1].rate.toFixed(2);
                    drawRateHistoryChart();
                    renderRateFreshness();
                }
            }
            dataLoaded=true;
            var fb=document.querySelectorAll('.filter-btn');
            for(var i=0;i<fb.length;i++)fb[i].classList.remove('disabled');
            updateWithFilter(currentFilter);
            renderSettingsStats();
            $('fileStatus').textContent='✅ Импортировано: '+txs.length;
        } catch(err){
            $('fileStatus').textContent='❌ Ошибка импорта: '+err.message;
            alert('Не удалось импортировать файл:\n'+err.message);
        }
    };
    reader.readAsText(file);
}

function clearAllDataConfirm(){
    if(!confirm('Удалить ВСЕ данные (транзакции и историю курса)?\n\nЭто действие нельзя отменить. Рекомендуем сначала сделать экспорт.'))return;
    if(!confirm('Точно удалить? Нажмите OK для подтверждения.'))return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RATE_STORAGE_KEY);
    localStorage.removeItem(RATE_HISTORY_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    allTransactions=[];rateHistory=[];dataLoaded=false;
    $('dashboard').classList.add('hidden');
    $('emptyState').classList.remove('hidden');
    var fb=document.querySelectorAll('.filter-btn');
    for(var i=0;i<fb.length;i++)fb[i].classList.add('disabled');
    if(expensePieChart){expensePieChart.destroy();expensePieChart=null;}
    if(incomePieChart){incomePieChart.destroy();incomePieChart=null;}
    if(rateHistoryChart){rateHistoryChart.destroy();rateHistoryChart=null;}
    if(balanceHistoryChart){balanceHistoryChart.destroy();balanceHistoryChart=null;}
    if(autoUpdateTimer){clearInterval(autoUpdateTimer);autoUpdateTimer=null;}
    renderSettingsStats();
    updateFreshness();
    renderRateFreshness();
    $('fileStatus').textContent='🗑️ Очищено';
}

/* ===== СОБЫТИЯ ===== */
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

$('addTxBtn').addEventListener('click',function(){openTxModal(-1);});
$('closeTxModal').addEventListener('click',closeTxModal);
$('cancelTxBtn').addEventListener('click',closeTxModal);

var typeBtns=document.querySelectorAll('.type-btn');
for(var i=0;i<typeBtns.length;i++){
    (function(btn){
        btn.addEventListener('click',function(){
            currentTxType=this.dataset.type;
            for(var j=0;j<typeBtns.length;j++)typeBtns[j].classList.remove('active');
            this.classList.add('active');
            fillCategories(currentTxType);
        });
    })(typeBtns[i]);
}

$('saveTxBtn').addEventListener('click',function(){
    var rub=parseFloat($('txRub').value)||0;
    var usd=parseFloat($('txUsd').value)||0;
    var category=$('txCategory').value;
    var note=$('txNote').value.trim()||'-';
    var dtVal=$('txDateTime').value;
    if(rub<=0&&usd<=0){alert('Введите хотя бы одну сумму');return;}
    if(!dtVal){alert('Укажите дату и время');return;}
    var dt=new Date(dtVal);
    var d=pad(dt.getDate()),mo=pad(dt.getMonth()+1),y=dt.getFullYear(),h=pad(dt.getHours()),mi=pad(dt.getMinutes());
    var dateStr=d+'.'+mo+'.'+y+', '+h+':'+mi;
    var typeLabel=currentTxType==='income'?'🟢 ДОХОД':'🔴 РАСХОД';
    var usdLabel=usd>0?usd+' Долларов 🇺🇸':'0 Долларов 🇺🇸';
    var rubLabel=rub+' Рублей 🇷🇺';
    var line=typeLabel+' | '+dateStr+' | '+usdLabel+'  -> '+rubLabel+' | '+category+' | '+note;
    var newTx=parseLine(line);
    if(!newTx){alert('Ошибка при разборе');return;}
    if(editingIndex>=0){
        allTransactions[editingIndex]=newTx;
        $('fileStatus').textContent='✏️ Отредактировано';
    } else {
        allTransactions.push(newTx);
        $('fileStatus').textContent='➕ Добавлено';
    }
    saveTransactions(allTransactions);
    updateWithFilter(currentFilter);
    closeTxModal();
});

$('syncBtn').addEventListener('click',function(){
    if(!allTransactions.length){$('fileStatus').textContent='ℹ️ Нет данных';return;}
    var token=getToken();
    if(!token){$('tokenModal').classList.add('open');lockBackground();return;}
    $('fileStatus').textContent='⏳ Синхронизация...';

    pushRateToGitHub();

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

    fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/stats2.json',{headers:{'Authorization':'token '+token},cache:'no-store'})
        .then(function(r){if(!r.ok)throw new Error('GET: '+r.status);return r.json();})
        .then(function(meta){
            return fetch('https://api.github.com/repos/arturskvortsov-boop/finance-dashboard/contents/stats2.json',{
                method:'PUT',
                headers:{'Authorization':'token '+token,'Content-Type':'application/json'},
                body:JSON.stringify({message:'Синхронизация PWA ('+allTransactions.length+')',content:updatedB64,sha:meta.sha})
            });
        })
        .then(function(r){if(!r.ok)throw new Error('PUT: '+r.status);return r.json();})
        .then(function(){$('fileStatus').textContent='✅ Синхронизировано: '+allTransactions.length;markSynced();})
        .catch(function(e){$('fileStatus').textContent='❌ '+e.message;});
});

$('closeTokenModal').addEventListener('click',function(){$('tokenModal').classList.remove('open');unlockBackground();});
$('cancelTokenBtn').addEventListener('click',function(){$('tokenModal').classList.remove('open');unlockBackground();});
$('saveTokenBtn').addEventListener('click',function(){
    var t=$('githubTokenInput').value.trim();
    if(!t){alert('Введите токен');return;}
    setToken(t);
    $('tokenModal').classList.remove('open');
    unlockBackground();
    updateTokenStatus();
    $('fileStatus').textContent='✅ Токен сохранён';
});

$('refreshBtn').addEventListener('click',function(e){
    e.preventDefault();
    $('fileStatus').textContent='⏳ Обновление...';
    loadData(true).then(function(ok){if(!ok)$('fileStatus').textContent='❌ Не удалось';});
});

$('refreshRateChartBtn').addEventListener('click',function(e){e.preventDefault();drawRateHistoryChart();$('fileStatus').textContent='🔄 График обновлён';});
$('fetchRateBtn').addEventListener('click',function(e){e.preventDefault();updateRateFromAPI();});
$('usdRateInput').addEventListener('keydown',function(e){if(e.key==='Enter')setRate(parseFloat(this.value));});
$('updateRateBtn').addEventListener('click',function(){setRate(parseFloat($('usdRateInput').value));});

$('incomeChartBox').addEventListener('click',function(){openCategoryDetail('income');});
$('expenseChartBox').addEventListener('click',function(){openCategoryDetail('expense');});
$('closeCatDetailModal').addEventListener('click',closeCatDetail);
$('catDetailModal').addEventListener('click',function(e){if(e.target===this)closeCatDetail();});

/* Settings handlers */
$('settingsTokenBtn').addEventListener('click',function(){
    $('githubTokenInput').value=getToken();
    $('tokenModal').classList.add('open');
    lockBackground();
});
$('settingsClearTokenBtn').addEventListener('click',function(){
    if(!getToken()){alert('Токен не задан');return;}
    if(!confirm('Удалить сохранённый GitHub-токен?'))return;
    localStorage.removeItem(TOKEN_KEY);
    updateTokenStatus();
    $('fileStatus').textContent='🔑 Токен удалён';
});
$('settingsExportBtn').addEventListener('click',function(){exportAllData();});
$('settingsExportCsvBtn').addEventListener('click',function(){exportAllDataCSV();});
$('settingsImportBtn').addEventListener('click',function(){$('settingsImportInput').click();});
$('settingsImportInput').addEventListener('change',function(e){
    if(e.target.files&&e.target.files[0]){importAllData(e.target.files[0]);e.target.value='';}
});
$('settingsClearBtn').addEventListener('click',function(){clearAllDataConfirm();});

/* Theme buttons */
var themeBtns=document.querySelectorAll('.theme-btn');
for(var i=0;i<themeBtns.length;i++){
    (function(b){
        b.addEventListener('click',function(){setTheme(this.dataset.theme);});
    })(themeBtns[i]);
}
if(window.matchMedia){
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',function(){
        if(currentTheme==='auto')applyTheme('auto');
    });
}

/* ===== TX SEARCH & FILTER ===== */
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

/* ===== NAVIGATION ===== */
var navTabs=document.querySelectorAll('.nav-tab');
var pageOrder=['dashboard','currency','settings'];

function switchPage(page, direction){
    var currentPage='';
    for(var i=0;i<navTabs.length;i++){
        if(navTabs[i].classList.contains('active'))currentPage=navTabs[i].dataset.page;
    }
    if(currentPage===page&&!direction)return;

    if(!direction&&currentPage){
        var oi=pageOrder.indexOf(currentPage);
        var ni=pageOrder.indexOf(page);
        if(oi>=0&&ni>=0&&oi!==ni)direction=ni>oi?'left':'right';
    }
    if(!direction)direction='left';

    for(var i=0;i<navTabs.length;i++)navTabs[i].classList.toggle('active',navTabs[i].dataset.page===page);

    var pgMap={dashboard:$('pageDashboard'),currency:$('pageCurrency'),settings:$('pageSettings')};
    var next=pgMap[page];
    if(!next)return;

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
            animateCurrencyNumbers();
            renderRateFreshness();
        },80);
    } else if(page==='settings'){
        updateTokenStatus();
        renderSettingsStats();
    } else {
        setTimeout(function(){
            if(incomePieChart){try{incomePieChart.resize();}catch(e){}}
            if(expensePieChart){try{expensePieChart.resize();}catch(e){}}
            if(balanceHistoryChart){try{balanceHistoryChart.resize();}catch(e){}}
        },80);
    }
}
for(var i=0;i<navTabs.length;i++){
    (function(t){t.addEventListener('click',function(){switchPage(this.dataset.page);});})(navTabs[i]);
}
var usdQuick=$('bcUsdQuick');
if(usdQuick)usdQuick.addEventListener('click',function(){switchPage('currency');});

/* ===== SWIPE NAVIGATION ===== */
var swipeStartX=0,swipeStartY=0,swipeActive=false;
document.addEventListener('touchstart',function(e){
    if(e.touches.length!==1){swipeActive=false;return;}
    if(document.querySelector('.modal-overlay.open')){swipeActive=false;return;}
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
    for(var i=0;i<navTabs.length;i++)if(navTabs[i].classList.contains('active'))cur=navTabs[i].dataset.page;
    var idx=pageOrder.indexOf(cur);
    if(idx<0)return;
    if(dx<0&&idx<pageOrder.length-1)switchPage(pageOrder[idx+1],'left');
    else if(dx>0&&idx>0)switchPage(pageOrder[idx-1],'right');
},{passive:true});

/* ===== ANIMATED NUMBERS ===== */
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

/* ===== START ===== */
applyTheme(localStorage.getItem(THEME_KEY)||'dark');

var savedRate=loadRate();
if(savedRate){
    currentUsdRate=savedRate;
    $('usdRateInput').value=savedRate.toFixed(2);
    $('rateInfo').textContent='1 USD = '+savedRate.toFixed(2)+' ₽';
    $('rateInfoSmall').textContent='1 USD = '+savedRate.toFixed(2)+' ₽';
}

loadData(true).then(function(loaded){
    if(!loaded){
        $('dashboard').classList.add('hidden');
        $('emptyState').classList.remove('hidden');
        $('fileStatus').textContent='📂 Загрузите JSON или проверьте GitHub';
    }
    return loadRateHistoryFromServer(false);
}).then(function(){
    setTimeout(drawRateHistoryChart,500);
    startFreshnessTimer();
    updateTokenStatus();
    renderSettingsStats();
    var lastRateEntry = rateHistory[rateHistory.length - 1];
    var stale = !lastRateEntry || (Date.now() - lastRateEntry.date.getTime()) > 12 * 60 * 60 * 1000;
    if (stale) setTimeout(function() { updateRateFromAPI(); }, 1200);
});

})();