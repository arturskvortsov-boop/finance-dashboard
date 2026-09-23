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
var TEMPLATES_KEY='financeTemplates';
var BUDGETS_KEY='financeBudgets';
var GOALS_KEY='financeGoals';
var HIDE_BALANCE_KEY='hideBalance';

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
var autoUpdateTimer=null, freshnessTimer=null;
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
    var m=String(cat).trim().match(/^(\S