import { describe, expect, it } from 'vitest';
import { createAnchor } from '../anchor/anchor.ts';
import { builtInTemplateText } from '../../../../test/helpers/promptTemplate.ts';
import {
  buildPromptFilePointer,
  byteLength,
  checkPromptTemplate,
  fenceFor,
  renderReviewPrompt,
} from './reviewPrompt.ts';
import type { PromptInput } from './reviewPrompt.ts';

const fileLines = ['a', 'b', 'c', 'd', 'e'];

const input: PromptInput = {
  review: {
    id: '01REVIEW',
    summary: 'Please tighten error handling.',
    branch: 'feat/x',
    worktreePath: '/repo',
    baseRef: 'origin/main',
    mergeBaseSha: 'a1b2c3d4e5',
    headSha: 'e4f5a6b7c8',
  },
  threads: [
    {
      id: '01THREADA',
      anchor: createAnchor({
        view: { kind: 'merged' },
        path: 'src/api/user.ts',
        side: 'new',
        startLine: 2,
        endLine: 3,
        fileLines,
        contextLines: 1,
      }),
      diffExcerpt: ' a\n-b\n+B\n c',
      history: [],
      newComments: ['This misses the null case.'],
    },
    {
      id: '01THREADB',
      anchor: createAnchor({
        view: { kind: 'commit', sha: 'deadbeefcafe' },
        path: 'README.md',
        side: 'old',
        startLine: 1,
        endLine: 1,
        fileLines,
        contextLines: 1,
      }),
      diffExcerpt: null,
      history: [
        { author: 'user', body: 'Why?' },
        { author: 'agent', body: 'Because.' },
      ],
      newComments: ['Still unclear.'],
    },
  ],
  replyCommand: 'revi reply',
};

describe('renderReviewPrompt with the built-in template', () => {
  const template = builtInTemplateText();

  it('renders the review as Markdown', () => {
    expect(renderReviewPrompt(template, input)).toMatchSnapshot();
  });

  it('omits the summary section when it is empty', () => {
    const text = renderReviewPrompt(template, { ...input, review: { ...input.review, summary: '  ' } });
    expect(text).not.toContain('## Summary');
  });

  it('keeps the template comment out of the prompt', () => {
    expect(renderReviewPrompt(template, input).startsWith('# Code review from revi')).toBe(true);
  });

  it('uses a fence longer than any backtick run in the excerpt', () => {
    expect(fenceFor('no ticks')).toBe('```');
    expect(fenceFor('has ```` four')).toBe('`````');
  });
});

describe('renderReviewPrompt with a custom template', () => {
  it('exposes language-neutral flags for side, view and author', () => {
    const template =
      '{{#threads}}{{label}} {{#isNewSide}}new{{/isNewSide}}{{^isNewSide}}old{{/isNewSide}}' +
      ' {{#isMergedView}}merged{{/isMergedView}}{{#commit}}commit:{{commit}}{{/commit}}' +
      '{{#history}} {{#isUser}}U{{/isUser}}{{^isUser}}A{{/isUser}}{{/history}}\n{{/threads}}';
    expect(renderReviewPrompt(template, input)).toBe('T1 new merged\nT2 old commit:deadbee U A\n');
  });

  it('renders the values the template asks for', () => {
    const template = '{{#threads}}{{label}} {{path}}:{{lines}} {{id}}\n{{/threads}}reply: {{replyCommand}}';
    expect(renderReviewPrompt(template, input)).toBe(
      'T1 src/api/user.ts:2-3 01THREADA\nT2 README.md:1 01THREADB\nreply: revi reply',
    );
  });

  it('inserts comment text verbatim, without HTML escaping', () => {
    const withMarkup = { ...input, review: { ...input.review, summary: 'a < b && "c"' } };
    expect(renderReviewPrompt('{{review.summary}}', withMarkup)).toBe('a < b && "c"');
  });

  it('rejects a template with an unclosed section', () => {
    expect(() => checkPromptTemplate('{{#threads}} no end')).toThrow();
    expect(() => checkPromptTemplate(builtInTemplateText())).not.toThrow();
  });
});

describe('prompt size', () => {
  it('measures UTF-8 bytes', () => {
    expect(byteLength('中')).toBe(3);
  });

  it('builds a pointer prompt for large reviews', () => {
    expect(buildPromptFilePointer({ reviewId: 'R1', filePath: '/tmp/r.md' })).toContain('/tmp/r.md');
  });
});
