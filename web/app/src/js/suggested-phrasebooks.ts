import type { Candidate, Lang, Phrase, PhrasebookDialogueLine } from '@catchphrase/card-schema';

export interface SuggestedGroup {
  title: string;
  essentials: Phrase[];
  vocab: Candidate[];
  dialogue: Omit<PhrasebookDialogueLine, 'id'>[];
}
export interface SuggestedPhrasebook {
  id: string;
  emoji: string;
  title: string;
  lang: Lang;
  groups: SuggestedGroup[];
}

export const SUGGESTED_PHRASEBOOKS: SuggestedPhrasebook[] = [
  {
    id:'seed-greetings-ja', emoji:'👋', title:'Greetings', lang:'ja',
    groups:[
      {
        title:'Say hello',
        essentials:[{lang:'ja',type:'phrase',text:'こんにちは',translation:'hello',reading:[['こんにちは',null]]}],
        vocab:[],
        dialogue:[
          {speaker:'you',card:{lang:'ja',type:'phrase',text:'こんにちは',translation:'Hello.',reading:[['こんにちは',null]]}},
          {speaker:'partner',card:{lang:'ja',type:'phrase',text:'こんにちは',translation:'Hello.',reading:[['こんにちは',null]]}},
        ],
      },
      {
        title:'General greetings',
        essentials:[
          {lang:'ja',type:'phrase',text:'おはようございます',translation:'good morning',reading:[['おはようございます',null]]},
          {lang:'ja',type:'phrase',text:'こんばんは',translation:'good evening',reading:[['こんばんは',null]]},
        ],
        vocab:[],
        dialogue:[
          {speaker:'you',card:{lang:'ja',type:'phrase',text:'おはようございます',translation:'Good morning.',reading:[['おはようございます',null]]}},
          {speaker:'partner',card:{lang:'ja',type:'phrase',text:'おはようございます',translation:'Good morning.',reading:[['おはようございます',null]]}},
        ],
      },
      {
        title:'Ask how someone is',
        essentials:[{lang:'ja',type:'phrase',text:'お元気ですか',translation:'how are you?',reading:[['お',null],['元','げん'],['気','き'],['ですか',null]]}],
        vocab:[],
        dialogue:[
          {speaker:'you',card:{lang:'ja',type:'phrase',text:'お元気ですか',translation:'How are you?',reading:[['お',null],['元','げん'],['気','き'],['ですか',null]]}},
          {speaker:'partner',card:{lang:'ja',type:'phrase',text:'はい、元気です',translation:'Yes, I’m well.',reading:[['はい、',null],['元','げん'],['気','き'],['です',null]]}},
        ],
      },
    ],
  },
  {
    id:'seed-directions-ja', emoji:'🧭', title:'Directions', lang:'ja',
    groups:[{
      title:'Find your way',
      essentials:[{lang:'ja',type:'phrase',text:'まっすぐ行ってください',translation:'please go straight',reading:[['まっすぐ',null],['行','い'],['ってください',null]]}],
      vocab:[
        {card:{lang:'ja',type:'word',text:'右',translation:'right',partOfSpeech:'noun',senseKey:'right-direction',reading:[['右','みぎ']]}},
        {card:{lang:'ja',type:'word',text:'左',translation:'left',partOfSpeech:'noun',senseKey:'left-direction',reading:[['左','ひだり']]}},
      ],
      dialogue:[
        {speaker:'you',card:{lang:'ja',type:'phrase',text:'駅はどこですか',translation:'Where is the station?',reading:[['駅','えき'],['はどこですか',null]]}},
        {speaker:'partner',card:{lang:'ja',type:'phrase',text:'まっすぐ行ってください',translation:'Please go straight.',reading:[['まっすぐ',null],['行','い'],['ってください',null]]}},
      ],
    }],
  },
  {
    id:'seed-restaurant-ja', emoji:'🍜', title:'Eating at a restaurant', lang:'ja',
    groups:[{
      title:'Order and pay',
      essentials:[
        {lang:'ja',type:'phrase',text:'注文してもいいですか',translation:'may I order?',reading:[['注','ちゅう'],['文','もん'],['してもいいですか',null]]},
        {lang:'ja',type:'phrase',text:'お会計お願いします',translation:'check, please',reading:[['お',null],['会','かい'],['計','けい'],['お願いします',null]]},
      ],
      vocab:[{card:{lang:'ja',type:'word',text:'メニュー',translation:'menu',partOfSpeech:'noun',senseKey:'food-menu',reading:[['メニュー',null]]}}],
      dialogue:[
        {speaker:'you',card:{lang:'ja',type:'phrase',text:'注文してもいいですか',translation:'May I order?',reading:[['注','ちゅう'],['文','もん'],['してもいいですか',null]]}},
        {speaker:'partner',card:{lang:'ja',type:'phrase',text:'はい、どうぞ',translation:'Yes, go ahead.',reading:[['はい、どうぞ',null]]}},
      ],
    }],
  },
  {
    id:'seed-exclamations-ja', emoji:'🗣️', title:'Exclamations', lang:'ja',
    groups:[{
      title:'Encourage someone',
      essentials:[
        {lang:'ja',type:'phrase',text:'すごい',translation:'amazing!',reading:[['すごい',null]]},
        {lang:'ja',type:'phrase',text:'頑張って',translation:'good luck!',reading:[['頑','がん'],['張','ば'],['って',null]]},
      ],
      vocab:[],
      dialogue:[
        {speaker:'you',card:{lang:'ja',type:'phrase',text:'頑張って',translation:'Good luck!',reading:[['頑','がん'],['張','ば'],['って',null]]}},
        {speaker:'partner',card:{lang:'ja',type:'phrase',text:'ありがとう',translation:'Thank you.',reading:[['ありがとう',null]]}},
      ],
    }],
  },
];

export function pendingSuggestions(seededDeckIds: ReadonlySet<string>): SuggestedPhrasebook[] {
  return SUGGESTED_PHRASEBOOKS.filter(suggestion => !seededDeckIds.has(suggestion.id));
}
