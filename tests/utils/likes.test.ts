import { mergeLikes } from '../../src/utils/dynamodb';

test('legacyとSetをユニークにマージ', () => {
  expect(mergeLikes(['a', 'b'], new Set(['b', 'c']))).toEqual(['a', 'b', 'c']);
});
test('undefined同士は空配列', () => {
  expect(mergeLikes(undefined, undefined)).toEqual([]);
});
test('Setが配列で来ても動く(lib-dynamodbの返り値ゆらぎ対策)', () => {
  expect(mergeLikes([], ['x'])).toEqual(['x']);
});
