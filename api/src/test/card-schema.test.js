'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCard, validateCandidate, validateCardBatch, validateEvidence,
  cardIdentity, evidenceIdentity, validateBreakdownRequest, validateBreakdownResponse, validatePhrasebookResponse,
} = require('../schema');
const word = {type:'word', lang:'ja', text:'食べる', translation:'eat', partOfSpeech:'verb', senseKey:'consume-food', reading:[['食','た'],['べる',null]]};
const source = {snapshot:{lang:'ja',text:'肉も魚も食べません。',translation:'I do not eat meat or fish.',reading:[['肉','にく'],['も',null],['魚','さかな'],['も',null],['食','た'],['べません。',null]]},span:{start:0,end:2}};
const chunk = {type:'chunk',lang:'ja',text:'肉も',translation:'neither meat',source,role:'negative listing',explanation:'Includes meat in the negative list.'};
const usage = {model:'fixture',inputTokens:0,outputTokens:0,totalTokens:0,costUsd:null,durationMs:0};

test('sense identities ignore gloss wording but preserve distinct senses and conservative spelling', () => {
  assert.equal(cardIdentity(validateCard(word)), cardIdentity(validateCard({...word,translation:'to eat'})));
  assert.notEqual(cardIdentity(word), cardIdentity({...word,senseKey:'consume-resources'}));
  const spanish = {...word,lang:'es',text:'Comer',reading:undefined};
  delete spanish.reading;
  assert.notEqual(cardIdentity(spanish),cardIdentity({...spanish,text:'comer'}));
  assert.equal(cardIdentity({...spanish,text:' café '}),cardIdentity({...spanish,text:'cafe\u0301'}));
});

test('all content boundaries reject malformed variants and readings rather than dropping fields', () => {
  for (const bad of [null, [], {...word,type:'sentence'}, {...word,senseKey:''}, {...word,partOfSpeech:undefined}, {...word,state:{}}, {...word,context:'Dinner'}, {...word,reading:[['食','た','extra'],['べる',null]]}, {...word,reading:[['食べました','たべました']]}, {...chunk,source:undefined}, {...word,example:{text:'食べる',reading:[['食','た']],translation:'eat'}}, {...word,example:{text:'食べる',translation:''}}]) {
    assert.throws(()=>validateCard(bad));
    assert.throws(()=>validateCandidate({card:bad}));
    assert.throws(()=>validateCardBatch({schemaVersion:2,cards:[{card:bad}]}));
  }
  assert.throws(()=>validateCardBatch({cards:[{card:word}]}));
  assert.throws(()=>validateCandidate({card:chunk,sources:[source]}));
});

test('historical evidence remains self contained and repeated positions have separate identity', () => {
  validateCard(chunk);
  const repeated = {snapshot:{lang:'zh',text:'哈哈，哈哈！',translation:'Ha ha, ha ha!'},span:{start:0,end:2}};
  const second = {...repeated,span:{start:3,end:5}};
  validateEvidence(repeated); validateEvidence(second);
  assert.notEqual(evidenceIdentity(repeated),evidenceIdentity(second));
  assert.notEqual(evidenceIdentity(source),evidenceIdentity({...source,snapshot:{...source.snapshot,translation:'No meat or fish for me.'}}));
  validateEvidence({...source,ref:{cardId:'deleted-parent',occurrenceId:'deleted-occurrence'}});
  for (const span of [{start:0,end:1},{start:1,end:2}]) {
    assert.throws(()=>validateEvidence({snapshot:{lang:'ja',text:'😀',translation:'smile'},span}));
  }
  assert.throws(()=>validateCard({...chunk,text:'魚も'}));
  assert.throws(()=>validateCandidate({card:word,sources:[{...source,snapshot:{...source.snapshot,lang:'zh'}}]}));
});

test('wire analysis binds all candidate evidence to the exact request snapshot', () => {
  const snapshot = {lang:'es',text:'caluroso',translation:'hot'};
  const request = validateBreakdownRequest({schemaVersion:2,source:{snapshot}});
  const card = {type:'word',lang:'es',text:'caluroso',translation:'hot',partOfSpeech:'adjective',senseKey:'high-temperature'};
  const response = {schemaVersion:2,chunks:[{start:0,end:8,text:'caluroso',gloss:'hot',role:'adjective',explanation:'Describes hot weather.',words:[{card,sources:[{snapshot,span:{start:0,end:8}}]}],target:{kind:'word',index:0}}],usage};
  validateBreakdownResponse(response,request);
  const hostile = structuredClone(response);
  hostile.chunks[0].words[0].sources[0].snapshot.translation='Another interpretation';
  assert.throws(()=>validateBreakdownResponse(hostile,request));
  const inflected = structuredClone(response);
  inflected.chunks[0].words[0].card.text='calor';
  assert.throws(()=>validateBreakdownResponse(inflected,request));
});

test('phrasebook draft evidence cannot cross conversation groups or substitute snapshots', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const groupId = '00000000-0000-4000-8000-000000000002';
  const snapshot = source.snapshot;
  const response = {schemaVersion:2,title:'Dinner',usage,flags:[
    {code:'vocab-source-missing',groupIndex:0,vocabIndex:1,reason:'omitted'},
    {code:'vocab-source-missing',groupIndex:0,vocabIndex:2,reason:'unresolved'},
  ],groups:[{
    id:groupId,title:'Dinner',phrases:[{id,card:{type:'phrase',...snapshot},speaker:'you'},
      {id:'00000000-0000-4000-8000-000000000004',card:{type:'phrase',lang:'ja',text:'はい。',translation:'Yes.'},speaker:'partner'}],
    vocab:[{card:word,sources:[{snapshot,ref:{occurrenceId:id},span:{start:4,end:9}}]},
      {card:{...word,text:'肉',reading:[['肉','にく']],translation:'meat',partOfSpeech:'noun',senseKey:'meat'}},
      {card:{...word,text:'魚',reading:[['魚','さかな']],translation:'fish',partOfSpeech:'noun',senseKey:'fish'}}],
  }]};
  validatePhrasebookResponse(response);
  const missingFlag = structuredClone(response);
  missingFlag.flags.pop();
  assert.throws(
    () => validatePhrasebookResponse(missingFlag),
    /identify every vocabulary item without source evidence/u,
  );
  const wrongSnapshot = structuredClone(response);
  wrongSnapshot.groups[0].vocab[0].sources[0].snapshot.translation = 'A different translation';
  assert.throws(()=>validatePhrasebookResponse(wrongSnapshot));
  const crossGroup = structuredClone(response);
  crossGroup.groups.push({...structuredClone(crossGroup.groups[0]),id:'00000000-0000-4000-8000-000000000003',
    phrases:crossGroup.groups[0].phrases.map((phrase,index)=>({...phrase,id:`00000000-0000-4000-8000-00000000000${index+5}`}))});
  assert.throws(()=>validatePhrasebookResponse(crossGroup));
});

test('both producers resolve the same dictionary sense despite contextual gloss wording', () => {
  const { assemblePhrasebook } = require('../phrasebook/parse');
  const { validatePhraseBreakdownResponse } = require('../phrase-breakdown');
  const produced = assemblePhrasebook({
    seed:'Dinner',language:'ja',
    conversations:[{title:'Dinner',lines:[{speaker:'you',text:'I do not eat.'}],vocab:['eat']}],
    translations:[{lines:['食[た]べません。'],vocab:[{target:'食[た]べる',partOfSpeech:'verb',senseKey:'consume-food',source:{lineIndex:0,surface:'食べません',occurrence:0}}]}],
  }).groups[0].vocab[0].card;
  const request = {schemaVersion:2,source:{snapshot:{lang:'ja',text:'食べません。',translation:'I do not eat.'}}};
  const analysis = validatePhraseBreakdownResponse(JSON.stringify({chunks:[{
    text:'食べません。',gloss:'do not eat',role:'negative verb',explanation:'Polite negative form.',equivalentWordIndex:null,
    words:[{surface:'食べません',occurrence:0,text:'食べる',translation:'to eat',partOfSpeech:'verb',senseKey:'consume-food',reading:[['食','た'],['べる',null]]}],
  }]}),request);
  const extracted = analysis.chunks[0].words[0].card;
  assert.equal(cardIdentity(validateCard(produced)),cardIdentity(validateCard(extracted)));
  assert.notEqual(cardIdentity(produced),cardIdentity({...extracted,senseKey:'consume-resources'}));
});
