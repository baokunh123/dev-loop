Run the Loop 2 scan for /Users/bhuang/workspace/dev-loop.

Steps:
1. Run `/Users/bhuang/workspace/dev-loop/skills/loop-2-scan/loop-2-scan.sh`.
2. Read its JSON output.
3. If `tickets` is empty, report that no Loop 2 tickets are ready and stop.
4. For each returned ticket:
   - confirm the ready directory still exists
   - confirm `plan.md` still exists
   - run `/Users/bhuang/workspace/dev-loop/skills/loop-2-trigger/loop-2-trigger.sh <ticket>`
   - read its JSON output
   - if the trigger returns `{"status":"skipped",...}`, report the skip and continue
   - if the trigger returns `{"status":"dispatch_ready",...}`, call `create_thread` in the mortgage project with `environment.type = "local"` and use the returned `worker_prompt`
5. Do not implement any ticket in this automation thread.
6. Do not run `codex exec`.
7. This thread is only the dispatcher.
