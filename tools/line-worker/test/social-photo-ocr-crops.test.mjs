import test from 'node:test';
import assert from 'node:assert/strict';
import { photoPriceCropIndexes } from '../scripts/build-social-screens.mjs';

const tsv = text => ['level\ttext', ['5','1','1','1','1','1','1','1','60','20','90',text].join('\t')].join('\n');
test('photo OCR checks only visible intersections and masks the price photo, retaining ordinary photos', async () => {
  const crops = [];
  const rects = [
    {x:10,y:10,width:100,height:100}, {x:120,y:10,width:100,height:100},
    {x:500,y:10,width:100,height:100}, {x:-20,y:130,width:100,height:100}
  ];
  const result = await photoPriceCropIndexes(Buffer.from('captured pixels'), rects, {width:390,height:200}, async (png, crop) => {
    assert.equal(png.toString(), 'captured pixels');
    crops.push(crop);
    return tsv(crops.length === 2 ? '3,850' : '10/17');
  });
  assert.deepEqual(result, [1]);
  assert.deepEqual(crops, [[30,30,330,330], [360,30,660,330], [0,390,240,600]]);
});

test('an unavailable crop OCR is a verification failure, never a zero-price result', async () => {
  await assert.rejects(photoPriceCropIndexes(Buffer.from('pixels'), [{x:0,y:0,width:100,height:100}],
    {width:390,height:200}, async()=>null), /PHOTO_OCR_UNAVAILABLE/);
});
