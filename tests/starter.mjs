import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {roomFromScene} from '../app/public/room-layout.js';
import {animationFrame} from '../app/public/renderer.js';

const {samples}=JSON.parse(await fs.readFile('app/public/assets/sample.json','utf8'));
assert.ok(samples.length>0);
for(const scene of samples){
  const room=roomFromScene(scene,'D04');assert.ok(room.actors.length>0);
  for(const actor of room.actors){
    assert.match(actor.atlas,/^\/assets\//);await fs.access('app/public'+actor.atlas);
    assert.ok(actor.frames>0 && actor.frames<=actor.columns*actor.rows);
    for(const time of [0,100,999,1e7]){const frame=animationFrame(actor,time);assert.ok(frame>=0&&frame<actor.frames);}
  }
}
const world=JSON.parse(await fs.readFile('worlds/personal/world.json','utf8'));
assert.equal(new Set(world.rooms.map(r=>r.address)).size,world.rooms.length);
for(const room of world.rooms)for(const actor of room.actors)await fs.access('app/public'+actor.atlas);
console.log('Starter themes, room conversion, animation bounds and world images passed.');
