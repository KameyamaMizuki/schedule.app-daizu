import { generateSessionToken, verifySessionToken, extractBearer, FAMILY_USER_IDS } from '../../src/utils/auth';

const SECRET = 'test-secret';
const UID = FAMILY_USER_IDS[0];

describe('session token', () => {
  test('生成したトークンが検証を通りuserIdが返る', () => {
    const t = generateSessionToken(UID, SECRET);
    expect(verifySessionToken(t, SECRET)).toBe(UID);
  });
  test('secretが違うとnull', () => {
    const t = generateSessionToken(UID, SECRET);
    expect(verifySessionToken(t, 'other')).toBeNull();
  });
  test('30日経過でnull', () => {
    const now = Date.now();
    const t = generateSessionToken(UID, SECRET, now);
    expect(verifySessionToken(t, SECRET, now + 31 * 24 * 3600 * 1000)).toBeNull();
    expect(verifySessionToken(t, SECRET, now + 29 * 24 * 3600 * 1000)).toBe(UID);
  });
  test('家族以外のuserIdはnull', () => {
    const t = generateSessionToken('Uxxxx', SECRET);
    expect(verifySessionToken(t, SECRET)).toBeNull();
  });
  test('改ざん・形式不正はnull', () => {
    expect(verifySessionToken('st.aaa.' + UID + '.deadbeef', SECRET)).toBeNull();
    expect(verifySessionToken('garbage', SECRET)).toBeNull();
    expect(verifySessionToken('', SECRET)).toBeNull();
  });
  test('有効な長さの16進数だが値が異なるHMACはnull(タイミング攻撃対策)', () => {
    const t = generateSessionToken(UID, SECRET);
    const parts = t.split('.');
    const hmacWithWrongLastChar = parts.slice(0, 3).join('.') + '.' + parts[3].slice(0, -1) + (parts[3][31] === 'f' ? '0' : 'f');
    expect(verifySessionToken(hmacWithWrongLastChar, SECRET)).toBeNull();
  });
});

describe('extractBearer', () => {
  test('Authorization/authorization両対応、Bearer以外はnull', () => {
    expect(extractBearer({ headers: { Authorization: 'Bearer abc' } } as any)).toBe('abc');
    expect(extractBearer({ headers: { authorization: 'Bearer abc' } } as any)).toBe('abc');
    expect(extractBearer({ headers: {} } as any)).toBeNull();
    expect(extractBearer({ headers: { Authorization: 'Basic abc' } } as any)).toBeNull();
  });
});
