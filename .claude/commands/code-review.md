---
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git show:*), Bash(git blame:*)
description: Code review local changes
disable-model-invocation: false
---

Provide a code review for local code changes.

To do this, follow these steps precisely:

1. Use a Haiku agent to check what changes exist locally:
   - Run `git status` to see staged/unstaged changes
   - Run `git diff` for unstaged changes and `git diff --cached` for staged changes
   - If no changes exist, check recent commits with `git log -5 --oneline`
   - Ask the user which commits to review if there are no uncommitted changes
   - If there are no changes at all, do not proceed.

2. Use another Haiku agent to give you a list of file paths to (but not the contents of) any relevant CLAUDE.md files from the codebase: the root CLAUDE.md file (if one exists), as well as any CLAUDE.md files in the directories whose files were modified

3. Use a Haiku agent to summarize the changes being reviewed

4. Then, launch 5 parallel Sonnet agents to independently code review the changes. The agents should do the following, then return a list of issues and the reason each issue was flagged (eg. CLAUDE.md adherence, bug, historical git context, etc.):
   a. Agent #1: Audit the changes to make sure they comply with the CLAUDE.md. Note that CLAUDE.md is guidance for Claude as it writes code, so not all instructions will be applicable during code review.
   b. Agent #2: Read the file changes, then do a shallow scan for obvious bugs. Avoid reading extra context beyond the changes, focusing just on the changes themselves. Focus on large bugs, and avoid small issues and nitpicks. Ignore likely false positives.
   c. Agent #3: Read the git blame and history of the code modified, to identify any bugs in light of that historical context
   d. Agent #4: Read the full context of modified files to check for integration issues, inconsistencies with existing patterns, or potential regressions
   e. Agent #5: Read code comments in the modified files, and make sure the changes comply with any guidance in the comments.

5. For each issue found in #4, launch a parallel Haiku agent that takes the issue description and list of CLAUDE.md files (from step 2), and returns a score to indicate the agent's level of confidence for whether the issue is real or false positive. To do that, the agent should score each issue on a scale from 0-100, indicating its level of confidence. For issues that were flagged due to CLAUDE.md instructions, the agent should double check that the CLAUDE.md actually calls out that issue specifically. The scale is (give this rubric to the agent verbatim):
   a. 0: Not confident at all. This is a false positive that doesn't stand up to light scrutiny, or is a pre-existing issue.
   b. 25: Somewhat confident. This might be a real issue, but may also be a false positive. The agent wasn't able to verify that it's a real issue. If the issue is stylistic, it is one that was not explicitly called out in the relevant CLAUDE.md.
   c. 50: Moderately confident. The agent was able to verify this is a real issue, but it might be a nitpick or not happen very often in practice. Relative to the rest of the changes, it's not very important.
   d. 75: Highly confident. The agent double checked the issue, and verified that it is very likely it is a real issue that will be hit in practice. The existing approach is insufficient. The issue is very important and will directly impact the code's functionality, or it is an issue that is directly mentioned in the relevant CLAUDE.md.
   e. 100: Absolutely certain. The agent double checked the issue, and confirmed that it is definitely a real issue, that will happen frequently in practice. The evidence directly confirms this.

6. Filter out any issues with a score less than 80. If there are no issues that meet this criteria, report that no significant issues were found.

Examples of false positives, for steps 4 and 5:

- Pre-existing issues
- Something that looks like a bug but is not actually a bug
- Pedantic nitpicks that a senior engineer wouldn't call out
- Issues that a linter, typechecker, or compiler would catch (eg. missing or incorrect imports, type errors, broken tests, formatting issues, pedantic style issues like newlines). No need to run these build steps yourself -- it is safe to assume that they will be run separately.
- General code quality issues (eg. lack of test coverage, general security issues, poor documentation), unless explicitly required in CLAUDE.md
- Issues that are called out in CLAUDE.md, but explicitly silenced in the code (eg. due to a lint ignore comment)
- Changes in functionality that are likely intentional or are directly related to the broader change

Notes:

- Do not check build signal or attempt to build or typecheck the app. These will run separately, and are not relevant to your code review.
- Use git commands to inspect changes, not GitHub CLI
- Make a todo list first
- You must cite each issue with the file path and line number
- For your final output, follow the following format precisely (assuming for this example that you found 3 issues):

---

### Code review

Found 3 issues:

1. **<brief description of bug>** (CLAUDE.md says "<...>")
   - File: `path/to/file.ts:42-45`
   - Details: <explanation>

2. **<brief description of bug>** (some/other/CLAUDE.md says "<...>")
   - File: `path/to/other.ts:10`
   - Details: <explanation>

3. **<brief description of bug>** (bug due to <reason>)
   - File: `path/to/another.ts:100-105`
   - Details: <explanation>

---

- Or, if you found no issues:

---

### Code review

No issues found. Checked for bugs and CLAUDE.md compliance.

---
