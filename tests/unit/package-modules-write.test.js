const fs = require('fs');
const os = require('os');
const path = require('path');
const {writePackage} = require('../../src/package-modules');

describe('writePackage', () => {
  let dir;

  afterAll(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });

  test('resolves only after the archive is fully written to disk', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-write-'));
    const target = path.join(dir, 'out.zip');
    await writePackage(target, [{
      filepath: 'composer.json',
      contentBuffer: Buffer.from('{"name":"a/b"}', 'utf8'),
      mtime: new Date('2022-02-22 22:02:22.000Z'),
      isExecutable: false,
    }]);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.statSync(target).size).toBeGreaterThan(0);
  });
});
