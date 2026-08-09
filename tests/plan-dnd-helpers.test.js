import { describe, it, expect } from 'vitest';
import { dragIdsFor } from '../src/ui/plan/usePlanDnd.js';

const visible = ['a', 'b', 'c', 'd'];

describe('dragIdsFor', () => {
  it('drags just the row when it is not in the selection', () => {
    expect(dragIdsFor('c', new Set(['a', 'b']), visible)).toEqual(['c']);
  });
  it('drags just the row when it is the only selected one', () => {
    expect(dragIdsFor('c', new Set(['c']), visible)).toEqual(['c']);
  });
  it('drags the whole selection in visible order when the row is selected', () => {
    expect(dragIdsFor('b', new Set(['d', 'b']), visible)).toEqual(['b', 'd']);
  });
});
