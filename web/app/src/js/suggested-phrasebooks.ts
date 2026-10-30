import type { Lang, Phrase, PhrasebookConversationLine, PhrasebookWordFamily } from '@catchphrase/card-schema';

export interface SuggestedGroup {
  title: string;
  thingsToSay: Phrase[];
  likelyExchanges: {
    title: string;
    lines: { speaker: 'you' | 'partner'; responses: Phrase[] }[];
  }[];
  words: { title: string; items: PhrasebookWordFamily['items'] }[];
  exampleConversation: Omit<PhrasebookConversationLine, 'id'>[];
}
export interface SuggestedPhrasebook {
  id: string;
  emoji: string;
  title: string;
  lang: Lang;
  groups: SuggestedGroup[];
}

const phrase = (text: string, translation: string, reading?: Phrase['reading']): Phrase => ({
  lang: 'ja', type: 'phrase', text, translation, ...(reading ? { reading } : {}),
});
const word = (text: string, translation: string, senseKey: string, reading?: Phrase['reading']): PhrasebookWordFamily['items'][number] => ({
  card: { lang: 'ja', type: 'word', text, translation, partOfSpeech: 'noun', senseKey,
    ...(reading ? { reading } : {}) },
});
const hello = phrase('こんにちは', 'Hello.', [['こんにちは', null]]);
const morning = phrase('おはようございます', 'Good morning.', [['おはようございます', null]]);
const evening = phrase('こんばんは', 'Good evening.', [['こんばんは', null]]);
const howAreYou = phrase('お元気ですか', 'How are you?', [['お', null], ['元', 'げん'], ['気', 'き'], ['ですか', null]]);
const well = phrase('はい、元気です', 'Yes, I’m well.', [['はい、', null], ['元', 'げん'], ['気', 'き'], ['です', null]]);
const thanks = phrase('ありがとう', 'Thank you.', [['ありがとう', null]]);
const station = phrase('駅はどこですか', 'Where is the station?', [['駅', 'えき'], ['はどこですか', null]]);
const straight = phrase('まっすぐ行ってください', 'Please go straight.', [['まっすぐ', null], ['行', 'い'], ['ってください', null]]);
const order = phrase('注文してもいいですか', 'May I order?', [['注', 'ちゅう'], ['文', 'もん'], ['してもいいですか', null]]);
const goAhead = phrase('はい、どうぞ', 'Yes, go ahead.', [['はい、どうぞ', null]]);
const bill = phrase('お会計お願いします', 'Check, please.', [['お', null], ['会', 'かい'], ['計', 'けい'], ['お願いします', null]]);
const goodLuck = phrase('頑張って', 'Good luck!', [['頑', 'がん'], ['張', 'ば'], ['って', null]]);
const amazing = phrase('すごい', 'Amazing!', [['すごい', null]]);

export const SUGGESTED_PHRASEBOOKS: SuggestedPhrasebook[] = [
  {
    id: 'seed-greetings-ja', emoji: '👋', title: 'Greetings', lang: 'ja',
    groups: [
      {
        title: 'Say hello',
        thingsToSay: [hello],
        likelyExchanges: [{ title: 'Meet someone', lines: [
          { speaker: 'you', responses: [hello] },
          { speaker: 'partner', responses: [hello, phrase('どうも', 'Hi.', [['どうも', null]])] },
        ] }],
        words: [{ title: 'People you greet', items: [
          word('友達', 'friend', 'friend', [['友', 'とも'], ['達', 'だち']]),
          word('先生', 'teacher', 'teacher', [['先', 'せん'], ['生', 'せい']]),
        ] }],
        exampleConversation: [{ speaker: 'you', card: hello }, { speaker: 'partner', card: hello }],
      },
      {
        title: 'General greetings',
        thingsToSay: [morning, evening],
        likelyExchanges: [{ title: 'Greet someone in the morning', lines: [
          { speaker: 'you', responses: [morning] },
          { speaker: 'partner', responses: [morning, phrase('おはよう', 'Morning!', [['おはよう', null]])] },
        ] }],
        words: [{ title: 'Times of day', items: [
          word('朝', 'morning', 'morning', [['朝', 'あさ']]),
          word('夜', 'night', 'night', [['夜', 'よる']]),
        ] }],
        exampleConversation: [{ speaker: 'you', card: morning }, { speaker: 'partner', card: morning }],
      },
      {
        title: 'Ask how someone is',
        thingsToSay: [howAreYou],
        likelyExchanges: [{ title: 'Catch up', lines: [
          { speaker: 'you', responses: [howAreYou] },
          { speaker: 'partner', responses: [well, phrase('まあまあです', 'I’m okay.', [['まあまあです', null]])] },
        ] }],
        words: [{ title: 'How you feel', items: [
          word('元気', 'good health', 'health', [['元', 'げん'], ['気', 'き']]),
          word('疲れ', 'tiredness', 'fatigue', [['疲', 'つか'], ['れ', null]]),
        ] }],
        exampleConversation: [{ speaker: 'you', card: howAreYou }, { speaker: 'partner', card: well }],
      },
    ],
  },
  {
    id: 'seed-directions-ja', emoji: '🧭', title: 'Directions', lang: 'ja',
    groups: [{
      title: 'Find your way',
      thingsToSay: [station, straight],
      likelyExchanges: [{ title: 'Ask for the station', lines: [
        { speaker: 'you', responses: [station] },
        { speaker: 'partner', responses: [straight,
          phrase('右に曲がってください', 'Please turn right.', [['右', 'みぎ'], ['に', null], ['曲', 'ま'], ['がってください', null]])] },
      ] }],
      words: [{ title: 'Directions', items: [
        word('右', 'right', 'right-direction', [['右', 'みぎ']]),
        word('左', 'left', 'left-direction', [['左', 'ひだり']]),
      ] }],
      exampleConversation: [{ speaker: 'you', card: station }, { speaker: 'partner', card: straight },
        { speaker: 'you', card: thanks }],
    }],
  },
  {
    id: 'seed-restaurant-ja', emoji: '🍜', title: 'Eating at a restaurant', lang: 'ja',
    groups: [{
      title: 'Order and pay',
      thingsToSay: [order, bill],
      likelyExchanges: [{ title: 'Place an order', lines: [
        { speaker: 'you', responses: [order] },
        { speaker: 'partner', responses: [goAhead,
          phrase('少々お待ちください', 'Please wait a moment.', [['少々', 'しょうしょう'], ['お', null], ['待', 'ま'], ['ちください', null]])] },
      ] }],
      words: [{ title: 'At the table', items: [
        word('メニュー', 'menu', 'food-menu', [['メニュー', null]]),
        word('水', 'water', 'drinking-water', [['水', 'みず']]),
      ] }],
      exampleConversation: [{ speaker: 'you', card: order }, { speaker: 'partner', card: goAhead },
        { speaker: 'you', card: phrase('これをお願いします', 'This one, please.', [['これをお', null], ['願', 'ねが'], ['いします', null]]) }],
    }],
  },
  {
    id: 'seed-exclamations-ja', emoji: '🗣️', title: 'Exclamations', lang: 'ja',
    groups: [{
      title: 'Encourage someone',
      thingsToSay: [amazing, goodLuck],
      likelyExchanges: [{ title: 'Offer encouragement', lines: [
        { speaker: 'you', responses: [goodLuck] },
        { speaker: 'partner', responses: [thanks,
          phrase('頑張ります', 'I’ll do my best.', [['頑', 'がん'], ['張', 'ば'], ['ります', null]])] },
      ] }],
      words: [{ title: 'Effort and results', items: [
        word('練習', 'practice', 'practice', [['練', 'れん'], ['習', 'しゅう']]),
        word('成功', 'success', 'success', [['成', 'せい'], ['功', 'こう']]),
      ] }],
      exampleConversation: [{ speaker: 'you', card: goodLuck }, { speaker: 'partner', card: thanks }],
    }],
  },
];

export function pendingSuggestions(seededDeckIds: ReadonlySet<string>): SuggestedPhrasebook[] {
  return SUGGESTED_PHRASEBOOKS.filter(suggestion => !seededDeckIds.has(suggestion.id));
}
