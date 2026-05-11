import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Task 1.1 config guards', () => {
  it('broadly ignores .env variants while keeping .env.example tracked', () => {
    const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');

    expect(gitignore).toContain('.env*');
    expect(gitignore).toContain('!.env.example');
  });

  it('CI grep guard scans for Gemini package string literals in client surfaces', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toContain('@google/generative-ai');
    expect(workflow).toContain('generative-ai');
    expect(workflow).toContain('app');
    expect(workflow).toContain('components');
    expect(workflow).toContain('lib');
    expect(workflow).toContain('grep -v');
    expect(workflow).toMatch(/\^.*lib\/server\//);
    expect(workflow).toContain('tests/fixtures');
  });
});
