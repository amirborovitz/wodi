import { sectionsToRows, buildMineMapFromBreakdown } from '../components/celebration/faces/HandwrittenFace/posterData';
import { buildSubstitutionPatch } from '../components/logging/story/substitutionPatch';
import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../types';
import { createBlankResult } from '../components/logging/story/types';
import { toLegacyResult } from '../components/logging/story/StoryLogResults';
import { buildSavedExercises } from './buildSavedExercises';
import { buildWorkloadBreakdownFromResults } from '../screens/AddWorkoutScreen';
import { buildPageArtifactSections, buildRewardArtifactSections } from '../components/celebration/helpers';

function daniel(): ParsedExercise {
 return {name:'Daniel',type:'wod',loggingMode:'for_time',suggestedSets:1,
 prescription:'50 Pull-ups, 400m Run, 21 Thrusters, 800m Run, 21 Thrusters, 400m Run, 50 Pull-ups',
 movements:[{name:'Pull-up',reps:50,inputType:'none'}, {name:'Run',distance:400,inputType:'distance'},
 {name:'Thruster',reps:21,inputType:'weight',rxWeights:{male:42.5,female:30,unit:'kg'}},
 {name:'Run',distance:800,inputType:'distance'}, {name:'Thruster',reps:21,inputType:'weight',rxWeights:{male:42.5,female:30,unit:'kg'}},
 {name:'Run',distance:400,inputType:'distance'}, {name:'Pull-up',reps:50,inputType:'none'}]};
}
describe('Daniel occurrence quantities',()=>{
 it.each([false,true])('preserves the separate distances (section wrapper: %s)',(sectioned)=>{
 const ex=daniel();if(sectioned)ex.sections=[{sectionType:'rounds',rounds:1,movements:ex.movements!}];
 const story=createBlankResult(ex,0,'for_time','male');story.timeSeconds=1020;
 expect(story.movementResults?.filter(m=>m.movement.name==='Run').map(m=>m.distance)).toEqual([400,800,400]);
 const result=toLegacyResult(story), saved=buildSavedExercises([result]).builtExercises;
 const totals=buildWorkloadBreakdownFromResults([result]);
 expect(totals.grandTotalDistance).toBe(1600);
 expect((sectioned?saved[0].sections![0].movements:saved[0].movements)!.filter(m=>m.name==='Run').map(m=>m.distance)).toEqual([400,800,400]);
 for(const sections of [buildPageArtifactSections(saved[0],totals.movements,false),buildRewardArtifactSections(saved,totals.movements)]){
 const runs=sections.flatMap(s=>s.rows).filter(r=>r.name.toLowerCase().includes('run'));
 expect(runs.map(r=>r.primary)).toEqual(['400m','800m','400m']);
 expect(runs.every(r=>r.totalNote===undefined)).toBe(true);
 expect(JSON.stringify(sectionsToRows(sections,buildMineMapFromBreakdown(totals.movements)))).not.toContain('1.60km');
 }
 });
});
it('converts only the selected Daniel run, once, during logging/save',()=>{
 const story=createBlankResult(daniel(),0,'for_time','male');story.timeSeconds=1020;
 const middle=story.movementResults!.filter(m=>m.movement.name==='Run')[1];
 Object.assign(middle,buildSubstitutionPatch(middle,{originalName:'Run',selectedName:'Echo Bike',substitutionType:'equivalent',targetUnit:'distance',originalValue:800,adjustedValue:2400}));
 const result=toLegacyResult(story), saved=buildSavedExercises([result]).builtExercises;
 const distances=saved[0].movements!.filter(m=>m.distance).map(m=>m.distance);
 expect(distances).toEqual([400,2400,400]);
 expect(buildWorkloadBreakdownFromResults([result]).grandTotalDistance).toBe(3200);
});

it('saves a shared ladder substitution per tier before any poster reads it',()=>{
 const distances=[800,600,400];
 const ex: ParsedExercise={name:'Ladder',type:'wod',loggingMode:'for_time',suggestedSets:1,prescription:'800/600/400m Run with 30/20/10 Sit-ups',
 sections:distances.map((distance,i)=>({sectionType:'rounds',rounds:1,movements:[{name:'Run',distance,inputType:'distance'},{name:'Sit-up',reps:30-i*10,inputType:'none'}]}))};
 ex.movements = ex.sections!.flatMap(section=>section.movements);
 const story=createBlankResult(ex,0,'for_time');story.timeSeconds=1020;
 const run=story.movementResults!.find(m=>m.movement.name==='Run')!;
 expect(story.movementResults!.filter(m=>m.movement.name==='Run')).toHaveLength(1);
 Object.assign(run,buildSubstitutionPatch(run,{originalName:'Run',selectedName:'Echo Bike',substitutionType:'equivalent',targetUnit:'distance',originalValue:800,adjustedValue:2400}));
 const result=toLegacyResult(story), saved=buildSavedExercises([result]).builtExercises;
 expect(saved[0].sections!.map(sec=>sec.movements[0].distance)).toEqual([2400,1800,1200]);
 const totals=buildWorkloadBreakdownFromResults([result], {type:'metcon',format:'for_time',scoreType:'time',exercises:[ex]});
 expect(totals.grandTotalDistance, JSON.stringify({maps:result.movementDistances,sub:result.movementSubstitutions,totals})).toBe(5400);
 // Misleading name-aggregated per-trip data must never overwrite saved occurrences.
 const stale=totals.movements.map(m=>({...m,distancePerRep:9999}));
 for(const sections of [buildPageArtifactSections(saved[0],stale,false),buildRewardArtifactSections(saved,stale)]){
 const text=JSON.stringify(sections);
 expect(text).toContain('2400-1800-1200m');
 expect(text).not.toContain('9999');
 }
});
