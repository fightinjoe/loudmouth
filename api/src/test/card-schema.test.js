'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCard, validateCandidate, validateCardBatch, validateEvidence,
  cardIdentity, evidenceIdentity, validateBreakdownRequest, validateBreakdownResponse, validatePhrasebookResponse,
  validateContextResult, validatePhrasebookImage, validatePhrasebookImageResponse,
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
  const response = {schemaVersion:2,chunks:[{start:0,end:8,text:'caluroso',gloss:'hot',role:'adjective',explanation:'Describes hot weather.',words:[{card,sources:[{snapshot,span:{start:0,end:8}}]}],target:{kind:'word',index:0}}],flags:[],usage};
  validateBreakdownResponse(response,request);
  const hostile = structuredClone(response);
  hostile.chunks[0].words[0].sources[0].snapshot.translation='Another interpretation';
  assert.throws(()=>validateBreakdownResponse(hostile,request));
  const inflected = structuredClone(response);
  inflected.chunks[0].words[0].card.text='calor';
  assert.throws(()=>validateBreakdownResponse(inflected,request));
});

test('wire breakdown permits flagged Words without evidence but never unvalidated evidence or equivalence', () => {
  const snapshot = {lang:'ja',text:'食べません。',translation:'I do not eat.'};
  const request = {schemaVersion:2,source:{snapshot}};
  const response = {
    schemaVersion:2,
    chunks:[{
      start:0,end:snapshot.text.length,text:snapshot.text,
      gloss:'do not eat',role:'negative verb',explanation:'Polite negative.',
      words:[{card:word}],
      target:{kind:'chunk',card:{
        type:'chunk',lang:'ja',text:snapshot.text,translation:'do not eat',
        source:{snapshot,span:{start:0,end:snapshot.text.length}},
        role:'negative verb',explanation:'Polite negative.',
      }},
    }],
    flags:[{code:'word-source-missing',chunkIndex:0,wordIndex:0,reason:'unresolved'}],
    usage,
  };
  const validated = validateBreakdownResponse(response,request);
  assert.equal(validated.chunks[0].words[0].card.text,'食べる');
  assert.equal(Object.hasOwn(validated.chunks[0].words[0],'sources'),false);
  for (const mutate of [
    value => { value.flags = []; },
    value => { value.flags.push({...value.flags[0]}); },
    value => { value.flags[0].chunkIndex = 1; },
    value => { value.flags[0].wordIndex = 1; },
    value => { value.flags[0].reason = 'guessed'; },
    value => { value.chunks[0].target = {kind:'word',index:0}; },
    value => { value.chunks[0].words[0].sources = []; },
    value => {
      value.flags = [];
      value.chunks[0].words[0].sources = [{
        snapshot:{...snapshot,translation:'Different occurrence'},span:{start:0,end:5},
      }];
    },
    value => {
      value.chunks[0].words[0].sources = [{snapshot,span:{start:0,end:5}}];
    },
  ]) {
    const invalid = structuredClone(response);
    mutate(invalid);
    assert.throws(() => validateBreakdownResponse(invalid,request));
  }
});

test('v3 phrasebook evidence stays inside its topic and preserves section ownership', () => {
  const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const snapshot = source.snapshot;
  const response = { schemaVersion:3, title:'Dinner', usage, flags:[], groups:[{
    id:uuid(1), title:'Dinner',
    essentials:[{id:uuid(2),card:{type:'phrase',...snapshot}}],
    dialogue:[
      {id:uuid(3),card:{type:'phrase',...snapshot},speaker:'you'},
      {id:uuid(4),card:{type:'phrase',lang:'ja',text:'はい。',translation:'Yes.'},speaker:'partner'},
      {id:uuid(5),card:{type:'phrase',lang:'ja',text:'いいえ。',translation:'No.'},speaker:'partner',alternative:true},
    ],
    vocab:[
      {card:word,sources:[{snapshot,ref:{occurrenceId:uuid(2)},span:{start:4,end:9}}]},
      {card:{...word,text:'肉',reading:[['肉','にく']],translation:'meat',partOfSpeech:'noun',senseKey:'meat'}},
    ],
  }] };
  assert.equal(validatePhrasebookResponse(response).schemaVersion,3);
  const dialogueEvidence = structuredClone(response);
  dialogueEvidence.groups[0].vocab[0].sources[0].ref.occurrenceId = uuid(3);
  assert.equal(validatePhrasebookResponse(dialogueEvidence).groups[0].vocab[0].sources[0].ref.occurrenceId,uuid(3));
  for (const mutate of [
    value => { value.schemaVersion = 2; },
    value => { value.groups[0].phrases = []; },
    value => { value.groups[0].featuredPhraseIds = []; },
    value => { delete value.groups[0].essentials; },
    value => { delete value.groups[0].vocab; },
    value => { delete value.groups[0].dialogue; },
    value => { value.groups[0].essentials = []; },
    value => { value.groups[0].essentials[0].speaker = 'you'; },
    value => { value.groups[0].dialogue[0].alternative = true; },
    value => { delete value.groups[0].dialogue[2].alternative; },
    value => { value.groups[0].dialogue[1].speaker = 'you'; },
    value => { value.groups[0].dialogue[0].id = uuid(2); },
    value => { value.groups[0].vocab[0].sources[0].snapshot.translation = 'Changed'; },
    value => { value.groups[0].vocab[0].sources[0].ref.occurrenceId = uuid(8); },
    value => { value.groups[0].vocab[1].card.reading = [['肉',null]]; },
    value => { value.groups[0].dialogue[1].card.lang = 'es'; },
    value => { value.flags = [{code:'vocab-source-missing',groupIndex:0,vocabIndex:1,reason:'omitted'}]; },
    value => { value.flags = [{code:'vocab-source-missing',groupIndex:0,vocabIndex:0,reason:'unresolved'}]; },
  ]) {
    const invalid = structuredClone(response);
    mutate(invalid);
    assert.throws(() => validatePhrasebookResponse(invalid));
  }
  const flagged = structuredClone(response);
  flagged.flags = [{code:'vocab-source-missing',groupIndex:0,vocabIndex:1,reason:'unresolved'}];
  assert.equal(validatePhrasebookResponse(flagged).flags[0].reason,'unresolved');
  const foreign = structuredClone(response);
  const other = structuredClone(response.groups[0]);
  other.id = uuid(6);
  other.essentials[0].id = uuid(7);
  other.dialogue.forEach((entry,index) => { entry.id = uuid(8+index); });
  other.vocab = [];
  foreign.groups.push(other);
  foreign.groups[0].vocab[0].sources[0].ref.occurrenceId = uuid(7);
  assert.throws(() => validatePhrasebookResponse(foreign), /owning group/);
});

test('both producers resolve the same dictionary sense despite contextual gloss wording', () => {
  const { assemblePhrasebook } = require('../phrasebook/parse');
  const { validatePhraseBreakdownResponse } = require('../phrase-breakdown');
  const produced = assemblePhrasebook({
    seed:'Dinner',language:'ja',
    conversations:[{title:'Dinner',essentials:['I do not eat.'],lines:[{speaker:'you',text:'I do not eat.'},{speaker:'partner',text:'Understood.'}],vocab:['eat']}],
    translations:[{essentials:['食[た]べません。'],lines:['食[た]べません。','はい。'],vocab:[{target:'食[た]べる',partOfSpeech:'verb',senseKey:'consume-food',source:{section:'essentials',index:0,surface:'食べません',occurrence:0}}]}],
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

test('normalized context requires bounded bespoke art without changing card exchange versions', () => {
  const context = {
    questions:[{label:'Where?',options:['Here','There']}],
    checklist:[{label:'Ask for help',checked:true}],
    imagePrompt:'A watercolor still life.', usage,
  };
  assert.equal(validateContextResult(context).imagePrompt,context.imagePrompt);
  for (const mutate of [
    value => { delete value.imagePrompt; },
    value => { value.imagePrompt = ' '; },
    value => { value.imagePrompt = 'x'.repeat(2001); },
    value => { value.imagePrompt = ' padded '; },
    value => { value.checklist[0].checked = 'yes'; },
    value => { value.questions[0].options = ['one']; },
    value => { value.unknown = true; },
  ]) {
    const invalid = structuredClone(context); mutate(invalid);
    assert.throws(() => validateContextResult(invalid));
  }
  assert.equal(validateCardBatch({schemaVersion:2,cards:[{card:word}]}).schemaVersion,2);
  assert.throws(() => validateCardBatch({schemaVersion:3,cards:[{card:word}]}));
});

test('image responses enforce local PNG bytes, dimensions and conservative stage costs', async () => {
  const png = await require('sharp')({create:{width:16,height:9,channels:4,background:{r:200,g:100,b:80,alpha:0.5}}}).png().toBuffer();
  const image = {dataUrl:`data:image/png;base64,${png.toString('base64')}`,mediaType:'image/png',width:16,height:9};
  const response = {image,usage:{model:'image-model',costUsd:null,durationMs:3,stages:[
    {provider:'openrouter',model:'image-model',costUsd:null,durationMs:3},
  ]}};
  assert.equal(validatePhrasebookImage(image).width,16);
  assert.equal(validatePhrasebookImageResponse(response).usage.costUsd,null);
  for (const mutate of [
    value => { value.image.dataUrl = 'https://example.com/art.png'; },
    value => { value.image.dataUrl = 'data:image/png;base64,bm90LXBuZw=='; },
    value => { value.image.dataUrl += ' '; },
    value => { value.image.mediaType = 'image/jpeg'; },
    value => { value.image.width = 0; },
    value => { value.image.width = 9; },
    value => { value.image.width = 16000; value.image.height = 9000; },
    value => { value.usage.costUsd = 0.02; },
    value => { value.usage.stages[0].costUsd = -1; },
    value => { value.usage.stages.pop(); },
    value => { value.usage.stages.push({...value.usage.stages[0]}); },
    value => { value.usage.inputTokens = 0; },
  ]) {
    const invalid = structuredClone(response); mutate(invalid);
    assert.throws(() => validatePhrasebookImageResponse(invalid));
  }
});
