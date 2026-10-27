/* Runs first in every game page the app shows, before the game's own scripts (the app puts it at the top of <head>). */

/* 통계: this phone is never counted. The engine reads walk-count before it counts anything, the same key ?count=0 sets (the app opens
   every game with ?count=0 too); and should storage be cleared mid-visit, a count beacon is still dropped here. */
try{localStorage.setItem('walk-count','0')}catch(e){}
(function(){var send=navigator.sendBeacon&&navigator.sendBeacon.bind(navigator);
 if(send)navigator.sendBeacon=function(u,d){return /\/api\/word-reports\/count/.test(String(u))?true:send(u,d)}})();

/* Speech: Android's WebView has no speechSynthesis, so the games' voice (lines read aloud, 듣기 문제) goes to the phone's own
   text-to-speech through the app (WalkTTS). The engine only uses getVoices, onvoiceschanged, speak and cancel. The voices arrive
   when the phone's speech engine is ready (__walkVoices), which can be after the page starts. */
(function(){if(!window.WalkTTS)return;var voices=[];try{voices=JSON.parse(WalkTTS.voices())}catch(e){}
 function Utterance(t){this.text=t==null?'':String(t);this.lang='';this.voice=null;this.rate=1;this.pitch=1;this.volume=1}
 var S={speaking:false,pending:false,paused:false,onvoiceschanged:null,
  getVoices:function(){return voices.slice()},
  speak:function(u){WalkTTS.speak(String(u.text||''),String((u.voice&&u.voice.lang)||u.lang||''),+u.rate||1,+u.pitch||1)},
  cancel:function(){WalkTTS.stop()},pause:function(){},resume:function(){},addEventListener:function(){},removeEventListener:function(){}};
 try{Object.defineProperty(window,'speechSynthesis',{value:S,configurable:true});
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true,writable:true})}catch(e){}
 window.__walkVoices=function(v){voices=v||[];if(S.onvoiceschanged)try{S.onvoiceschanged()}catch(e){}};
})();

/* Sharing: WebView has no navigator.share, so the games' 보내기 (send to Claude, ChatGPT, Gemini…) goes to Android's share sheet. */
if(window.WalkShare){navigator.share=function(d){d=d||{};WalkShare.share(String([d.title,d.text,d.url].filter(Boolean).join('\n')));return Promise.resolve()};navigator.canShare=function(){return true}}
