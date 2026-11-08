{{!
  revi review prompt. This is the text revi pastes into the agent's terminal on Submit.

  To use your own version, copy this file to ~/.config/revi/review-prompt.md
  (or pass --prompt-template <path> to revi) and edit it. revi reads the file on
  every delivery, so changes apply to the next Submit without a restart.

  Syntax is Mustache (https://mustache.github.io/mustache.5.html). Values are
  inserted as-is (no HTML escaping). A misspelled name renders as nothing.

  review.id  review.worktreePath  review.branch  review.baseRef
  review.mergeBase  review.head      short SHAs (7 characters)
  review.summary                     the Submit summary, empty when not given

  threads                            one entry per comment thread in this review:
    label                            T1, T2, ...
    id                               the thread id that `revi reply` needs
    path  lines  side  view          e.g. src/a.ts  5-8  new  merged diff
    isNewSide                        true on the new side (side is `new`)
    isMergedView  isWorktreeView     which view the comment is on
    commit                           short SHA on a single-commit view, else empty
    hasExcerpt                       true when the lines are still in the diff
    excerpt                          the lines with 3 lines of context, diff format
    originalSnippet                  the lines as they were when commented on
    fence                            a backtick fence longer than any in excerpt/snippet
    hasHistory                       true when this thread had earlier comments
    history                          earlier comments: author (user|agent), isUser, quotedBody
    newComments                      this review's comments: quotedBody
  threadIds                          "T1=<id>, T2=<id>"
  replyCommand                       revi reply
  statuses                           addressed|answered|wontfix|question

  Keep the reply instructions: they are how the agent's answers get back to revi.
}}
# Code review from revi (review {{review.id}})
Repo: {{review.worktreePath}} (branch `{{review.branch}}`, base `{{review.baseRef}}` @ {{review.mergeBase}}, HEAD {{review.head}})
{{#review.summary}}

## Summary
{{review.summary}}
{{/review.summary}}

## Comments
{{#threads}}

### [{{label}}] {{path}}:{{lines}} ({{side}} side, {{view}})

{{#hasExcerpt}}
{{fence}}diff
{{excerpt}}
{{fence}}
{{/hasExcerpt}}
{{^hasExcerpt}}
The lines are no longer in the diff. Originally:
{{fence}}
{{originalSnippet}}
{{fence}}
{{/hasExcerpt}}
{{#hasHistory}}

Earlier in this thread:
{{#history}}

**{{author}}:**
{{quotedBody}}
{{/history}}

New comment:
{{/hasHistory}}
{{#newComments}}

{{quotedBody}}
{{/newComments}}
{{/threads}}

## How to respond
Read each comment and decide what it asks for. Not every comment is a change request.
- It asks for a change: edit the code, then reply with `--status addressed`.
- It asks a question: answer it in the reply without changing the code, with `--status answered`.
- You disagree with the requested change: explain why, with `--status wontfix`.
- You cannot tell what is wanted: ask, with `--status question`.
- Do not commit.

For every thread, reply once when you are done with it:
  `{{replyCommand}} <threadId> --status {{statuses}} --body-file - <<'EOF'`
  `<your reply>`
  `EOF`
Thread ids: {{threadIds}}
